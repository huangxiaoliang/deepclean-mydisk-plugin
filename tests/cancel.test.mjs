import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-cancel-test-'))
process.env.DSH_HOME = path.join(root, 'dsh')
process.env.DEEPCLEAN_TRASH_DIR = path.join(root, 'trash')

const plugin = await import('../lib/index.js')
const routes = []
const ctx = {
  tools: { register() {} },
  effect() {},
  inject(deps, cb) { if (deps.includes('webServer')) cb({ webServer: { register(r) { routes.push(r); return () => {} } } }) },
}
plugin.apply(ctx)
const find = (p) => routes.find((r) => r.path === '/dsh-deepclean/api' + p)
function mockRes() { return { code: 0, body: '', writeHead(c) { this.code = c }, end(b) { this.body = b }, destroy() {} } }
function mockReq(method, url, body) {
  const listeners = {}
  const req = { method, url, headers: { host: '127.0.0.1:62465', 'x-deepclean-ui': 'panel', 'sec-fetch-site': 'same-origin' }, on(e, f) { (listeners[e] ||= []).push(f) }, destroy() {} }
  setTimeout(() => {
    if (body !== undefined) for (const f of listeners.data || []) f(Buffer.from(body))
    for (const f of listeners.end || []) f()
  }, 0)
  return req
}
async function call(p, method = 'GET', body) {
  const res = mockRes()
  await find(p).handler(mockReq(method, '/dsh-deepclean/api' + p, body), res)
  return { code: res.code, body: JSON.parse(res.body || '{}') }
}

test('scan cancellation terminates quickly', { timeout: 60000 }, async () => {
  assert.equal((await call('/scan', 'POST', '{}')).code, 202)
  await new Promise((r) => setTimeout(r, 1200))
  const cancel = await call('/scan/cancel', 'POST', '{}')
  if (cancel.code === 409) {
    const s = (await call('/scan')).body.scan.status
    assert.ok(['done', 'canceled', 'error'].includes(s), `unexpected ${s}`)
    return
  }
  assert.equal(cancel.code, 200)
  const t0 = Date.now()
  let status = 'running'
  while (Date.now() - t0 < 15000) {
    await new Promise((r) => setTimeout(r, 300))
    status = (await call('/scan')).body.scan.status
    if (status !== 'running') break
  }
  assert.equal(status, 'canceled')
})

test('photo scan cancellation terminates quickly', { timeout: 60000 }, async () => {
  assert.equal((await call('/photos/scan', 'POST', '{}')).code, 202)
  await new Promise((r) => setTimeout(r, 1200))
  const cancel = await call('/photos/cancel', 'POST', '{}')
  if (cancel.code === 409) {
    const s = (await call('/photos')).body.scan.status
    assert.ok(['done', 'canceled', 'error'].includes(s), `unexpected ${s}`)
    return
  }
  assert.equal(cancel.code, 200)
  const t0 = Date.now()
  let status = 'running'
  while (Date.now() - t0 < 15000) {
    await new Promise((r) => setTimeout(r, 300))
    status = (await call('/photos')).body.scan.status
    if (status !== 'running') break
  }
  assert.equal(status, 'canceled')
})
