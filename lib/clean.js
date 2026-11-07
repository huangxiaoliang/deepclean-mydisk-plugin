/**
 * 清理能力（移动 + 撤销 + 审计 + 显式永久删除批次）—— 默认只移动，不自动永久删除。
 *
 * 安全契约：
 * - 只接受「最近一次扫描结果」允许列表里的绝对路径；
 * - 符号链接一律拒绝（避免移到链接目标）；
 * - 目标名冲突时自动加序号，绝不覆盖；
 * - 撤销只回滚仍存在、且原位置已空的条目。
 */
import fs from 'node:fs'
import crypto from 'node:crypto'
import os from 'node:os'
import path from 'node:path'

export const MAX_BATCH = 200

export function trashDir(now = Date.now()) {
  // 一律返回绝对路径：相对 DEEPCLEAN_TRASH_DIR 会让审计里的 to 变成相对路径，
  // 跨重启后 restore/purge 的归属校验会对不上。
  if (process.env.DEEPCLEAN_TRASH_DIR) return path.resolve(process.env.DEEPCLEAN_TRASH_DIR)
  if (process.platform === 'win32') {
    const base = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
    return path.resolve(base, 'deepclean-mydisk', 'trash', String(now))
  }
  if (process.platform === 'darwin') return path.resolve(os.homedir(), '.Trash')
  return path.resolve(os.homedir(), '.local', 'share', 'deepclean-mydisk', 'trash', String(now))
}

export function auditLogPath() {
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  return path.join(home, 'deepclean-audit.log')
}

// 超过轮转阈值时保留近期记录，同时保留所有仍可恢复批次的完整恢复依据。
// 未处理批次很多时可超过阈值：不能为了压缩日志丢失用户文件的恢复入口。
const AUDIT_MAX_BYTES = 5 * 1024 * 1024

function auditMaxBytes() {
  const n = Number(process.env.DEEPCLEAN_AUDIT_MAX_BYTES)
  return n > 0 ? n : AUDIT_MAX_BYTES
}

function rotateAuditIfNeeded(file) {
  try {
    if (fs.statSync(file).size <= auditMaxBytes()) return
    const lines = fs.readFileSync(file, 'utf8').split('\n')
    const entries = lines.map(line => { try { return JSON.parse(line) } catch { return null } })
    const batches = new Map(), owners = new Map(), restored = new Set()
    for (const entry of entries) {
      if (entry?.action === 'clean' && Array.isArray(entry.moved)) {
        batches.set(entry.batchId, entry.moved)
        for (const item of entry.moved) owners.set(item.to, item)
      } else if (entry?.action === 'restore' && Array.isArray(entry.results)) {
        for (const item of batches.get(entry.batchId) || []) {
          if (entry.results.some(r => r.ok && r.path === item.from && (!r.to || r.to === item.to))) restored.add(item)
        }
      }
    }
    const pending = new Set([...batches].filter(([, items]) => items.some(item =>
      !restored.has(item) && owners.get(item.to) === item && canRestoreMoved(item))).map(([id]) => id))
    let size = 0
    let tail = lines.length
    while (tail > 0 && size <= auditMaxBytes() / 2) {
      tail -= 1
      size += Buffer.byteLength(lines[tail]) + 1
    }
    const kept = lines.filter((line, i) => i >= tail || pending.has(entries[i]?.batchId))
    const tmp = file + '.' + crypto.randomUUID() + '.tmp'
    try {
      fs.writeFileSync(tmp, kept.join('\n'), { encoding: 'utf8', flag: 'wx', mode: 0o600 })
      fs.renameSync(tmp, file)
    } finally {
      try { fs.unlinkSync(tmp) } catch { /* renamed or never created */ }
    }
  } catch { /* 轮转失败不阻断清理 */ }
}

