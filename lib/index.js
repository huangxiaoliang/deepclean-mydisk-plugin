/**
 * deepclean-mydisk —— DSH host 插件（v0.4）
 *
 * 组成：
 *   1. 模型工具：disk_check_permissions / disk_audit / disk_self_test（只读）
 *   2. 侧边栏 API：扫描（后台/进度/取消）、历史、恢复、白名单、清理、撤销
 *
 * 安全边界：清理只移到废纸篓/隔离区；只接受最近一次扫描（10 分钟内）的允许路径；
 * 白名单路径永远拒绝；符号链接拒绝。
 */
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineTool } from '@deepseek-ai/dsh-tools'
import { moveToTrash, restoreMoved, appendAudit, moveAcrossDevices, canRestoreMoved, purgeMoved } from './clean.js'
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

export const name = 'deepclean-mydisk'
export const inject = ['tools']

let lastReport = null
let lastReportAt = 0
let activeChild = null
const lastBatches = []

const scanState = {
  status: 'idle', // idle | running | done | error | canceled
  progress: 0,
  stage: '',
  startedAt: 0,
  finishedAt: 0,
  error: '',
  full: false,
  canceled: false,
}

function killTree(child) {
  if (!child || child.killed) return
  if (process.platform === 'win32') {
    try { spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' }) } catch { /* ignore */ }
    return
  }
  try { process.kill(-child.pid, 'SIGTERM') } catch { try { child.kill('SIGTERM') } catch { /* ignore */ } }
  setTimeout(() => {
    try { process.kill(-child.pid, 'SIGKILL') } catch { /* ignore */ }
  }, 1500).unref?.()
}

function pythonCommand() {
  const win = process.platform === 'win32'
  return { cmd: win ? 'py' : 'python3', args: win ? ['-3'] : [] }
}

function runScanner(extraArgs, timeoutMs, opts = {}, script = 'deepclean.py') {
  const { cmd, args } = pythonCommand()
  const target = path.join(RESOURCES, 'scripts', script)
  return new Promise((resolve, reject) => {
    let child
    try {
      child = spawn(cmd, [...args, target, ...extraArgs], {
        cwd: RESOURCES,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
        windowsHide: true,
      })
    } catch (err) {
      reject(new Error(`无法启动 ${cmd}：${err instanceof Error ? err.message : String(err)}`))
      return
    }
    if (typeof opts.trackChild === 'function') opts.trackChild(child)
    else activeChild = child
    let out = ''
    let err = ''
    let buf = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { out += chunk })
    child.stderr.on('data', (chunk) => {
      err += chunk
      if (typeof opts.onProgress !== 'function') return
      buf += chunk
      let idx
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim()
        buf = buf.slice(idx + 1)
        const m = /^PROGRESS (\d+) (.+)$/.exec(line)
        if (m) opts.onProgress(Number(m[1]), m[2])
      }
    })
    const timer = setTimeout(() => {
      try { killTree(child) } catch { /* ignore */ }
      reject(new Error(`扫描超时（${Math.round(timeoutMs / 1000)}s）；可改用快速扫描`))
    }, timeoutMs)
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(new Error(`无法启动 ${cmd}：${error.message}（请确认本机已安装 Python 3）`))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (typeof opts.trackChild === 'function') opts.trackChild(null)
      else if (activeChild === child) activeChild = null
      resolve({ code, out, err })
    })
  })
}

function clip(text) {
  if (text.length <= MAX_OUTPUT) return text
  return `${text.slice(0, MAX_OUTPUT)}\n\n…（输出已截断，共 ${text.length} 字符）`
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

function listCleanBatches() {
  let lines = []
  try {
    lines = fs.readFileSync(AUDIT_FILE, 'utf8').split('\n').filter(Boolean)
  } catch {
    return []
  }
  const batches = []
  const latestOwner = new Map()
  for (const line of lines) {
    try {
      const e = JSON.parse(line)
      if (e.action === 'clean' && Array.isArray(e.moved) && e.moved.length) {
        const items = e.moved.map(m => ({ ...m, restored: false }))
        for (const item of items) latestOwner.set(item.to, item)
        batches.push({ batchId: e.batchId, at: e.at, items })
      } else if (e.action === 'restore' && Array.isArray(e.results)) {
        // Replay legacy logs too, including partial successful restores.
        for (const batch of batches) {
          if (batch.batchId !== e.batchId) continue
          for (const item of batch.items) {
            if (e.results.some(r => r.ok && r.path === item.from && (!r.to || r.to === item.to))) item.restored = true
          }
        }
      }
    } catch { /* ignore */ }
  }
  return batches.slice(-20).reverse().map(batch => {
    const items = batch.items.map(item => ({
      from: item.from, to: item.to, identity: item.identity,
      exists: !item.restored && latestOwner.get(item.to) === item && canRestoreMoved(item),
    }))
    return { batchId: batch.batchId, at: batch.at, count: items.length, restorable: items.filter(i => i.exists).length, items }
  })
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
    canceled: scanState.canceled,
    full: scanState.full,
    at: lastReportAt,
    hasReport: !!lastReport,
  }
}

