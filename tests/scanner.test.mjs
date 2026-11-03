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
