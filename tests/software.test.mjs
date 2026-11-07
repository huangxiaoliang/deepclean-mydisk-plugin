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