// 返回是否写入成功：审计失败时清理/恢复仍会完成，但调用方必须把「历史里可能看不到」
// 如实告诉用户，而不是继续承诺「可在历史恢复」。
export function appendAudit(entry) {
  try {
    const file = auditLogPath()
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.appendFileSync(file, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n', 'utf8')
    rotateAuditIfNeeded(file)
    return true
  } catch {
    return false
  }
}

function fileIdentity(file) {
  const st = fs.lstatSync(file, { bigint: true })
  if (st.isSymbolicLink()) throw new Error('符号链接不允许恢复')
  return { dev: String(st.dev), ino: String(st.ino), birthtimeNs: String(st.birthtimeNs) }
}

function sameIdentity(a, b) {
  return a.dev === b.dev && a.ino === b.ino && a.birthtimeNs === b.birthtimeNs
}

export function canRestoreMoved(item) {
  try {
    const actual = fileIdentity(item.to)
    return !item.identity || sameIdentity(item.identity, actual)
  } catch { return false }
}

function uniqueDest(dir, base) {
  let dest = path.join(dir, base)
  let i = 1
  while (fs.existsSync(dest)) {
    dest = path.join(dir, `${base}.${i}`)
    i += 1
    if (i > 1000) throw new Error('目标目录里同名文件过多')
  }
  return dest
}

// 恢复时如果原位置已有同名文件，按「名称 (restored)」另存，而不是覆盖。
function restoredName(dir, base) {
  let dest = path.join(dir, `${base} (restored)`)
  let i = 1
  while (fs.existsSync(dest)) {
    if (i > 1000) throw new Error('目标目录里同名文件过多')
    dest = path.join(dir, `${base} (restored ${i++})`)
  }
  return dest
}

function restoreWord() {
  return process.platform === 'darwin' ? '废纸篓' : '隔离区'
}

function restoreFail(code, message) {
  const err = new Error(message)
  err.code = code
  return err
}

/** 逐项结果汇总，供宿主/客户端如实展示。 */
export function summarizeResults(results) {
  const list = Array.isArray(results) ? results : []
  const ok = list.filter((r) => r.ok).length
  const codes = {}
  for (const r of list) {
    if (r.ok) continue
    const code = r.code || 'io'
    codes[code] = (codes[code] || 0) + 1
  }
  return { ok, failed: list.length - ok, codes }
}

function existsNoFollow(p) {
  try { fs.lstatSync(p); return true } catch { return false }
}

// 只为审计原路径重建父目录，创建前检查全部既存祖先。
function ensureRestoreParent(target) {
  assertRestoreParentSafe(target)
  const parent = path.dirname(target)
  fs.mkdirSync(parent, { recursive: true })
}

/**
 * 把 paths 移到废纸篓（macOS/Windows/其他隔离目录）。
 * @param {string[]} paths 绝对路径
 * @param {Set<string>} allowed 本次扫描允许的路径集合
 * @param {{annotations?: Map<string, {kb?: number|null, category?: string|null, kbScope?: 'path'}>}} [options]
 *   `annotations` 只用于审计记录（该路径在扫描报告里的大小/分类），不参与放行判断。
 * @returns {{batchId:string, moved:Array<{from:string,to:string}>, results:Array<object>}}
 */
export function moveToTrash(paths, allowed, options = {}) {
  if (!Array.isArray(paths) || paths.length === 0) throw new Error('没有要清理的条目')
  if (paths.length > MAX_BATCH) throw new Error(`一次最多清理 ${MAX_BATCH} 项`)
  if (!allowed || typeof allowed.has !== 'function') throw new Error('缺少允许列表')
  const annotations = options && options.annotations instanceof Map ? options.annotations : null
  const now = Date.now()
  const batchId = crypto.randomUUID()
  const trash = trashDir(now)
  fs.mkdirSync(trash, { recursive: true })
  // Isolate batches without lengthening the original filename.
  const dir = path.join(trash, `deepclean-${batchId}`)
  fs.mkdirSync(dir)
  const moved = []
  const results = []
  for (const p of paths) {
    try {
      if (typeof p !== 'string' || !path.isAbsolute(p)) throw new Error('路径必须是绝对路径')
      if (!allowed.has(p)) throw new Error('不在最近一次扫描的允许列表中')
      const st = fs.lstatSync(p)
      if (st.isSymbolicLink()) throw new Error('符号链接不允许移动')
      if (!st.isDirectory() && !st.isFile()) throw new Error('不支持的条目类型')
      const dest = uniqueDest(dir, path.basename(p))
      const identity = fileIdentity(p)
      fs.renameSync(p, dest)
      const annotation = annotations ? annotations.get(p) : undefined
      moved.push({
        from: p,
        to: dest,
        identity,
        ...(annotation ? { kb: Number.isFinite(annotation.kb) ? annotation.kb : null, category: annotation.category || null } : {}),
        ...(annotation?.kbScope === 'path' ? { kbScope: 'path' } : {}),
      })
      results.push({ path: p, ok: true, to: dest })
    } catch (err) {
      results.push({ path: p, ok: false, error: String(err && err.message ? err.message : err) })
    }
  }
  const auditOk = appendAudit({ action: 'clean', batchId, platform: process.platform, trash: dir, moved, results })
  return { batchId, moved, results, auditOk }
}

/**
 * 撤销一个清理批次：把仍在废纸篓、原位置已空的条目移回。
 */
export function undoBatch(batch, opts = {}) {
  if (!batch || !Array.isArray(batch.moved) || batch.moved.length === 0) {
    throw new Error('没有可撤销的批次')
  }
  return restoreMoved(batch.moved, batch.batchId, opts)
}

function assertRestoreParentSafe(target) {
  // Keep lexical ancestors too: resolving '..' first could hide a linked component.
  let parent = path.dirname(target)
  for (;;) {
    try {
      const st = fs.lstatSync(parent)
      if (st.isSymbolicLink()) throw restoreFail('symlink', '原路径的祖先目录是符号链接，拒绝恢复')
      if (!st.isDirectory()) throw restoreFail('io', '原路径的祖先不是目录，拒绝恢复')
    } catch (err) {
      if (err.code !== 'ENOENT') throw err
    }
    const next = path.dirname(parent)
    if (next === parent) break
    parent = next
  }
}

/** ok / notfound / changed（identity 不一致，区别于文件缺失）。 */
function restoreItemState(item) {
  let actual
  try { actual = fileIdentity(item.to) } catch { return 'notfound' }
  if (!item.identity) return 'ok'
  return sameIdentity(item.identity, actual) ? 'ok' : 'changed'
}

const ERRNO_CODES = {
  EACCES: 'eacces', EPERM: 'eacces', EROFS: 'eacces',
  EXDEV: 'exdev', ENOENT: 'enoent', EEXIST: 'exists', ENOTDIR: 'io', EISDIR: 'io',
  ELOOP: 'symlink', ENOSPC: 'io', EBUSY: 'io',
}

function normalizeRestoreCode(err) {
  const code = err && err.code ? String(err.code) : ''
  if (['exists', 'notfound', 'changed', 'eacces', 'exdev', 'enoent', 'symlink', 'io'].includes(code)) return code
  return ERRNO_CODES[code] || 'io'
}

/**
 * 从审计日志的 moved 列表恢复（跨重启可用）。
 *
 * 每项结果带 code，调用方据此给出「怎么办」：
 *   notfound  = 隔离区/废纸篓里已没有该条目（被清空/被移走）
 *   changed   = 条目仍在但已被替换（identity 不一致）
 *   exists    = 原位置已有同名文件（onConflict==='rename' 时会另存为副本）
 *   enoent    = 原路径父目录不存在且不允许重建
 *   eacces / exdev / symlink / io = 权限、跨卷、符号链接、其他 IO 失败
 *
 * @param {Array<{from:string,to:string,identity?:object}>} moved
 * @param {string} batchId
 * @param {{onConflict?: 'fail'|'rename', recreateParents?: boolean}} [opts]
 */
export function restoreMoved(moved, batchId = '', opts = {}) {
  const onConflict = opts.onConflict === 'rename' ? 'rename' : 'fail'
  const recreateParents = opts.recreateParents !== false
  const roots = trashRoots()
  const results = []
  for (const item of [...moved].reverse()) {
    try {
      // 恢复源必须仍在「本插件批次目录」内，且 realpath 不能借中间符号链接逃逸。
      if (!item || typeof item.from !== 'string' || !path.isAbsolute(item.from)
        || typeof item.to !== 'string' || !path.isAbsolute(item.to)
        || !underTrash(item.to, roots) || !inPluginBatch(item.to) || !realpathInsideTrash(item.to, roots)) {
        throw restoreFail('notfound', `${restoreWord()}条目不在可恢复范围内，拒绝恢复`)
      }
      const state = restoreItemState(item)
      if (state === 'notfound') throw restoreFail('notfound', `${restoreWord()}条目不存在，拒绝恢复`)
      if (state === 'changed') throw restoreFail('changed', `${restoreWord()}条目已被替换，拒绝恢复`)
      // 父目录存在时也要查：只在「父目录不存在」时才检查会漏掉父目录本身是符号链接的情况。
      assertRestoreParentSafe(item.from)
      const parent = path.dirname(item.from)
      if (!existsNoFollow(parent)) {
        if (!recreateParents) throw restoreFail('enoent', '原路径的目录已不存在，无法恢复')
        ensureRestoreParent(item.from)
      }
      let target = item.from
      if (existsNoFollow(target)) {
        if (onConflict !== 'rename') throw restoreFail('exists', '原位置已存在同名文件，拒绝覆盖')
        target = restoredName(parent, path.basename(item.from))
      }
      fs.renameSync(item.to, target)
      results.push({ path: item.from, to: item.to, restoredTo: target, renamed: target !== item.from, ok: true })
    } catch (err) {
      results.push({
        path: item && typeof item.from === 'string' ? item.from : '',
        to: item && typeof item.to === 'string' ? item.to : '',
        ok: false,
        code: normalizeRestoreCode(err),
        error: String(err && err.message ? err.message : err),
      })
    }
  }
  const auditOk = appendAudit({ action: 'restore', batchId, results })
  return { batchId, results, auditOk }
}

function trashRoots() {
  const roots = []
  if (process.env.DEEPCLEAN_TRASH_DIR) roots.push(path.resolve(process.env.DEEPCLEAN_TRASH_DIR))
  roots.push(path.resolve(os.homedir(), '.Trash'))
  if (process.platform === 'win32') {
    const base = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
    roots.push(path.resolve(base, 'deepclean-mydisk', 'trash'))
  } else {
    roots.push(path.resolve(os.homedir(), '.local', 'share', 'deepclean-mydisk', 'trash'))
  }
  return roots
}

function samePath(a, b) {
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
}

function startsWithPath(target, base) {
  const t = process.platform === 'win32' ? target.toLowerCase() : target
  const b = process.platform === 'win32' ? base.toLowerCase() : base
  return t.startsWith(b + path.sep)
}

// 严格后代：废纸篓/隔离区根目录本身永远不被当成批次条目（否则可一次删掉整个废纸篓）。
function underTrash(p, roots) {
  const resolved = path.resolve(p)
  return roots.some((root) => startsWithPath(resolved, path.resolve(root)))
}

// 条目必须位于本插件的 deepclean-<uuid> 批次目录里（restore/purge 都要求）。
function inPluginBatch(p) {
  return /^deepclean-/.test(path.basename(path.dirname(path.resolve(p))))
}

// realpath 归属校验：批次目录中间若被塞入符号链接指向外部，字符串前缀检查会被绕过。
function realpathInsideTrash(p, roots) {
  let real
  try { real = fs.realpathSync(p) } catch { return false }
  for (const root of roots) {
    let realRoot
    try { realRoot = fs.realpathSync(root) } catch { continue }
    if (startsWithPath(real, realRoot)) return true
  }
  return false
}

function dirSizeBytes(dir) {
  let total = 0
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return 0 }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue
    const p = path.join(dir, entry.name)
    try {
      if (entry.isDirectory()) total += dirSizeBytes(p)
      else if (entry.isFile()) total += fs.lstatSync(p).size
    } catch { /* ignore */ }
  }
  return total
}

