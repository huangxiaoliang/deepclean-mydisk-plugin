import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { moveToTrash, undoBatch, restoreMoved, purgeMoved, appendAudit, auditLogPath, summarizeResults, quarantineSummary, quarantineRoot, trashDir } from '../lib/clean.js'

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dc-clean-test-')))
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

test('appendAudit rotates the log when it exceeds the configured cap', () => {
  process.env.DEEPCLEAN_AUDIT_MAX_BYTES = '2048'
  try {
    const file = auditLogPath()
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, '')
    for (let i = 0; i < 60; i++) appendAudit({ action: 'clean', batchId: `rot-${i}`, moved: [{ from: `/f/${i}`, to: `/t/${i}` }] })
    const text = fs.readFileSync(file, 'utf8')
    assert.ok(text.length <= 2048, `log rotated under the cap, got ${text.length}`)
    assert.match(text, /rot-59/, 'newest entries survive rotation')
    assert.ok(!text.includes('"rot-0"'), 'oldest entries are dropped')
    for (const line of text.split('\n').filter(Boolean)) JSON.parse(line)
  } finally {
    delete process.env.DEEPCLEAN_AUDIT_MAX_BYTES
  }
})


test('moveToTrash: audit annotations are recorded but never grant access', () => {
  const dir = makeDir('annotated')
  const file = path.join(dir, 'a.bin')
  fs.writeFileSync(file, 'x')
  const annotations = new Map([[file, { kb: 42, category: 'leftover', kbScope: 'path' }]])
  const res = moveToTrash([file], new Set([file]), { annotations })
  assert.equal(res.moved.length, 1)
  assert.equal(res.moved[0].kb, 42)
  assert.equal(res.moved[0].category, 'leftover')
  const lines = fs.readFileSync(auditLogPath(), 'utf8').trim().split('\n')
  const entry = JSON.parse(lines[lines.length - 1])
  assert.equal(entry.action, 'clean')
  assert.equal(entry.moved[0].kb, 42)
  assert.equal(entry.moved[0].category, 'leftover')
  assert.equal(entry.moved[0].kbScope, 'path')
  const denied = moveToTrash([path.join(dir, 'not-allowed')], new Set(), { annotations: new Map([[path.join(dir, 'not-allowed'), { kb: 1, category: 'dev' }]]) })
  assert.equal(denied.moved.length, 0, 'annotations must not widen the allow-set')
})

test('restoreMoved: a conflict is refused by default and can be restored as a copy', () => {
  const dir = makeDir('conflict')
  const file = path.join(dir, 'c.txt')
  fs.writeFileSync(file, 'ORIGINAL')
  const res = moveToTrash([file], new Set([file]))
  fs.writeFileSync(file, 'NEWER')
  const failed = restoreMoved(res.moved, res.batchId)
  assert.equal(failed.results[0].ok, false)
  assert.equal(failed.results[0].code, 'exists')
  assert.equal(fs.readFileSync(file, 'utf8'), 'NEWER', 'must not overwrite the existing file')
  assert.equal(fs.existsSync(res.moved[0].to), true, 'trash entry stays for a retry')
  const copy = restoreMoved(res.moved, res.batchId, { onConflict: 'rename' })
  assert.equal(copy.results[0].ok, true)
  assert.equal(copy.results[0].renamed, true)
  assert.match(copy.results[0].restoredTo, /c\.txt \(restored\)$/)
  assert.equal(fs.readFileSync(copy.results[0].restoredTo, 'utf8'), 'ORIGINAL')
  assert.equal(fs.readFileSync(file, 'utf8'), 'NEWER')
})

test('restoreMoved: recreates a missing parent directory', () => {
  const dir = makeDir('recreate')
  const file = path.join(dir, 'deep', 'r.txt')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, 'R')
  const res = moveToTrash([file], new Set([file]))
  fs.rmSync(dir, { recursive: true, force: true })
  const out = restoreMoved(res.moved, res.batchId)
  assert.equal(out.results[0].ok, true)
  assert.equal(fs.readFileSync(file, 'utf8'), 'R')
})

test('restoreMoved: refuses items whose source is outside the trash roots', () => {
  const outside = path.join(makeDir('outside-src'), 'keep.bin')
  fs.writeFileSync(outside, 'KEEP')
  const from = path.join(root, 'never-created', 'x.bin')
  const out = restoreMoved([{ from, to: outside }], 'forged')
  assert.equal(out.results[0].ok, false)
  assert.equal(out.results[0].code, 'notfound')
  assert.equal(fs.existsSync(outside), true, 'outside file must never be moved')
  assert.equal(fs.existsSync(from), false)
})

