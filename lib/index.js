/**
 * deepclean-mydisk —— DSH host 插件（v0.4）
 *
 * 组成：
 *   1. 模型工具：disk_check_permissions / disk_audit / disk_inspect / disk_report / disk_self_test（全部只读）
 *   2. 侧边栏 API：扫描（后台/进度/取消）、历史、恢复、白名单、清理、撤销
 *
 * 安全边界：清理只移到废纸篓/隔离区；只接受最近一次扫描（10 分钟内）的允许路径；
 * 白名单路径永远拒绝；符号链接拒绝。
 */
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { bootTime, createSoftwareService } from './software.js'
import { discoverSoftware, fileStamp, softwareEnv } from './software-discovery.js'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineTool } from '@deepseek-ai/dsh-tools'
import { moveToTrash, restoreMoved, appendAudit, moveAcrossDevices, canRestoreMoved, purgeMoved, summarizeResults, quarantineSummary, MAX_BATCH } from './clean.js'
import { isProtected } from './platform.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const RESOURCES = path.resolve(HERE, '..', 'resources')
const ENTRY = path.join(RESOURCES, 'scripts', 'deepclean.py')
const MAX_OUTPUT = 24000

const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const HISTORY_FILE = path.join(DSH_HOME, 'deepclean-history.json')
const WHITELIST_FILE = path.join(DSH_HOME, 'deepclean-whitelist.json')
const AUDIT_FILE = path.join(DSH_HOME, 'deepclean-audit.log')
const REPORT_TTL_MS = 10 * 60 * 1000
// 清理目的地的平台词：macOS 为废纸篓，Windows 与其他平台为隔离区（见 docs/copy-terms.md）。
const TRASH_WORD = process.platform === 'darwin' ? '废纸篓' : '隔离区'

export const name = 'deepclean-mydisk'
export const inject = ['tools']

let lastReport = null
let lastReportAt = 0
// disk_audit 的临时报告：只给 disk_inspect 解析 itemId / 覆盖路径，绝不参与清理放行。
let lastToolReport = null
let lastToolReportAt = 0
let scanController = null
let fdaRevision = 0
const lastBatches = []

const scanState = {
  status: 'idle', // idle | running | done | error | canceled
  progress: 0,
  stage: '',
  startedAt: 0,
  finishedAt: 0,
  error: '',
  errorCode: '',
  fda: null,
  full: false,
  canceled: false,
}

function killTree(child) {
  if (!child?.pid || child.killed) return
  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
        .on('error', () => {})
    } catch { /* ignore */ }
    return
  }
  try { process.kill(-child.pid, 'SIGTERM') } catch { try { child.kill('SIGTERM') } catch { /* ignore */ } }
  setTimeout(() => {
    try { process.kill(-child.pid, 'SIGKILL') } catch { /* ignore */ }
  }, 1500).unref?.()
}

// DSH 自带运行时里可能就有可用的 Python：用户机器上常见只有 Microsoft Store
// 的占位别名（执行即退出 9009），PATH 探测会全部失败。这里只做存在性检查，
// 真正的可用性仍由下面的版本探针判定，所以不会误用一个坏的运行时。
function bundledPythonCandidates() {
  const relatives = process.platform === 'win32'
    ? [['python', 'python.exe']]
    : [['python', 'bin', 'python3'], ['python', 'bin', 'python'], ['python', 'python3']]
  let runtimes = []
  try {
    runtimes = fs.readdirSync(path.join(DSH_HOME, 'dsh-runtimes'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
  } catch {
    return []
  }
  const found = []
  for (const runtime of runtimes) {
    for (const relative of relatives) {
      const exe = path.join(DSH_HOME, 'dsh-runtimes', runtime, 'dependencies', ...relative)
      if (!fs.existsSync(exe)) continue
      found.push([exe])
      break
    }
  }
  return found
}

// 解释器探测：只跑版本探针，不跑扫描器，真实扫描失败（含超时）绝不触发换解释器重试。
const PYTHON_PROBE = ['-I', '-S', '-c', 'import sys; print("deepclean-python-ok" if (3, 9) <= sys.version_info < (4,) else "deepclean-python-unsupported")']

// 顺序：显式 PYTHON → PATH 上的启动器 → DSH 自带运行时（兜底）。
function pythonCandidates(win) {
  const launchers = win ? [['py', '-3'], ['python'], ['python3']] : [['python3'], ['python']]
  const candidates = []
  const seen = new Set()
  for (const candidate of [process.env.PYTHON ? [process.env.PYTHON] : null, ...launchers, ...bundledPythonCandidates()]) {
    if (!candidate || seen.has(candidate.join('\u0000'))) continue
    seen.add(candidate.join('\u0000'))
    candidates.push(candidate)
  }
  return candidates
}

async function pickPython(candidates, env, opts) {
  const failures = []
  for (const [cmd, ...args] of candidates) {
    opts.signal?.throwIfAborted()
    const label = [cmd, ...args].join(' ')
    let result
    try {
      result = await runScannerProcess(cmd, [...args, ...PYTHON_PROBE], 5000, { env, signal: opts.signal })
    } catch (err) {
      opts.signal?.throwIfAborted()
      // 解释器没装（ENOENT）不算失败，继续找下一个候选。
      if (err.code === 'ENOENT') continue
      const reason = err.code === 'ETIMEDOUT' ? '探测超时'
        : err.code === 'EACCES' || err.code === 'EPERM' ? '启动被拒绝' : '无法启动'
      failures.push(`${label}：${reason}`)
      continue
    }
    opts.signal?.throwIfAborted()
    const marker = (result.out || '').trim()
    if (result.code === 0 && marker === 'deepclean-python-ok') return { python: [cmd, ...args], failures }
    // 能启动但不是可用解释器：py 无运行时（RC_NO_PYTHON）、商店占位别名、
    // Python Install Manager 未开启自动安装、或版本低于 3.9。继续尝试下一个。
    if ((result.code === 0 && marker === 'deepclean-python-unsupported') ||
        (cmd === 'py' ? result.code === 103 : result.code === 9009) ||
        (result.code >>> 0) === 0xA0000006) continue
    failures.push(`${label}：${result.code === 0 ? '未返回版本信息' : '异常退出'}`)
  }
  return { python: null, failures }
}

async function runScanner(extraArgs, timeoutMs, opts = {}, script = 'deepclean.py') {
  const win = process.platform === 'win32'
  const target = path.join(RESOURCES, 'scripts', script)
  const env = { ...process.env, PYTHONIOENCODING: 'utf-8', ...opts.env }
  if (win) env.PYTHON_MANAGER_AUTOMATIC_INSTALL = 'false'
  const candidates = pythonCandidates(win)
  const picked = await pickPython(candidates, env, opts)
  if (picked.python) {
    const [cmd, ...args] = picked.python
    return runScannerProcess(cmd, [...args, target, ...extraArgs], timeoutMs, { ...opts, env })
  }
  // 非 Windows 维持历史行为：把首选解释器的真实启动失败原样抛出（errorCode 留空，
  // 客户端不会走进 Windows 专用的 Python 安装引导卡）。
  if (!win) {
    const [cmd, ...args] = candidates[0]
    return runScannerProcess(cmd, [...args, target, ...extraArgs], timeoutMs, { ...opts, env })
  }
  if (picked.failures.length) throw Object.assign(new Error(`Python 探测失败（${picked.failures.join('；')}）。请检查 Python 是否能在本机启动，然后重试。`), { code: 'python_probe_failed' })
  throw Object.assign(new Error('找不到可用的 Python 3（需要 3.9 或更新版本）。请安装 Python 3，确认 PowerShell 中 `py -3 --version`、`python --version` 或 `python3 --version` 能显示版本，然后重启 DSH。'), { code: 'python_unavailable' })
}

function runScannerProcess(cmd, args, timeoutMs, { env, signal, onProgress }) {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted()
    let child
    try {
      child = spawn(cmd, args, {
        cwd: RESOURCES,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
        windowsHide: true,
      })
    } catch (err) {
      reject(Object.assign(new Error(`无法启动 ${cmd}：${err instanceof Error ? err.message : String(err)}`), { code: err?.code }))
      return
    }
    const abort = () => killTree(child)
    signal?.addEventListener('abort', abort, { once: true })
    let out = ''
    let err = ''
    let buf = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { out += chunk })
    child.stderr.on('data', (chunk) => {
      err += chunk
      if (typeof onProgress !== 'function') return
      buf += chunk
      let idx
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim()
        buf = buf.slice(idx + 1)
        const m = /^PROGRESS (\d+) (.+)$/.exec(line)
        if (m) onProgress(Number(m[1]), m[2])
      }
    })
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort)
      try { killTree(child) } catch { /* ignore */ }
      reject(Object.assign(new Error(`扫描超时（${Math.round(timeoutMs / 1000)}s）；可改用快速扫描`), { code: 'ETIMEDOUT' }))
    }, timeoutMs)
    child.on('error', (error) => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      reject(Object.assign(new Error(`无法启动 ${cmd}：${error.message}（请确认本机已安装 Python 3）`), { code: error.code }))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      resolve({ code, out, err })
    })
  })
}

function clip(text) {
  if (text.length <= MAX_OUTPUT) return text
  return `${text.slice(0, MAX_OUTPUT)}\n\n…（输出已截断，共 ${text.length} 字符）`
}

function scannerFdaStatus(result) {
  const status = /^DEEPCLEAN_FDA (granted|denied|unknown)\r?$/m.exec(result.err)?.[1]
  if (status && result.code === (status === 'denied' ? 2 : 0)) return status
}

function formatResult(result) {
  const text = (result.out || '').trim()
  if (text) return clip(text)
  return clip((result.err || '').trim() || `（无输出，exit ${result.code}）`)
}

const output = {
  schema: { type: 'string' },
  render: (_args, value) => [{ type: 'text', text: value }],
}

function readJsonFile(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJsonFile(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
}

function loadWhitelist() {
  const data = readJsonFile(WHITELIST_FILE, { paths: [] })
  return Array.isArray(data.paths) ? data.paths.filter((p) => typeof p === 'string') : []
}

function saveWhitelist(paths) {
  writeJsonFile(WHITELIST_FILE, { paths })
}

function appendHistory(entry) {
  const data = readJsonFile(HISTORY_FILE, { items: [] })
  const items = Array.isArray(data.items) ? data.items : []
  items.push(entry)
  writeJsonFile(HISTORY_FILE, { items: items.slice(-100) })
}

function loadHistory() {
  const data = readJsonFile(HISTORY_FILE, { items: [] })
  return Array.isArray(data.items) ? data.items : []
}

function listCleanBatches(limit = 20) {
  let lines = []
  try {
    lines = fs.readFileSync(AUDIT_FILE, 'utf8').split('\n').filter(Boolean)
  } catch {
    return []
  }
  const batches = []
  const byId = new Map()
  const latestOwner = new Map()
  const restores = new Map()
  const purged = new Set()
  for (const line of lines) {
    try {
      const e = JSON.parse(line)
      if (e.action === 'clean' && Array.isArray(e.moved) && e.moved.length) {
        const items = e.moved.map(m => ({ ...m, restored: false, deleted: false }))
        for (const item of items) latestOwner.set(item.to, item)
        const batch = { batchId: e.batchId, at: e.at, items }
        batches.push(batch)
        byId.set(e.batchId, batch)
      } else if ((e.action === 'restore' || e.action === 'purge') && Array.isArray(e.results)) {
        const isRestore = e.action === 'restore'
        if (!isRestore && e.batchId) purged.add(e.batchId)
        for (const item of byId.get(e.batchId)?.items || []) {
          const matched = e.results.find(r => r.ok && (isRestore
            ? r.path === item.from && (!r.to || r.to === item.to)
            : r.from === item.from && r.to === item.to))
          if (!matched) continue
          if (isRestore) {
            item.restored = true
            item.restoredAt ??= e.at
            if (typeof matched.restoredTo === 'string' && path.isAbsolute(matched.restoredTo)) {
              item.restoredTo ??= matched.restoredTo
            }
          } else {
            item.deleted = true
            item.deletedAt ??= e.at
          }
        }
        if (!isRestore) continue
        // 最近一次恢复是否部分失败：历史页据此提示「上次恢复失败」并给另存为副本入口。
        const failed = e.results.filter(r => !r.ok)
        const codes = {}
        for (const r of failed) codes[r.code || 'io'] = (codes[r.code || 'io'] || 0) + 1
        restores.set(e.batchId, { at: e.at, ok: e.results.length - failed.length, failed: failed.length, codes })
      } else if (e.action === 'purge' && e.batchId) {
        purged.add(e.batchId)
      }
    } catch { /* ignore */ }
  }
  return batches.reverse().map(batch => {
    const items = batch.items.map(item => ({
      from: item.from, to: item.to, identity: item.identity, restored: item.restored,
      restoredAt: item.restoredAt, restoredTo: item.restored ? item.restoredTo : undefined,
      deleted: item.deleted === true, deletedAt: item.deletedAt,
      // 审计标注用于历史展示。旧日志可能没有大小、分类或大小归属。
      kb: Number.isFinite(item.kb) ? item.kb : null,
      kbScope: item.kbScope === 'path' ? 'path' : undefined,
      category: typeof item.category === 'string' ? item.category : null,
      exists: !item.restored && !item.deleted && latestOwner.get(item.to) === item && canRestoreMoved(item),
    }))
    return {
      batchId: batch.batchId, at: batch.at, count: items.length,
      restorable: items.filter(i => i.exists).length, items,
      lastRestore: restores.get(batch.batchId) || null,
      restored: items.filter((i) => i.restored).length,
      purged: purged.has(batch.batchId),
    }
  }).filter((batch, index) => index < limit || batch.restorable > 0)
}

// 隔离区/废纸篓汇总：遍历目录有成本，面板轮询用 3 秒缓存；清空/恢复/清理后主动失效。
let quarantineCache = { at: 0, data: null }

export function quarantineInfo() {
  const now = Date.now()
  if (quarantineCache.data && now - quarantineCache.at < 3000) return quarantineCache.data
  let data
  try { data = quarantineSummary() } catch { data = { root: '', kb: 0, files: 0, batches: [], truncated: false } }
  data = {
    ...data,
    // macOS 扫描器会统计整个 ~/.Trash（含非本插件文件）；面板要把两者分开说清楚。
    systemTrashKb: lastReport && Number.isFinite(lastReport.trashKb) ? lastReport.trashKb : null,
  }
  quarantineCache = { at: now, data }
  return data
}

export function invalidateQuarantine() {
  quarantineCache = { at: 0, data: null }
}

function reportSummary(report) {
  const groups = report.leftoverGroups || []
  const safeKb = groups.filter((g) => g.bucket === 'safe').reduce((s, g) => s + g.kb, 0)
  const confirmKb = groups.filter((g) => g.bucket === 'confirm').reduce((s, g) => s + g.kb, 0)
  return {
    safeKb,
    confirmKb,
    cacheKb: report.estimate ? report.estimate.cacheKb : 0,
    devKb: report.estimate ? report.estimate.devKb : 0,
    totalKb: report.estimate ? report.estimate.totalKb : 0,
  }
}

function scanSummary() {
  const end = scanState.finishedAt || Date.now()
  const elapsed = scanState.startedAt ? Math.max(0, Math.round((end - scanState.startedAt) / 1000)) : 0
  let progress = scanState.progress
  if (scanState.status === 'running' && scanState.startedAt) {
    const expectedMs = scanState.full ? 45000 : 28000
    const interpolated = Math.min(95, Math.round((elapsed * 1000 / expectedMs) * 95))
    progress = Math.max(progress, interpolated)
  }
  return {
    status: scanState.status,
    progress,
    stage: scanState.stage,
    elapsed,
    error: scanState.error,
    errorCode: scanState.errorCode,
    fda: scanState.fda,
    canceled: scanState.canceled,
    full: scanState.full,
    at: lastReportAt,
    hasReport: !!lastReport,
  }
}

function startScan(full) {
  if (softwareService?.active) return false
  if (scanState.status === 'running') return false
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepclean-'))
  const file = path.join(dir, 'report.json')
  Object.assign(scanState, {
    status: 'running', progress: 0, stage: '准备扫描', startedAt: Date.now(), finishedAt: 0,
    error: '', errorCode: '', fda: null, full: !!full, canceled: false,
  })
  const argv = []
  if (!full) argv.push('--quick')
  // 扫描器在扫描开始时探测权限，按发起顺序分配序号，避免慢扫描覆盖之后的权限检查。
  const permissionRevision = process.platform === 'darwin' ? ++fdaRevision : 0
  if (permissionRevision) argv.push('--permission-status')
  argv.push('--json', file)
  scanController = new AbortController()
  runScanner(argv, 300000, {
    signal: scanController.signal,
    onProgress: (pct, label) => {
      scanState.progress = pct
      scanState.stage = label
    },
  }).then((res) => {
    if (scanState.canceled) {
      scanState.status = 'canceled'
      scanState.stage = '已取消'
      scanState.finishedAt = Date.now()
      return
    }
    if (res.code !== 0) {
      scanState.status = 'error'
      if (permissionRevision && scannerFdaStatus(res) === 'denied') {
        scanState.errorCode = 'full_disk_access_required'
        scanState.fda = { status: 'denied', revision: permissionRevision }
      }
      scanState.error = (res.out || res.err || `exit ${res.code}`).trim().slice(0, 500)
      scanState.finishedAt = Date.now()
      return
    }
    const report = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (permissionRevision && report.fda) scanState.fda = { status: report.fda.status, revision: permissionRevision }
    lastReport = report
    lastReportAt = Date.now()
    scanState.report = report
    scanState.progress = 100
    scanState.stage = '完成'
    scanState.status = 'done'
    scanState.finishedAt = Date.now()
    appendHistory({
      at: lastReportAt,
      platform: report.platform || process.platform,
      free: report.disk ? report.disk.free : 0,
      total: report.disk ? report.disk.total : 0,
      elapsed: report.elapsed || 0,
      full: !!full,
      ...reportSummary(report),
    })
  }).catch((err) => {
    scanState.status = scanState.canceled ? 'canceled' : 'error'
    if (scanState.canceled) scanState.stage = '已取消'
    else Object.assign(scanState, scannerError(err))
    scanState.finishedAt = Date.now()
  }).finally(() => {
    try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* ignore */ }
  })
  return true
}