/**
 * 显式永久删除某个清理批次（用户二次确认后调用）。
 * 只允许删除隔离区/废纸篓内、由本插件移动的条目；符号链接拒绝。
 */
export function purgeMoved(items, batchId = '') {
  if (!Array.isArray(items) || items.length === 0) throw new Error('没有可永久删除的条目')
  const roots = trashRoots()
  const results = []
  let purged = 0
  let freedBytes = 0
  for (const item of items) {
    try {
      const to = item && item.to
      if (!to || !path.isAbsolute(to)) throw new Error('条目路径无效')
      if (!underTrash(to, roots) || !inPluginBatch(to) || !realpathInsideTrash(to, roots)) {
        throw new Error('不在隔离区/废纸篓的本插件批次目录内，拒绝删除')
      }
      let st
      try { st = fs.lstatSync(to) } catch { throw new Error('条目已不存在（可能已被清空）') }
      if (st.isSymbolicLink()) throw new Error('符号链接拒绝永久删除')
      freedBytes += st.isDirectory() ? dirSizeBytes(to) : st.size
      fs.rmSync(to, { recursive: true, force: true })
      purged += 1
      results.push({ from: item.from, to, ok: true })
    } catch (err) {
      results.push({ from: item && item.from, to: item && item.to, ok: false, error: String(err && err.message ? err.message : err) })
    }
  }
  // 删完后把空的批次目录一起收掉，避免废纸篓/隔离区里留下 deepclean-<uuid> 空壳。
  for (const dir of new Set(items.filter((i) => i && typeof i.to === 'string').map((i) => path.dirname(i.to)))) {
    try { fs.rmdirSync(dir) } catch { /* 仍有余项或已被删除 */ }
  }
  const auditOk = appendAudit({ action: 'purge', batchId, results, purged, freedBytes })
  return { batchId, purged, freedBytes, results, auditOk }
}

