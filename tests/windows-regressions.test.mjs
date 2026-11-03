import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { isProtected, parseTreeOutput } from '../lib/platform.js'
import { cloudRoots, isCloudBackedPath, moveBlockReason } from '../lib/index.js'

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

// 云盘保护此前只有 DEEPCLEAN_CLOUD_ROOTS 的负例/注入用例，OneDrive 正例从未被断言。
// 这里在 win32 语义 + 临时 profile 下验证宿主侧的云盘根与搬家拒绝确实生效。
test('Windows cloud roots include OneDrive env and profile directories', (t) => {
  const keys = ['HOME', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'OneDrive', 'OneDriveConsumer', 'OneDriveCommercial', 'DEEPCLEAN_CLOUD_ROOTS']
  const savedEnv = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
  const savedPlatform = process.platform
  const profile = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dc-cloud-roots-')))
  t.after(() => {
    Object.defineProperty(process, 'platform', { value: savedPlatform })
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    fs.rmSync(profile, { recursive: true, force: true })
  })
  const onedrive = path.join(profile, 'OneDrive')
  fs.mkdirSync(onedrive)
  fs.mkdirSync(path.join(profile, 'OneDrive - Contoso'))
  fs.mkdirSync(path.join(profile, 'Dropbox'))
  Object.defineProperty(process, 'platform', { value: 'win32' })
  process.env.HOME = profile
  process.env.USERPROFILE = profile
  // Windows 的 os.tmpdir() 本身就在 %LOCALAPPDATA%\\Temp 下；这里必须把 AppData
  // 根也指到临时 profile，否则「可搬家」的 Downloads 夹具会被当成 App 数据目录拒绝。
  process.env.LOCALAPPDATA = path.join(profile, 'AppData', 'Local')
  process.env.APPDATA = path.join(profile, 'AppData', 'Roaming')
  fs.mkdirSync(process.env.LOCALAPPDATA, { recursive: true })
  fs.mkdirSync(process.env.APPDATA, { recursive: true })
  process.env.OneDrive = onedrive
  delete process.env.OneDriveConsumer
  delete process.env.OneDriveCommercial
  delete process.env.DEEPCLEAN_CLOUD_ROOTS

  const roots = cloudRoots()
  for (const expected of [onedrive, path.join(profile, 'OneDrive - Contoso'), path.join(profile, 'Dropbox')]) {
    assert.ok(roots.includes(expected), `missing ${expected} in ${roots.join(', ')}`)
  }
  assert.equal(isCloudBackedPath(path.join(onedrive, 'keep.docx')), true)
  assert.notEqual(moveBlockReason(path.join(onedrive, 'keep.docx')), '', 'cloud file must not be movable')
  assert.equal(isCloudBackedPath(path.join(profile, 'Downloads', 'movie.mp4')), false)
  assert.equal(moveBlockReason(path.join(profile, 'Downloads', 'movie.mp4')), '')
})
