/** Software operations are separate from disk cleanup. No model write tool. */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'

export function bootTime() {
  try { return Date.now() - os.uptime() * 1000 } catch { return null }
}
const TTL = 10 * 60 * 1000
const fail = code => { throw Object.assign(new Error(code), { code }) }
const clone = value => structuredClone(value)
const publicItem = ({ command, ...item }) => item
const jobStates = ['checking', 'running', 'verifying', 'completed', 'failed', 'unknown', 'canceled', 'reboot_required']
function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try { process.kill(pid, 0); return true } catch (err) { return err.code !== 'ESRCH' }
}

export function createSoftwareService({ discover, execute: executeItem, journalPath, now = Date.now, getBootTime = bootTime, disk = () => null, blocked = () => false }) {
  let inventory = { items: [], sources: [], at: 0 }, scanning = false, active = null, pending = null, journalError = false, scanError = ''
  const plans = new Map()
  let jobs = []
  try {
    if (fs.existsSync(journalPath)) {
      if (fs.lstatSync(journalPath).isSymbolicLink()) fail('journal_unavailable')
      const saved = JSON.parse(fs.readFileSync(journalPath, 'utf8'))
      if (!Array.isArray(saved) || saved.length > 1000 || saved.some(j => !j || typeof j.id !== 'string' || !j.item || typeof j.item.id !== 'string' || !jobStates.includes(j.status))) fail('journal_unavailable')
      jobs = saved.map(j => ['checking', 'running', 'verifying'].includes(j.status) ? { ...j, status: 'unknown', error: 'interrupted' } : j)
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
  async function refresh() {
    const next = await discover()
    if (!Array.isArray(next.items) || !Array.isArray(next.sources)) fail('invalid_inventory')
    if (new Set(next.items.map(x => x.id)).size !== next.items.length) fail('ambiguous_inventory')
    inventory = { ...next, at: now() }
    return inventory
  }
  const snapshot = () => clone({ ...inventory, items: inventory.items.map(publicItem), scanning, active, jobs, journalError, scanError })
  async function scan() {
    if (scanning || active || blocked()) fail('busy')
    scanning = true; scanError = ''
    try { await refresh(); return snapshot() } catch (err) { scanError = err.code || 'source_unavailable'; inventory.at = 0; throw err } finally { scanning = false }
  }
  function sourceFor(item) {
    return inventory.sources.find(s => s.id === item.sourceId && s.status === 'ok')
  }
  function stillInstalled(item) {
    return inventory.items.some(candidate => {
      if (candidate.id === item.id) return true
      if (item.provider !== candidate.provider || item.action === 'move-app') return false
      if (item.packageId && item.packageId === candidate.packageId) return candidate.sourceId === item.sourceId || candidate.location === item.location
      return !!item.key && item.key === candidate.key && item.sourceId === candidate.sourceId
    })
  }
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
        if (!current || JSON.stringify(current) !== JSON.stringify(p.item)) fail('installation_changed')
        const executionSource = sourceFor(current)
        if (!executionSource || executionSource.environment !== p.environment) fail('source_unavailable')
        if (blocked()) fail('busy')
        if (p.expiresAt <= now()) fail('plan_expired')
        const before = disk()
        job.status = 'running'; persist()
        invoked = true
        const result = await executeItem(current, pid => {
          job.pid = pid
          persist()
        })
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
        const present = stillInstalled(current)
        if (result.rebootRequired) {
          job.status = 'reboot_required'
          job.bootAt = result.bootAt
        } else if (present && result.canceled) job.status = 'canceled'
        else if (present) { job.status = 'failed'; job.error = 'still_installed' }
        else { job.status = 'completed'; if (result.code !== 0) job.warning = 'uninstalled_with_error' }
      } catch (err) {
        job.status = invoked ? 'unknown' : 'failed'
        job.error = err.code || 'operation_failed'
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
  return { scan, plan, execute, reconcile, snapshot, get active() { return active }, wait: () => pending }
}
