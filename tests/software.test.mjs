import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createSoftwareService } from '../lib/software.js'

const item = { id: 'npm:first:hello', name: 'hello', version: '1.0', provider: 'npm', sourceId: 'node-first', location: '/demo/first/hello', fingerprint: 'original', executable: true, warnings: [], command: { file: '/demo/node', args: ['/demo/npm-cli.js', 'uninstall', '--global', 'hello'] } }
function fixture(t, overrides = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dc-software-')))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  let items = [structuredClone(item), { ...structuredClone(item), id: 'npm:second:hello', sourceId: 'node-second', location: '/demo/second/hello' }]
  const service = createSoftwareService({ journalPath: path.join(dir, 'jobs.json'), discover: async () => ({ items: structuredClone(items), sources: [{ id: 'node-first', status: 'ok' }, { id: 'node-second', status: 'ok' }] }), execute: async target => { items = items.filter(x => x.id !== target.id); return { code: 0 } }, ...overrides })
  return { service, setItems: value => { items = value }, dir }
}

test('uninstall acts on one installation instance and verifies absence', async t => {
  const { service } = fixture(t)
  await service.scan()
  const plan = await service.plan(item.id)
  const job = await service.execute(plan.id, true)
  await service.wait()
  assert.equal(service.snapshot().jobs.find(x => x.id === job.id).status, 'completed')
  assert.deepEqual(service.snapshot().items.map(x => x.id), ['npm:second:hello'])
  await assert.rejects(service.execute(plan.id, true), /plan_used/)
})

test('changed installation never reaches the uninstaller', async t => {
  let called = false
  const { service, setItems } = fixture(t, { execute: async () => { called = true } })
  await service.scan(); const plan = await service.plan(item.id)
  setItems([{ ...item, version: '2.0', fingerprint: 'replacement' }])
  await service.execute(plan.id, true); await service.wait()
  assert.equal(called, false)
  assert.equal(service.snapshot().jobs[0].error, 'installation_changed')
})

test('expired and unconfirmed plans cannot run', async t => {
  let clock = 1000
  const { service } = fixture(t, { now: () => clock })
  await service.scan(); const p = await service.plan(item.id)
  await assert.rejects(service.execute(p.id, false), /confirmation_required/)
  clock += 600001
  await assert.rejects(service.execute(p.id, true), /plan_expired/)
})

test('zero exit status does not prove removal', async t => {
  const { service } = fixture(t, { execute: async () => ({ code: 0 }) })
  await service.scan(); const p = await service.plan(item.id)
  await service.execute(p.id, true); await service.wait()
  assert.equal(service.snapshot().jobs[0].error, 'still_installed')
})

test('journal failure prevents invocation', async t => {
  let called = false
  const { service, dir } = fixture(t, { execute: async () => { called = true } })
  await service.scan(); const p = await service.plan(item.id)
  fs.mkdirSync(path.join(dir, 'jobs.json'))
  await assert.rejects(service.execute(p.id, true))
  assert.equal(called, false)
})

test('verification source failure is unknown, never successful removal', async t => {
  let after = false
  const { service } = fixture(t, { discover: async () => ({ items: after ? [] : [item], sources: [{ id: item.sourceId, status: after ? 'error' : 'ok' }] }), execute: async () => { after = true; return { code: 0 } } })
  await service.scan(); const p = await service.plan(item.id)
  await service.execute(p.id, true); await service.wait()
  assert.equal(service.snapshot().jobs[0].status, 'unknown')
})

test('active task prevents concurrent scan or uninstall', async t => {
  let release
  const { service } = fixture(t, { execute: () => new Promise(resolve => { release = resolve }) })
  await service.scan(); const p = await service.plan(item.id)
  const other = await service.plan('npm:second:hello')
  await service.execute(p.id, true)
  await assert.rejects(service.execute(other.id, true), /busy/)
  await assert.rejects(service.scan(), /busy/)
  while (!release) await new Promise(resolve => setImmediate(resolve))
  release({ code: 0 }); await service.wait()
})

test('unfinished tasks survive restart and require explicit reconciliation', async t => {
  const { service, dir } = fixture(t)
  fs.writeFileSync(path.join(dir, 'jobs.json'), JSON.stringify([{ id: 'interrupted-job', item, status: 'running' }]))
  const restarted = createSoftwareService({ journalPath: path.join(dir, 'jobs.json'), discover: async () => ({ items: [], sources: [{ id: item.sourceId, status: 'ok' }] }), execute: async () => assert.fail('must not replay') })
  assert.equal(restarted.snapshot().jobs[0].status, 'unknown')
  await restarted.reconcile('interrupted-job')
  assert.equal(restarted.snapshot().jobs[0].status, 'completed')
})