const photosState = {
  status: 'idle', progress: 0, stage: '', startedAt: 0, finishedAt: 0, error: '', errorCode: '', result: null,
}
let photoController = null
let photoAllowed = new Set()
let photoAt = 0

function photosSummary() {
  const end = photosState.finishedAt || Date.now()
  return {
    status: photosState.status,
    progress: photosState.progress,
    stage: photosState.stage,
    elapsed: photosState.startedAt ? Math.round((end - photosState.startedAt) / 1000) : 0,
    error: photosState.error,
    errorCode: photosState.errorCode,
    at: photoAt,
    hasResult: !!photosState.result,
  }
}

function startPhotoScan() {
  if (softwareService?.active) return false
  if (photosState.status === 'running') return false
  if (scanState.status === 'running') return false
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepclean-photos-'))
  const file = path.join(dir, 'photos.json')
  Object.assign(photosState, { status: 'running', progress: 0, stage: '准备', startedAt: Date.now(), finishedAt: 0, error: '', errorCode: '', result: null })
  photoController = new AbortController()
  const { signal } = photoController
  runScanner(['--json', file], 600000, {
    signal,
    onProgress: (pct, label) => {
      if (!signal.aborted) { photosState.progress = pct; photosState.stage = label }
    },
  }, 'photos.py').then((res) => {
    if (signal.aborted) return
    if (res.code !== 0) {
      photosState.status = 'error'
      photosState.error = (res.out || res.err || `exit ${res.code}`).trim().slice(0, 500)
      photosState.finishedAt = Date.now()
      return
    }
    const result = JSON.parse(fs.readFileSync(file, 'utf8'))
    photosState.result = result
    photosState.progress = 100
    photosState.stage = '完成'
    photosState.status = 'done'
    photosState.finishedAt = Date.now()
    photoAt = Date.now()
    photoAllowed = new Set()
    for (const g of result.groups || []) for (const it of g.items || []) if (!isCloudBackedPath(it.path)) photoAllowed.add(it.path)
  }).catch((err) => {
    if (signal.aborted) return
    photosState.status = 'error'
    Object.assign(photosState, scannerError(err))
    photosState.finishedAt = Date.now()
  }).finally(() => {
    try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* ignore */ }
  })
  return true
}

const moveState = {
  status: 'idle', done: 0, total: 0, current: '', results: [], error: '', startedAt: 0, finishedAt: 0,
}
let moveCanceled = false

function moveSummary() {
  const end = moveState.finishedAt || Date.now()
  return {
    destination: moveState.destination || '',
    startedAt: moveState.startedAt,
    status: moveState.status,
    done: moveState.done,
    total: moveState.total,
    current: moveState.current,
    results: moveState.results,
    error: moveState.error,
    elapsed: moveState.startedAt ? Math.round((end - moveState.startedAt) / 1000) : 0,
  }
}

function assertMoveSource(p) {
  if (!withinHome(p) || isProtected(p, loadWhitelist())) throw new Error('个人文件夹之外或受保护的路径不可移动')
  const home = path.resolve(process.env.HOME || os.homedir())
  for (let current = path.resolve(p); current !== home; current = path.dirname(current)) {
    if (fs.lstatSync(current).isSymbolicLink()) throw new Error('符号链接不可移动')
  }
}

async function moveJob(paths, dest, destStat) {
  for (const p of paths) {
    if (moveCanceled) break
    moveState.current = path.basename(p)
    try {
      if (!withinHome(p)) throw new Error('只允许移动个人文件夹内的文件')
      assertMoveSource(p)
      const st = fs.statSync(p)
      if (!st.isFile()) throw new Error('只支持移动单个文件')
      let target = path.join(dest, path.basename(p))
      let i = 1
      while (fs.existsSync(target)) target = path.join(dest, `${path.basename(p)}.${i++}`)
      if (st.dev === destStat.dev) {
        fs.renameSync(p, target)
      } else {
        await moveAcrossDevices(p, target)
      }
      moveState.results.push({ path: p, ok: true, to: target })
    } catch (err) {
      moveState.results.push({ path: p, ok: false, error: String(err && err.message ? err.message : err) })
    }
    moveState.done += 1
  }
  moveState.current = ''
  moveState.finishedAt = Date.now()
  moveState.status = moveCanceled ? 'canceled' : 'done'
  appendAudit({ action: 'move', destination: dest, canceled: moveCanceled, results: moveState.results })
}

// ── 云盘 / App 数据目录保护（搬家与照片去重的第二道防线）─────────────────
const PACKAGE_SUFFIXES = ['.photoslibrary', '.photolibrary', '.sparsebundle', '.fcpbundle',
  '.logicx', '.band', '.imovielibrary', '.tvlibrary', '.aplibrary']
const CLOUD_DIR_NAMES = ['onedrive', 'dropbox', 'google drive', 'icloud drive']

export function cloudRoots() {
  const roots = []
  const home = process.env.HOME || os.homedir()
  if (process.platform === 'darwin') {
    roots.push(path.join(home, 'Library', 'CloudStorage'), path.join(home, 'Library', 'Mobile Documents'))
  } else if (process.platform === 'win32') {
    for (const name of ['OneDrive', 'OneDriveConsumer', 'OneDriveCommercial']) {
      if (process.env[name]) roots.push(process.env[name])
    }
    try {
      for (const name of fs.readdirSync(home)) {
        const low = name.toLowerCase()
        if (low.startsWith('onedrive') || low === 'dropbox' || low === 'google drive') roots.push(path.join(home, name))
      }
    } catch { /* ignore */ }
  }
  const extra = process.env.DEEPCLEAN_CLOUD_ROOTS
  if (extra) {
    try { for (const p of JSON.parse(extra)) if (typeof p === 'string' && path.isAbsolute(p)) roots.push(p) } catch { /* ignore */ }
  }
  const seen = new Set()
  return roots.map((r) => path.resolve(r)).filter((r) => (seen.has(r) ? false : (seen.add(r), true)))
}

