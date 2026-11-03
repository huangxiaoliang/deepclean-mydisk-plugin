import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('../resources/scripts/deepclean.py', import.meta.url))
const win = process.platform === 'win32'

test('scanner self-test exits 0', { timeout: 120000 }, () => {
  const cmd = process.env.PYTHON || (win ? 'python' : 'python3')
  const r = spawnSync(cmd, [script, '--self-test'], { encoding: 'utf8', timeout: 90000 })
  assert.equal(r.status, 0, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`)
})

test('photo decoder regressions and native read-only image processing', { timeout: 120000 }, () => {
  const tests = fileURLToPath(new URL('./photos-regressions.py', import.meta.url))
  const cmd = process.env.PYTHON || (win ? 'python' : 'python3')
  const r = spawnSync(cmd, [tests], { encoding: 'utf8', timeout: 110000 })
  assert.equal(r.status, 0, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`)
})

test('windows scanner pure-function regressions (big files mtime/budget, cleanable filter)', () => {
  const tests = fileURLToPath(new URL('./windows-scanner-regressions.py', import.meta.url))
  const cmd = process.env.PYTHON || (win ? 'python' : 'python3')
  const r = spawnSync(cmd, [tests], { encoding: 'utf8', timeout: 60000 })
  assert.equal(r.status, 0, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`)
})

test('tree.py regressions (dirs seeding map, big-file heaps, partial propagation)', () => {
  const tests = fileURLToPath(new URL('./tree-regressions.py', import.meta.url))
  const cmd = process.env.PYTHON || (win ? 'python' : 'python3')
  const r = spawnSync(cmd, [tests], { encoding: 'utf8', timeout: 60000 })
  assert.equal(r.status, 0, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`)
})

test('macos scanner regressions (big_files streaming top-N heap, prune, budget cutoff)', () => {
  const tests = fileURLToPath(new URL('./macos-scanner-regressions.py', import.meta.url))
  const cmd = process.env.PYTHON || (win ? 'python' : 'python3')
  const r = spawnSync(cmd, [tests], { encoding: 'utf8', timeout: 60000 })
  assert.equal(r.status, 0, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`)
})

test('Windows complete scan integrates browser profiles and running protection', () => {
  const tests = fileURLToPath(new URL('../scripts/windows-ci/scanner.py', import.meta.url))
  const cmd = process.env.PYTHON || (win ? 'python' : 'python3')
  const r = spawnSync(cmd, [tests], { encoding: 'utf8', timeout: 60000 })
  assert.equal(r.status, 0, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`)
})

// --platform windows 在非 Windows 宿主上曾经直接 traceback（C:/ 不存在）。
// 现在必须给出明确错误与退出码 2，而不是把 FileNotFoundError 抛给调用方。
test('windows backend is refused with a clear error on a non-Windows host', { skip: win, timeout: 30000 }, () => {
  const cmd = process.env.PYTHON || 'python3'
  const r = spawnSync(cmd, [script, '--platform', 'windows', '--quick'], { encoding: 'utf8', timeout: 25000 })
  assert.equal(r.status, 2, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`)
  assert.match(r.stderr, /Windows/)
  assert.doesNotMatch(r.stderr, /Traceback|FileNotFoundError/)
})
