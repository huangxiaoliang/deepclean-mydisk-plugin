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

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-win-python-'))
process.env.DSH_HOME = root
// 探测顺序里的显式覆盖项要保持可控，避免开发者环境里的 PYTHON 影响断言。
delete process.env.PYTHON
const { apply } = await import('../lib/index.js')
test.after(() => fs.rmSync(root, { recursive: true, force: true }))

async function scan(t, python, { cancel = false, afterStart } = {}) {
  const platform = process.platform
  Object.defineProperty(process, 'platform', { value: 'win32' })
  const launches = []
  let probingChild
  t.mock.method(childProcess, 'spawn', (cmd, args) => {
    launches.push([cmd, ...args])
    if (cmd === 'taskkill') {
      assert.equal(args[1], String(probingChild.pid))
      queueMicrotask(() => probingChild.emit('close', 1))
      return new EventEmitter()
    }
    const child = Object.assign(new EventEmitter(), { pid: 12345, stdout: new PassThrough(), stderr: new PassThrough() })
    queueMicrotask(() => {
      const result = python(cmd, args)
      if (result.hold) { probingChild = child; return }
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
  async function call(method, suffix = '') {
    const req = new EventEmitter()
    req.method = method
    const res = { writeHead(code) { this.code = code }, end(body) { this.body = JSON.parse(body) } }
    const pending = routes.get(`/dsh-deepclean/api/scan${suffix}`)(req, res)
    req.emit('data', Buffer.from('{}'))
    req.emit('end')
    await pending
    return res
  }
  assert.equal((await call('POST')).code, 202)
  if (cancel) assert.equal((await call('POST', '/cancel')).code, 200)
  await afterStart?.()
  for (let i = 0; i < 100; i++) {
    const { body } = await call('GET')
    if (body.scan.status !== 'running') return { ...body, launches }
    await delay(10)
  }
  assert.fail('scan did not finish')
}

const spawnError = (cmd, code) => ({ error: Object.assign(new Error(`spawn ${cmd} ${code}`), { code }) })
const missing = cmd => spawnError(cmd, 'ENOENT')
const available = { code: 0, out: 'deepclean-python-ok\n' }

function finishScan(args) {
  assert.ok(args.some(arg => arg.endsWith(`${path.sep}deepclean.py`)))
  fs.writeFileSync(args[args.indexOf('--json') + 1], JSON.stringify({ platform: 'win32' }))
  return { code: 0 }
}

test('Windows scan falls back to Python on PATH when py is missing', async (t) => {
  const { scan: result, launches, report } = await scan(t, (cmd, args) => {
    if (cmd === 'py') return missing(cmd)
    return args.includes('-c') ? available : finishScan(args)
  })
  assert.equal(result.status, 'done', result.error)
  assert.equal(report.platform, 'win32')
  assert.deepEqual(launches.map(([cmd]) => cmd), ['py', 'python', 'python'])
})

test('Windows scan skips a launcher without a runtime and a nonfunctional python alias', async (t) => {
  const { scan: result, launches } = await scan(t, (cmd, args) => {
    if (cmd === 'py') return { code: 1, err: 'No suitable Python runtime found' }
    if (cmd === 'python') return { code: 0, out: '' }
    return args.includes('-c') ? available : finishScan(args)
  })
  assert.equal(result.status, 'done', result.error)
  assert.deepEqual(launches.map(([cmd]) => cmd), ['py', 'python', 'python3', 'python3'])
})

test('Windows scan gives recovery steps when no usable Python is found', async (t) => {
  const { scan: result, launches } = await scan(t, missing)
  assert.equal(result.status, 'error')
  assert.equal(result.errorCode, 'python_unavailable')
  assert.match(result.error, /找不到可用的 Python 3.*python --version.*重启 DSH/)
  assert.deepEqual(launches.map(([cmd]) => cmd), ['py', 'python', 'python3'])
})

test('Windows scan honors an explicit PYTHON executable', async (t) => {
  const exe = path.join(root, 'custom-python', 'python.exe')
  fs.mkdirSync(path.dirname(exe), { recursive: true })
  fs.writeFileSync(exe, '')
  process.env.PYTHON = exe
  try {
    const { scan: result, launches } = await scan(t, (cmd, args) => {
      if (cmd !== exe) return missing(cmd)
      return args.includes('-c') ? available : finishScan(args)
    })
    assert.equal(result.status, 'done', result.error)
    assert.equal(launches[0][0], exe, 'the explicit override must be probed first')
    assert.deepEqual(launches.map(([cmd]) => cmd), [exe, exe])
  } finally {
    delete process.env.PYTHON
  }
})

test('Windows scan falls back to the Python shipped with DSH when PATH has no usable launcher', async (t) => {
  const exe = path.join(root, 'dsh-runtimes', 'dsh-primary-runtime', 'dependencies', 'python', 'python.exe')
  fs.mkdirSync(path.dirname(exe), { recursive: true })
  fs.writeFileSync(exe, '')
  try {
    const { scan: result, launches } = await scan(t, (cmd, args) => {
      if (cmd === 'py') return missing(cmd)
      if (cmd !== exe) return { code: 0, out: '' } // PATH 上的 Store 占位别名：能启动但不是 Python
      return args.includes('-c') ? available : finishScan(args)
    })
    assert.equal(result.status, 'done', result.error)
    assert.deepEqual(launches.map(([cmd]) => cmd), ['py', 'python', 'python3', exe, exe])
  } finally {
    fs.rmSync(path.join(root, 'dsh-runtimes'), { recursive: true, force: true })
  }
})

test('Windows scan reports a blocked Python launch instead of prompting for installation', async (t) => {
  const { scan: result, launches } = await scan(t, cmd => cmd === 'py' ? spawnError(cmd, 'EACCES') : missing(cmd))
  assert.equal(result.errorCode, 'python_probe_failed')
  assert.match(result.error, /py -3：启动被拒绝/)
  assert.deepEqual(launches.map(([cmd]) => cmd), ['py', 'python', 'python3'])
})

test('Windows scan preserves a Python probe timeout when the other candidates are missing', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { scan: result, launches } = await scan(t, cmd => cmd === 'py' ? { hold: true } : missing(cmd), {
    async afterStart() {
      t.mock.timers.tick(5000)
      await new Promise(setImmediate)
    },
  })
  assert.equal(result.errorCode, 'python_probe_failed')
  assert.match(result.error, /py -3：探测超时/)
  assert.deepEqual(launches.map(([cmd]) => cmd), ['py', 'taskkill', 'python', 'python3'])
})

test('Windows scan still offers installation when the launchers have no compatible runtime', async (t) => {
  const { scan: result } = await scan(t, cmd => ({
    py: { code: 0xA0000006 },
    python: { code: 9009 },
    python3: { code: 0, out: 'deepclean-python-unsupported\n' },
  })[cmd])
  assert.equal(result.errorCode, 'python_unavailable')
})

test('Windows scan still tries another interpreter after a launch is blocked', async (t) => {
  const { scan: result } = await scan(t, (cmd, args) => {
    if (cmd === 'py') return spawnError(cmd, 'EACCES')
    return args.includes('-c') ? available : finishScan(args)
  })
  assert.equal(result.status, 'done', result.error)
})

test('Windows scan preserves a scanner failure once Python is selected', async (t) => {
  const { scan: result, launches } = await scan(t, (_cmd, args) => args.includes('-c')
    ? available
    : { code: 7, err: 'scanner fixture: could not read directory' })
  assert.equal(result.status, 'error')
  assert.equal(result.errorCode, '')
  assert.equal(result.error, 'scanner fixture: could not read directory')
  assert.deepEqual(launches.map(args => args.slice(0, 2)), [['py', '-3'], ['py', '-3']])
})

test('canceling a Windows scan during the Python probe does not launch another command', async (t) => {
  const { scan: result, launches } = await scan(t, cmd => cmd === 'py' ? { hold: true } : missing(cmd), { cancel: true })
  assert.equal(result.status, 'canceled')
  assert.equal(result.error, '')
  assert.deepEqual(launches.map(([cmd]) => cmd), ['py', 'taskkill'])
})
