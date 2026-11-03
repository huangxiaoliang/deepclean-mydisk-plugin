// Explicitly invoked by run.mjs; never operates on the user's real profile.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { moveToTrash, restoreMoved, moveAcrossDevices, quarantineSummary } from '../../lib/clean.js'

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dc-native-中文-')))
  const env = { DSH_HOME: path.join(root, 'state'), DEEPCLEAN_TRASH_DIR: path.join(root, 'trash'),
    USERPROFILE: path.join(root, 'profile'), HOME: path.join(root, 'profile'),
    LOCALAPPDATA: path.join(root, 'profile', 'AppData', 'Local'), APPDATA: path.join(root, 'profile', 'AppData', 'Roaming') }
  const previous = Object.fromEntries(Object.keys(env).map(k => [k, process.env[k]]))
  Object.assign(process.env, env)
  fs.mkdirSync(env.USERPROFILE, { recursive: true })
  t.after(() => {
    for (const [k,v] of Object.entries(previous)) { if (v === undefined) delete process.env[k]; else process.env[k] = v }
    fs.rmSync(root, { recursive: true, force: true })
  })
  return root
}
async function host() {
  const plugin = await import(`../../lib/index.js?native=${crypto.randomUUID()}`)
  const routes = []
  plugin.apply({ tools: { register() {} }, effect() {}, inject(deps, cb) {
    if (deps.includes('webServer')) cb({ webServer: { register(r) { routes.push(r); return () => {} } } })
  } })
  return { plugin, async call(endpoint, body) {
    const route = routes.find(r => r.path === '/dsh-deepclean/api' + endpoint)
    assert.ok(route, endpoint)
    const listeners = {}
    const req = { method: 'POST', url: route.path, on(e,f) { (listeners[e] ||= []).push(f) }, destroy() {} }
    const res = { code: 0, body: '', writeHead(c) { this.code = c }, end(b) { this.body = b }, destroy() {} }
    const response = route.handler(req, res)
    for (const f of listeners.data || []) f(Buffer.from(JSON.stringify(body)))
    for (const f of listeners.end || []) f()
    await response
    return { code: res.code, body: JSON.parse(res.body) }
  } }
}

const native = { skip: process.platform !== 'win32', timeout: 60000 }
test('native Windows: Chinese and long paths survive clean/restore unchanged', native, t => {
  const root = fixture(t)
  const folder = path.join(root, '中文目录', '嵌套'.repeat(45), '目录'.repeat(45))
  fs.mkdirSync(folder, { recursive: true })
  const file = path.join(folder, '照片记录-' + '长名称'.repeat(15) + '.bin')
  assert.ok(file.length > 260, 'fixture must exceed the legacy Windows path limit')
  fs.writeFileSync(file, crypto.randomBytes(4096))
  const original = fs.readFileSync(file)
  const batch = moveToTrash([file], new Set([file]))
  assert.equal(batch.results[0].ok, true, JSON.stringify(batch.results))
  assert.equal(batch.auditOk, true)
  assert.equal(restoreMoved(batch.moved, batch.batchId).results[0].ok, true)
  assert.deepEqual(fs.readFileSync(file), original)
})

test('native Windows: exclusive file lock refuses clean and preserves source', native, async t => {
  const root = fixture(t), file = path.join(root, 'locked.bin')
  fs.writeFileSync(file, 'KEEP')
  const command = '$f=[IO.File]::Open($env:DEEPCLEAN_LOCK_FILE,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None);try{[Console]::WriteLine("READY");[Console]::ReadLine()|Out-Null}finally{$f.Dispose()}'
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
    env: { ...process.env, DEEPCLEAN_LOCK_FILE: file }, stdio: ['pipe','pipe','pipe'] })
  t.after(() => child.kill())
  let errors = ''
  child.stderr.on('data', b => { errors += b })
  try {
    await new Promise((resolve,reject) => {
      let output = ''
      const timer = setTimeout(() => reject(Error('Lock readiness timed out: ' + errors)), 15000)
      child.stdout.on('data', b => { output += b; if (output.includes('READY')) { clearTimeout(timer); resolve() } })
      child.once('error', e => { clearTimeout(timer); reject(e) })
      child.once('exit', code => { clearTimeout(timer); reject(Error(`Lock child exited ${code}: ${errors}`)) })
    })
    const result = moveToTrash([file], new Set([file]))
    assert.equal(result.results[0].ok, false)
    assert.equal(fs.existsSync(file), true)
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit')
      const killTimer = setTimeout(() => child.kill(), 5000)
      child.stdin.on('error', () => {})
      child.stdin.end('\n')
      try { await exited } finally { clearTimeout(killTimer) }
    }
  }
  assert.equal(fs.readFileSync(file, 'utf8'), 'KEEP')
})