test('summarizeResults: counts successes and failure codes', () => {
  const summary = summarizeResults([
    { ok: true }, { ok: true },
    { ok: false, code: 'exists' }, { ok: false, code: 'notfound' }, { ok: false },
  ])
  assert.deepEqual(summary, { ok: 2, failed: 3, codes: { exists: 1, notfound: 1, io: 1 } })
  assert.deepEqual(summarizeResults([]), { ok: 0, failed: 0, codes: {} })
})

test('moveToTrash / restore report audit failures instead of silently promising history', () => {
  const blocked = path.join(root, 'dsh-home-is-a-file')
  fs.writeFileSync(blocked, 'not a directory')
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = blocked
  try {
    const dir = makeDir('audit-fail')
    const file = path.join(dir, 'f.txt')
    fs.writeFileSync(file, 'F')
    const res = moveToTrash([file], new Set([file]))
    assert.equal(res.moved.length, 1, 'moving must still succeed when audit cannot be written')
    assert.equal(res.auditOk, false)
    const undo = restoreMoved(res.moved, res.batchId)
    assert.equal(undo.results[0].ok, true)
    assert.equal(undo.auditOk, false)
  } finally {
    process.env.DSH_HOME = previous
  }
})

test('quarantineSummary: counts only plugin batches, honours budget and layouts', () => {
  const previous = process.env.DEEPCLEAN_TRASH_DIR
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dc-quarantine-')))
  process.env.DEEPCLEAN_TRASH_DIR = root
  try {
    assert.equal(quarantineRoot(), root)
    const batch = path.join(root, 'deepclean-abc')
    fs.mkdirSync(path.join(batch, 'nested'), { recursive: true })
    fs.writeFileSync(path.join(batch, 'a.bin'), Buffer.alloc(2048))
    fs.writeFileSync(path.join(batch, 'nested', 'b.bin'), Buffer.alloc(1024))
    const empty = quarantineSummary()
    assert.equal(empty.batches.length, 1)
    assert.equal(empty.batches[0].batchId, 'abc')
    assert.ok(empty.kb >= 3)
    assert.equal(empty.files, 2)
    // Windows/其他平台布局：<root>/<timestamp>/deepclean-<uuid>
    const ts = path.join(root, '1700000000000')
    fs.mkdirSync(path.join(ts, 'deepclean-win'), { recursive: true })
    fs.writeFileSync(path.join(ts, 'deepclean-win', 'c.bin'), Buffer.alloc(512))
    const both = quarantineSummary()
    assert.equal(both.batches.length, 2)
    assert.ok(both.batches.some((b) => b.batchId === 'win'))
    const truncated = quarantineSummary({ budgetMs: 1 })
    assert.equal(typeof truncated.truncated, 'boolean')
  } finally {
    if (previous === undefined) delete process.env.DEEPCLEAN_TRASH_DIR
    else process.env.DEEPCLEAN_TRASH_DIR = previous
  }
})


test('restoreMoved: refuses a symlinked original parent directory', { skip: process.platform === 'win32' }, () => {
  const dir = makeDir('symlink-parent')
  const real = path.join(dir, 'real')
  fs.mkdirSync(real)
  const file = path.join(real, 'r.txt')
  fs.writeFileSync(file, 'R')
  const res = moveToTrash([file], new Set([file]))
  fs.rmSync(real, { recursive: true, force: true })
  const target = path.join(dir, 'target')
  fs.mkdirSync(target)
  fs.symlinkSync(target, real)
  const out = restoreMoved(res.moved, res.batchId)
  assert.equal(out.results[0].ok, false)
  assert.equal(out.results[0].code, 'symlink')
  assert.equal(fs.existsSync(path.join(target, 'r.txt')), false, 'must not write through the link')
})

test('restoreMoved: refuses a trash entry reached through a middle symlink', { skip: process.platform === 'win32' }, () => {
  const dir = makeDir('mid-link')
  const batchDir = path.join(process.env.DEEPCLEAN_TRASH_DIR, 'deepclean-midlink')
  fs.mkdirSync(batchDir, { recursive: true })
  const outside = path.join(root, 'outside-mid')
  fs.mkdirSync(outside)
  const victim = path.join(outside, 'victim.txt')
  fs.writeFileSync(victim, 'VICTIM')
  fs.symlinkSync(outside, path.join(batchDir, 'link'))
  const forged = { from: path.join(dir, 'x.txt'), to: path.join(batchDir, 'link', 'victim.txt') }
  const out = restoreMoved([forged], 'forged')
  assert.equal(out.results[0].ok, false)
  assert.equal(out.results[0].code, 'notfound')
  assert.equal(fs.readFileSync(victim, 'utf8'), 'VICTIM', 'outside file must stay untouched')
})