// 隔离区/废纸篓的「本插件批次」根目录（不含系统废纸篓里的其他文件）。
export function quarantineRoot() {
  if (process.env.DEEPCLEAN_TRASH_DIR) return path.resolve(process.env.DEEPCLEAN_TRASH_DIR)
  if (process.platform === 'win32') {
    const base = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
    return path.resolve(base, 'deepclean-mydisk', 'trash')
  }
  if (process.platform === 'darwin') return path.resolve(os.homedir(), '.Trash')
  return path.resolve(os.homedir(), '.local', 'share', 'deepclean-mydisk', 'trash')
}

function budgetedUsage(dir, deadline) {
  let bytes = 0
  let files = 0
  let truncated = false
  const stack = [dir]
  while (stack.length) {
    if (Date.now() > deadline) { truncated = true; break }
    const cur = stack.pop()
    let entries
    try { entries = fs.readdirSync(cur, { withFileTypes: true }) } catch { continue }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue
      const child = path.join(cur, entry.name)
      try {
        if (entry.isDirectory()) stack.push(child)
        else if (entry.isFile()) { bytes += fs.lstatSync(child).size; files += 1 }
      } catch { /* ignore */ }
    }
  }
  return { bytes, files, truncated }
}

/**
 * 隔离区/废纸篓里「本插件移入」的批次占用（只读统计，带时间预算）。
 * 布局：macOS 与 DEEPCLEAN_TRASH_DIR 下是 <root>/deepclean-<uuid>；
 * Windows/其他平台默认是 <root>/<时间戳>/deepclean-<uuid>。
 */
