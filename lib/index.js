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
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineTool } from '@deepseek-ai/dsh-tools'
import { moveToTrash, restoreMoved, appendAudit } from './clean.js'

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
      try { child.kill('SIGTERM') } catch { /* ignore */ }
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

function isProtected(p, whitelist) {
  return whitelist.some((w) => p === w || p.startsWith(w.replace(/\/+$/, '') + '/'))
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
  for (const line of lines) {
    try {
      const e = JSON.parse(line)
      if (e.action !== 'clean' || !Array.isArray(e.moved) || e.moved.length === 0) continue
      const items = e.moved.map((m) => ({ from: m.from, to: m.to, exists: fs.existsSync(m.to) }))
      const restorable = items.filter((i) => i.exists).length
      batches.push({ batchId: e.batchId, at: e.at, count: items.length, restorable, items })
    } catch { /* ignore */ }
  }
  return batches.slice(-20).reverse()
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

function hashFile(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256')
    const stream = fs.createReadStream(file)
    stream.on('data', (chunk) => h.update(chunk))
    stream.on('end', () => resolve(h.digest('hex')))
    stream.on('error', reject)
  })
}

const moveState = {
  status: 'idle', done: 0, total: 0, current: '', results: [], error: '', startedAt: 0, finishedAt: 0,
}
let moveCanceled = false

function moveSummary() {
  const end = moveState.finishedAt || Date.now()
  return {
    status: moveState.status,
    done: moveState.done,
    total: moveState.total,
    current: moveState.current,
    results: moveState.results,
    error: moveState.error,
    elapsed: moveState.startedAt ? Math.round((end - moveState.startedAt) / 1000) : 0,
  }
}

async function moveJob(paths, dest, destStat) {
  for (const p of paths) {
    if (moveCanceled) break
    moveState.current = path.basename(p)
    try {
      if (!withinHome(p)) throw new Error('只允许移动家目录内的文件')
      const st = fs.statSync(p)
      if (!st.isFile()) throw new Error('只支持移动单个文件')
      let target = path.join(dest, path.basename(p))
      let i = 1
      while (fs.existsSync(target)) target = path.join(dest, `${path.basename(p)}.${i++}`)
      if (st.dev === destStat.dev) {
        fs.renameSync(p, target)
      } else {
        const tmp = `${target}.deepclean-tmp`
        fs.copyFileSync(p, tmp)
        const [h1, h2] = [await hashFile(p), await hashFile(tmp)]
        if (h1 !== h2 || fs.statSync(tmp).size !== st.size) {
          fs.rmSync(tmp, { force: true })
          throw new Error('跨盘校验失败，原文件已保留')
        }
        fs.renameSync(tmp, target)
        fs.unlinkSync(p)
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
  const items = paths.filter((p) => allowed.has(p))
  if (items.length === 0) throw new Error('没有可移动的大文件（需先「完整扫描」）')
  const dest = path.resolve(String(destination || ''))
  if (!fs.existsSync(dest) || !fs.statSync(dest).isDirectory()) throw new Error('目标目录不存在')
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
    status: 'running', done: 0, total: items.length, current: '', results: [],
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
  for (const p of photoAllowed) if (!isProtected(p, whitelist)) set.add(p)
  for (const app of report.special || []) {
    for (const c of app.categories || []) {
      if (!c.cleanable) continue
      for (const p of c.paths || []) add(p)
    }
  }
  return set
}

function withinHome(p) {
  const home = path.resolve(process.env.HOME || os.homedir())
  const resolved = path.resolve(p)
  return resolved === home || resolved.startsWith(home + path.sep)
}

function runShell(cmd, args, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    let child
    try { child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] }) }
    catch (err) { reject(err); return }
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

async function listChildren(dirPath) {
  const home = process.env.HOME || os.homedir()
  const target = dirPath ? path.resolve(dirPath) : path.resolve(home)
  if (!withinHome(target)) throw new Error('只允许浏览家目录')
  let res
  if (process.platform === 'win32') {
    const esc = target.replace(/'/g, "''")
    const script = "Get-ChildItem -LiteralPath '" + esc + "' -Force | ForEach-Object { $s = if ($_.PSIsContainer) { (Get-ChildItem -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum } else { $_.Length }; ([string][int64]$s) + [char]9 + $_.FullName }"
    res = await runShell('powershell', ['-NoProfile', '-Command', script])
  } else {
    const esc = target.replace(/'/g, "'\\''")
    res = await runShell('/bin/sh', ['-c', `du -sk '${esc}'/* 2>/dev/null`])
  }
  const children = []
  for (const line of (res.out || '').split('\n')) {
    const idx = line.indexOf('\t')
    if (idx < 0) continue
    const kb = parseInt(line.slice(0, idx), 10)
    const p = line.slice(idx + 1)
    if (!Number.isFinite(kb) || !p) continue
    let isDir = false
    try { isDir = fs.lstatSync(p).isDirectory() } catch { continue }
    children.push({ name: path.basename(p), path: p, kb, isDir })
  }
  children.sort((a, b) => b.kb - a.kb)
  return { path: target, children }
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
        scan: scanSummary(),
        history: loadHistory().slice(-30),
        cleanBatches: listCleanBatches(),
        whitelist: loadWhitelist(),
        platform: process.platform,
      })
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
        if (activeChild) {
          try { activeChild.kill('SIGTERM') } catch { /* ignore */ }
        }
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

    route('/dsh-deepclean/api/tree', async (req, res) => {
      try {
        const url = new URL(req.url, 'http://dsh.local')
        const target = url.searchParams.get('path') || ''
        const body = await listChildren(target)
        sendJson(res, 200, body)
      } catch (err) {
        sendJson(res, 400, { error: String(err && err.message ? err.message : err) })
      }
    })

    route('/dsh-deepclean/api/reveal', async (req, res) => {
      try {
        if (req.method !== 'POST') return sendJson(res, 405, { error: '只支持 POST' })
        const body = await readBody(req)
        const target = String(body.path || '')
        if (!target || !withinHome(target) || !fs.existsSync(target)) throw new Error('路径不存在或不在家目录')
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
      if (photoChild) { try { photoChild.kill('SIGTERM') } catch { /* ignore */ } }
      sendJson(res, 200, { ok: true })
    })

    route('/dsh-deepclean/api/thumb', async (req, res) => {
      try {
        const url = new URL(req.url, 'http://dsh.local')
        const target = url.searchParams.get('path') || ''
        if (!withinHome(target) || !fs.existsSync(target) || !fs.statSync(target).isFile()) throw new Error('图片不可读')
        const size = Math.max(64, Math.min(320, Number(url.searchParams.get('size')) || 160))
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepclean-thumb-'))
        const out = path.join(dir, 't.jpg')
        await runShell('sips', ['-Z', String(size), '-s', 'format', 'jpeg', target, '--out', out], 20000)
        const data = fs.readFileSync(out)
        try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* ignore */ }
        res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'max-age=300' })
        res.end(data)
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
        const moved = batch.items.filter((i) => i.exists).map((i) => ({ from: i.from, to: i.to }))
        if (moved.length === 0) return sendJson(res, 409, { error: '废纸篓里已没有该批次文件（可能已清空）' })
        const { results } = restoreMoved(moved, batch.batchId)
        sendJson(res, 200, { batchId: batch.batchId, results })
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
