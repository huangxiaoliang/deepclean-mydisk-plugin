import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// 真实安装版本随 package.json 发布演进，不要在断言里写死，否则每次改版本号测试都会红。
const pluginVersion = JSON.parse(
  fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
).version

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dc-update-test-')))
process.env.HOME = root
process.env.USERPROFILE = root
process.env.DSH_HOME = path.join(root, 'dsh')
process.env.DEEPCLEAN_TRASH_DIR = path.join(root, 'trash')
process.env.LOCALAPPDATA = path.join(root, 'AppData', 'Local')
process.env.APPDATA = path.join(root, 'AppData', 'Roaming')

const baseUrl = new URL('../lib/index.js', import.meta.url).href
let sequence = 0

// 每个用例都拿一个新的插件实例（唯一 query 绕过 ESM 缓存），更新检测缓存与注入的服务互不污染。
async function freshPlugin(manager) {
  const plugin = await import(`${baseUrl}?update-case=${++sequence}`)
  const routes = []
  const tools = []
  const ctx = {
    tools: { register(tool) { tools.push(tool) } },
    effect() {},
    inject(deps, cb) {
      if (deps.includes('webServer')) cb({ webServer: { register(r) { routes.push(r); return () => {} } } })
      if (deps.includes('pluginManager') && manager) cb({ pluginManager: manager })
    },
  }
  plugin.apply(ctx)
  return { routes, tools }
}

function mockRes() {
  return { code: 0, body: '', writeHead(c) { this.code = c }, end(b) { this.body = b }, destroy() {} }
}

const BASE_HEADERS = { host: '127.0.0.1:62465', origin: 'http://127.0.0.1:62465', 'sec-fetch-site': 'same-origin' }

function mockReq(method, url, body, headers = {}) {
  const listeners = {}
  const req = {
    method,
    url,
    headers: { ...BASE_HEADERS, ...headers },
    socket: {},
    on(e, f) { (listeners[e] ||= []).push(f) },
    destroy() {},
  }
  setTimeout(() => {
    if (body !== undefined) for (const f of listeners.data || []) f(Buffer.from(body))
    for (const f of listeners.end || []) f()
  }, 0)
  return req
}

function find(routes, p) {
  return routes.find((r) => r.path === '/dsh-deepclean/api' + p)
}

async function call(routes, p, method = 'GET', body, headers) {
  const [routePath] = p.split('?')
  const route = find(routes, routePath)
  assert.ok(route, `missing route ${routePath}`)
  const res = mockRes()
  const isWrite = body !== undefined
  await route.handler(mockReq(method, '/dsh-deepclean/api' + p, body, {
    'x-deepclean-ui': 'update',
    ...(isWrite ? { 'content-type': 'application/json' } : {}),
    ...headers,
  }), res)
  return { code: res.code, body: JSON.parse(res.body || '{}') }
}

function listedManager({ versions, installed = '0.13.1', bundles = [], refuse = null, onUpdate = null }) {
  const calls = { listVersions: 0, listBundles: 0, updateBundle: 0 }
  return {
    calls,
    async listBundles() {
      calls.listBundles++
      return bundles
    },
    async listVersions() {
      calls.listVersions++
      if (refuse) return refuse
      return { status: 'listed', installed, versions, omitted: 0 }
    },
    async updateBundle(name, version, options) {
      calls.updateBundle++
      if (onUpdate) return onUpdate(name, version, options)
      return { from: installed, to: version, step: 'install', result: { application: 'restart-required', stage: 'install' } }
    },
  }
}

const bundle = (version, extra = {}) => ({ name: 'deepclean-mydisk', installed: true, availability: 'profile', source: `registry+https://registry.npmjs.org/deepclean-mydisk@${version}`, version, ...extra })
const listed = (version, extra = {}) => ({ version, bundle: true, prerelease: false, tags: ['latest'], ...extra })

test('update check reports when DSH provides no plugin manager', async () => {
  const { routes } = await freshPlugin(null)
  const { code, body } = await call(routes, '/update-check')
  assert.equal(code, 200)
  assert.equal(body.supported, false)
  assert.equal(body.reason, 'manager_unavailable')
  assert.equal(body.updateAvailable, false)
  assert.equal(body.installedVersion, pluginVersion)
})

test('update check lists a newer compatible version', async () => {
  const manager = listedManager({ versions: [listed('0.14.0')], bundles: [bundle('0.13.1')] })
  const { routes } = await freshPlugin(manager)
  const { code, body } = await call(routes, '/update-check')
  assert.equal(code, 200)
  assert.equal(body.supported, true)
  assert.equal(body.updatable, true)
  assert.equal(body.updateAvailable, true)
  assert.equal(body.installedVersion, '0.13.1')
  assert.equal(body.latestVersion, '0.14.0')
  assert.equal(body.reason, '')
})

test('update check caches for six hours and refresh bypasses it', async () => {
  const manager = listedManager({ versions: [listed('0.14.0')] })
  const { routes } = await freshPlugin(manager)
  await call(routes, '/update-check')
  await call(routes, '/update-check')
  assert.equal(manager.calls.listVersions, 1, 'second check must reuse the in-memory cache')
  await call(routes, '/update-check', 'GET', undefined, { 'x-deepclean-ui': 'update' })
  await call(routes, '/update-check?refresh=1')
  assert.equal(manager.calls.listVersions, 2, 'refresh=1 must re-check')
})

