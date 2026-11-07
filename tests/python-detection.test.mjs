import test from 'node:test'
import assert from 'node:assert/strict'
import childProcess from 'node:child_process'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { setTimeout as delay } from 'node:timers/promises'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-posix-python-'))
process.env.DSH_HOME = root
// 探测顺序里的显式覆盖项要保持可控，避免开发者环境里的 PYTHON 影响断言。
delete process.env.PYTHON
const { apply } = await import('../lib/index.js')
test.after(() => fs.rmSync(root, { recursive: true, force: true }))

// 在任意宿主上模拟 macOS 分支：runScanner 在调用时才读 process.platform，
// 所以覆盖它就能走到非 Windows 的解释器探测逻辑。
async function scan(t, python) {
  const platform = process.platform
  Object.defineProperty(process, 'platform', { value: 'darwin' })
  const launches = []
  t.mock.method(childProcess, 'spawn', (cmd, args) => {
    launches.push([cmd, ...args])
    const child = Object.assign(new EventEmitter(), { pid: 12345, stdout: new PassThrough(), stderr: new PassThrough() })
    queueMicrotask(() => {
      const result = python(cmd, args)
      if (result.error) child.emit('error', result.error)
      if (result.out) child.stdout.write(result.out)
      if (result.err) child.stderr.write(result.err)
      child.emit('close', result.code ?? -2)
    })
    return child
  })
  syncBuiltinESMExports()
  t.after(() => {
    t.mock.restoreAll()
    syncBuiltinESMExports()
    Object.defineProperty(process, 'platform', { value: platform })
  })

  const routes = new Map()
  apply({
    tools: { register() {} }, effect() {},
    inject(_deps, fn) { fn({ webServer: { register(route) { routes.set(route.path, route.handler) } } }) },
  })
  async function call(method) {
    const req = new EventEmitter()
    req.method = method
    req.headers = { host: '127.0.0.1:62465', 'x-deepclean-ui': 'panel', 'sec-fetch-site': 'same-origin' }
    const res = { writeHead(code) { this.code = code }, end(body) { this.body = JSON.parse(body) } }
    const pending = routes.get('/dsh-deepclean/api/scan')(req, res)
    req.emit('data', Buffer.from('{}'))
    req.emit('end')
    await pending
    return res
  }
  assert.equal((await call('POST')).code, 202)
  for (let i = 0; i < 100; i++) {
    const { body } = await call('GET')
    if (body.scan.status !== 'running') return { ...body, launches }
    await delay(10)
  }
  assert.fail('scan did not finish')
}

const missing = cmd => ({ error: Object.assign(new Error(`spawn ${cmd} ENOENT`), { code: 'ENOENT' }) })
const available = { code: 0, out: 'deepclean-python-ok\n' }

function finishScan(args) {
  assert.ok(args.some(arg => arg.endsWith(`${path.sep}deepclean.py`)))
  fs.writeFileSync(args[args.indexOf('--json') + 1], JSON.stringify({ platform: 'darwin' }))
  return { code: 0 }
}

test('POSIX scan runs python3 from PATH when it is usable', async (t) => {
  const { scan: result, launches, report } = await scan(t, (_cmd, args) => (
    args.includes('-c') ? available : finishScan(args)
  ))
  assert.equal(result.status, 'done', result.error)
  assert.equal(report.platform, 'darwin')
  assert.deepEqual(launches.map(([cmd]) => cmd), ['python3', 'python3'])
})

test('POSIX scan skips a python3 that starts but is not a usable interpreter', async (t) => {
  const exe = path.join(root, 'dsh-runtimes', 'dsh-primary-runtime', 'dependencies', 'python', 'bin', 'python3')
  fs.mkdirSync(path.dirname(exe), { recursive: true })
  fs.writeFileSync(exe, '')
  try {
    const { scan: result, launches } = await scan(t, (cmd, args) => {
      // macOS 上 /usr/bin/python3 是「装了命令行工具才有用」的桩：能启动但不返回版本。
      if (cmd === 'python3') return { code: 1, err: 'xcode-select: error: no developer tools were found' }
      if (cmd !== exe) return missing(cmd)
      return args.includes('-c') ? available : finishScan(args)
    })
    assert.equal(result.status, 'done', result.error)
    assert.deepEqual(launches.map(([cmd]) => cmd), ['python3', 'python', exe, exe])
  } finally {
    fs.rmSync(path.join(root, 'dsh-runtimes'), { recursive: true, force: true })
  }
})

test('POSIX scan keeps the original launch error when no interpreter works', async (t) => {
  const { scan: result, launches } = await scan(t, missing)
  assert.equal(result.status, 'error')
  assert.equal(result.errorCode, '')
  assert.match(result.error, /无法启动 python3/)
  assert.deepEqual(launches.map(([cmd]) => cmd), ['python3', 'python', 'python3'])
})

test('POSIX scan honors an explicit PYTHON executable', async (t) => {
  const exe = path.join(root, 'custom-python', 'python3')
  fs.mkdirSync(path.dirname(exe), { recursive: true })
  fs.writeFileSync(exe, '')
  process.env.PYTHON = exe
  try {
    const { scan: result, launches } = await scan(t, (cmd, args) => {
      if (cmd !== exe) return missing(cmd)
      return args.includes('-c') ? available : finishScan(args)
    })
    assert.equal(result.status, 'done', result.error)
    assert.deepEqual(launches.map(([cmd]) => cmd), [exe, exe])
  } finally {
    delete process.env.PYTHON
  }
})
