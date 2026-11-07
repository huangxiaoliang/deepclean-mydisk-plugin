import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { EventEmitter } from 'node:events'

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dc-software-journal-')))
process.env.DSH_HOME = root
// 在宿主加载前放入损坏的操作记录，覆盖「结构性损坏 -> fail-closed -> 显式重置」链路。
fs.writeFileSync(path.join(root, 'deepclean-software-jobs.json'), '{broken')
const { apply } = await import('../lib/index.js')
const routes = []
apply({ tools: { register() {} }, effect() {}, inject: (_names, cb) => cb({ webServer: { register: r => { routes.push(r); return () => {} } } }) })
test.after(() => fs.rmSync(root, { recursive: true, force: true }))

async function call(endpoint, method = 'GET', headers = {}, body = {}) {
  const req = new EventEmitter(); req.method = method; req.headers = { host: '127.0.0.1:4173', ...headers }; req.destroy = () => {}
  const res = { code: 0, body: '', writeHead(code) { this.code = code }, end(value) { this.body = JSON.parse(value) } }
  const pending = routes.find(r => r.path === '/dsh-deepclean/api/' + endpoint).handler(req, res)
  setImmediate(() => { req.emit('data', Buffer.from(JSON.stringify(body))); req.emit('end') })
  await pending
  return res
}

test('a corrupt journal is fail-closed and reset through the API with a backup', async () => {
  const ui = { 'x-deepclean-ui': 'software' }
  const state = await call('software', 'GET', ui)
  assert.equal(state.code, 200)
  assert.equal(state.body.journalError, true)
  const write = { ...ui, 'content-type': 'application/json' }
  assert.equal((await call('software/journal/reset', 'POST', write, {})).code, 403, 'writes need the session token')
  const reset = await call('software/journal/reset', 'POST', { ...write, 'x-deepclean-token': state.body.token }, {})
  assert.equal(reset.code, 200)
  assert.equal(reset.body.journalError, false)
  assert.equal(reset.body.jobs.length, 0)
  assert.equal(fs.readdirSync(root).filter(name => name.includes('.corrupt-')).length, 1, 'the damaged file is kept as a backup')
  const after = await call('software', 'GET', ui)
  assert.equal(after.body.journalError, false)
  const noop = await call('software/journal/reset', 'POST', { ...write, 'x-deepclean-token': state.body.token }, {})
  assert.equal(noop.code, 409)
  assert.equal(noop.body.error, 'journal_ok')
})