function startScan(full) {
  if (scanState.status === 'running') return false
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepclean-'))
  const file = path.join(dir, 'report.json')
  Object.assign(scanState, {
    status: 'running', progress: 0, stage: '准备扫描', startedAt: Date.now(), finishedAt: 0,
    error: '', full: !!full, canceled: false,
  })
  const argv = []
  if (!full) argv.push('--quick')
  argv.push('--json', file)
  runScanner(argv, 300000, {
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
      scanState.error = (res.out || res.err || `exit ${res.code}`).trim().slice(0, 500)
      scanState.finishedAt = Date.now()
      return
    }
    const report = JSON.parse(fs.readFileSync(file, 'utf8'))
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
    scanState.error = String(err && err.message ? err.message : err)
    scanState.finishedAt = Date.now()
  }).finally(() => {
    try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* ignore */ }
  })
  return true
}

const photosState = {
  status: 'idle', progress: 0, stage: '', startedAt: 0, finishedAt: 0, error: '', result: null,
}
let photoChild = null
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
    at: photoAt,
    hasResult: !!photosState.result,
  }
}

function startPhotoScan() {
  if (photosState.status === 'running') return false
  if (scanState.status === 'running') return false
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepclean-photos-'))
  const file = path.join(dir, 'photos.json')
  Object.assign(photosState, { status: 'running', progress: 0, stage: '准备', startedAt: Date.now(), finishedAt: 0, error: '', result: null })
  runScanner(['--json', file], 600000, {
    onProgress: (pct, label) => { photosState.progress = pct; photosState.stage = label },
    trackChild: (child) => { photoChild = child },
  }, 'photos.py').then((res) => {
    if (photosState.status !== 'running') return
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
    for (const g of result.groups || []) for (const it of g.items || []) photoAllowed.add(it.path)
  }).catch((err) => {
    photosState.status = photosState.status === 'running' ? 'error' : photosState.status
    photosState.error = String(err && err.message ? err.message : err)
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
  if (!withinHome(p) || isProtected(p, loadWhitelist())) throw new Error('家目录外路径或受保护路径不可移动')
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
      if (!withinHome(p)) throw new Error('只允许移动家目录内的文件')
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

function startMove(paths, destination) {
  if (moveState.status === 'running') throw new Error('已有搬家任务在进行中')
  if (!lastReport || Date.now() - lastReportAt > REPORT_TTL_MS) throw new Error('扫描结果已过期，请先完整扫描')
  const allowed = new Set((lastReport.bigFiles || []).map((b) => b.path))
  if (!Array.isArray(paths) || paths.some(p => !allowed.has(p))) throw new Error('包含未经最近扫描确认的文件')
  const items = [...new Set(paths)]
  for (const p of items) {
    assertMoveSource(p)
  }
  if (items.length === 0) throw new Error('没有可移动的大文件（需先「完整扫描」）')
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

function allowedPaths(report) {
  const whitelist = loadWhitelist()
  const set = new Set()
  const add = (p) => { if (p && !isProtected(p, whitelist)) set.add(p) }
  for (const g of report.leftoverGroups || []) {
    if (g.bucket !== 'safe') continue
    for (const p of g.paths || []) add(p)
  }
  for (const c of report.caches || []) if (!c.system) add(c.path)
  for (const d of report.devCaches || []) {
    if (d.cleanable !== false) add(d.path)
  }
  for (const b of report.browsers || []) add(b.path)
  for (const a of report.appCaches || []) {
    if (a.cleanable === false || a.running) continue
    for (const p of a.paths || []) add(p)
  }
  for (const p of photoAllowed) if (!isProtected(p, whitelist)) set.add(p)
  for (const app of report.special || []) {
    for (const c of app.categories || []) {
      if (!c.cleanable) continue
      for (const p of c.paths || []) add(p)
    }
  }
  return set
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
  return resolved === home || resolved.startsWith(home + path.sep)
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

const treeCache = new Map()
const TREE_TTL_MS = 60 * 1000

async function listChildren(dirPath, refresh = false) {
  const home = process.env.HOME || os.homedir()
  const target = dirPath ? path.resolve(dirPath) : path.resolve(home)
  if (!withinHome(target)) throw new Error('只允许浏览家目录')
  const realHome = fs.realpathSync(process.env.HOME || os.homedir())
  const relative = path.relative(realHome, fs.realpathSync(target))
  if (fs.lstatSync(target).isSymbolicLink() || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw new Error('符号链接或家目录外路径不可浏览')
  const cached = treeCache.get(target)
  if (!refresh && cached && Date.now() - cached.at < TREE_TTL_MS) return cached.data
  // The independent read-only helper includes hidden entries and reports partial totals.
  // It has its own child handle so browsing never cancels an audit or photo scan.
  const res = await runScanner([target], 120000, { trackChild() {} }, 'tree.py')
  if (res.code !== 0) throw new Error('目录统计失败或无权读取，请检查权限后重试')
  const data = JSON.parse(res.out)
  treeCache.set(target, { at: Date.now(), data })
  while (treeCache.size > 100) treeCache.delete(treeCache.keys().next().value)
  return data
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(JSON.stringify(body))
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

export function apply(ctx) {
  ctx.tools.register(defineTool({
    name: 'disk_check_permissions',
    description: '检查宿主进程是否具备磁盘体检所需权限：macOS 需要「完全磁盘访问」，Windows 只报告管理员状态。未授权时不会进行任何扫描。',
    parameters: {},
    output,
    async execute() {
      return formatResult(await runScanner(['--check-permissions'], 30000))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'disk_audit',
    description: '只读磁盘体检（macOS / Windows）：扫描磁盘占用并按「可安全清理 / 需确认 / 不要动」三档返回 Markdown 报告。绝不删除、移动或修改任何文件。',
    parameters: {
      quick: { type: 'boolean', description: '快速模式：跳过全盘大文件扫描（默认 true）' },
      redact: { type: 'boolean', description: '脱敏：家目录替换为 ~，主机名打码（默认 false）' },
      platform: { type: 'string', description: 'auto | macos | windows（默认 auto）' },
      json: { type: 'boolean', description: '返回 JSON 而不是 Markdown（默认 false）' },
    },
    output,
    async execute(args) {
      const argv = []
      if (args.platform && args.platform !== 'auto') argv.push('--platform', String(args.platform))
      if (args.quick !== false) argv.push('--quick')
      if (args.redact) argv.push('--redact')
      let jsonDir = null
      try {
        if (args.json) {
          jsonDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepclean-'))
          argv.push('--json', path.join(jsonDir, 'report.json'))
        }
        const result = await runScanner(argv, 300000)
        if (args.json && result.code === 0) {
          const file = path.join(jsonDir, 'report.json')
          if (fs.existsSync(file)) return clip(fs.readFileSync(file, 'utf8'))
        }
        const text = formatResult(result)
        if (result.code !== 0) return `扫描未完成（exit ${result.code}）\n\n${text}`
        return text
      } finally {
        if (jsonDir) {
          try { fs.rmSync(jsonDir, { recursive: true, force: true }) } catch { /* ignore */ }
        }
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'disk_self_test',
    description: '运行 deepclean-mydisk 的真机自检（macOS 扫描链路；Windows 8 项检查），验证扫描器在当前环境可用。',
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
        const result = await runScanner(['--check-permissions'], 30000)
        sendJson(res, 200, { code: result.code, text: (result.out || result.err).trim() })
      } catch (err) {
        sendJson(res, 500, { error: String(err && err.message ? err.message : err) })
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
        whitelist: loadWhitelist(),
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
        if (activeChild) killTree(activeChild)
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
      try {
        const url = new URL(req.url, 'http://dsh.local')
        const target = url.searchParams.get('path') || ''
        const body = await listChildren(target, url.searchParams.get('refresh') === '1')
        sendJson(res, 200, body)
      } catch (err) {
        sendJson(res, 400, { error: String(err && err.message ? err.message : err) })
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
        if (!withinHome(target) && !st.isDirectory()) throw new Error('只允许打开家目录内文件或已存在的目录')
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
      if (photoChild) killTree(photoChild)
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
        const paths = Array.isArray(body.paths) ? body.paths : []
        const count = startMove(paths, body.destination)
        sendJson(res, 202, { ok: true, count, move: moveSummary() })
      } catch (err) {
        sendJson(res, 400, { error: String(err && err.message ? err.message : err) })
      }
    })

    route('/dsh-deepclean/api/move/cancel', async (_req, res) => {
      if (moveState.status !== 'running') return sendJson(res, 409, { error: '当前没有搬家任务' })
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
        const reportFresh = !!lastReport && Date.now() - lastReportAt <= REPORT_TTL_MS
        const photosFresh = !!photosState.result && Date.now() - photoAt <= REPORT_TTL_MS
        if (!reportFresh && !photosFresh) {
          return sendJson(res, 409, { error: '扫描结果已过期，请先重新扫描' })
        }
        const body = await readBody(req)
        const paths = Array.isArray(body.paths) ? body.paths : []
        if (paths.length === 0) return sendJson(res, 400, { error: '没有选择任何条目' })
        const whitelist = loadWhitelist()
        const blocked = paths.filter((p) => isProtected(p, whitelist))
        if (blocked.length > 0) return sendJson(res, 400, { error: `有 ${blocked.length} 项在白名单中，拒绝清理` })
        const allowed = new Set()
        if (reportFresh) for (const p of allowedPaths(lastReport)) allowed.add(p)
        if (photosFresh) for (const p of photoAllowed) allowed.add(p)
        const { batchId, moved, results } = moveToTrash(paths, allowed)
        if (moved.length > 0) {
          lastBatches.push({ batchId, moved, at: Date.now() })
          while (lastBatches.length > 20) lastBatches.shift()
        }
        sendJson(res, 200, { batchId, moved: moved.length, results })
      } catch (err) {
        sendJson(res, 400, { error: String(err && err.message ? err.message : err) })
      }
    })

    route('/dsh-deepclean/api/undo', async (req, res) => {
      try {
        if (req.method !== 'POST') return sendJson(res, 405, { error: '只支持 POST' })
        const body = await readBody(req)
        const batch = body.batchId
          ? lastBatches.find((b) => b.batchId === body.batchId)
          : lastBatches[lastBatches.length - 1]
        if (!batch) return sendJson(res, 404, { error: '没有可撤销的批次' })
        const { results } = restoreMoved(batch.moved, batch.batchId)
        const index = lastBatches.indexOf(batch)
        if (index >= 0) lastBatches.splice(index, 1)
        sendJson(res, 200, { batchId: batch.batchId, results })
      } catch (err) {
        sendJson(res, 400, { error: String(err && err.message ? err.message : err) })
      }
    })

    route('/dsh-deepclean/api/state', async (_req, res) => {
      sendJson(res, 200, {
        at: lastReportAt,
        canUndo: lastBatches.length > 0,
        lastBatchId: lastBatches.length > 0 ? lastBatches[lastBatches.length - 1].batchId : null,
        scan: scanSummary(),
      })
    })

    route('/dsh-deepclean/api/history', async (_req, res) => {
      sendJson(res, 200, { scans: loadHistory().slice(-30), cleans: listCleanBatches() })
    })

    route('/dsh-deepclean/api/restore', async (req, res) => {
      try {
        if (req.method !== 'POST') return sendJson(res, 405, { error: '只支持 POST' })
        const body = await readBody(req)
        const batches = listCleanBatches()
        const batch = batches.find((b) => b.batchId === body.batchId)
        if (!batch) return sendJson(res, 404, { error: '找不到该清理批次' })
        const moved = batch.items.filter((i) => i.exists).map((i) => ({ from: i.from, to: i.to, identity: i.identity }))
        if (moved.length === 0) return sendJson(res, 409, { error: '废纸篓里已没有该批次文件（可能已清空）' })
        const { results } = restoreMoved(moved, batch.batchId)
        sendJson(res, 200, { batchId: batch.batchId, results })
      } catch (err) {
        sendJson(res, 400, { error: String(err && err.message ? err.message : err) })
      }
    })

    route('/dsh-deepclean/api/purge', async (req, res) => {
      try {
        if (req.method !== 'POST') return sendJson(res, 405, { error: '只支持 POST' })
        const body = await readBody(req)
        const batches = listCleanBatches()
        const batch = body.batchId ? batches.find((b) => b.batchId === body.batchId) : batches[0]
        if (!batch) return sendJson(res, 404, { error: '找不到该清理批次' })
        const items = batch.items.filter((i) => i.exists)
        if (items.length === 0) return sendJson(res, 409, { error: '废纸篓里已没有该批次文件（可能已清空）' })
        const { purged, freedBytes, results } = purgeMoved(items, batch.batchId)
        const idx = lastBatches.findIndex((b) => b.batchId === batch.batchId)
        if (idx >= 0) lastBatches.splice(idx, 1)
        sendJson(res, 200, { batchId: batch.batchId, purged, freedBytes, results })
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