test('restoreMoved/purgeMoved refuse the trash root itself and non-batch entries', () => {
  const trashRoot = path.join(process.env.DEEPCLEAN_TRASH_DIR)
  const forgedRoot = { from: path.join(root, 'a'), to: trashRoot }
  assert.equal(restoreMoved([forgedRoot], 'x').results[0].ok, false)
  assert.equal(purgeMoved([forgedRoot], 'x').purged, 0)
  const ordinary = path.join(trashRoot, 'ordinary')
  fs.mkdirSync(ordinary, { recursive: true })
  const ordinaryFile = path.join(ordinary, 'o.bin')
  fs.writeFileSync(ordinaryFile, 'O')
  assert.equal(purgeMoved([{ from: path.join(root, 'b'), to: ordinaryFile }], 'x').purged, 0)
  assert.equal(fs.existsSync(ordinaryFile), true)
})

test('restoreMoved: a replaced trash entry reports code=changed', () => {
  const dir = makeDir('changed')
  const file = path.join(dir, 'c.bin')
  fs.writeFileSync(file, 'ORIGINAL')
  const res = moveToTrash([file], new Set([file]))
  fs.rmSync(res.moved[0].to)
  fs.writeFileSync(res.moved[0].to, 'REPLACED')
  const out = restoreMoved(res.moved, res.batchId)
  assert.equal(out.results[0].ok, false)
  assert.equal(out.results[0].code, 'changed')
})

test('trashDir resolves a relative DEEPCLEAN_TRASH_DIR', () => {
  const previous = process.env.DEEPCLEAN_TRASH_DIR
  process.env.DEEPCLEAN_TRASH_DIR = 'relative-trash'
  try {
    assert.equal(trashDir(), path.resolve('relative-trash'))
  } finally {
    if (previous === undefined) delete process.env.DEEPCLEAN_TRASH_DIR
    else process.env.DEEPCLEAN_TRASH_DIR = previous
  }
})

test('restore refuses a linked higher ancestor even with missing parent directories', () => {
  for (const missing of [false, true]) {
    const dir = makeDir('ancestor-' + missing)
    const original = path.join(dir, 'original'), redirected = path.join(dir, 'redirected')
    fs.mkdirSync(path.join(original, 'sub'), { recursive: true })
    fs.mkdirSync(redirected)
    if (!missing) fs.mkdirSync(path.join(redirected, 'sub'))
    const source = path.join(original, 'sub', 'keep.txt')
    fs.writeFileSync(source, 'KEEP')
    const batch = moveToTrash([source], new Set([source]))
    fs.rmSync(original, { recursive: true })
    fs.symlinkSync(redirected, original, process.platform === 'win32' ? 'junction' : 'dir')
    const out = restoreMoved(batch.moved, batch.batchId)
    assert.equal(out.results[0].ok, false)
    assert.equal(out.results[0].code, 'symlink')
    assert.equal(fs.existsSync(path.join(redirected, 'sub', 'keep.txt')), false)
    assert.equal(fs.existsSync(batch.moved[0].to), true)
  }
  const dir = makeDir('ancestor-dotdot'), guard = path.join(dir, 'guard')
  const redirected = path.join(dir, 'redirected'), inner = path.join(redirected, 'inner')
  fs.mkdirSync(guard)
  fs.mkdirSync(inner, { recursive: true })
  const lexical = guard + path.sep + '..' + path.sep + 'keep.txt'
  fs.writeFileSync(lexical, 'KEEP')
  const batch = moveToTrash([lexical], new Set([lexical]))
  fs.rmdirSync(guard)
  fs.symlinkSync(inner, guard, process.platform === 'win32' ? 'junction' : 'dir')
  const out = restoreMoved(batch.moved, batch.batchId)
  assert.equal(out.results[0].code, 'symlink', 'normalizing dot segments must not conceal a linked ancestor')
  assert.equal(fs.existsSync(path.join(redirected, 'keep.txt')), false)
})