function comparablePath(p) {
  const resolved = path.resolve(p)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

/** 路径是否落在云盘根内（OneDrive/iCloud/Dropbox/Google Drive）：真实扫描器已排除，宿主再兜底。 */
export function isCloudBackedPath(p, roots = cloudRoots()) {
  if (typeof p !== 'string' || !path.isAbsolute(p)) return false
  const target = comparablePath(p)
  for (const root of roots) {
    const base = comparablePath(root)
    if (target === base || target.startsWith(base + path.sep)) return true
  }
  return false
}

/** 搬家拒绝原因：云盘文件（会同步删云端）与 App 数据目录（会破坏应用）。返回空串表示允许。 */
export function moveBlockReason(p) {
  if (typeof p !== 'string' || !path.isAbsolute(p)) return '路径必须是绝对路径'
  if (isCloudBackedPath(p)) return '云盘文件不参与搬家（请在云盘客户端中处理）'
  const segments = path.resolve(p).split(path.sep).map((seg) => seg.toLowerCase())
  const pairs = segments.slice(0, -1).map((seg, i) => `${seg}/${segments[i + 1]}`)
  if (pairs.some((pair) => ['library/mail', 'library/messages', 'library/group containers', 'library/containers', 'library/application support'].includes(pair))) {
    return 'App 数据目录（如邮件、应用容器）内的文件不允许搬家，可能破坏应用数据'
  }
  if (segments.some((seg) => PACKAGE_SUFFIXES.some((ext) => seg.endsWith(ext)))) {
    return 'App 数据目录（如照片图库）内的文件不允许搬家，可能破坏应用数据'
  }
  const joined = segments.join('/')
  const home = process.env.HOME || os.homedir()
  const appRoots = [path.join(home, 'AppData'), process.env.LOCALAPPDATA, process.env.APPDATA].filter(Boolean)
  if (appRoots.some(root => {
    const base = comparablePath(root), target = comparablePath(p)
    return target === base || target.startsWith(base + path.sep)
  })) return 'App 数据目录内的文件不允许搬家，可能破坏应用数据'
  if (/(^|\/)appdata\/local\/packages(\/|$)/.test(joined) || /(^|\/)windowsapps(\/|$)/.test(joined)) {
    return '商店应用数据目录内的文件不允许搬家，可能破坏应用数据'
  }
  return ''
}

// Big files confirmed by a fresh tree walk (<= REPORT_TTL_MS), the second
// allow-set channel for moves alongside the full-scan report.
function treeConfirmedPaths() {
  const set = new Set()
  const now = Date.now()
  const clouds = cloudRoots()
  for (const entry of treeCache.values()) {
    if (now - entry.at > REPORT_TTL_MS) continue
    for (const f of entry.data.bigFiles || []) if (!isCloudBackedPath(f.path, clouds)) set.add(f.path)
  }
  return set
}

function startMove(paths, destination) {
  if (moveState.status === 'running') throw new Error('已有移动任务在进行中')
  const reportFresh = !!lastReport && Date.now() - lastReportAt <= REPORT_TTL_MS
  const allowed = treeConfirmedPaths()
  if (reportFresh) for (const b of lastReport.bigFiles || []) allowed.add(b.path)
  if (allowed.size === 0) throw new Error('扫描结果已过期，请先完整扫描')
  if (!Array.isArray(paths) || paths.some(p => !allowed.has(p))) throw new Error('包含未经最近扫描确认的文件')
  const items = [...new Set(paths)]
  for (const p of items) {
    assertMoveSource(p)
    const blocked = moveBlockReason(p)
    if (blocked) throw new Error(blocked)
  }
  if (items.length === 0) throw new Error('没有可移动的大文件（需先「完整扫描」或在「空间」中浏览目录）')
  const dest = path.resolve(String(destination || ''))
  if (!fs.existsSync(dest) || fs.lstatSync(dest).isSymbolicLink() || !fs.statSync(dest).isDirectory()) throw new Error('目标目录不存在')
  try { fs.accessSync(dest, fs.constants.W_OK) } catch { throw new Error('目标目录不可写') }
  const destStat = fs.statSync(dest)
  let total = 0
  for (const p of items) total += fs.statSync(p).size
  try {
    const st = fs.statfsSync(dest)
    if (total > st.bavail * st.bsize * 0.95) throw new Error('目标磁盘空间不足')
  } catch (err) {
    if (String(err.message).includes('空间不足')) throw err
  }
  moveCanceled = false
  Object.assign(moveState, {
    destination: dest, status: 'running', done: 0, total: items.length, current: '', results: [],
    error: '', startedAt: Date.now(), finishedAt: 0,
  })
  moveJob(items, dest, destStat).catch((err) => {
    moveState.status = 'error'
    moveState.error = String(err && err.message ? err.message : err)
    moveState.finishedAt = Date.now()
  })
  return items.length
}

// Exported for tests: the clean allow-set contract (report → panel → clean route).
export function allowedPaths(report) {
  const whitelist = loadWhitelist()
  const clouds = cloudRoots()
  const set = new Set()
  const running = [...(report.caches || []), ...(report.devCaches || []), ...(report.browsers || []), ...(report.appCaches || [])]
    .filter(item => item.running).flatMap(item => item.paths || [item.path]).filter(Boolean).map(comparablePath)
  const add = (p) => {
    if (!p || isProtected(p, whitelist) || isCloudBackedPath(p, clouds)) return
    const target = comparablePath(p)
    if (running.some(base => target === base || target.startsWith(base + path.sep) || base.startsWith(target + path.sep))) return
    set.add(p)
  }
  for (const g of report.leftoverGroups || []) {
    if (g.bucket !== 'safe') continue
    for (const p of g.paths || []) add(p)
  }
  // admin 项（如 C:\Windows\Temp）与扫描器标记 cleanable=false 的项（如被占用的 Temp）不进允许集合；
  // 运行中的浏览器/应用缓存同样排除（扫描时刻的进程快照，与 appCaches 同口径）。
  for (const c of report.caches || []) if (!c.system && !c.admin && c.cleanable !== false && !c.running) add(c.path)
  for (const d of report.devCaches || []) {
    if (d.cleanable !== false) add(d.path)
  }
  for (const b of report.browsers || []) if (!b.running) add(b.path)
  for (const a of report.appCaches || []) {
    if (a.cleanable === false || a.running) continue
    for (const p of a.paths || []) add(p)
  }
  for (const p of photoAllowed) add(p)
  for (const app of report.special || []) {
    for (const c of app.categories || []) {
      if (!c.cleanable) continue
      for (const p of c.paths || []) add(p)
    }
  }
  return set
}

// 清理成功后把已移动的路径从内存报告中剔除：连续清理不必全量重扫，
// 同一项的再次清理会得到「不在允许列表」的明确报错而非逐条 lstat 失败。
// 部分清理的组保留扫描时的 kb，并标明它不能代表剩余路径的大小。
export function pruneReport(report, cleanedPaths) {
  if (!report || !cleanedPaths || cleanedPaths.size === 0) return report
  const pruneGroup = (group) => {
    const original = Array.isArray(group.paths) ? group.paths : []
    const paths = original.filter((p) => !cleanedPaths.has(p))
    return paths.length === original.length ? { ...group, paths } : { ...group, paths, kbIncomplete: true }
  }
  const r = { ...report }
  r.leftoverGroups = (report.leftoverGroups || []).map(pruneGroup).filter((g) => g.paths.length > 0)
  r.caches = (report.caches || []).filter((c) => !cleanedPaths.has(c.path))
  r.devCaches = (report.devCaches || []).filter((d) => !cleanedPaths.has(d.path))
  r.browsers = (report.browsers || []).filter((b) => !cleanedPaths.has(b.path))
  r.appCaches = (report.appCaches || []).map(pruneGroup).filter((a) => a.paths.length > 0)
  r.special = (report.special || [])
    .map((app) => ({
      ...app,
      categories: (app.categories || []).map(pruneGroup).filter((c) => c.paths.length > 0),
    }))
    .filter((app) => app.categories.length > 0)
  return r
}

/**
 * 把一次清理的路径映射回扫描报告里的「大小 / 分类」，**只用于审计与复清分析**。
 * 放行判断仍然只看 allowedPaths；这里的映射不参与任何准入决定。
 * 多路径组只有总量，逐项只记分类。单路径且完整的组才有可归属的大小。
 *
 * @param {object|null} report 最近一次扫描报告
 * @param {string[]} paths 本次要清理的路径
 * @returns {Map<string, {kb: number|null, category: string, kbScope?: 'path'}>}
 */
export function cleanAnnotations(report, paths) {
  const wanted = new Set(Array.isArray(paths) ? paths.filter((p) => typeof p === 'string' && path.isAbsolute(p)) : [])
  const map = new Map()
  if (!report || wanted.size === 0) return map
  const put = (p, kb, category, kbScope) => {
    if (!wanted.has(p)) return
    const size = Number.isFinite(kb) && kb >= 0 ? kb : null
    if (map.has(p) && (map.get(p).kb != null || size == null)) return
    map.set(p, { kb: size, category, ...(kbScope ? { kbScope } : {}) })
  }
  const attribute = (group, category) => {
    const members = [...new Set(Array.isArray(group.paths) ? group.paths : [])]
    const sizeKnown = members.length === 1 && !group.kbIncomplete
    for (const p of members) put(p, sizeKnown ? group.kb : null, category, sizeKnown ? 'path' : undefined)
  }
  for (const g of report.leftoverGroups || []) attribute(g, 'leftover')
  for (const c of report.caches || []) put(c.path, c.kb, c.system ? 'system' : 'other')
  for (const d of report.devCaches || []) put(d.path, d.kb, 'dev')
  for (const b of report.browsers || []) put(b.path, b.kb, 'browser')
  for (const a of report.appCaches || []) attribute(a, 'app')
  for (const app of report.special || []) {
    for (const c of app.categories || []) attribute(c, 'special')
  }
  return map
}

/** 照片清理的审计标注：每个文件就是一个路径，大小取分组里的单文件 kb。 */
function photoCleanAnnotations(result, paths) {
  const wanted = new Set(Array.isArray(paths) ? paths.filter((p) => typeof p === 'string') : [])
  const map = new Map()
  if (!result || wanted.size === 0) return map
  for (const g of result.groups || []) {
    for (const it of g.items || []) {
      if (!it || typeof it.path !== 'string' || !wanted.has(it.path) || map.has(it.path)) continue
      map.set(it.path, { kb: Number.isFinite(it.kb) ? it.kb : null, category: 'photo' })
    }
  }
  return map
}

// 服务端分片：单批上限 200 不变，超出时按顺序切成多个批次（每片独立 batchId/审计），
// 避免「勾 300 项一次全部失败」。导出给测试直接验证切片与边界。
export function splitBatches(paths, limit = MAX_BATCH) {
  const list = Array.isArray(paths) ? paths : []
  const size = Number.isFinite(limit) && limit > 0 ? limit : MAX_BATCH
  const out = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

// 清理成功后从照片结果里剔除已移动的文件：相似组不足 2 张即消散，
// 避免 UI 继续展示已移走的照片并再次默认全选（点清理会 404/全部失败）。
export function prunePhotoResult(result, cleanedPaths) {
  if (!result || !Array.isArray(result.groups) || !cleanedPaths || cleanedPaths.size === 0) return result
  const groups = []
  for (const g of result.groups) {
    const items = (g.items || []).filter((it) => it && !cleanedPaths.has(it.path))
    if (items.length < 2) continue
    const totalKb = items.reduce((n, it) => n + (Number(it.kb) || 0), 0)
    const biggest = items.reduce((a, b) => ((Number(b.kb) || 0) > (Number(a.kb) || 0) ? b : a), items[0])
    groups.push({ ...g, items, totalKb, wastedKb: Math.max(0, totalKb - (Number(biggest.kb) || 0)) })
  }
  return { ...result, groups }
}

// 撤销后把已恢复的条目从内存批次里剔除（否则重试只会对它们报 notfound）。
export function trimUndoneBatch(moved, results) {
  const restored = new Set((Array.isArray(results) ? results : []).filter((r) => r.ok).map((r) => r.path))
  return (Array.isArray(moved) ? moved : []).filter((m) => !restored.has(m.from))
}

function estimateReclaim(paths) {
  const budget = Date.now() + 8000
  let logical = 0
  let allocated = 0
  let files = 0
  let truncated = false
  const walk = (p) => {
    if (truncated) return
    if (Date.now() > budget) { truncated = true; return }
    let st
    try { st = fs.lstatSync(p) } catch { return }
    if (st.isSymbolicLink()) return
    if (st.isFile()) { logical += st.size; allocated += (st.blocks || 0) * 512; files += 1; return }
    if (!st.isDirectory()) return
    let entries
    try { entries = fs.readdirSync(p, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue
      walk(path.join(p, entry.name))
    }
  }
  for (const p of paths) if (typeof p === 'string' && path.isAbsolute(p)) walk(p)
  let snapshots = 0
  if (process.platform === 'darwin') {
    try {
      const out = spawnSync('tmutil', ['listlocalsnapshots', '/'], { encoding: 'utf8', timeout: 3000 })
      snapshots = (String(out.stdout || '').match(/com\.apple\.TimeMachine/g) || []).length
    } catch { /* ignore */ }
  }
  return { logicalBytes: logical, allocatedBytes: allocated, files, truncated, snapshots }
}

function withinHome(p) {
  const home = path.resolve(process.env.HOME || os.homedir())
  const resolved = path.resolve(p)
  if (process.platform !== 'win32') return resolved === home || resolved.startsWith(home + path.sep)
  // Windows paths are case-insensitive; keep this consistent with isProtected.
  const lhs = resolved.toLowerCase()
  const rhs = home.toLowerCase()
  return lhs === rhs || lhs.startsWith(rhs + path.sep)
}

function runShell(cmd, args, timeoutMs = 120000, input = null) {
  return new Promise((resolve, reject) => {
    let child
    try { child = spawn(cmd, args, { stdio: [input === null ? 'ignore' : 'pipe', 'pipe', 'pipe'], windowsHide: true }) }
    catch (err) { reject(err); return }
    if (input !== null) {
      child.stdin.on('error', () => {}) // A decoder may fail before it reads the job.
      child.stdin.end(input, 'utf8')
    }
    let out = ''
    let err = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (c) => { out += c })
    child.stderr.on('data', (c) => { err += c })
    const timer = setTimeout(() => { try { child.kill() } catch { /* ignore */ } reject(new Error('命令超时')) }, timeoutMs)
    child.on('error', (error) => { clearTimeout(timer); reject(error) })
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, out, err }) })
  })
}

// 打开侧边栏即可显示的磁盘容量：直接 statfs 读取，毫秒级、只读，不触发扫描。
// 口径与扫描器 report.disk 一致（macOS 数据卷 / Windows 系统盘 / Linux 根分区）。
function bootMount() {
  if (process.platform === 'darwin') return '/System/Volumes/Data'
  if (process.platform === 'win32') return `${process.env.SystemDrive || 'C:'}\\`
  return '/'
}

function readUsage(mount) {
  const st = fs.statfsSync(mount)
  const free = st.bavail * st.bsize
  const used = (st.blocks - st.bfree) * st.bsize
  return { total: used + free, used, free }
}

function diskSnapshot() {
  const candidates = [bootMount()]
  const home = os.homedir()
  if (!candidates.includes(home)) candidates.push(home)
  for (const mount of candidates) {
    try {
      return { ...readUsage(mount), mount, at: Date.now() }
    } catch { /* 换下一个候选挂载点 */ }
  }
  return null
}

function listVolumes() {
  const out = []
  const add = (p) => {
    try {
      out.push({ path: p, label: path.basename(p) || p, ...readUsage(p) })
    } catch { /* ignore */ }
  }
  if (process.platform === 'darwin') {
    add('/')
    try {
      for (const name of fs.readdirSync('/Volumes')) {
        if (name.startsWith('.')) continue
        add(path.join('/Volumes', name))
      }
    } catch { /* ignore */ }
  } else if (process.platform === 'win32') {
    for (const letter of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
      const p = `${letter}:\\`
      if (fs.existsSync(p)) add(p)
    }
  } else {
    add('/')
    add(os.homedir())
  }
  const seen = new Set()
  return out.filter((v) => (seen.has(v.path) ? false : (seen.add(v.path), true)))
}

// 导出仅供测试断言播种顺序/字段传播/上限；生产代码只在本文件内使用。
export const treeCache = new Map()
const TREE_TTL_MS = 60 * 1000
// One walk can seed up to MAX_DIRS (500) levels plus the target itself. Keep the
// cap above that so seeding never evicts the target it just walked.
const TREE_CACHE_MAX = 2000

// tree.py walks the subtree once and returns a `dirs` map of per-directory
// listings; seeding every level at once makes drill-down cache hits instead
// of re-walking the subtree on each click.
export function seedTreeCache(target, data) {
  const at = Date.now()
  const dirs = data.dirs && typeof data.dirs === 'object' ? data.dirs : {}
  delete data.dirs
  // Seed the children first and the target last: if the target were inserted
  // first, a walk that seeds MAX_DIRS levels would push it past the cap and
  // evict it, so every home visit re-walked the whole subtree.
  for (const [p, d] of Object.entries(dirs)) {
    treeCache.set(path.resolve(p), {
      at,
      data: {
        path: p,
        children: Array.isArray(d.children) ? d.children : [],
        at: data.at,
        metric: data.metric,
        unavailable: d.unavailable || 0,
        skipped: d.skipped || 0,
        skippedCloud: d.skippedCloud || 0,
        cloudFiles: d.cloudFiles || 0,
        sharedFiles: d.sharedFiles || 0,
        sharedDupKb: d.sharedDupKb || 0,
        bigFilesCap: d.bigFilesCap || 0,
        bigFiles: Array.isArray(d.bigFiles) ? d.bigFiles : [],
      },
    })
  }
  treeCache.delete(target)
  treeCache.set(target, { at, data })
  // The target's size changed: refresh the cached parent rows too, otherwise
  // going back up after a refresh shows the old size for up to TREE_TTL_MS.
  const totalKb = (data.children || []).reduce((n, c) => n + (Number(c.kb) || 0), 0)
  let parent = path.dirname(target)
  for (let depth = 0; depth < 64; depth++) {
    const entry = treeCache.get(parent)
    if (!entry) break
    const row = (entry.data.children || []).find((c) => path.resolve(c.path) === target)
    if (row) row.kb = totalKb
    const up = path.dirname(parent)
    if (up === parent) break
    parent = up
  }
  while (treeCache.size > TREE_CACHE_MAX) treeCache.delete(treeCache.keys().next().value)
}

