import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { EventEmitter } from 'node:events'
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dc-software-http-')))
process.env.DSH_HOME = root
const { apply, validateVendorCommand } = await import('../lib/index.js')
const routes = [], tools = []
apply({ tools: { register: t => tools.push(t) }, inject: (_names, cb) => cb({ webServer: { register: r => { routes.push(r); return () => {} } } }), effect() {} })
test.after(() => fs.rmSync(root, { recursive: true, force: true }))
async function call(endpoint, method = 'GET', headers = {}, body = {}) {
  const req = new EventEmitter(); req.method = method; req.headers = { host: '127.0.0.1:4173', ...headers }; req.destroy = () => {}
  const res = { code: 0, body: '', writeHead(code) { this.code = code }, end(value) { this.body = JSON.parse(value) } }
  const pending = routes.find(r => r.path === '/dsh-deepclean/api/' + endpoint).handler(req, res)
  setImmediate(() => { req.emit('data', Buffer.from(JSON.stringify(body))); req.emit('end') })
  await pending
  return res
}

test('software APIs require custom same-origin header and reject cross-site reads', async () => {
  assert.equal((await call('software')).code, 403)
  assert.equal((await call('software', 'GET', { host: 'rebound.example:4173', origin: 'http://rebound.example:4173', 'x-deepclean-ui': 'software' })).code, 403)
  assert.equal((await call('software', 'GET', { 'x-deepclean-ui': 'software', origin: 'https://evil.example' })).code, 403)
  assert.equal((await call('software', 'GET', { 'x-deepclean-ui': 'software', 'sec-fetch-site': 'cross-site' })).code, 403)
})

test('write APIs reject missing token, arbitrary plans and wrong methods', async () => {
  const headers = { 'x-deepclean-ui': 'software', 'content-type': 'application/json' }
  const state = await call('software', 'GET', headers)
  assert.equal(state.code, 200)
  assert.equal((await call('software/execute', 'POST', headers, { planId: 'arbitrary', confirmed: true, command: 'rm' })).code, 403)
  const result = await call('software/execute', 'POST', { ...headers, 'x-deepclean-token': state.body.token }, { planId: 'arbitrary', confirmed: true })
  assert.equal(result.body.error, 'plan_missing')
  assert.equal((await call('software/execute', 'GET', headers)).code, 405)
  assert.equal(tools.length, 5, 'no model uninstall tool is registered')
})

test('the vendor execution boundary only accepts one absolute .exe plus argv', () => {
  assert.equal(validateVendorCommand({ file: 'C:\\Program Files\\Git\\unins000.exe', args: ['/VERYSILENT'] }, 'win32'), '')
  assert.equal(validateVendorCommand({ file: 'C:\\Program Files\\App\\unins000.exe', args: [] }, 'win32'), '')
  for (const file of ['cmd.exe', 'C:\\Windows\\System32\\cmd.exe', 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', 'C:\\Windows\\System32\\rundll32.exe']) {
    assert.equal(validateVendorCommand({ file, args: [] }, 'win32'), 'unsafe_uninstaller', file + ' is an interpreter')
  }
  assert.equal(validateVendorCommand({ file: 'uninstall.exe', args: [] }, 'win32'), 'unsafe_uninstaller', 'relative paths are refused')
  assert.equal(validateVendorCommand({ file: '\\\\server\\share\\unins.exe', args: [] }, 'win32'), 'unsafe_uninstaller', 'UNC paths are refused')
  assert.equal(validateVendorCommand({ file: 'C:\\App\\unins.msi', args: [] }, 'win32'), 'unsafe_uninstaller', 'only .exe is accepted')
  assert.equal(validateVendorCommand({ file: 'C:\\App\\unins.exe', args: ['line\nbreak'] }, 'win32'), 'unsafe_uninstaller')
  assert.equal(validateVendorCommand({ file: 'C:\\App\\unins.exe', args: Array.from({ length: 41 }, () => 'x') }, 'win32'), 'unsafe_uninstaller')
  assert.equal(validateVendorCommand({ file: 'C:\\App\\unins.exe', args: [] }, 'darwin'), 'unsupported_platform')
})
