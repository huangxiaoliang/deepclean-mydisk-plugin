import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { EventEmitter } from 'node:events'

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dc-software-auth-')))
process.env.HOME = root
process.env.USERPROFILE = root
process.env.DSH_HOME = path.join(root, 'dsh')
process.env.LOCALAPPDATA = path.join(root, 'AppData', 'Local')
process.env.APPDATA = path.join(root, 'AppData', 'Roaming')
const baseUrl = new URL('../lib/index.js', import.meta.url).href
let sequence = 0
test.after(() => fs.rmSync(root, { recursive: true, force: true }))

// 软件路由必须复用宿主 connection 的登录鉴权；服务缺失时才退回本地回环围栏。
// viaWebServer 只经 webServer 作用域暴露 connection，覆盖「connection 注入没跑到」的时序。
async function freshPlugin(connection, { viaWebServer = false } = {}) {
  const plugin = await import(`${baseUrl}?software-auth=${++sequence}`)
  const routes = []
  plugin.apply({
    tools: { register() {} },
    effect() {},
    inject(deps, cb) {
      if (deps.includes('webServer')) {
        cb({
          webServer: { register(route) { routes.push(route); return () => {} } },
          get: (name) => (name === 'connection' ? connection : undefined),
        })
      }
      if (deps.includes('connection') && !viaWebServer) cb({ connection })
    },
  })
  return routes
}

const HEADERS = { host: '127.0.0.1:4173', 'x-deepclean-ui': 'software', 'sec-fetch-site': 'same-origin' }

async function call(routes, endpoint, method = 'GET', headers = HEADERS, body) {
  const req = new EventEmitter()
  req.method = method
  req.url = '/dsh-deepclean/api/' + endpoint
  req.headers = { ...headers }
  req.socket = { remoteAddress: '127.0.0.1' }
  req.destroy = () => {}
  const res = { code: 0, body: '', writeHead(code) { this.code = code }, end(value) { this.body = JSON.parse(value) } }
  const pending = routes.find(route => route.path === '/dsh-deepclean/api/' + endpoint).handler(req, res)
  setImmediate(() => {
    if (body !== undefined) req.emit('data', Buffer.from(JSON.stringify(body)))
    req.emit('end')
  })
  await pending
  return res
}

test('software routes follow the host connection rejection', async () => {
  const routes = await freshPlugin({ requestRejection: () => 401 })
  assert.equal((await call(routes, 'software')).code, 401)
  const write = await call(routes, 'software/scan', 'POST', { ...HEADERS, 'content-type': 'application/json', 'x-deepclean-token': 'preview' }, {})
  assert.equal(write.code, 401)
})

test('software routes keep local fences when the host connection accepts', async () => {
  const routes = await freshPlugin({ requestRejection: () => undefined })
  const state = await call(routes, 'software')
  assert.equal(state.code, 200)
  assert.ok(state.body.token)
  // 宿主鉴权放行不等于跳过本地围栏：缺自定义头仍必须被拒。
  assert.equal((await call(routes, 'software', 'GET', { host: '127.0.0.1:4173', 'sec-fetch-site': 'same-origin' })).code, 403)
})

test('software routes fall back to the web server scope connection', async () => {
  // ctx.inject(['connection']) 尚未回调时，connection 可能只经 webServer 作用域可见。
  // 这种情况下 software 路由也必须走宿主登录鉴权，不能退回「自定义头 + 公开 token」。
  const routes = await freshPlugin({ requestRejection: () => 401 }, { viaWebServer: true })
  assert.equal((await call(routes, 'software')).code, 401)
  const write = await call(routes, 'software/scan', 'POST', { ...HEADERS, 'content-type': 'application/json', 'x-deepclean-token': 'preview' }, {})
  assert.equal(write.code, 401)
})