async function listChildren(dirPath, refresh = false, signal) {
  const home = process.env.HOME || os.homedir()
  const target = dirPath ? path.resolve(dirPath) : path.resolve(home)
  if (!withinHome(target)) throw Object.assign(new Error('只允许浏览个人文件夹'), { code: 'tree_outside' })
  let realHome
  let realTarget
  try {
    realHome = fs.realpathSync(process.env.HOME || os.homedir())
    realTarget = fs.realpathSync(target)
  } catch (err) {
    const missing = err && err.code === 'ENOENT'
    throw Object.assign(new Error(missing ? '目录不存在或已被删除' : '目录不可读，请检查权限'), { code: missing ? 'tree_missing' : 'tree_denied' })
  }
  const relative = path.relative(realHome, realTarget)
  let lst
  try { lst = fs.lstatSync(target) } catch (err) {
    const missing = err && err.code === 'ENOENT'
    throw Object.assign(new Error(missing ? '目录不存在或已被删除' : '目录不可读，请检查权限'), { code: missing ? 'tree_missing' : 'tree_denied' })
  }
  if (lst.isSymbolicLink() || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw Object.assign(new Error('链接或个人文件夹之外的路径不可浏览'), { code: 'tree_symlink' })
  const cached = treeCache.get(target)
  if (!refresh && cached && Date.now() - cached.at < TREE_TTL_MS) {
    // LRU: refresh recency so a frequently used directory is not the oldest.
    treeCache.delete(target)
    treeCache.set(target, cached)
    return cached.data
  }
  // The independent read-only helper includes hidden entries and reports partial totals.
  // It has its own child handle so browsing never cancels an audit or photo scan.
  let res
  try {
    res = await runScanner([target], 120000, { env: { DEEPCLEAN_CLOUD_ROOTS: JSON.stringify(cloudRoots()) }, signal }, 'tree.py')
  } catch (err) {
    if (signal?.aborted) throw Object.assign(new Error('已停止加载'), { code: 'aborted' })
    if (/扫描超时/.test(String(err && err.message))) throw Object.assign(new Error('目录统计超时'), { code: 'tree_timeout' })
    throw err
  }
  if (signal?.aborted) throw Object.assign(new Error('已停止加载'), { code: 'aborted' })
  if (res.code !== 0) throw Object.assign(new Error('目录统计失败或无权读取，请检查权限后重试'), { code: 'tree_failed' })
  const data = JSON.parse(res.out)
  seedTreeCache(target, data)
  return data
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

function scannerError(err) {
  const error = String(err && err.message ? err.message : err)
  const code = err && err.code
  // 只透传可预期的稳定错误码，客户端才能本地化；其他原始 fs 错误不暴露。
  if (typeof code === 'string' && (code === 'python_unavailable' || code === 'python_probe_failed' || code === 'aborted' || code.startsWith('tree_'))) {
    return { error, errorCode: code }
  }
  return { error }
}

function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('请求体过大'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')) }
      catch (err) { reject(new Error(`JSON 解析失败：${err.message}`)) }
    })
    req.on('error', reject)
  })
}

function humanBytes(n) {
  const bytes = Math.max(0, Number(n) || 0)
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${Math.round(bytes)} B`
}

// ── disk_inspect：只读路径事实检查（模型工具） ──────────────────────────────
// 只做 lstat / readdir / 一次 Spotlight 查询：不跟随符号链接、不写入、不移动任何文件。
const INSPECT_BUDGET_MS = 1200
const INSPECT_MAX_ENTRIES = 20000

function inspectTree(abs) {
  const out = { sizeBytes: 0, allocatedBytes: 0, files: 0, dirs: 0, truncated: false, top: [] }
  const deadline = Date.now() + INSPECT_BUDGET_MS
  const stack = [abs]
  let visited = 0
  while (stack.length > 0) {
    if (Date.now() > deadline || visited > INSPECT_MAX_ENTRIES) { out.truncated = true; break }
    const dir = stack.pop()
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { continue }
    for (const entry of entries) {
      visited += 1
      const child = path.join(dir, entry.name)
      let st
      try { st = fs.lstatSync(child) } catch { continue }
      if (st.isSymbolicLink()) continue
      if (st.isFile()) {
        out.sizeBytes += st.size
        out.allocatedBytes += (st.blocks || 0) * 512
        out.files += 1
        if (dir === abs) out.top.push({ name: entry.name, type: 'file', bytes: st.size })
      } else if (st.isDirectory()) {
        out.dirs += 1
        if (dir === abs) out.top.push({ name: entry.name, type: 'dir', bytes: 0 })
        stack.push(child)
      }
      if (visited > INSPECT_MAX_ENTRIES) { out.truncated = true; break }
    }
  }
  out.top.sort((a, b) => (a.type === b.type ? b.bytes - a.bytes : a.type === 'file' ? -1 : 1))
  out.top = out.top.slice(0, 8)
  return out
}

function appInstallState(bundleId) {
  if (!bundleId || process.platform !== 'darwin') return 'unknown'
  try {
    const out = spawnSync('mdfind', [`kMDItemCFBundleIdentifier == "${bundleId}"`], { encoding: 'utf8', timeout: 2500, windowsHide: true })
    if (out.error || out.status !== 0) return 'unknown'
    return String(out.stdout || '').trim() === '' ? 'not-found' : 'installed'
  } catch {
    return 'unknown'
  }
}

/** 在最近一次报告里找该路径所属的条目（只读事实，不参与放行判断）。
 *  requireFresh=false 只用于「路径是否被报告覆盖」的准入判断，不用于允许集合。 */
function reportMatchFor(abs, report = lastReport, options = {}) {
  const requireFresh = !options || options.requireFresh !== false
  if (!report) return null
  if (requireFresh && Date.now() - lastReportAt > REPORT_TTL_MS) return null
  const inside = (p) => typeof p === 'string' && (p === abs || abs.startsWith(p + path.sep))
  for (const g of report.leftoverGroups || []) {
    if ((g.paths || []).some(inside)) return { category: 'leftover', name: g.name || g.baseId, bucket: g.bucket, kb: g.kb, why: g.why }
  }
  for (const a of report.appCaches || []) {
    if ((a.paths || []).some(inside)) return { category: 'app', name: a.app || a.baseId, bucket: a.cleanable === false || a.running ? 'confirm' : 'safe', kb: a.kb }
  }
  for (const c of report.caches || []) {
    if (inside(c.path)) return { category: c.system ? 'system' : 'other', name: path.basename(c.path), bucket: c.system ? 'system' : 'cache', kb: c.kb }
  }
  for (const d of report.devCaches || []) {
    if (inside(d.path)) return { category: 'dev', name: path.basename(d.path), bucket: d.cleanable === false ? 'confirm' : 'safe', kb: d.kb, why: d.advice }
  }
  for (const b of report.browsers || []) {
    if (inside(b.path)) return { category: 'browser', name: b.name, bucket: b.running ? 'confirm' : 'safe', kb: b.kb }
  }
  for (const app of report.special || []) {
    for (const c of app.categories || []) {
      if ((c.paths || []).some(inside)) return { category: 'special', name: `${app.app} ${c.name}`, bucket: c.cleanable ? 'safe' : 'confirm', kb: c.kb }
    }
  }
  for (const f of report.bigFiles || []) {
    if (f.path === abs) return { category: 'bigfile', name: path.basename(abs), bucket: 'info', kb: f.kb }
  }
  return null
}

// 不可信文本净化（宿主侧副本）：工具输出会回到模型上下文，文件名/目录名同样可能带换行或指令。
function untrustedTextHost(value, maxLen = 120) {
  let s = typeof value === 'string' ? value : value == null ? '' : String(value)
  try { s = s.normalize('NFKC') } catch { /* ignore */ }
  s = s.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u200e\u200f\u200b-\u200d\u2060\ufeff]/g, ' ')
  s = s.replace(/\s+/g, ' ').trim()
  if (maxLen > 0 && s.length > maxLen) s = `${s.slice(0, maxLen - 1)}…`
  return s
}

// 隐私默认：工具输出也不回传完整绝对路径；保留 ~ + 顶层目录 + basename。
function safeDisplayPathHost(p) {
  const home = path.resolve(process.env.HOME || os.homedir()).replace(/\\/g, '/')
  const raw = String(p || '').replace(/\\/g, '/')
  if (!raw) return ''
  const name = untrustedTextHost(path.posix.basename(raw), 100)
  const insideHome = raw === home || raw.startsWith(home + '/')
  const rest = (insideHome ? raw.slice(home.length) : raw).replace(/^\/+/, '')
  const parts = rest.split('/').filter(Boolean)
  const top = parts.length > 1 && parts[0] !== name ? untrustedTextHost(parts[0], 40) : ''
  if (insideHome) return top ? `~/${top}/…/${name}` : `~/…/${name}`
  return top ? `${top}/…/${name}` : `…/${name}`
}

// ── disk_audit 输出净化：剥掉「建议命令」节，给模型可检查的 itemId ─────────────
// 模型只做只读解释；扫描器生成的 mv / Move-Item 命令不进入模型上下文，避免它直接照抄执行。

const SUGGESTION_HEADING = /^## 十、建议命令.*$/m
const AUDIT_HINTS_MAX = 30
const AUDIT_BOUNDARY = '> 本报告由 disk_audit 生成，供解释使用；清理与恢复仍由用户在 DeepClean 面板体检并确认。报告覆盖可清理候选，不是整盘占用分布。'
const AUDIT_HINTS_HEADER = '可检查条目 id（传给 disk_inspect 的 itemId；仅对本次报告有效）：'

/** 去掉扫描器「十、建议命令」一节（到文末）并去掉尾部空白。 */
export function sanitizeAuditMarkdown(markdown) {
  const text = typeof markdown === 'string' ? markdown : ''
  const match = SUGGESTION_HEADING.exec(text)
  if (!match) return text.trimEnd()
  return text.slice(0, match.index).trimEnd()
}

/** 从报告推导可检查的 itemId 列表；编号规则必须与 inspectTargets() 一致。 */
export function auditHints(report) {
  const lines = []
  if (!report) return lines
  const push = (id, name) => {
    if (lines.length >= AUDIT_HINTS_MAX) return
    const label = untrustedTextHost(name, 80) || '(未命名)'
    lines.push(`- ${id} · ${label}`)
  }
  const base = (p) => path.basename(String(p || '').replace(/\\/g, '/'))
  ;(report.leftoverGroups || []).forEach((g, i) => push(`leftover:${i}`, g.name || g.baseId))
  ;(report.appCaches || []).forEach((a, i) => push(`appCaches:${i}`, a.app || a.baseId))
  ;(report.devCaches || []).forEach((d, i) => push(`devCaches:${i}`, base(d.path)))
  ;(report.browsers || []).forEach((b, i) => push(`browsers:${i}`, b.name))
  ;(report.special || []).forEach((app, ai) => (app.categories || []).forEach((c, ci) => push(`special:${ai}:${ci}`, `${app.app || ''} ${c.name || ''}`)))
  ;(report.caches || []).forEach((c, i) => push(`caches:${i}`, base(c.path)))
  ;(report.bigFiles || []).forEach((f, i) => push(`bigFiles:${i}`, base(f.path)))
  return lines
}

/** disk_audit 的最终输出：边界说明 + itemId 清单（放正文前，避免被截断）+ 无命令节报告。 */
function renderAuditOutput(markdown, report) {
  const parts = [AUDIT_BOUNDARY, '']
  const hints = auditHints(report)
  if (hints.length > 0) parts.push(AUDIT_HINTS_HEADER, ...hints, '')
  const body = sanitizeAuditMarkdown(markdown)
  if (body) parts.push(body)
  return clip(parts.join('\n'))
}

// 默认 --redact 时扫描器把 HOME 换成 "~"（JSON 也一样）；只读检查要还原成真实路径，
// 否则 itemId 会被解析到进程工作目录。脱敏只影响模型看到的输出，磁盘路径必须还原。
function expandReportPath(p) {
  const s = typeof p === 'string' ? p : ''
  if (s === '~') return os.homedir()
  if (s.startsWith('~/') || s.startsWith('~\\')) return path.join(os.homedir(), s.slice(2))
  return s
}

/** 把脱敏过的报告路径还原成绝对路径（不修改原始 JSON，返回拷贝）。 */
export function normalizeToolReport(report) {
  if (!report || typeof report !== 'object') return null
  const fix = (list) => (Array.isArray(list) ? list : []).map((p) => expandReportPath(p))
  return {
    ...report,
    home: expandReportPath(report.home),
    leftoverGroups: (report.leftoverGroups || []).map((g) => ({ ...g, paths: fix(g.paths) })),
    appCaches: (report.appCaches || []).map((a) => ({ ...a, paths: fix(a.paths) })),
    devCaches: (report.devCaches || []).map((d) => ({ ...d, path: expandReportPath(d.path) })),
    browsers: (report.browsers || []).map((b) => ({ ...b, path: expandReportPath(b.path) })),
    caches: (report.caches || []).map((c) => ({ ...c, path: expandReportPath(c.path) })),
    special: (report.special || []).map((app) => ({ ...app, categories: (app.categories || []).map((c) => ({ ...c, paths: fix(c.paths) })) })),
    bigFiles: (report.bigFiles || []).map((f) => ({ ...f, path: expandReportPath(f.path) })),
    cloudStorage: (report.cloudStorage || []).map((c) => ({ ...c, path: expandReportPath(c.path) })),
  }
}

/** 把面板 buildRows 的 inspectKey 映射回真实路径。编号规则必须与 lib/client.js 的 buildRows 一致。 */
function inspectTargets(report) {
  const map = new Map()
  if (!report) return map
  const put = (key, p) => { if (typeof p === 'string' && p) map.set(key, p) }
  ;(report.leftoverGroups || []).forEach((g, i) => put(`leftover:${i}`, (g.paths || [])[0]))
  ;(report.appCaches || []).forEach((a, i) => put(`appCaches:${i}`, (a.paths || [])[0]))
  ;(report.devCaches || []).forEach((d, i) => put(`devCaches:${i}`, d.path))
  ;(report.browsers || []).forEach((b, i) => put(`browsers:${i}`, b.path))
  ;(report.special || []).forEach((app, ai) => (app.categories || []).forEach((c, ci) => put(`special:${ai}:${ci}`, (c.paths || [])[0])))
  ;(report.caches || []).forEach((c, i) => put(`caches:${i}`, c.path))
  ;(report.bigFiles || []).forEach((f, i) => put(`bigFiles:${i}`, f.path))
  return map
}

/** 只读检查的数据来源：优先时间较新的 toolReport（disk_audit）或面板 lastReport。 */
function currentInspectSource() {
  if (lastToolReport && lastToolReportAt > lastReportAt) return { report: lastToolReport, at: lastToolReportAt, source: 'tool' }
  if (lastReport) return { report: lastReport, at: lastReportAt, source: 'panel' }
  return null
}

/** itemId 命中的条目是否包含多个路径（组类条目只检查第一个路径）。 */
function inspectItemMeta(report, itemId) {
  if (!report || typeof itemId !== 'string') return null
  const parts = itemId.split(':')
  const idx = (value) => {
    const n = Number(value)
    return Number.isInteger(n) && n >= 0 ? n : -1
  }
  const keys = { leftover: 'leftoverGroups', appCaches: 'appCaches', browsers: 'browsers', devCaches: 'devCaches', caches: 'caches', bigFiles: 'bigFiles' }
  if (keys[parts[0]]) {
    const item = (report[keys[parts[0]]] || [])[idx(parts[1])]
    if (!item) return null
    const paths = Array.isArray(item.paths) ? item.paths : item.path ? [item.path] : []
    return { paths, multiPath: paths.length > 1 }
  }
  if (parts[0] === 'special') {
    const app = (report.special || [])[idx(parts[1])]
    const category = app && (app.categories || [])[idx(parts[2])]
    if (!category) return null
    const paths = Array.isArray(category.paths) ? category.paths : []
    return { paths, multiPath: paths.length > 1 }
  }
  return null
}

/**
 * 只读检查输出的「是否在清理允许集合内」：只有**新鲜的面板报告**可以判定；
 * toolReport（disk_audit 的临时报告）只用于定位条目，永远不参与放行。
 */
export function inspectAllowance({ source, stale, report, abs } = {}) {
  if (source !== 'panel' || stale || !report || !abs) return false
  return allowedPaths(report).has(abs)
}

export function inspectPath(target, report) {
  const explicit = report !== undefined && report !== null
  const src = explicit ? { report, at: Date.now(), source: 'panel' } : (currentInspectSource() || { report: null, at: 0, source: 'panel' })
  const stale = !!src.at && Date.now() - src.at > REPORT_TTL_MS
  const result = { path: '', display: '', exists: false, type: 'unknown', error: '', source: src.source, reportAt: src.at, stale }
  const obj = target && typeof target === 'object' ? target : { path: target }
  const itemId = typeof obj.itemId === 'string' ? obj.itemId.trim() : ''
  const rawPath = typeof obj.path === 'string' ? obj.path.trim() : ''
  let abs = ''
  if (itemId) {
    const resolved = inspectTargets(src.report).get(itemId)
    if (!resolved) return { ...result, error: '未找到该条目：报告可能已过期或该项已被清理（请重新体检后再试）' }
    abs = path.resolve(resolved)
    result.itemId = itemId
    const meta = inspectItemMeta(src.report, itemId)
    if (meta && meta.multiPath) result.multiPath = true
  } else if (rawPath) {
    abs = path.resolve(expandReportPath(rawPath))
    // fail-closed：只允许检查最近一次体检报告覆盖的路径，避免注入后拿只读工具探测任意目录。
    if (!reportMatchFor(abs, src.report, { requireFresh: false })) {
      return { ...result, error: '不在最近一次体检报告范围内（本工具只检查报告覆盖的条目；请先体检，或传入面板提供的 itemId）' }
    }
  } else {
    return { ...result, error: '需要 itemId 或绝对路径' }
  }
  result.path = abs
  result.display = safeDisplayPathHost(abs)
  let st
  try {
    st = fs.lstatSync(abs)
  } catch (err) {
    result.error = err && err.code === 'ENOENT' ? '路径不存在（可能已被清理或从未存在）' : `无法读取：${err && err.code ? err.code : String(err)}`
    return result
  }
  result.exists = true
  result.type = st.isSymbolicLink() ? 'symlink' : st.isDirectory() ? 'dir' : st.isFile() ? 'file' : 'other'
  result.mtime = st.mtimeMs
  result.atime = st.atimeMs
  result.sizeBytes = st.size
  if (result.type === 'dir') Object.assign(result, inspectTree(abs))
  else if (result.type === 'file') {
    result.files = 1
    result.allocatedBytes = (st.blocks || 0) * 512
  }
  result.report = reportMatchFor(abs, src.report, { requireFresh: false })
  result.allowed = inspectAllowance({ source: src.source, stale, report: src.report, abs })
  const rawBundleId = (/[\\/]Library[\\/](?:Group )?Containers[\\/]([^\\/]+)/.exec(abs) || [])[1]
  const bundleId = untrustedTextHost(rawBundleId || '', 128)
  if (bundleId && /^[A-Za-z0-9._-]{1,128}$/.test(bundleId)) {
    result.bundleId = bundleId
    result.installed = appInstallState(bundleId)
  }
  const appRoot = (/^(\/Applications\/[^/]+\.app)(?:\/|$)/.exec(abs) || [])[1]
  if (appRoot) result.appBundle = { display: safeDisplayPathHost(appRoot), exists: fs.existsSync(appRoot) }
  return result
}

export function renderInspect(info) {
  const L = []
  L.push(`# 只读路径检查：\`${info.display || '(空)'}\``)
  L.push('')
  if (!info.exists) {
    L.push(`- 结果：${info.error || '不存在或不可读'}`)
    L.push('')
    L.push('说明：本工具只读，未修改、未移动任何文件。')
    return L.join('\n')
  }
  if (info.itemId) L.push(`- 条目 id：${untrustedTextHost(info.itemId, 80)}`)
  L.push(`- 类型：${{ dir: '目录', file: '文件', symlink: '符号链接（未跟随）', other: '其他' }[info.type] || info.type}`)
  if (info.type === 'dir' || info.type === 'file') {
    L.push(`- 占用（逻辑）：${humanBytes(info.sizeBytes)}；按分配块：${humanBytes(info.allocatedBytes)}`)
    if (info.type === 'dir') {
      L.push(`- 文件：${info.files} 个；子目录：${info.dirs} 个；统计${info.truncated ? '**不完整**（达到只读时间/条目预算）' : '完整'}`)
      if (info.top && info.top.length > 0) {
        L.push(`- 顶层子项（文件按大小）：${info.top.map((t) => (t.type === 'dir' ? `${untrustedTextHost(t.name, 60)}/` : `${untrustedTextHost(t.name, 60)} ${humanBytes(t.bytes)}`)).join('；')}`)
      }
    } else {
      L.push(`- 文件数：1；修改时间：${new Date(info.mtime).toLocaleString()}`)
    }
  }
  if (info.type === 'dir') L.push(`- 修改时间：${new Date(info.mtime).toLocaleString()}`)
  if (info.report) {
    const r = info.report
    const fromTool = info.source === 'tool'
    L.push(`- 报告来源：${fromTool ? '工具体检（不参与清理放行）' : '面板体检'}`)
    L.push(`- 报告时间：${info.reportAt ? new Date(info.reportAt).toLocaleString() : '未知'}；状态：${info.stale ? '已过期（清理前需重新体检）' : '新鲜'}`)
    if (info.multiPath) L.push('- 注意：该条目包含多个路径，只检查了第一个')
    L.push(`- 报告归类（${fromTool ? 'disk_audit 工具报告' : '面板报告'}）：${r.category} · 分档 ${r.bucket} · ${humanBytes((r.kb || 0) * 1024)}${r.name ? ` · 名称「${untrustedTextHost(r.name, 120)}」` : ''}`)
    L.push(`- 该路径是否在清理允许集合内（程序判定，不是清理建议）：${info.allowed ? '是' : '否'}`)
    if (r.why) L.push(`- 扫描器说明：${untrustedTextHost(r.why, 240)}`)
  } else {
    L.push('- 扫描器归类：最近一次体检报告未覆盖该路径')
  }
  if (info.bundleId) {
    const state = info.installed === 'installed' ? '已安装' : info.installed === 'not-found' ? '未找到（Spotlight 查询不到）' : '无法确认'
    L.push(`- Bundle ID：${untrustedTextHost(info.bundleId, 120)}；对应 App：${state}`)
  }
  if (info.appBundle) L.push(`- App 包：${info.appBundle.display || '（已脱敏）'}（${info.appBundle.exists ? '存在' : '不存在'}）`)
  L.push('')
  L.push('说明：本工具只读，未修改、未移动任何文件；分档与报告大小来自报告快照，文件数与当前大小来自本次只读统计；输出中的路径已脱敏，文件名已单行化。')
  return L.join('\n')
}

