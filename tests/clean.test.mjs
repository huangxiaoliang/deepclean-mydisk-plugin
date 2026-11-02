import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { moveToTrash, undoBatch, restoreMoved, purgeMoved, auditLogPath } from '../lib/clean.js'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-clean-test-'))
process.env.DSH_HOME = path.join(root, 'dsh')
process.env.DEEPCLEAN_TRASH_DIR = path.join(root, 'trash')

function makeDir(name) {
  const p = path.join(root, name)
  fs.mkdirSync(p, { recursive: true })
  return p
}

test('moveToTrash: allowed file is moved and audited', () => {
  const dir = makeDir('ok')
  const file = path.join(dir, 'a.txt')
  fs.writeFileSync(file, 'hello')
  const res = moveToTrash([file], new Set([file]))
  assert.equal(res.moved.length, 1)
  assert.equal(fs.existsSync(file), false)
  assert.equal(fs.existsSync(res.moved[0].to), true)
  assert.match(fs.readFileSync(auditLogPath(), 'utf8'), /"action":"clean"/)
  undoBatch({ batchId: res.batchId, moved: res.moved })
  assert.equal(fs.existsSync(file), true)
})

test('moveToTrash: disallowed path is rejected', () => {
  const dir = makeDir('denied')
  const file = path.join(dir, 'b.txt')
  fs.writeFileSync(file, 'x')
  const res = moveToTrash([file], new Set())
  assert.equal(res.moved.length, 0)
  assert.match(res.results[0].error, /允许列表/)
  assert.equal(fs.existsSync(file), true)
})

test('moveToTrash: symlink is refused', { skip: process.platform === 'win32' }, () => {
  const dir = makeDir('link')
  const target = path.join(dir, 'target.txt')
  fs.writeFileSync(target, 't')
  const link = path.join(dir, 'link.txt')
  fs.symlinkSync(target, link)
  const res = moveToTrash([link], new Set([link]))
  assert.equal(res.moved.length, 0)
  assert.match(res.results[0].error, /符号链接/)
  assert.equal(fs.existsSync(link), true)
})

test('moveToTrash: name collision gets a suffix', () => {
  const a = makeDir('one'); const b = makeDir('two')
  const f1 = path.join(a, 'same.bin'); const f2 = path.join(b, 'same.bin')
  fs.writeFileSync(f1, '1'); fs.writeFileSync(f2, '2')
  const r1 = moveToTrash([f1], new Set([f1]))
  const r2 = moveToTrash([f2], new Set([f2]))
  assert.notEqual(r1.moved[0].to, r2.moved[0].to)
})

test('restoreMoved: cross-restart restore from audit-shaped items', () => {
  const dir = makeDir('restore')
  const file = path.join(dir, 'r.txt')
  fs.writeFileSync(file, 'r')
  const res = moveToTrash([file], new Set([file]))
  assert.equal(fs.existsSync(file), false)
  const out = restoreMoved(res.moved, res.batchId)
  assert.equal(out.results.every((r) => r.ok), true)
  assert.equal(fs.existsSync(file), true)
})

test('purgeMoved: permanently deletes moved items and audits', () => {
  const dir = makeDir('purge')
  const file = path.join(dir, 'p.txt')
  fs.writeFileSync(file, 'purge-me')
  const res = moveToTrash([file], new Set([file]))
  assert.equal(fs.existsSync(res.moved[0].to), true)
  const out = purgeMoved(res.moved, res.batchId)
  assert.equal(out.purged, 1)
  assert.equal(fs.existsSync(res.moved[0].to), false)
  assert.match(fs.readFileSync(auditLogPath(), 'utf8'), /"action":"purge"/)
})

test('purgeMoved: refuses paths outside trash roots', () => {
  const dir = makeDir('purge-outside')
  const file = path.join(dir, 'x.txt')
  fs.writeFileSync(file, 'x')
  const out = purgeMoved([{ from: file, to: file }], 'b')
  assert.equal(out.purged, 0)
  assert.match(out.results[0].error, /隔离区|废纸篓/)
  assert.equal(fs.existsSync(file), true)
})