export function quarantineSummary(opts = {}) {
  const budgetMs = Number.isFinite(opts.budgetMs) && opts.budgetMs > 0 ? opts.budgetMs : 1500
  const deadline = Date.now() + budgetMs
  const root = quarantineRoot()
  const batches = []
  let kb = 0
  let files = 0
  let truncated = false
  const addBatch = (dir) => {
    const usage = budgetedUsage(dir, deadline)
    truncated = truncated || usage.truncated
    const batchKb = Math.round(usage.bytes / 1024)
    kb += batchKb
    files += usage.files
    let at = 0
    try { at = fs.lstatSync(dir).mtimeMs } catch { /* ignore */ }
    batches.push({ batchId: path.basename(dir).replace(/^deepclean-/, ''), path: dir, kb: batchKb, files: usage.files, at })
  }
  let entries = []
  try { entries = fs.readdirSync(root, { withFileTypes: true }) } catch { /* 没有隔离区 */ }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue
    if (!entry.isDirectory()) continue
    const child = path.join(root, entry.name)
    if (entry.name.startsWith('deepclean-')) { addBatch(child); continue }
    // Windows/其他平台：<root>/<时间戳>/deepclean-<uuid>
    let nested = []
    try { nested = fs.readdirSync(child, { withFileTypes: true }) } catch { continue }
    for (const sub of nested) {
      if (!sub.isDirectory() || sub.isSymbolicLink() || !sub.name.startsWith('deepclean-')) continue
      addBatch(path.join(child, sub.name))
    }
  }
  batches.sort((a, b) => b.at - a.at)
  return { root, kb, files, batches, truncated }
}