// ── disk_report：只读取面板最近一次报告做摘要（不触发扫描、不写文件） ───────
const RISK_TIERS = ['recommended', 'optional', 'review', 'protected']
const RISK_LABEL = { recommended: '推荐清理', optional: '可选清理', review: '需确认', protected: '受保护' }

function normalizedReportPath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/\/+$/, '')
}

function insideReportPath(p, parent) {
  const a0 = normalizedReportPath(p)
  const b0 = normalizedReportPath(parent)
  if (!a0 || !b0) return false
  const win = /^[a-z]:/i.test(a0) || /^[a-z]:/i.test(b0)
  const a = win ? a0.toLowerCase() : a0
  const b = win ? b0.toLowerCase() : b0
  return a === b || a.startsWith(b + '/')
}

/** 摘要里的四档计数：判定规则与面板 buildRows 的 rowRisk 一致（受保护 > 需确认 > 推荐 > 可选）。 */
function reportRiskRows(report) {
  const whitelist = loadWhitelist()
  const rows = []
  if (!report) return rows
  const running = [...(report.caches || []), ...(report.devCaches || []), ...(report.browsers || []), ...(report.appCaches || [])]
    .filter((item) => item && item.running)
    .flatMap((item) => item.paths || [item.path])
    .filter(Boolean)
  const add = (row) => {
    row.paths = [...new Set((row.paths || []).filter(Boolean))]
    if (row.checkable && row.paths.some((p) => running.some((base) => insideReportPath(p, base) || insideReportPath(base, p)))) {
      row.checkable = false
      row.recommended = false
    }
    row.protected = row.paths.some((p) => whitelist.some((w) => insideReportPath(p, w)))
    row.checkable = !!row.checkable && !row.protected && row.paths.length > 0
    row.tier = row.protected ? 'protected' : !row.checkable ? 'review' : row.recommended ? 'recommended' : 'optional'
    rows.push(row)
  }
  const label = (p) => path.basename(normalizedReportPath(p))
  ;(report.leftoverGroups || []).forEach((g, i) => add({ itemId: `leftover:${i}`, name: g.name || g.baseId, paths: g.paths, kb: g.kb, checkable: g.bucket === 'safe', recommended: g.bucket === 'safe' }))
  ;(report.appCaches || []).forEach((a, i) => add({ itemId: `appCaches:${i}`, name: a.app || a.baseId, paths: a.paths, kb: a.kb, checkable: a.cleanable !== false && !a.running, recommended: a.cleanable !== false && !a.running }))
  ;(report.devCaches || []).forEach((d, i) => add({ itemId: `devCaches:${i}`, name: label(d.path), paths: [d.path], kb: d.kb, checkable: d.cleanable !== false, recommended: d.cleanable !== false }))
  ;(report.browsers || []).forEach((b, i) => add({ itemId: `browsers:${i}`, name: b.name, paths: [b.path], kb: b.kb, checkable: !b.running, recommended: !b.running }))
  ;(report.special || []).forEach((app, ai) => (app.categories || []).forEach((c, ci) => add({ itemId: `special:${ai}:${ci}`, name: `${app.app || ''} ${c.name || ''}`, paths: c.paths, kb: c.kb, checkable: !!c.cleanable, recommended: !!c.cleanable })))
  const specific = rows.flatMap((r) => r.paths)
  ;(report.caches || []).forEach((c, i) => {
    if (specific.some((p) => insideReportPath(c.path, p) || insideReportPath(p, c.path))) return
    const locked = !!c.system || !!c.admin || c.cleanable === false || !!c.running
    add({ itemId: `caches:${i}`, name: label(c.path), paths: [c.path], kb: c.kb, checkable: !locked, recommended: false })
  })
  return rows
}

function tierLine(rows, tier) {
  const list = rows.filter((r) => r.tier === tier)
  const totalKb = list.reduce((sum, r) => sum + (Number(r.kb) || 0), 0)
  return `- ${RISK_LABEL[tier]}（${tier}）：${list.length} 项，合计 ${humanBytes(totalKb * 1024)}`
}

function tierTop(rows, tier, limit = 5) {
  return rows
    .filter((r) => r.tier === tier)
    .sort((a, b) => (Number(b.kb) || 0) - (Number(a.kb) || 0))
    .slice(0, limit)
    .map((r) => `- ${untrustedTextHost(r.name, 80) || '(未命名)'} · ${humanBytes((Number(r.kb) || 0) * 1024)} · ${r.itemId}`)
}