test('an interrupted job cannot be reconciled while its uninstaller is alive', async t => {
  const { dir } = fixture(t)
  fs.writeFileSync(path.join(dir, 'jobs.json'), JSON.stringify([{ id: 'still-running', item, status: 'running', pid: process.pid }]))
  const service = createSoftwareService({ journalPath: path.join(dir, 'jobs.json'), discover: async () => ({ items: [item], sources: [{ id: item.sourceId, status: 'ok' }] }), execute: async () => assert.fail('must not replay') })
  await assert.rejects(service.reconcile('still-running'), /uninstaller_running/)
  await service.scan()
  await assert.rejects(service.plan(item.id), /uninstaller_running/)
})

test('an uninstaller requesting reboot is held for verification after restart', async t => {
  const { service } = fixture(t, { getBootTime: () => 123456789, execute: async () => ({ code: 3010, rebootRequired: true, bootAt: 123456789 }) })
  await service.scan(); const plan = await service.plan(item.id)
  const job = await service.execute(plan.id, true); await service.wait()
  assert.equal(service.snapshot().jobs[0].status, 'reboot_required')
  await assert.rejects(service.reconcile(job.id), /restart_required/)
})

test('a different manager environment cannot verify removal', async t => {
  let after = false
  const { service } = fixture(t, { discover: async () => ({ items: after ? [] : [item], sources: [{ id: item.sourceId, status: 'ok', environment: after ? '/demo/second' : '/demo/first' }] }), execute: async () => { after = true; return { code: 0 } } })
  await service.scan(); const plan = await service.plan(item.id)
  await service.execute(plan.id, true); await service.wait()
  assert.equal(service.snapshot().jobs[0].error, 'verification_unavailable')
})

test('a blocked software scan records the reason instead of failing silently', async t => {
  let blocked = true
  const { service } = fixture(t, { blocked: () => blocked })
  await assert.rejects(service.scan(), /busy/)
  assert.equal(service.snapshot().scanning, false)
  assert.equal(service.snapshot().scanError, 'busy')
  blocked = false
  await service.scan()
  assert.equal(service.snapshot().scanError, '')
})

test('a vendor uninstaller that returns early is verified again before failing', async t => {
  let calls = 0
  const { service } = fixture(t, {
    verifyDelay: 0,
    discover: async () => { calls += 1; return { items: calls < 3 ? [structuredClone(item)] : [], sources: [{ id: item.sourceId, status: 'ok' }] } },
    execute: async () => ({ code: 0, deferred: true }),
  })
  await service.scan()
  const plan = await service.plan(item.id)
  await service.execute(plan.id, true)
  await service.wait()
  assert.equal(service.snapshot().jobs[0].status, 'completed')
  assert.equal(calls, 3, 'the removal is re-checked after the uninstaller exits')
})

test('install sizes are measured after the scan and cached per installation', async t => {
  let calls = 0
  let release
  const gate = new Promise(resolve => { release = resolve })
  const { service } = fixture(t, { measure: async () => { calls += 1; await gate; return { bytes: 4096, partial: false } } })
  await service.scan()
  const pending = service.snapshot()
  assert.equal(pending.sizes.pending, true)
  assert.equal(pending.sizes.total, 2)
  assert.equal(pending.items[0].sizeBytes ?? null, null)
  release()
  await service.whenSizes()
  const done = service.snapshot()
  assert.equal(done.sizes.done, true)
  assert.equal(done.sizes.pending, false)
  assert.equal(done.sizes.measured, 2)
  assert.ok(done.items.every(entry => entry.sizeBytes === 4096 && entry.sizeSource === 'measured' && entry.sizePartial === false))
  await service.scan()
  assert.equal(calls, 2, 'unchanged installations reuse the measured size')
  assert.equal(service.snapshot().sizes.done, true)
})

test('an unmeasurable installation falls back to the installer-reported size', async t => {
  const { service, setItems } = fixture(t, { measure: async () => null })
  setItems([{ ...structuredClone(item), estimatedSizeKb: 2048 }])
  await service.scan()
  await service.whenSizes()
  const entry = service.snapshot().items[0]
  assert.equal(entry.sizeBytes, 2048 * 1024)
  assert.equal(entry.sizeSource, 'registry')
  assert.equal(entry.sizePartial, true)
})

