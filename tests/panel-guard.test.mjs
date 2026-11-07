import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-panel-guard-'))
process.env.DSH_HOME = path.join(root, 'dsh')
process.env.DEEPCLEAN_TRASH_DIR = path.join(root, 'trash')
test.after(() => fs.rmSync(root, { recursive: true, force: true }))

// 独立模块实例（query 让 ESM 重新求值），模拟「宿主 connection 服务存在」的真实路径。
const plugin = await import('../lib/index.js?panel-guard')

let trustChecks = 0
const connection = {
  // 宿主的真实实现：Host/Origin 围栏 + 浏览器登录 cookie；未登录回 401。
  requestRejection(req) {
    trustChecks += 1
    return req.headers && req.headers.cookie === 'dsh=ok' ? undefined : 401
  },
}

const routes = []
plugin.apply({
  tools: { register() {} },
  effect() {},
  inject(deps, cb) {
    if (deps.includes('connection')) cb({ connection })
    if (deps.includes('webServer')) {
      cb({
        webServer: { register(route) { routes.push(route); return () => {} } },
        get: (name) => (name === 'connection' ? connection : undefined),
      })
    }
  },
})

function mockRes() {
  return { code: 0, body: '', writeHead(code) { this.code = code }, end(value) { this.body = value } }
}
async function call(endpoint, { method = 'GET', headers = {} } = {}) {
  const route = routes.find((r) => r.path === '/dsh-deepclean/api' + endpoint)
  assert.ok(route, `missing route ${endpoint}`)
  const req = {
    method,
    url: '/dsh-deepclean/api' + endpoint,
    headers: { host: '127.0.0.1:62465', ...headers },
    destroy() {},
  }
  const res = mockRes()
  await route.handler(req, res)
  return res
}

test('panel routes defer Host/Origin checks and authentication to the host connection service', async () => {
  const before = trustChecks
  // 没有登录 cookie：即使 Host、同源标记和自定义头都合法，也必须被宿主拒绝。
  assert.equal((await call('/overview', { headers: { 'x-deepclean-ui': 'panel', 'sec-fetch-site': 'same-origin' } })).code, 401)
  assert.equal((await call('/clean', { method: 'POST', headers: { 'x-deepclean-ui': 'panel' } })).code, 401)
  assert.ok(trustChecks >= before + 2, 'every panel request must ask the host connection service')
  // 已登录：面板请求正常放行。
  assert.equal((await call('/overview', { headers: { cookie: 'dsh=ok', 'x-deepclean-ui': 'panel', 'sec-fetch-site': 'same-origin' } })).code, 200)
  // 图片路由不能要求自定义头（<img> 不能加），但仍要过宿主的登录鉴权。
  assert.equal((await call('/thumb', { headers: { cookie: 'dsh=ok' } })).code, 404)
  assert.equal((await call('/thumb')).code, 401)
})

test('panel routes still require the custom header behind a trusted host', async () => {
  // 宿主鉴权通过后，非图片路由仍缺一层自定义头防护（跨站简单请求带不上）。
  assert.equal((await call('/overview', { headers: { cookie: 'dsh=ok', 'sec-fetch-site': 'same-origin' } })).code, 403)
  assert.equal((await call('/clean', { method: 'POST', headers: { cookie: 'dsh=ok' } })).code, 403)
  // 图片路由不看自定义头。
  assert.equal((await call('/thumb', { headers: { cookie: 'dsh=ok' } })).code, 404)
})