export function renderReportSummary(report, at) {
  const L = []
  const now = Date.now()
  const stamp = Number.isFinite(at) && at > 0 ? at : now
  const ageMs = Math.max(0, now - stamp)
  const ageMin = Math.floor(ageMs / 60000)
  const stale = ageMs > REPORT_TTL_MS
  const windows = report && report.platform === 'windows'
  L.push('# DeepClean 面板报告摘要（只读）')
  L.push('')
  L.push(`- 生成时间：${untrustedTextHost(report && report.generatedAt, 60) || '未知'}`)
  L.push(`- 报告年龄：${ageMin < 1 ? '刚生成' : `${ageMin} 分钟前`}；状态：${stale ? '已过期（超过 10 分钟，清理前需重新体检）' : '新鲜'}`)
  L.push(`- 平台：${windows ? 'Windows' : 'macOS'}`)
  if (report && report.fda) {
    const status = report.fda.status
    const fdaText = { granted: '已授权', denied: '未授权（App 容器会显示为空壳）', unknown: '无法确认' }[status] || untrustedTextHost(status, 40)
    L.push(`- 完全磁盘访问（FDA）：${fdaText}（${untrustedTextHost(report.fda.detail, 120)}）`)
  } else {
    const access = (report && report.access) || {}
    L.push(`- 权限：${untrustedTextHost(access.detail, 120) || (access.admin ? '管理员' : '普通用户')}`)
  }
  const disk = (report && report.disk) || {}
  L.push(`- 磁盘：共 ${humanBytes(disk.total)}，已用 ${humanBytes(disk.used)}，可用 ${humanBytes(disk.free)}`)
  const trashKb = report && Number.isFinite(report.trashKb) ? report.trashKb : null
  L.push(`- ${windows ? '隔离区' : '废纸篓'}占用：${trashKb === null ? '未统计' : humanBytes(trashKb * 1024)}`)
  const est = (report && report.estimate) || {}
  L.push(`- 预计可释放：${humanBytes((Number(est.totalKb) || 0) * 1024)}（推荐残留 ${humanBytes((Number(est.safeKb) || 0) * 1024)} / 缓存 ${humanBytes((Number(est.cacheKb) || 0) * 1024)} / 开发缓存 ${humanBytes((Number(est.devKb) || 0) * 1024)}）`)
  if (Number(est.confirmKb)) L.push(`- 需确认项合计：${humanBytes(Number(est.confirmKb) * 1024)}（不计入预计可释放，永不自动勾选）`)
  L.push('')
  const rows = reportRiskRows(report)
  L.push('## 四档条目（与面板同一判定规则）')
  L.push('')
  for (const tier of RISK_TIERS) L.push(tierLine(rows, tier))
  for (const tier of RISK_TIERS) {
    L.push('')
    L.push(`### ${RISK_LABEL[tier]}（${tier}） Top 5`)
    L.push('')
    const top = tierTop(rows, tier)
    if (top.length === 0) L.push('（无）')
    else L.push(...top)
  }
  L.push('')
  L.push('### 大文件 Top 5')
  L.push('')
  const big = (report && Array.isArray(report.bigFiles) ? report.bigFiles : []).slice(0, 5)
  if (big.length === 0) {
    L.push('（无：本次可能是快速扫描，未扫描大文件；需要大文件清单请用 disk_audit 的 quick=false）')
  } else {
    big.forEach((f, i) => {
      const mtime = Number(f.mtime)
      const days = Number.isFinite(mtime) && mtime > 0 ? `${Math.floor((now - mtime) / 86400000)} 天未修改` : '修改时间未知'
      L.push(`- ${untrustedTextHost(path.basename(normalizedReportPath(f.path)), 80) || '(未命名)'} · ${humanBytes((Number(f.kb) || 0) * 1024)} · ${days} · bigFiles:${i}`)
    })
  }
  L.push('')
  L.push('## 范围与数据边界')
  L.push('')
  if (report && report.scope) L.push(`- 扫描范围：${untrustedTextHost(report.scope, 240)}`)
  else L.push('- 扫描范围：`~/Library` 的缓存与容器、开发缓存、云盘目录、废纸篓与大文件；不含 `/private/var`、`/Library` 与其他用户目录。')
  L.push('- 本摘要只读取面板最近一次体检的内存报告：不触发新扫描、不写任何文件、不改变清理分档或允许集合。')
  L.push('- 报告覆盖可清理候选与部分大文件，不是整盘占用分布；分档与大小来自报告快照，条目的 itemId 只对生成它的这份报告有效。')
  L.push('- 清理由用户在 DeepClean 面板确认；模型只解释，不清理、不恢复、不给可执行命令。')
  return L.join('\n')
}

// Software jobs have their own authorization; they never enter allowedPaths().
let softwareService = null
const softwareToken = crypto.randomBytes(32).toString('hex')
function getSoftwareService() {
  if (!softwareService) softwareService = createSoftwareService({
    journalPath: path.join(DSH_HOME, 'deepclean-software-jobs.json'),
    discover: discoverSoftware,
    blocked: () => moveState.status === 'running' || scanState.status === 'running' || photosState.status === 'running',
    execute: executeSoftware,
    disk: diskSnapshot,
  })
  return softwareService
}
function softwareRequestAllowed(req, write = false) {
  const headers = req.headers || {}
  if (headers['x-deepclean-ui'] !== 'software') return false
  // Same-origin alone does not stop a DNS-rebinding page targeting the local server.
  if (!/^(?:127\.0\.0\.1|localhost|\[::1\])(?::[0-9]+)?$/i.test(headers.host || '')) return false
  const remote = req.socket?.remoteAddress
  if (remote && !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote)) return false
  if (headers['sec-fetch-site'] && headers['sec-fetch-site'] !== 'same-origin') return false
  if (headers.origin) {
    try { if (new URL(headers.origin).host !== headers.host) return false } catch { return false }
  }
  if (write && (headers['x-deepclean-token'] !== softwareToken || String(headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'application/json')) return false
  return true
}
// This measures just the selected installation. It does not estimate reclaimable bytes.
function measureSoftwareInstall(target) {
  if (!target || !path.isAbsolute(target) || path.dirname(target) === target || target === os.homedir() || /^\\\\/.test(target)) return null
  const roots = cloudRoots()
  const deadline = Date.now() + 250
  const seen = new Set()
  let count = 0, bytes = 0, partial = false
  let root
  try {
    root = fs.lstatSync(target)
    if (root.isSymbolicLink() || comparablePath(fs.realpathSync(target)) !== comparablePath(target) || isCloudBackedPath(target, roots)) return null
  } catch { return null }
  function visit(p, info) {
    if (++count > 8000 || Date.now() >= deadline) { partial = true; return false }
    try {
      const st = info || fs.lstatSync(p)
      if (st.isSymbolicLink()) return true
      if (st.dev !== root.dev || isCloudBackedPath(p, roots)) { partial = true; return true }
      if (st.isFile()) {
        const key = st.nlink > 1 && st.ino ? `${st.dev}:${st.ino}` : null
        if (key && seen.has(key)) return true
        if (key) seen.add(key)
        bytes += st.size
      } else if (st.isDirectory()) {
        const dir = fs.opendirSync(p)
        try {
          for (let entry; (entry = dir.readSync());) if (!visit(path.join(p, entry.name))) return false
        } finally { dir.closeSync() }
      }
    } catch { partial = true }
    return true
  }
  visit(target, root)
  return { bytes, partial }
}

function softwarePathProtected(location) {
  if (!location) return false
  if (!path.isAbsolute(location)) return true
  const paths = [location]
  try { paths.push(fs.realpathSync(location)) } catch { /* Some system entries have no readable install directory. */ }
  const protectedPaths = loadWhitelist(), roots = cloudRoots()
  return paths.some(p => isProtected(p, protectedPaths) || isCloudBackedPath(p, roots))
}
async function executeSoftware(item, recordProcess) {
  if (!item.executable || softwarePathProtected(item.location)) throw Object.assign(new Error('protected_path'), { code: 'protected_path' })
  // Invalidate all disk-write snapshots before an external uninstaller changes files.
  lastReport = null; lastReportAt = 0; photoAllowed.clear(); photosState.result = null; treeCache.clear()
  if (item.command?.kind === 'move-app') {
    if (process.platform !== 'darwin' || !item.location.endsWith('.app')) throw new Error('unsupported_platform')
    const allowedRoots = ['/Applications', path.join(os.homedir(), 'Applications')]
    if (!allowedRoots.some(root => path.dirname(item.location) === root || path.dirname(item.location) === path.join(root, 'Utilities'))) throw new Error('protected_path')
    for (let p = item.location; ; p = path.dirname(p)) {
      if (fs.lstatSync(p).isSymbolicLink()) throw new Error('symlink')
      if (p === path.dirname(p)) break
    }
    const st = fs.statSync(item.location, { bigint: true })
    if (String(st.dev) !== String(item.identity[0]) || String(st.ino) !== String(item.identity[1]) || String(st.mtimeNs) !== String(item.identity[2])) throw new Error('installation_changed')
    const out = moveToTrash([item.location], new Set([item.location]))
    if (!out.moved.length) throw new Error('move_failed')
    invalidateQuarantine()
    return { code: 0, batchId: out.batchId, auditOk: out.auditOk }
  }
  let file, args, env = item.command?.env || {}
  if (item.command?.kind === 'msi') {
    if (process.platform !== 'win32' || !/^\{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}$/i.test(item.productCode)) throw new Error('invalid_package_id')
    file = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/msiexec.exe')
    args = ['/x', item.productCode, '/norestart']
  } else if (item.command?.kind === 'appx') {
    if (process.platform !== 'win32' || !/^[A-Za-z0-9_.-]+$/.test(item.packageFullName)) throw new Error('invalid_package_id')
    file = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe')
    // Identifier is validated above; all remaining script text is a fixed template.
    const script = `$ErrorActionPreference='Stop'; try { $p=Get-AppxPackage | Where-Object { $_.PackageFullName -ceq '${item.packageFullName}' }; if (!$p -or $p.NonRemovable -or $p.IsFramework) { exit 2 }; Remove-AppxPackage -Package $p.PackageFullName -ErrorAction Stop; exit 0 } catch { exit 1 }`
    args = ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')]
  } else {
    if (!item.command?.stamps?.length) throw new Error('unsafe_executable')
    for (const stamp of item.command.stamps) if (JSON.stringify(fileStamp(stamp.path)) !== JSON.stringify(stamp)) throw new Error('installation_changed')
    file = item.command.file; args = item.command.args
  }
  // Uninstallers are not killed on timeout: interrupting an installer can corrupt its state.
  // Process completion remains observable even if the client leaves the page.
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { shell: false, cwd: os.homedir(), env: softwareEnv(env), windowsHide: false, stdio: ['ignore', 'ignore', 'ignore'] })
    let journalFailure = null
    child.on('error', reject)
    child.on('close', code => {
      if (journalFailure) return reject(journalFailure)
      const msi = item.command?.kind === 'msi'
      resolve({ code, canceled: msi && code === 1602, rebootRequired: msi && (code === 1641 || code === 3010), bootAt: msi ? bootTime() : null })
    })
    if (child.pid) {
      try { recordProcess(child.pid) } catch (err) { journalFailure = err }
    }
  })
}

