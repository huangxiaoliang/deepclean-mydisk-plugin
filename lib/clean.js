/**
 * 清理能力（移动 + 撤销 + 审计）—— 只移动，不永久删除。
 *
 * 安全契约：
 * - 只接受「最近一次扫描结果」允许列表里的绝对路径；
 * - 符号链接一律拒绝（避免移到链接目标）；
 * - 目标名冲突时自动加序号，绝不覆盖；
 * - 撤销只回滚仍存在、且原位置已空的条目。
 */
import fs from 'node:fs'
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
  const batchId = String(now)
  const dir = trashDir(now)
  fs.mkdirSync(dir, { recursive: true })
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
      fs.renameSync(p, dest)
      moved.push({ from: p, to: dest })
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
      if (!fs.existsSync(item.to)) throw new Error('废纸篓里已找不到该条目')
      if (fs.existsSync(item.from)) throw new Error('原位置已存在同名文件，拒绝覆盖')
      fs.renameSync(item.to, item.from)
      results.push({ path: item.from, ok: true })
    } catch (err) {
      results.push({ path: item.from, ok: false, error: String(err && err.message ? err.message : err) })
    }
  }
  appendAudit({ action: 'restore', batchId, results })
  return { batchId, results }
}
