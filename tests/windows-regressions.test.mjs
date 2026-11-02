import test from 'node:test'
import assert from 'node:assert/strict'
import { isProtected, parseTreeOutput } from '../lib/platform.js'

test('Windows protection covers descendants, case, separator and dot segments', () => {
  const roots = ['C:\\Users\\Alice\\Cache\\']
  for (const p of [String.raw`C:\Users\Alice\Cache\child`, 'c:/users/ALICE/cache', String.raw`C:\Users\Alice\Cache\sub\..\file`]) {
    assert.equal(isProtected(p, roots, 'win32'), true, p)
  }
  for (const p of [String.raw`C:\Users\Alice\Cache-old\file`, String.raw`D:\Users\Alice\Cache\file`, String.raw`C:\Users\Alice\Cache\..\Documents\file`]) {
    assert.equal(isProtected(p, roots, 'win32'), false, p)
  }
  assert.equal(isProtected('C:/Users/Alice/a', ['C:\\'], 'win32'), true)
  assert.equal(isProtected(String.raw`\\SERVER\Share\Cache\file`, [String.raw`\\server\share\cache`], 'win32'), true)
})

test('POSIX protection preserves case and directory boundaries', () => {
  assert.equal(isProtected('/home/a/cache/file', ['/home/a/cache'], 'darwin'), true)
  assert.equal(isProtected('/home/a/Cache/file', ['/home/a/cache'], 'darwin'), false)
  assert.equal(isProtected('/home/a/cache-old/file', ['/home/a/cache'], 'darwin'), false)
  assert.equal(isProtected('/home/a/cache', ['/'], 'darwin'), true)
})

test('Windows tree converts bytes to KB and preserves Unicode paths', () => {
  const rows = parseTreeOutput('1048576\tC:\\Users\\张三\\one.bin\r\n512\tC:\\Users\\张三\\small.bin\r\n', 'win32')
  assert.deepEqual(rows, [{path: 'C:\\Users\\张三\\one.bin', kb: 1024}, {path: 'C:\\Users\\张三\\small.bin', kb: .5}])
  assert.deepEqual(parseTreeOutput('1024\t/home/a/file\n', 'darwin'), [{path:'/home/a/file',kb:1024}])
  assert.deepEqual(parseTreeOutput('junk\tC:\\bad\n-1\tC:\\bad\n', 'win32'), [])
})