test('update check skips incompatible, prerelease, deprecated and non-bundle versions', async () => {
  const manager = listedManager({
    versions: [
      listed('0.16.0', { incompatible: { runtimeVersion: '0.2.2', requirements: '>=0.3.0' } }),
      listed('0.15.0', { prerelease: true }),
      listed('0.14.0', { deprecated: 'broken build' }),
      listed('0.14.1', { bundle: false }),
    ],
  })
  const { routes } = await freshPlugin(manager)
  const { body } = await call(routes, '/update-check')
  assert.equal(body.updateAvailable, false)
  assert.equal(body.updatable, true)
  assert.equal(body.reason, 'incompatible')
  assert.equal(body.newestVersion, '0.16.0')
  assert.equal(body.latestVersion, '0.13.1')
})

test('update check reports up to date when the registry lists nothing newer', async () => {
  const manager = listedManager({ versions: [] })
  const { routes } = await freshPlugin(manager)
  const { body } = await call(routes, '/update-check')
  assert.equal(body.updateAvailable, false)
  assert.equal(body.reason, 'up_to_date')
  assert.equal(body.installedVersion, '0.13.1')
})

test('update check refuses link installs without hiding the settings status', async () => {
  // link: 安装会被官方 updateRefusal 判成 not-updatable；仍返回安装版本供设置页展示。
  const manager = listedManager({ bundles: [bundle('0.13.1', { source: 'link:/Users/me/deepclean-mydisk-plugin' })], refuse: { status: 'refused', problem: 'not-updatable', reason: 'deepclean-mydisk is not installed from a registry under its own name', attempts: [] } })
  const { routes } = await freshPlugin(manager)
  const { body } = await call(routes, '/update-check')
  assert.equal(body.supported, true)
  assert.equal(body.updatable, false)
  assert.equal(body.reason, 'not_updatable')
  assert.equal(body.updateAvailable, false)
  assert.equal(body.installedVersion, '0.13.1')
})

test('update check failures stay out of the panel as check_failed', async () => {
  const manager = listedManager({ versions: [] })
  manager.listVersions = async () => { throw new Error('registry unavailable') }
  const { routes } = await freshPlugin(manager)
  const { code, body } = await call(routes, '/update-check')
  assert.equal(code, 200)
  assert.equal(body.reason, 'check_failed')
  assert.equal(body.updateAvailable, false)
})

test('update requests require the ui header, POST and explicit confirmation', async () => {
  const manager = listedManager({ versions: [listed('0.14.0')] })
  const { routes } = await freshPlugin(manager)
  const get = await call(routes, '/update', 'GET')
  assert.equal(get.code, 405)
  const denied = await call(routes, '/update', 'POST', JSON.stringify({ confirm: true }), { 'x-deepclean-ui': 'software' })
  assert.equal(denied.code, 403)
  const missing = await call(routes, '/update', 'POST', JSON.stringify({}))
  assert.equal(missing.code, 400)
  assert.equal(manager.calls.updateBundle, 0)
})

test('update installs the newest compatible version and reports the restart', async () => {
  const manager = listedManager({
    versions: [listed('0.15.0', { incompatible: { runtimeVersion: '0.2.2' } }), listed('0.14.0')],
    bundles: [bundle('0.13.1')],
  })
  const { routes } = await freshPlugin(manager)
  const { code, body } = await call(routes, '/update', 'POST', JSON.stringify({ confirm: true }))
  assert.equal(code, 200)
  assert.equal(body.ok, true)
  assert.equal(body.from, '0.13.1')
  assert.equal(body.to, '0.14.0')
  assert.equal(body.restartRequired, true)
  assert.equal(body.application, 'restart-required')
  assert.deepEqual(manager.calls.updateBundle, 1)
  // 成功后缓存改为已是最新，面板不会继续提示更新。
  const check = await call(routes, '/update-check')
  assert.equal(check.body.updateAvailable, false)
  assert.equal(check.body.reason, 'up_to_date')
  assert.equal(check.body.installedVersion, '0.14.0')
})

test('update reports a failed manager operation with its stable error code', async () => {
  const manager = listedManager({
    versions: [listed('0.14.0')],
    onUpdate: () => ({ from: '0.13.1', to: '0.14.0', step: 'install', result: { application: 'failed', stage: 'install', error: { code: 'operation-error' } } }),
  })
  const { routes } = await freshPlugin(manager)
  const { code, body } = await call(routes, '/update', 'POST', JSON.stringify({ confirm: true }))
  assert.equal(code, 200)
  assert.equal(body.ok, false)
  assert.equal(body.errorCode, 'operation-error')
  assert.equal(body.from, '0.13.1')
  assert.equal(body.to, '0.14.0')
})

test('update without a plugin manager is refused', async () => {
  const { routes } = await freshPlugin(null)
  const { body } = await call(routes, '/update', 'POST', JSON.stringify({ confirm: true }))
  assert.equal(body.ok, false)
  assert.equal(body.errorCode, 'manager_unavailable')
})

test('update with no newer version returns no_update', async () => {
  const manager = listedManager({ versions: [] })
  const { routes } = await freshPlugin(manager)
  const { body } = await call(routes, '/update', 'POST', JSON.stringify({ confirm: true }))
  assert.equal(body.ok, false)
  assert.equal(body.errorCode, 'no_update')
})

test('update routes reject non-loopback hosts and cross-site requests', async () => {
  const manager = listedManager({ versions: [listed('0.14.0')] })
  const { routes } = await freshPlugin(manager)
  const badHost = await call(routes, '/update-check', 'GET', undefined, { host: 'example.com' })
  assert.equal(badHost.code, 403)
  const crossSite = await call(routes, '/update-check', 'GET', undefined, { 'sec-fetch-site': 'cross-site' })
  assert.equal(crossSite.code, 403)
})
