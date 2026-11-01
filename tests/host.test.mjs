import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-host-test-'))
process.env.DSH_HOME = path.join(root, 'dsh')
process.env.DEEPCLEAN_TRASH_DIR = path.join(root, 'trash')

const plugin = await import('../lib/index.js')

const routes = []
const ctx = {
  tools: { register() {} },
  effect() {},
  inject(deps, cb) {
    if (deps.includes('webServer')) cb({ webServer: { register(r) { routes.push(r); return () => {} } } })
  },
}
plugin.apply(ctx)

const find = (p) => routes.find((r) => r.path.endsWith(p))
function mockRes() {
  return { code: 0, body: '', writeHead(c) { this.code = c }, end(b) { this.body = b }, destroy() {} }
}
function mockReq(method, url, body) {
  const listeners = {}
  const req = { method, url, on(e, f) { (listeners[e] ||= []).push(f) }, destroy() {} }
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

test('host registers expected routes', () => {
  for (const p of ['/overview', '/disk', '/scan', '/scan/cancel', '/clean', '/undo', '/history', '/restore', '/whitelist', '/photos', '/photos/scan', '/thumb', '/move', '/move/cancel', '/tree', '/reveal', '/state', '/permissions']) {
    assert.ok(find(p), `missing route ${p}`)
  }
})

test('state starts clean', async () => {
  const { code, body } = await call('/state')
  assert.equal(code, 200)
  assert.equal(body.canUndo, false)
})

test('overview exposes live disk usage before any scan', async () => {
  const { code, body } = await call('/overview')
  assert.equal(code, 200)
  assert.equal(body.report, null, 'no scan has run yet')
  assert.ok(body.disk, 'overview must include a live disk snapshot')
  assert.ok(body.disk.total > 0, 'total must be positive')
  assert.ok(body.disk.used >= 0)
  assert.ok(body.disk.free >= 0)
  assert.ok(Math.abs(body.disk.used + body.disk.free - body.disk.total) < 2, 'used + free == total')
  assert.ok(typeof body.disk.mount === 'string' && body.disk.mount.length > 0)
  assert.ok(Date.now() - body.disk.at < 60000, 'snapshot is fresh')
})

test('disk endpoint returns a live snapshot matching fs.statfs', async () => {
  const { code, body } = await call('/disk')
  assert.equal(code, 200)
  assert.ok(body.disk, '/disk must return a snapshot')
  assert.ok(Math.abs(body.disk.used + body.disk.free - body.disk.total) < 2, 'used + free == total')
  const st = fs.statfsSync(body.disk.mount)
  const free = st.bavail * st.bsize
  const used = (st.blocks - st.bfree) * st.bsize
  assert.ok(Math.abs(body.disk.free - free) < 64 * 1024 * 1024)
  assert.ok(Math.abs(body.disk.used - used) < 64 * 1024 * 1024)
})

test('clean refuses without a fresh scan', async () => {
  const { code } = await call('/clean', 'POST', JSON.stringify({ paths: [] }))
  assert.equal(code, 409)
})

test('move refuses without a fresh scan', async () => {
  const { code } = await call('/move', 'POST', JSON.stringify({ paths: [], destination: root }))
  assert.equal(code, 400)
})

test('whitelist stores only absolute paths', async () => {
  const put = await call('/whitelist', 'PUT', JSON.stringify({ paths: ['relative/path', path.join(root, 'abs')] }))
  assert.equal(put.code, 200)
  assert.deepEqual(put.body.paths, [path.join(root, 'abs')])
  const get = await call('/whitelist')
  assert.deepEqual(get.body.paths, [path.join(root, 'abs')])
  await call('/whitelist', 'PUT', JSON.stringify({ paths: [] }))
})

test('photos starts idle', async () => {
  const { code, body } = await call('/photos')
  assert.equal(code, 200)
  assert.equal(body.scan.status, 'idle')
})

test('tree rejects paths outside home', { skip: process.platform === 'win32' }, async () => {
  const res = mockRes()
  await find('/tree').handler(mockReq('GET', '/dsh-deepclean/api/tree?path=' + encodeURIComponent('/etc')), res)
  assert.equal(res.code, 400)
})

test('permissions endpoint responds', { skip: process.platform === 'win32' }, async () => {
  const { code, body } = await call('/permissions')
  assert.equal(code, 200)
  assert.match(body.text, /权限检查/)
})