function hashFile(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(file)
    stream.on('data', chunk => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

// Only writes new, exclusively owned files on the destination filesystem.
export async function moveAcrossDevices(source, target) {
  const size = fs.statSync(source).size
  const staging = fs.mkdtempSync(path.join(path.dirname(target), '.deepclean-'))
  const tmp = path.join(staging, 'data')
  let publishedIdentity = null
  try {
    fs.copyFileSync(source, tmp, fs.constants.COPYFILE_EXCL)
    const before = await hashFile(source)
    if (before !== await hashFile(tmp) || fs.statSync(tmp).size !== size) {
      throw new Error('跨盘校验失败，原文件已保留')
    }
    try {
      // Atomic no-replace publication on APFS/NTFS and other hard-link-capable volumes.
      fs.linkSync(tmp, target)
    } catch (err) {
      if (!['ENOTSUP', 'EOPNOTSUPP', 'EPERM', 'ENOSYS', 'EXDEV'].includes(err.code)) throw err
      // FAT/exFAT may not support hard links. COPYFILE_EXCL still refuses existing entries.
      fs.copyFileSync(tmp, target, fs.constants.COPYFILE_EXCL)
    }
    publishedIdentity = fileIdentity(target)
    if (before !== await hashFile(target) || fs.statSync(target).size !== size) {
      throw new Error('跨盘校验失败，原文件已保留')
    }
    // Do not remove the source if a destination entry was replaced during validation.
    if (!sameIdentity(publishedIdentity, fileIdentity(target))) throw new Error('目标文件已变化，原文件已保留')
    fs.unlinkSync(source)
  } catch (err) {
    if (publishedIdentity) {
      try {
        if (sameIdentity(publishedIdentity, fileIdentity(target))) fs.unlinkSync(target)
      } catch { /* Never remove a replacement that we do not own. */ }
    }
    throw err
  } finally {
    try { fs.rmSync(staging, { recursive: true, force: true }) } catch { /* A failed cleanup cannot invalidate a successful move. */ }
  }
}