test('a plan stays valid when install sizes finish after it', async t => {
  let open
  const gate = new Promise(resolve => { open = resolve })
  const { service } = fixture(t, { measure: async () => { await gate; return { bytes: 8192, partial: false } } })
  await service.scan()
  const plan = await service.plan(item.id)
  open()
  await service.whenSizes()
  await service.execute(plan.id, true)
  await service.wait()
  assert.equal(service.snapshot().jobs[0].status, 'completed')
})

test('an oversized journal is trimmed instead of locking uninstall', async t => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dc-software-')))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const journalPath = path.join(dir, 'jobs.json')
  fs.writeFileSync(journalPath, JSON.stringify(Array.from({ length: 1001 }, (_, i) => ({
    id: 'job-' + i, item, status: 'completed', startedAt: 1000 + i, finishedAt: 2000 + i,
  }))))
  const service = createSoftwareService({ journalPath, discover: async () => ({ items: [structuredClone(item)], sources: [{ id: item.sourceId, status: 'ok' }] }), execute: async () => ({ code: 0 }) })
  assert.equal(service.snapshot().journalError, false)
  assert.equal(service.snapshot().jobs.length, 1000)
  assert.equal(service.snapshot().jobs[0].id, 'job-1000', 'newest record is kept')
})

test('a corrupt journal is fail-closed and can be reset with a backup', async t => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dc-software-')))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const journalPath = path.join(dir, 'jobs.json')
  fs.writeFileSync(journalPath, '{broken')
  const service = createSoftwareService({ journalPath, discover: async () => ({ items: [structuredClone(item)], sources: [{ id: item.sourceId, status: 'ok' }] }), execute: async () => ({ code: 0 }) })
  assert.equal(service.snapshot().journalError, true)
  await service.scan()
  const blockedPlan = await service.plan(item.id)
  await assert.rejects(service.execute(blockedPlan.id, true), /journal_unavailable/)
  const state = service.resetJournal()
  assert.equal(state.journalError, false)
  assert.equal(state.jobs.length, 0)
  assert.equal(fs.readdirSync(dir).filter(name => name.includes('.corrupt-')).length, 1)
  await service.scan()
  const plan = await service.plan(item.id)
  await service.execute(plan.id, true)
  await service.wait()
  assert.equal(service.snapshot().journalError, false)
})

test('resetting a healthy journal is refused', async t => {
  const { service } = fixture(t)
  assert.throws(() => service.resetJournal(), /journal_ok/)
})

test('preflight failures are failed with their reason, not left unverified', async t => {
  const { service } = fixture(t, { execute: async () => { throw Object.assign(new Error('installation_changed'), { code: 'installation_changed', preflight: true }) } })
  await service.scan()
  const plan = await service.plan(item.id)
  await service.execute(plan.id, true)
  await service.wait()
  const job = service.snapshot().jobs[0]
  assert.equal(job.status, 'failed')
  assert.equal(job.error, 'installation_changed')
})

test('a failure after the uninstaller started still needs verification', async t => {
  const { service } = fixture(t, { execute: async (_target, recordProcess) => { recordProcess(424242); throw Object.assign(new Error('boom'), { code: 'EACCES' }) } })
  await service.scan()
  const plan = await service.plan(item.id)
  await service.execute(plan.id, true)
  await service.wait()
  const job = service.snapshot().jobs[0]
  assert.equal(job.status, 'unknown')
  assert.equal(job.error, 'EACCES')
})

test('a partially readable desktop source still allows its readable apps', async t => {
  const app = { ...structuredClone(item), id: 'desktop:demo', sourceId: 'desktop', provider: 'macOS', kind: 'desktop', action: 'move-app', location: '/Applications/Demo.app' }
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dc-software-')))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const service = createSoftwareService({ journalPath: path.join(dir, 'jobs.json'), discover: async () => ({ items: [app], sources: [{ id: 'desktop', status: 'partial', error: 'desktop_partial' }] }), execute: async () => ({ code: 0 }) })
  await service.scan()
  const plan = await service.plan(app.id)
  assert.ok(plan.id)
})

test('a partially readable manager source stays atomic', async t => {
  const { service } = fixture(t, { discover: async () => ({ items: [structuredClone(item)], sources: [{ id: item.sourceId, status: 'partial' }] }) })
  await service.scan()
  await assert.rejects(service.plan(item.id), /source_unavailable/)
})
