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
  if (process.env.DEEPCLEAN_TRASH_DIR) return process.env.DEEPCLEAN_TRASH_DIR
  if (process.platform === 'win32') {
    const base = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
    return path.join(base, 'deepclean-mydisk', 'trash', String(now))
  }
  if (process.platform === 'darwin') return path.join(os.homedir(), '.Trash')
  return path.join(os.homedir(), '.local', 'share', 'deepclean-mydisk', 'trash', String(now))
}

export function auditLogPath() {
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  return path.join(home, 'deepclean-audit.log')
}

export function appendAudit(entry) {
  try {
    const file = auditLogPath()
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.appendFileSync(file, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n', 'utf8')
  } catch { /* 审计失败不阻断清理 */ }
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

/**
 * 把 paths 移到废纸篓（macOS/Windows/其他隔离目录）。
 * @param {string[]} paths 绝对路径
 * @param {Set<string>} allowed 本次扫描允许的路径集合
 * @returns {{batchId:string, moved:Array<{from:string,to:string}>, results:Array<object>}}
 */
export function moveToTrash(paths, allowed) {
  if (!Array.isArray(paths) || paths.length === 0) throw new Error('没有要清理的条目')
  if (paths.length > MAX_BATCH) throw new Error(`一次最多清理 ${MAX_BATCH} 项`)
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
      moved.push({ from: p, to: dest, identity })
      results.push({ path: p, ok: true, to: dest })
    } catch (err) {
      results.push({ path: p, ok: false, error: String(err && err.message ? err.message : err) })
    }
  }
  appendAudit({ action: 'clean', batchId, platform: process.platform, trash: dir, moved, results })
  return { batchId, moved, results }
}

/**
 * 撤销一个清理批次：把仍在废纸篓、原位置已空的条目移回。
 */
export function undoBatch(batch) {
  if (!batch || !Array.isArray(batch.moved) || batch.moved.length === 0) {
    throw new Error('没有可撤销的批次')
  }
  return restoreMoved(batch.moved, batch.batchId)
}

/**
 * 从审计日志的 moved 列表恢复（跨重启可用）。
 */
export function restoreMoved(moved, batchId = '') {
  const results = []
  for (const item of [...moved].reverse()) {
    try {
      if (!canRestoreMoved(item)) throw new Error(`${process.platform === 'darwin' ? '废纸篓' : '隔离区'}条目不存在或已被替换，拒绝恢复`)
      if (fs.existsSync(item.from)) throw new Error('原位置已存在同名文件，拒绝覆盖')
      fs.renameSync(item.to, item.from)
      results.push({ path: item.from, to: item.to, ok: true })
    } catch (err) {
      results.push({ path: item.from, ok: false, error: String(err && err.message ? err.message : err) })
    }
  }
  appendAudit({ action: 'restore', batchId, results })
  return { batchId, results }
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

function underTrash(p, roots) {
  const resolved = path.resolve(p)
  return roots.some((root) => resolved === root || resolved.startsWith(root + path.sep))
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
      if (!underTrash(to, roots)) throw new Error('不在隔离区/废纸篓内，拒绝删除')
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
  appendAudit({ action: 'purge', batchId, results, purged, freedBytes })
  return { batchId, purged, freedBytes, results }
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
