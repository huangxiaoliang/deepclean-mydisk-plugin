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