export function apply(ctx) {
  ctx.tools.register(defineTool({
    name: 'disk_check_permissions',
    description: 'Check whether the host process can read every protected disk path: Full Disk Access on macOS, administrator status on Windows. Never scans. Call it before disk_audit when a scan reports missing items or the user asks why data is absent.',
    parameters: {},
    output,
    async execute() {
      return formatResult(await runScanner(['--check-permissions'], 30000))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'disk_audit',
    description: 'Scan disk usage on macOS or Windows (Linux is unverified) and return a Markdown report with cleanup tiers (recommended / optional / needs review / protected) and an estimated reclaimable total. Use this instead of du or df when the user asks what takes space or what is safe to clean up. Read-only: never deletes, moves, or modifies user files. Each call starts a new scan: quick mode (default) takes about 30–60 seconds and skips the full-disk large-file scan; pass quick=false to include files over 300 MB (up to 5 minutes, may time out). On macOS, a missing Full Disk Access aborts with authorization steps. The report covers cleanup candidates only, not a full-disk usage breakdown. Cleanup and restore always require the user\'s confirmation in the DeepClean panel.',
    parameters: {
      quick: { type: 'boolean', description: 'Skip the full-disk large-file scan (default true). Set false when the user asks about large files; a full scan can take several minutes.' },
      redact: { type: 'boolean', description: 'Replace the home directory with ~ and mask the hostname (default true; only disable when the user asks for diagnostics).' },
      platform: { type: 'string', enum: ['auto', 'macos', 'windows'], description: 'Target platform; auto detects the host (default auto).' },
    },
    output,
    async execute(args) {
      const opts = args && typeof args === 'object' ? args : {}
      const argv = []
      if (opts.platform && opts.platform !== 'auto') argv.push('--platform', String(opts.platform))
      if (opts.quick !== false) argv.push('--quick')
      if (opts.redact !== false) argv.push('--redact')
      let jsonDir = null
      try {
        // 内部始终用 --json 临时文件读结构化报告；不再暴露 json 参数（完整报告会超过输出上限）。
        jsonDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepclean-'))
        const reportFile = path.join(jsonDir, 'report.json')
        argv.push('--json', reportFile)
        const result = await runScanner(argv, 300000)
        if (result.code !== 0) return `扫描未完成（exit ${result.code}）\n\n${formatResult(result)}`
        const text = (result.out || '').trim() || formatResult(result)
        let report = null
        try {
          if (fs.existsSync(reportFile)) report = normalizeToolReport(JSON.parse(fs.readFileSync(reportFile, 'utf8')))
        } catch {
          report = null
        }
        // 只写 toolReport（给 disk_inspect 定位条目），绝不写面板的 lastReport。
        if (report) {
          lastToolReport = report
          lastToolReportAt = Date.now()
        }
        return renderAuditOutput(text, report)
      } finally {
        if (jsonDir) {
          try { fs.rmSync(jsonDir, { recursive: true, force: true }) } catch { /* ignore */ }
        }
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'disk_inspect',
    description: 'Read one item from the latest DeepClean report: type, size, file count, modification time, risk tier, whether the app is installed, and whether the program considers it cleanable. Pass itemId from a panel prompt or a disk_audit hint (for example leftover:0 or bigFiles:2), or an absolute path covered by the report; paths outside the report are rejected. An itemId is valid only for the report that produced it and may point to another item after a rescan or cleanup. Reports older than 10 minutes are accepted but marked stale, and their tiers may no longer match the cleanup allow-set. For group items only the first path of the group is inspected. If no report exists, ask the user to run a checkup or call disk_audit first. Read-only.',
    parameters: {
      itemId: { type: 'string', description: 'Item id from a panel prompt, disk_audit or disk_report (for example leftover:0 or bigFiles:2); takes precedence over path.' },
      path: { type: 'string', description: 'Absolute path to inspect (only paths covered by the latest report; use either itemId or path).' },
    },
    output,
    async execute(args) {
      const target = { path: args && typeof args.path === 'string' ? args.path : '', itemId: args && typeof args.itemId === 'string' ? args.itemId : '' }
      return clip(renderInspect(inspectPath(target)))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'disk_report',
    description: 'Read the DeepClean panel\'s most recent checkup report as a bounded Markdown summary without scanning again: time and staleness, platform, Full Disk Access, disk capacity, estimated reclaimable space, per-tier counts, top items with itemId, and large files with itemId. Use it when the user asks what the panel found, or when you need itemIds for disk_inspect without a rescan. Read-only; the summary cannot change cleanup tiers or the allow-set.',
    parameters: {},
    output,
    async execute() {
      if (!lastReport) return '暂无面板体检报告。请先在 DeepClean 面板运行一次体检，再让我读取报告。'
      return clip(renderReportSummary(lastReport, lastReportAt))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'disk_self_test',
    description: 'Run the scanner\'s read-only self-test: the macOS scan chain (4 checks) or the 7 Windows checks covering Python, permissions, registry access, quoting and report rendering. Usually seconds, up to 180 s; writes only to the system temp directory. Use only when diagnosing a broken scanner; normal disk questions use disk_audit. It does not replace disk_check_permissions.',
    parameters: {},
    output,
    async execute() {
      const result = await runScanner(['--self-test'], 180000)
      const text = formatResult(result)
      return result.code === 0 ? text : `自检未通过（exit ${result.code}）\n\n${text}`
    },
  }))

  ctx.inject(['webServer'], (webCtx) => {
    const disposers = []

    const route = (routePath, handler) => {
      disposers.push(webCtx.webServer.register({ kind: 'exact', path: routePath, handler }))
    }

    for (const endpoint of ['software', 'software/scan', 'software/plan', 'software/execute', 'software/reconcile', 'software/open']) {
      route('/dsh-deepclean/api/' + endpoint, async (req, res) => {
        const write = endpoint !== 'software'
        if (req.method !== (write ? 'POST' : 'GET')) return sendJson(res, 405, { error: 'method_not_allowed' })
        if (!softwareRequestAllowed(req, write)) return sendJson(res, 403, { error: 'request_denied' })
        try {
          const service = getSoftwareService()
          if (!write) return sendJson(res, 200, { ...service.snapshot(), token: softwareToken })
          const body = await readBody(req, 8192)
          const fields = { 'software/scan': [], 'software/open': ['itemId'], 'software/plan': ['itemId'], 'software/execute': ['planId', 'confirmed'], 'software/reconcile': ['jobId'] }[endpoint]
          if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !fields.includes(key))) return sendJson(res, 400, { error: 'invalid_request' })
          if (endpoint === 'software/scan') {
            if (service.snapshot().scanning || service.snapshot().active) return sendJson(res, 409, { error: 'busy' })
            service.scan().catch(() => {})
            return sendJson(res, 202, service.snapshot())
          }
          if (endpoint === 'software/open') {
            const current = service.snapshot()
            if (!current.at || Date.now() - current.at > REPORT_TTL_MS) return sendJson(res, 409, { error: 'stale_inventory' })
            const item = current.items.find(i => i.id === body.itemId && i.kind === 'desktop')
            if (!item) return sendJson(res, 404, { error: 'not_found' })
            if (process.env.DEEPCLEAN_NO_OPEN !== '1') {
              if (process.platform === 'darwin') {
                if (!path.isAbsolute(item.location) || !fs.existsSync(item.location)) return sendJson(res, 409, { error: 'installation_changed' })
                const result = await runShell('/usr/bin/open', ['-R', item.location], 15000)
                if (result.code !== 0) return sendJson(res, 409, { error: 'software_operation_failed' })
              } else if (process.platform === 'win32') {
                const ps = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe')
                const result = await runShell(ps, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from("$ErrorActionPreference='Stop'; Start-Process 'ms-settings:appsfeatures'", 'utf16le').toString('base64')], 15000)
                if (result.code !== 0) return sendJson(res, 409, { error: 'software_operation_failed' })
              } else return sendJson(res, 409, { error: 'unsupported_platform' })
            }
            return sendJson(res, 200, { ok: true })
          }
          if (endpoint === 'software/plan') {
            const plan = await service.plan(body.itemId)
            if (softwarePathProtected(plan.item.location)) return sendJson(res, 409, { error: 'protected_path' })
            return sendJson(res, 200, { ...plan, size: measureSoftwareInstall(plan.item.location) })
          }
          if (endpoint === 'software/execute') return sendJson(res, 202, await service.execute(body.planId, body.confirmed))
          return sendJson(res, 200, await service.reconcile(body.jobId))
        } catch (err) { sendJson(res, 409, { error: err.code || 'software_operation_failed' }) }
      })
    }

    // A fixed, bundled illustration; never expose arbitrary filesystem paths.
    route('/dsh-deepclean/assets/disk.png', async (req, res) => {
      if (req.method !== 'GET') return sendJson(res, 405, { error: '只支持 GET' })
      try {
        const bytes = fs.readFileSync(path.join(RESOURCES, 'images', 'disk.png'))
        res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' })
        res.end(bytes)
      } catch {
        sendJson(res, 404, { error: '图片不存在' })
      }
    })

    route('/dsh-deepclean/api/permissions', async (_req, res) => {
      try {
        const permissionRevision = process.platform === 'darwin' ? ++fdaRevision : 0
        const argv = ['--check-permissions']
        if (permissionRevision) argv.push('--permission-status')
        const result = await runScanner(argv, 30000)
        const text = (result.out || result.err).trim()
        if (permissionRevision) {
          const status = scannerFdaStatus(result)
          if (!status) return sendJson(res, 500, { code: result.code, error: text || '权限检查未返回结果' })
          return sendJson(res, 200, { code: result.code, status: status === 'denied' ? 'denied' : 'ok', text, fda: { status, revision: permissionRevision } })
        }
        sendJson(res, 200, { code: result.code, status: result.code === 2 ? 'denied' : 'ok', text })
      } catch (err) {
        sendJson(res, 500, scannerError(err))
      }
    })

    // 一键打开 macOS「完全磁盘访问」设置页；URL 是固定常量，不接受用户输入。
    // DEEPCLEAN_NO_OPEN=1 供 CI/测试跳过真正的 open 调用。
    route('/dsh-deepclean/api/open-privacy-settings', async (req, res) => {
      try {
        if (req.method !== 'POST') return sendJson(res, 405, { error: '只支持 POST' })
        if (process.platform !== 'darwin') return sendJson(res, 400, { error: '仅 macOS 支持' })
        if (process.env.DEEPCLEAN_NO_OPEN !== '1') {
          const result = await runShell('open', ['x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles'], 15000)
          if (result.code !== 0) return sendJson(res, 400, { error: '无法打开系统设置' })
        }
        sendJson(res, 200, { ok: true })
      } catch (err) {
        sendJson(res, 400, { error: String(err && err.message ? err.message : err) })
      }
    })

    route('/dsh-deepclean/api/overview', async (_req, res) => {
      sendJson(res, 200, {
        at: lastReportAt,
        report: lastReport,
        // 面板打开即可用的实时容量快照：数据来自 statfs，与是否扫描无关。
        disk: diskSnapshot(),
        scan: scanSummary(),
        history: loadHistory().slice(-30),
        cleanBatches: listCleanBatches(),
        quarantine: quarantineInfo(),
        whitelist: loadWhitelist(),
        paths: { audit: AUDIT_FILE, history: HISTORY_FILE, whitelist: WHITELIST_FILE },
        platform: process.platform,
      })
    })

    // 轻量刷新：只读一次 statfs，不触碰历史/扫描状态（面板每 60 秒或回到前台时调用）。
    route('/dsh-deepclean/api/disk', async (_req, res) => {
      sendJson(res, 200, { disk: diskSnapshot() })
    })

    route('/dsh-deepclean/api/scan', async (req, res) => {
      try {
        if (req.method === 'POST') {
          const body = await readBody(req).catch(() => ({}))
          const started = startScan(!!body.full)
          return sendJson(res, started ? 202 : 409, started ? { ok: true, scan: scanSummary() } : { error: '扫描已在进行中', scan: scanSummary() })
        }
        sendJson(res, 200, { scan: scanSummary(), report: lastReport, at: lastReportAt })
      } catch (err) {
        sendJson(res, 400, { error: String(err && err.message ? err.message : err) })
      }
    })

    route('/dsh-deepclean/api/scan/cancel', async (req, res) => {
      try {
        if (scanState.status !== 'running') return sendJson(res, 409, { error: '当前没有进行中的扫描' })
        scanState.canceled = true
        scanController?.abort()
        sendJson(res, 200, { ok: true, scan: scanSummary() })
      } catch (err) {
        sendJson(res, 400, { error: String(err && err.message ? err.message : err) })
      }
    })

    route('/dsh-deepclean/api/report', async (req, res) => {
      try {
        const url = new URL(req.url, 'http://dsh.local')
        const full = url.searchParams.get('full') === '1'
        const cached = url.searchParams.get('cached') === '1'
        if (cached && lastReport) return sendJson(res, 200, { report: lastReport, at: lastReportAt })
        const started = startScan(full)
        sendJson(res, started ? 202 : 409, { scan: scanSummary() })
      } catch (err) {
        sendJson(res, 500, { error: String(err && err.message ? err.message : err) })
      }
    })

    route('/dsh-deepclean/api/volumes', async (_req, res) => {
      try {
        sendJson(res, 200, { volumes: listVolumes() })
      } catch (err) {
        sendJson(res, 400, { error: String(err && err.message ? err.message : err) })
      }
    })

    route('/dsh-deepclean/api/tree', async (req, res) => {
      if (req.method !== 'GET') return sendJson(res, 405, { error: '只支持 GET' })
      // 客户端点「停止加载」会断开请求：把 close 映射成 AbortSignal，杀掉 tree.py，
      // 避免被放弃的遍历继续跑到 120s 超时。
      const controller = new AbortController()
      const onClose = () => { if (!res.writableEnded) controller.abort() }
      if (typeof res.on === 'function') res.on('close', onClose)
      try {
        const url = new URL(req.url, 'http://dsh.local')
        const target = url.searchParams.get('path') || ''
        const body = await listChildren(target, url.searchParams.get('refresh') === '1', controller.signal)
        if (!controller.signal.aborted && res.writableEnded !== true) sendJson(res, 200, body)
      } catch (err) {
        // 已断开/已取消的请求不再写响应，避免向关闭的流 end()。
        if (!controller.signal.aborted && err?.code !== 'aborted') sendJson(res, 400, scannerError(err))
      } finally {
        if (typeof res.off === 'function') res.off('close', onClose)
      }
    })

    // Read-only folder picker and fresh capacity preflight. No directory creation.
    route('/dsh-deepclean/api/destination', async (req, res) => {
      try {
        if (req.method !== 'GET') return sendJson(res, 405, { error: '只支持 GET' })
        const raw = new URL(req.url, 'http://localhost').searchParams.get('path') || ''
        if (!path.isAbsolute(raw)) throw new Error('请选择绝对路径的目标目录')
        const target = path.resolve(raw)
        if (fs.lstatSync(target).isSymbolicLink() || !fs.statSync(target).isDirectory()) throw new Error('目标必须是文件夹，且不能是符号链接')
        fs.accessSync(target, fs.constants.R_OK)
        let writable = true
        try { fs.accessSync(target, fs.constants.W_OK) } catch { writable = false }
        const folders = fs.readdirSync(target, { withFileTypes: true }).filter(e => e.isDirectory() && !e.isSymbolicLink())
          .map(e => ({ name: e.name, path: path.join(target, e.name) })).sort((a,b) => a.name.localeCompare(b.name))
        const usage = readUsage(target)
        sendJson(res, 200, { path: target, parent: path.dirname(target) === target ? null : path.dirname(target), writable, folders, ...usage })
      } catch (err) { sendJson(res, 400, { error: String(err.message || err) }) }
    })

    route('/dsh-deepclean/api/reveal', async (req, res) => {
      try {
        if (req.method !== 'POST') return sendJson(res, 405, { error: '只支持 POST' })
        const body = await readBody(req)
        const target = String(body.path || '')
        if (!target || !fs.existsSync(target)) throw new Error('路径不存在')
        const st = fs.statSync(target)
        if (!withinHome(target) && !st.isDirectory()) throw new Error('只允许打开个人文件夹内的文件或已存在的目录')
        if (process.platform === 'darwin') await runShell('open', ['-R', target], 15000)
        else if (process.platform === 'win32') await runShell('explorer', ['/select,' + target], 15000)
        else await runShell('xdg-open', [path.dirname(target)], 15000)
        sendJson(res, 200, { ok: true })
      } catch (err) {
        sendJson(res, 400, { error: String(err && err.message ? err.message : err) })
      }
    })

    route('/dsh-deepclean/api/photos', async (_req, res) => {
      sendJson(res, 200, { scan: photosSummary(), result: photosState.result })
    })

    route('/dsh-deepclean/api/photos/scan', async (req, res) => {
      try {
        if (req.method !== 'POST') return sendJson(res, 405, { error: '只支持 POST' })
        const started = startPhotoScan()
        sendJson(res, started ? 202 : 409, started ? { ok: true, scan: photosSummary() } : { error: '已有扫描在进行中', scan: photosSummary() })
      } catch (err) {
        sendJson(res, 400, { error: String(err && err.message ? err.message : err) })
      }
    })

    route('/dsh-deepclean/api/photos/cancel', async (_req, res) => {
      if (photosState.status !== 'running') return sendJson(res, 409, { error: '当前没有照片扫描' })
      photosState.status = 'canceled'
      photosState.stage = '已取消'
      photosState.finishedAt = Date.now()
      photoController?.abort()
      sendJson(res, 200, { ok: true })
    })

    route('/dsh-deepclean/api/thumb', async (req, res) => {
      try {
        const url = new URL(req.url, 'http://dsh.local')
        const target = url.searchParams.get('path') || ''
        if (!withinHome(target) || !fs.existsSync(target) || !fs.statSync(target).isFile()) throw new Error('图片不可读')
        const size = Math.max(64, Math.min(320, Number(url.searchParams.get('size')) || 160))
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepclean-thumb-'))
        try {
          const out = path.join(dir, 't.jpg')
          let result
          if (process.platform === 'win32') {
            const helper = fs.readFileSync(path.join(RESOURCES, 'scripts', 'photos-windows.ps1'), 'utf8')
            const command = Buffer.from(`& {\n${helper}\n} -Mode thumbnail`, 'utf16le').toString('base64')
            result = await runShell('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', command], 20000, JSON.stringify({ path: target, output: out, size }))
          } else {
            result = await runShell('sips', ['-Z', String(size), '-s', 'format', 'jpeg', target, '--out', out], 20000)
          }
          if (result.code !== 0) throw new Error((result.err || '图片解码失败').slice(0, 500))
          const data = fs.readFileSync(out)
          res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'max-age=300' })
          res.end(data)
        } finally {
          try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* ignore */ }
        }
      } catch (err) {
        sendJson(res, 404, { error: String(err && err.message ? err.message : err) })
      }
    })

    route('/dsh-deepclean/api/move', async (req, res) => {
      try {
        if (req.method === 'GET') return sendJson(res, 200, { move: moveSummary() })
        if (req.method !== 'POST') return sendJson(res, 405, { error: '只支持 POST' })
        const body = await readBody(req)
        if (softwareService?.active) return sendJson(res, 409, { error: '软件卸载进行中，请等待核验完成。' })
        const paths = Array.isArray(body.paths) ? body.paths : []
        const count = startMove(paths, body.destination)
        sendJson(res, 202, { ok: true, count, move: moveSummary() })
      } catch (err) {
        sendJson(res, 400, { error: String(err && err.message ? err.message : err) })
      }
    })

    route('/dsh-deepclean/api/move/cancel', async (_req, res) => {
      if (moveState.status !== 'running') return sendJson(res, 409, { error: '当前没有移动任务' })
      moveCanceled = true
      sendJson(res, 200, { ok: true })
    })

    route('/dsh-deepclean/api/reclaim', async (req, res) => {
      try {
        if (req.method !== 'POST') return sendJson(res, 405, { error: '只支持 POST' })
        const body = await readBody(req)
        const paths = Array.isArray(body.paths) ? body.paths.filter((p) => typeof p === 'string' && path.isAbsolute(p)) : []
        if (paths.length === 0) return sendJson(res, 400, { error: '没有要估算的路径' })
        sendJson(res, 200, estimateReclaim(paths))
      } catch (err) {
        sendJson(res, 400, { error: String(err && err.message ? err.message : err) })
      }
    })

    route('/dsh-deepclean/api/clean', async (req, res) => {
      try {
        if (req.method !== 'POST') return sendJson(res, 405, { error: '只支持 POST' })
        const body = await readBody(req)
        if (softwareService?.active) return sendJson(res, 409, { error: '软件卸载进行中，请等待核验完成。' })
        const reportFresh = !!lastReport && Date.now() - lastReportAt <= REPORT_TTL_MS
        const photosFresh = !!photosState.result && Date.now() - photoAt <= REPORT_TTL_MS
        if (!reportFresh && !photosFresh) {
          return sendJson(res, 409, { error: '扫描结果已过期，请先重新扫描' })
        }
        const paths = Array.isArray(body.paths) ? body.paths : []
        if (paths.length === 0) return sendJson(res, 400, { error: '没有选择任何条目' })
        const whitelist = loadWhitelist()
        const blocked = paths.filter((p) => isProtected(p, whitelist))
        if (blocked.length > 0) return sendJson(res, 400, { error: `有 ${blocked.length} 项在保护名单中，拒绝清理` })
        const allowed = new Set()
        if (reportFresh) for (const p of allowedPaths(lastReport)) allowed.add(p)
        if (photosFresh) for (const p of photoAllowed) allowed.add(p)
        // 审计标注：清理时报告里的大小/分类，只写入审计供历史与复清分析使用，不参与放行。
        const annotations = new Map()
        if (reportFresh) for (const [p, info] of cleanAnnotations(lastReport, paths)) annotations.set(p, info)
        if (photosFresh) for (const [p, info] of photoCleanAnnotations(photosState.result, paths)) {
          if (!annotations.has(p) || (annotations.get(p).kb == null && info.kb != null)) annotations.set(p, info)
        }
        // 超过单批上限时由服务端分片：每片独立 batchId/审计，客户端用 batchIds 统一撤销。
        const batches = []
        const results = []
        const chunkErrors = []
        let auditOk = true
        for (const part of splitBatches(paths)) {
          try {
            const out = moveToTrash(part, allowed, { annotations })
            auditOk = auditOk && out.auditOk !== false
            if (out.moved.length > 0) {
              lastBatches.push({ batchId: out.batchId, moved: out.moved, at: Date.now() })
              while (lastBatches.length > 20) lastBatches.shift()
            }
            batches.push({ batchId: out.batchId, moved: out.moved.length, results: out.results })
            results.push(...out.results)
          } catch (err) {
            chunkErrors.push({ index: batches.length, error: String(err && err.message ? err.message : err) })
            break
          }
        }
        if (batches.length === 0) {
          return sendJson(res, 400, { error: chunkErrors[0] ? chunkErrors[0].error : '清理失败' })
        }
        const cleaned = new Set(results.filter((r) => r.ok).map((r) => r.path))
        if (cleaned.size > 0 && reportFresh) lastReport = pruneReport(lastReport, cleaned)
        if (cleaned.size > 0 && photosFresh) {
          photosState.result = prunePhotoResult(photosState.result, cleaned)
          for (const p of cleaned) photoAllowed.delete(p)
        }
        invalidateQuarantine()
        const batchIds = batches.map((b) => b.batchId)
        // auditOk=false 时文件已移动，但历史里可能看不到恢复记录，客户端必须如实提示。
        sendJson(res, 200, {
          batchId: batchIds[batchIds.length - 1], batchIds,
          moved: cleaned.size, results, batches, chunkErrors, auditOk,
        })
      } catch (err) {
        sendJson(res, 400, { error: String(err && err.message ? err.message : err) })
      }
    })

    route('/dsh-deepclean/api/undo', async (req, res) => {
      try {
        if (req.method !== 'POST') return sendJson(res, 405, { error: '只支持 POST' })
        const body = await readBody(req)
        if (softwareService?.active) return sendJson(res, 409, { error: '软件卸载进行中，请等待核验完成。' })
        const ids = Array.isArray(body.batchIds)
          ? [...new Set(body.batchIds.filter((b) => typeof b === 'string'))]
          : (typeof body.batchId === 'string' ? [body.batchId] : [])
        const targets = (ids.length > 0
          ? ids.map((id) => lastBatches.find((b) => b.batchId === id))
          : [lastBatches[lastBatches.length - 1]]).filter(Boolean)
        if (targets.length === 0) return sendJson(res, 404, { error: '没有可撤销的批次' })
        const opts = { onConflict: body.onConflict === 'rename' ? 'rename' : 'fail' }
        const results = []
        const batches = []
        let auditOk = true
        let retryable = false
        for (const batch of targets) {
          const out = restoreMoved(batch.moved, batch.batchId, opts)
          auditOk = auditOk && out.auditOk !== false
          results.push(...out.results)
          const summary = summarizeResults(out.results)
          // 已恢复的条目从批次里剔除：否则重试时它们只会报 notfound，撤销入口永远清不掉。
          const restoredFrom = new Set(out.results.filter((r) => r.ok).map((r) => r.path))
          if (restoredFrom.size > 0) batch.moved = trimUndoneBatch(batch.moved, out.results)
          const pending = out.results.filter((r) => !r.ok)
          const retryableCodes = new Set(['exists', 'eacces', 'exdev', 'symlink', 'io'])
          const canRetry = pending.some((r) => retryableCodes.has(r.code))
          retryable = retryable || (batch.moved.length > 0 && canRetry)
          batches.push({ batchId: batch.batchId, summary, remaining: batch.moved.length })
          // 没有剩余条目、或剩下的条目已从隔离区消失（清空废纸篓/被替换）时移除撤销入口。
          const onlyGone = pending.length > 0 && pending.every((r) => r.code === 'notfound' || r.code === 'changed')
          if (batch.moved.length === 0 || onlyGone) {
            const index = lastBatches.indexOf(batch)
            if (index >= 0) lastBatches.splice(index, 1)
          }
        }
        const summary = summarizeResults(results)
        invalidateQuarantine()
        sendJson(res, 200, { batchId: batches[batches.length - 1].batchId, results, summary, batches, retryable, auditOk })
      } catch (err) {
        sendJson(res, 400, { error: String(err && err.message ? err.message : err) })
      }
    })

    route('/dsh-deepclean/api/state', async (_req, res) => {
      sendJson(res, 200, {
        at: lastReportAt,
        canUndo: lastBatches.length > 0,
        lastBatchId: lastBatches.length > 0 ? lastBatches[lastBatches.length - 1].batchId : null,
        // 分片清理会生成多个批次；重新挂载面板后要能一次撤销全部。
        lastBatchIds: lastBatches.map((b) => b.batchId),
        scan: scanSummary(),
      })
    })

    route('/dsh-deepclean/api/history', async (_req, res) => {
      sendJson(res, 200, { scans: loadHistory().slice(-30), cleans: listCleanBatches() })
    })

    route('/dsh-deepclean/api/quarantine', async (_req, res) => {
      try {
        sendJson(res, 200, quarantineInfo())
      } catch (err) {
        sendJson(res, 400, { error: String(err && err.message ? err.message : err) })
      }
    })

    // 显式「永久删除」：只删本插件移入隔离区/废纸篓的批次条目（purgeMoved 的边界），
    // 是两阶段释放的第二阶段；必须由客户端二次确认后调用。
    route('/dsh-deepclean/api/quarantine/purge', async (req, res) => {
      try {
        if (req.method !== 'POST') return sendJson(res, 405, { error: '只支持 POST' })
        const body = await readBody(req)
        if (softwareService?.active) return sendJson(res, 409, { error: '软件卸载进行中，请等待核验完成。' })
        const explicitIds = Array.isArray(body.batchIds) ? body.batchIds.filter((b) => typeof b === 'string') : []
        // 显式意图：要么列 batchIds，要么 all:true；不接受空 body 直接清空全部。
        if (explicitIds.length === 0 && body.all !== true) {
          return sendJson(res, 400, { error: '请显式传入 batchIds，或传 all:true 表示清空全部可恢复批次' })
        }
        const wanted = explicitIds.length > 0 ? new Set(explicitIds) : null
        const targets = listCleanBatches(Infinity).filter((b) => b.restorable > 0 && (!wanted || wanted.has(b.batchId)))
        if (targets.length === 0) return sendJson(res, 400, { error: `没有可永久删除的批次（${TRASH_WORD}可能已清空）` })
        let purged = 0
        let freedBytes = 0
        const batches = []
        const results = []
        let auditOk = true
        for (const batch of targets) {
          const items = batch.items.filter((i) => i.exists)
          if (items.length === 0) {
            batches.push({ batchId: batch.batchId, purged: 0, freedBytes: 0, skipped: true })
            continue
          }
          const out = purgeMoved(items, batch.batchId)
          auditOk = auditOk && out.auditOk !== false
          purged += out.purged
          freedBytes += out.freedBytes
          results.push(...out.results)
          batches.push({ batchId: batch.batchId, purged: out.purged, freedBytes: out.freedBytes })
          const idx = lastBatches.findIndex((b) => b.batchId === batch.batchId)
          if (idx >= 0) lastBatches.splice(idx, 1)
        }
        invalidateQuarantine()
        sendJson(res, 200, { total: { purged, freedBytes }, batches, results, auditOk })
      } catch (err) {
        sendJson(res, 400, { error: String(err && err.message ? err.message : err) })
      }
    })

    route('/dsh-deepclean/api/restore', async (req, res) => {
      try {
        if (req.method !== 'POST') return sendJson(res, 405, { error: '只支持 POST' })
        const body = await readBody(req)
        if (softwareService?.active) return sendJson(res, 409, { error: '软件卸载进行中，请等待核验完成。' })
        const batches = listCleanBatches(Infinity)
        const batch = batches.find((b) => b.batchId === body.batchId)
        if (!batch) return sendJson(res, 404, { error: '找不到该清理批次' })
        const moved = batch.items.filter((i) => i.exists).map((i) => ({ from: i.from, to: i.to, identity: i.identity }))
        if (moved.length === 0) return sendJson(res, 409, { error: `${TRASH_WORD}里已没有该批次文件（可能已清空）` })
        const out = restoreMoved(moved, batch.batchId, { onConflict: body.onConflict === 'rename' ? 'rename' : 'fail' })
        invalidateQuarantine()
        sendJson(res, 200, {
          batchId: batch.batchId, results: out.results,
          summary: summarizeResults(out.results), auditOk: out.auditOk,
        })
      } catch (err) {
        sendJson(res, 400, { error: String(err && err.message ? err.message : err) })
      }
    })

    route('/dsh-deepclean/api/purge', async (req, res) => {
      try {
        if (req.method !== 'POST') return sendJson(res, 405, { error: '只支持 POST' })
        const body = await readBody(req)
        if (softwareService?.active) return sendJson(res, 409, { error: '软件卸载进行中，请等待核验完成。' })
        const batches = listCleanBatches(Infinity)
        const batch = body.batchId ? batches.find((b) => b.batchId === body.batchId) : batches[0]
        if (!batch) return sendJson(res, 404, { error: '找不到该清理批次' })
        const items = batch.items.filter((i) => i.exists)
        if (items.length === 0) return sendJson(res, 409, { error: `${TRASH_WORD}里已没有该批次文件（可能已清空）` })
        const { purged, freedBytes, results, auditOk } = purgeMoved(items, batch.batchId)
        invalidateQuarantine()
        const idx = lastBatches.findIndex((b) => b.batchId === batch.batchId)
        if (idx >= 0) lastBatches.splice(idx, 1)
        sendJson(res, 200, { batchId: batch.batchId, purged, freedBytes, results, auditOk })
      } catch (err) {
        sendJson(res, 400, { error: String(err && err.message ? err.message : err) })
      }
    })

    route('/dsh-deepclean/api/whitelist', async (req, res) => {
      try {
        if (req.method === 'GET') return sendJson(res, 200, { paths: loadWhitelist() })
        if (req.method !== 'PUT' && req.method !== 'POST') return sendJson(res, 405, { error: '只支持 GET/PUT' })
        const body = await readBody(req)
        const paths = Array.isArray(body.paths) ? body.paths : []
        const cleaned = [...new Set(paths.filter((p) => typeof p === 'string' && path.isAbsolute(p)))]
        saveWhitelist(cleaned)
        sendJson(res, 200, { paths: cleaned })
      } catch (err) {
        sendJson(res, 400, { error: String(err && err.message ? err.message : err) })
      }
    })

    ctx.effect(() => () => {
      for (const dispose of disposers) {
        try { dispose() } catch { /* ignore */ }
      }
    })
  })
}