test('native Windows: restore refuses a junction in a higher ancestor', native, t => {
  const root = fixture(t), original = path.join(root, 'original'), other = path.join(root, 'other')
  fs.mkdirSync(path.join(original, 'sub'), { recursive: true })
  fs.mkdirSync(path.join(other, 'sub'), { recursive: true })
  const file = path.join(original, 'sub', 'keep.txt')
  fs.writeFileSync(file, 'KEEP')
  const batch = moveToTrash([file], new Set([file]))
  assert.equal(batch.results[0].ok, true)
  fs.rmSync(original, { recursive: true })
  fs.symlinkSync(other, original, 'junction')
  const restored = restoreMoved(batch.moved, batch.batchId)
  assert.equal(restored.results[0].ok, false, 'must reject a junction above the immediate parent')
  assert.equal(fs.existsSync(path.join(other, 'sub', 'keep.txt')), false)
  assert.equal(fs.existsSync(batch.moved[0].to), true)
})

test('native Windows: application databases stay out of the move allow-set', native, async t => {
  fixture(t)
  const { plugin } = await host()
  for (const file of [path.join(process.env.APPDATA, 'DemoApp', 'database.sqlite'),
    path.join(process.env.LOCALAPPDATA, 'DemoApp', 'database.sqlite')]) {
    assert.notEqual(plugin.moveBlockReason(file), '', `App database must be blocked: ${file}`)
  }
  assert.equal(plugin.moveBlockReason(path.join(process.env.USERPROFILE, 'Downloads', 'movie.mp4')), '')
})

test('native Windows: purge-all covers more than 20 plugin batches', native, async t => {
  const root = fixture(t), { call } = await host()
  const moved = []
  for (let i = 0; i < 21; i++) {
    const file = path.join(root, `batch-${i}.txt`)
    fs.writeFileSync(file, 'fixture')
    const batch = moveToTrash([file], new Set([file]))
    assert.equal(batch.results[0].ok, true)
    moved.push(batch.moved[0].to)
  }
  const out = await call('/quarantine/purge', { all: true })
  assert.equal(out.code, 200, JSON.stringify(out.body))
  assert.equal(out.body.total.purged, 21, 'all includes older batches, not just the latest page')
  assert.equal(moved.filter(p => fs.existsSync(p)).length, 0)
  assert.equal(quarantineSummary().files, 0)
})

test('native Windows: actual cross-volume copy verifies bytes and refuses overwrite', {
  ...native,
  // 只有显式声明「该镜像没有可丢弃测试卷」的 job 才允许跳过；Server 镜像仍必须提供卷，
  // 否则这条用例会失败而不是假装通过。必须保留 native.skip（非 Windows 宿主一律跳过），
  // 否则 macOS/Linux 直接跑 cases.mjs 会丢掉平台保护。
  skip: native.skip || (process.env.DEEPCLEAN_CI_ALLOW_MISSING_VOLUME === '1' && !process.env.DEEPCLEAN_TEST_VOLUME),
}, async t => {
  const root = fixture(t)
  const volume = process.env.DEEPCLEAN_TEST_VOLUME
  assert.ok(volume, 'CI must provide a separate disposable volume; cannot silently skip')
  assert.notEqual(path.parse(root).root.toLowerCase(), path.parse(volume).root.toLowerCase())
  const destination = fs.mkdtempSync(path.join(volume, 'deepclean-'))
  t.after(() => fs.rmSync(destination, { recursive: true, force: true }))
  const source = path.join(root, '跨盘.bin'), target = path.join(destination, '跨盘.bin')
  const original = crypto.randomBytes(4 * 1024 * 1024)
  const digest = b => crypto.createHash('sha256').update(b).digest('hex')
  fs.writeFileSync(source, original)
  await moveAcrossDevices(source, target)
  assert.equal(fs.existsSync(source), false)
  assert.equal(fs.statSync(target).size, original.length)
  assert.equal(digest(fs.readFileSync(target)), digest(original))
  fs.writeFileSync(source, 'SECOND')
  await assert.rejects(moveAcrossDevices(source, target))
  assert.equal(fs.readFileSync(source, 'utf8'), 'SECOND')
  assert.equal(digest(fs.readFileSync(target)), digest(original))
  assert.ok(!fs.readdirSync(destination).some(n => n.startsWith('.deepclean-')))
})
