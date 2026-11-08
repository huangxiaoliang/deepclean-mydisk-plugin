/** Software operations are separate from disk cleanup. No model write tool. */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'

export function bootTime() {
  try { return Date.now() - os.uptime() * 1000 } catch { return null }
}
const TTL = 10 * 60 * 1000
const SIZE_CONCURRENCY = 4
const SIZE_BUDGET_MS = 20000
const fail = code => { throw Object.assign(new Error(code), { code }) }
const clone = value => structuredClone(value)
const publicItem = ({ command, ...item }) => item
const jobStates = ['checking', 'running', 'verifying', 'completed', 'failed', 'unknown', 'canceled', 'reboot_required']
function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try { process.kill(pid, 0); return true } catch (err) { return err.code !== 'ESRCH' }
}

export function createSoftwareService({ discover, execute: executeItem, journalPath, now = Date.now, getBootTime = bootTime, disk = () => null, blocked = () => false, verifyDelay = 1500, measure = null }) {
  let inventory = { items: [], sources: [], at: 0 }, scanning = false, active = null, pending = null, journalError = false, scanError = ''
  const plans = new Map()
  let jobs = []
  // Install sizes are measured after the inventory is shown, so the list never
  // waits for a directory walk. Results are cached per installation fingerprint.
  let sizeState = { pending: false, done: true, measured: 0, total: 0, truncated: false, run: 0 }
  let sizePromise = Promise.resolve()
  const sizeCache = new Map()
  const sizeKey = item => `${item.id}:${item.fingerprint}`
  function applySize(item, entry) {
    item.sizeBytes = entry.bytes
    item.sizePartial = !!entry.partial
    item.sizeSource = entry.source
  }
  function applyCachedSizes() {
    for (const item of inventory.items) {
      const entry = sizeCache.get(sizeKey(item))
      if (entry) applySize(item, entry)
    }
  }
  function startSizeScan() {
    const run = ++sizeState.run
    sizeState = { pending: false, done: true, measured: 0, total: 0, truncated: false, run }
    sizePromise = Promise.resolve()
    if (typeof measure !== 'function') return
    const targets = inventory.items.filter(item => item.executable && !sizeCache.has(sizeKey(item)))
    if (!targets.length) return
    sizeState.pending = true
    sizeState.done = false
    sizeState.total = targets.length
    const deadline = Date.now() + SIZE_BUDGET_MS
    let cursor = 0
    const worker = async () => {
      while (true) {
        if (sizeState.run !== run) return
        if (blocked()) { sizeState.truncated = true; return }
        if (Date.now() > deadline) { sizeState.truncated = true; return }
        const index = cursor++
        if (index >= targets.length) return
        const item = targets[index]
        let entry = null
        try {
          const result = await measure(item)
          if (result && Number.isFinite(result.bytes) && result.bytes >= 0) entry = { bytes: result.bytes, partial: !!result.partial, source: 'measured' }
        } catch { /* fall through to the installer-reported hint */ }
        if (sizeState.run !== run) return
        if (!entry && Number.isFinite(item.estimatedSizeKb) && item.estimatedSizeKb > 0) entry = { bytes: item.estimatedSizeKb * 1024, partial: true, source: 'registry' }
        if (entry) { sizeCache.set(sizeKey(item), entry); applySize(item, entry) }
        sizeState.measured += 1
      }
    }
    sizePromise = Promise.all(Array.from({ length: SIZE_CONCURRENCY }, worker)).then(() => {
      if (sizeState.run === run) { sizeState.pending = false; sizeState.done = true }
    }, () => {
      if (sizeState.run === run) { sizeState.pending = false; sizeState.done = true; sizeState.truncated = true }
    })
  }
  const JOURNAL_LIMIT = 1000
  // 解析上限只防内存炸弹；超过运行期上限的记录在加载时按时间裁剪，不把整份日志判为损坏。
  const JOURNAL_PARSE_LIMIT = 10000
  const validJob = j => !!j && typeof j === 'object' && typeof j.id === 'string' && j.item && typeof j.item.id === 'string' && jobStates.includes(j.status)
  try {
    if (fs.existsSync(journalPath)) {
      if (fs.lstatSync(journalPath).isSymbolicLink()) fail('journal_unavailable')
      const saved = JSON.parse(fs.readFileSync(journalPath, 'utf8'))
      if (!Array.isArray(saved) || saved.length > JOURNAL_PARSE_LIMIT || saved.some(j => !validJob(j))) fail('journal_unavailable')
      const kept = saved.length > JOURNAL_LIMIT
        ? [...saved].sort((a, b) => (Number(b.startedAt) || 0) - (Number(a.startedAt) || 0)).slice(0, JOURNAL_LIMIT)
        : saved
      jobs = kept.map(j => ['checking', 'running', 'verifying'].includes(j.status) ? { ...j, status: 'unknown', error: 'interrupted' } : j)
    }
  } catch { journalError = true }
  function persist() {
    if (journalError) fail('journal_unavailable')
    const parent = path.dirname(journalPath)
    for (let p = parent; ; p = path.dirname(p)) {
      if (fs.existsSync(p) && fs.lstatSync(p).isSymbolicLink()) fail('journal_unavailable')
      if (p === path.dirname(p)) break
    }
    fs.mkdirSync(parent, { recursive: true, mode: 0o700 })
    if (fs.existsSync(journalPath) && fs.lstatSync(journalPath).isSymbolicLink()) fail('journal_unavailable')
    const temp = `${journalPath}.${crypto.randomUUID()}.tmp`
    try {
      const fd = fs.openSync(temp, 'wx', 0o600)
      try { fs.writeFileSync(fd, JSON.stringify(jobs)); fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
      fs.renameSync(temp, journalPath)
    } catch (err) { try { fs.unlinkSync(temp) } catch {} ; throw Object.assign(err, { code: 'journal_unavailable' }) }
  }
  // 只有日志被判定为不可用（结构损坏、符号链接、解析上限）时才允许重置：
  // 先把坏文件改名备份，再从空记录开始，避免静默丢掉可能有用的待核验记录。
  function resetJournal() {
    if (!journalError) fail('journal_ok')
    const backup = `${journalPath}.corrupt-${now()}`
    try {
      if (fs.existsSync(backup)) fail('journal_unavailable')
      if (fs.existsSync(journalPath)) fs.renameSync(journalPath, backup)
      jobs = []
      journalError = false
      persist()
      return snapshot()
    } catch (err) {
      journalError = true
      throw Object.assign(new Error(err?.message || 'journal_unavailable'), { code: err?.code || 'journal_unavailable' })
    }
  }
  async function refresh() {
    const next = await discover()
    if (!Array.isArray(next.items) || !Array.isArray(next.sources)) fail('invalid_inventory')
    if (new Set(next.items.map(x => x.id)).size !== next.items.length) fail('ambiguous_inventory')
    inventory = { ...next, at: now() }
    applyCachedSizes()
    return inventory
  }
  const snapshot = () => clone({ ...inventory, items: inventory.items.map(publicItem), scanning, active, jobs, journalError, scanError,
    sizes: { pending: sizeState.pending, done: sizeState.done, measured: sizeState.measured, total: sizeState.total, truncated: sizeState.truncated } })
  async function scan() {
    if (scanning || active || blocked()) { scanError = 'busy'; fail('busy') }
    scanning = true; scanError = ''
    try { await refresh(); startSizeScan(); return snapshot() } catch (err) { scanError = err.code || 'source_unavailable'; inventory.at = 0; throw err } finally { scanning = false }
  }
  function sourceFor(item) {
    // 管理器输出必须是原子的整体成功；桌面来源按 App 隔离，部分可读时其余 App 仍可操作。
    return inventory.sources.find(s => s.id === item.sourceId &&
      (s.status === 'ok' || (s.id === 'desktop' && s.status === 'partial')))
  }
  function stillInstalled(item) {
    return inventory.items.some(candidate => {
      if (candidate.id === item.id) return true
      if (item.provider !== candidate.provider || item.action === 'move-app') return false
      if (item.packageId && item.packageId === candidate.packageId) return candidate.sourceId === item.sourceId || candidate.location === item.location
      return !!item.key && item.key === candidate.key && item.sourceId === candidate.sourceId
    })
  }
  // Install sizes arrive after the plan, so identity must not include them.
  const sameInstallation = (a, b) => !!a && a.id === b.id && a.fingerprint === b.fingerprint &&
    a.location === b.location && !!a.executable === !!b.executable
  async function plan(id) {
    if (scanning || active || blocked()) fail('busy')
    if (!inventory.at || now() - inventory.at > TTL) fail('stale_inventory')
    const item = inventory.items.find(x => x.id === id)
    if (!item) fail('not_found')
    const source = sourceFor(item)
    if (!source) fail('source_unavailable')
    if (!item.executable) fail(item.blockReason || 'manual_required')
    if (jobs.some(j => j.status === 'unknown' && processAlive(j.pid))) fail('uninstaller_running')
    if (jobs.some(j => j.item.id === id && ['unknown', 'reboot_required'].includes(j.status))) fail('verification_required')
    const p = { id: crypto.randomUUID(), createdAt: now(), expiresAt: now() + TTL, item: clone(item), environment: source.environment, used: false }
    // Only the most recent 100 plans; stale plans never authorize an operation.
    for (const [key, value] of plans) if (value.expiresAt < now()) plans.delete(key)
    if (plans.size >= 100) plans.delete(plans.keys().next().value)
    plans.set(p.id, p)
    return { id: p.id, expiresAt: p.expiresAt, item: publicItem(clone(item)), command: clone(item.command), reversible: item.command?.kind === 'move-app' }
  }
  async function execute(planId, confirmed) {
    if (confirmed !== true) fail('confirmation_required')
    const p = plans.get(planId)
    if (!p) fail('plan_missing')
    if (p.used) fail('plan_used')
    if (p.expiresAt <= now()) fail('plan_expired')
    if (jobs.some(j => j.status === 'unknown' && processAlive(j.pid))) fail('uninstaller_running')
    if (jobs.some(j => j.item.id === p.item.id && ['unknown', 'reboot_required'].includes(j.status))) fail('verification_required')
    if (active || scanning || blocked()) fail('busy')
    const job = { id: crypto.randomUUID(), planId, item: publicItem(clone(p.item)), environment: p.environment, status: 'checking', startedAt: now(), finishedAt: null }
    const previousJobs = jobs
    const unresolved = jobs.filter(j => ['unknown', 'reboot_required'].includes(j.status))
    if (unresolved.length >= 1000) fail('verification_required')
    const finished = jobs.filter(j => !unresolved.includes(j)).slice(0, 999 - unresolved.length)
    jobs = [job, ...[...unresolved, ...finished].sort((a, b) => b.startedAt - a.startedAt)]
    try { persist() } catch (e) { jobs = previousJobs; throw e }
    p.used = true
    active = job.id
    pending = (async () => {
      let invoked = false
      try {
        await refresh()
        const current = inventory.items.find(x => x.id === p.item.id)
        if (!sameInstallation(current, p.item)) fail('installation_changed')
        const executionSource = sourceFor(current)
        if (!executionSource || executionSource.environment !== p.environment) fail('source_unavailable')
        if (blocked()) fail('busy')
        if (p.expiresAt <= now()) fail('plan_expired')
        const before = disk()
        job.status = 'running'; persist()
        const result = await executeItem(current, pid => {
          invoked = true
          job.pid = pid
          persist()
        })
        invoked = true
        delete job.pid
        const after = disk()
        if (before?.mount === after?.mount && Number.isFinite(before?.free) && Number.isFinite(after?.free)) job.freeDelta = after.free - before.free
        job.exitCode = result.code
        if (result.batchId) job.batchId = result.batchId
        if (result.auditOk === false) job.auditOk = false
        job.status = 'verifying'; persist()
        await refresh()
        const verificationSource = sourceFor(current)
        if (!verificationSource || verificationSource.environment !== p.environment) fail('verification_unavailable')
        let present = stillInstalled(current)
        // Vendor uninstallers may return before their own removal finishes (they often
        // hand off to a temp copy). Re-check a few times before reporting failure.
        if (!result.rebootRequired && result.deferred === true && present) {
          for (let attempt = 0; attempt < 3 && present; attempt++) {
            await new Promise(resolve => setTimeout(resolve, verifyDelay))
            await refresh()
            const pendingSource = sourceFor(current)
            if (!pendingSource || pendingSource.environment !== p.environment) fail('verification_unavailable')
            present = stillInstalled(current)
          }
        }
        if (result.rebootRequired) {
          job.status = 'reboot_required'
          job.bootAt = result.bootAt
        } else if (present && result.canceled) job.status = 'canceled'
        else if (present) { job.status = 'failed'; job.error = 'still_installed' }
        else { job.status = 'completed'; if (result.code !== 0) job.warning = 'uninstalled_with_error' }
      } catch (err) {
        // 预检失败（符号链接、安装身份变化、spawn 失败等）没有执行任何操作：记为 failed，
        // 只有真正启动过卸载器 / 移出过文件的中断才需要人工重新核验。
        job.status = invoked && err?.preflight !== true ? 'unknown' : 'failed'
        job.error = err?.code || 'operation_failed'
      } finally {
        job.finishedAt = now()
        try { persist() } catch { job.auditOk = false; journalError = true }
        active = null
      }
    })()
    return clone(job)
  }
  async function reconcile(id) {
    if (active || scanning || blocked()) fail('busy')
    const job = jobs.find(x => x.id === id)
    if (!job || !['unknown', 'reboot_required'].includes(job.status)) fail('not_found')
    if (processAlive(job.pid)) fail('uninstaller_running')
    if (job.status === 'reboot_required') {
      const currentBoot = getBootTime()
      if (!currentBoot || !job.bootAt || Math.abs(currentBoot - job.bootAt) < 60000) fail('restart_required')
    }
    scanning = true
    try {
      await refresh()
      const source = sourceFor(job.item)
      if (!source || source.environment !== job.environment) fail('verification_unavailable')
      job.status = stillInstalled(job.item) ? 'failed' : 'completed'
      job.error = job.status === 'failed' ? 'still_installed' : undefined
      persist()
      return snapshot()
    } finally { scanning = false }
  }
  return { scan, plan, execute, reconcile, resetJournal, snapshot, blockedNow: () => blocked(), get active() { return active }, wait: () => pending, whenSizes: () => sizePromise }
}
