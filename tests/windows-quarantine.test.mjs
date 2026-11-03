import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Windows 默认隔离区根（%LOCALAPPDATA%\deepclean-mydisk\trash\<时间戳>）在其它测试里
// 一律被 DEEPCLEAN_TRASH_DIR 顶掉，因此「写入的根」和 restore/purge 认领的根是否一致
// 从来没被验证过。这里不设置 DEEPCLEAN_TRASH_DIR，在 win32 语义下走默认路径。
// 一旦两者漂移，恢复/永久删除会永远报「不在可恢复范围内」，文件卡在隔离区出不来。
test('Windows default quarantine root is owned by restore and purge', async (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dc-win-quarantine-')))
  const savedPlatform = process.platform
  const savedEnv = {}
  for (const key of ['LOCALAPPDATA', 'DSH_HOME', 'DEEPCLEAN_TRASH_DIR']) {
    savedEnv[key] = process.env[key]
  }
  Object.defineProperty(process, 'platform', { value: 'win32' })
  process.env.LOCALAPPDATA = path.join(root, 'Local')
  process.env.DSH_HOME = path.join(root, 'state')
  delete process.env.DEEPCLEAN_TRASH_DIR
  t.after(() => {
    Object.defineProperty(process, 'platform', { value: savedPlatform })
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    fs.rmSync(root, { recursive: true, force: true })
  })

  const clean = await import('../lib/clean.js')
  const expectedRoot = path.resolve(process.env.LOCALAPPDATA, 'deepclean-mydisk', 'trash')
  assert.equal(clean.quarantineRoot(), expectedRoot)
  assert.equal(clean.trashDir(1700000000000), path.join(expectedRoot, '1700000000000'))

  const file = path.join(root, 'junk.txt')
  fs.writeFileSync(file, 'keep me')
  const batch = clean.moveToTrash([file], new Set([file]))
  assert.equal(batch.results[0].ok, true, JSON.stringify(batch.results))
  assert.equal(batch.auditOk, true)

  const relative = path.relative(expectedRoot, batch.moved[0].to).split(path.sep)
  assert.match(relative[0], /^\d{13}$/, `batch lives under a timestamp dir: ${batch.moved[0].to}`)
  assert.match(relative[1], /^deepclean-/, `batch dir keeps the deepclean- prefix: ${batch.moved[0].to}`)

  const restored = clean.restoreMoved(batch.moved, batch.batchId)
  assert.equal(restored.results[0].ok, true, JSON.stringify(restored.results))
  assert.equal(fs.readFileSync(file, 'utf8'), 'keep me')
})
