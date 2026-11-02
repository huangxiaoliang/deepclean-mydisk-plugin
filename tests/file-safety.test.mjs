import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { moveAcrossDevices, moveToTrash, restoreMoved } from '../lib/clean.js'
import { isProtected } from '../lib/platform.js'

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-safety-'))
  const previous = { home: process.env.DSH_HOME, trash: process.env.DEEPCLEAN_TRASH_DIR }
  process.env.DSH_HOME = path.join(root, 'state')
  process.env.DEEPCLEAN_TRASH_DIR = path.join(root, 'trash')
  t.after(() => {
    if (previous.home === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous.home
    if (previous.trash === undefined) delete process.env.DEEPCLEAN_TRASH_DIR; else process.env.DEEPCLEAN_TRASH_DIR = previous.trash
    fs.rmSync(root, { recursive: true, force: true })
  })
  return root
}

test('a selected directory containing a protected child is protected too', () => {
  assert.equal(isProtected('/home/a/cache', ['/home/a/cache/keep'], 'darwin'), true)
  assert.equal(isProtected('/home/a/cache-old', ['/home/a/cache/keep'], 'darwin'), false)
  assert.equal(isProtected('c:/USERS/A/cache', ['C:\\Users\\A\\Cache\\keep'], 'win32'), true)
})

test('cross-device copy does not overwrite a pre-existing temporary sibling', async t => {
  const root = fixture(t), source = path.join(root,'source'), target=path.join(root,'target')
  fs.writeFileSync(source,'SOURCE')
  fs.writeFileSync(target+'.deepclean-tmp','UNRELATED')
  await moveAcrossDevices(source,target)
  assert.equal(fs.readFileSync(target+'.deepclean-tmp','utf8'),'UNRELATED')
  assert.equal(fs.readFileSync(target,'utf8'),'SOURCE')
  assert.equal(fs.existsSync(source),false)
})

test('cross-device copy does not follow an existing temporary symlink', {skip:process.platform==='win32'}, async t => {
  const root=fixture(t),source=path.join(root,'source'),target=path.join(root,'target'),victim=path.join(root,'victim')
  fs.writeFileSync(source,'SOURCE');fs.writeFileSync(victim,'UNRELATED')
  fs.symlinkSync(victim,target+'.deepclean-tmp')
  await moveAcrossDevices(source,target)
  assert.equal(fs.readFileSync(victim,'utf8'),'UNRELATED')
  assert.equal(fs.lstatSync(target).isSymbolicLink(),false)
})

test('cross-device copy refuses an occupied final destination and retains source', async t => {
  const root=fixture(t),source=path.join(root,'source'),target=path.join(root,'target')
  fs.writeFileSync(source,'SOURCE');fs.writeFileSync(target,'UNRELATED')
  await assert.rejects(moveAcrossDevices(source,target))
  assert.equal(fs.readFileSync(source,'utf8'),'SOURCE')
  assert.equal(fs.readFileSync(target,'utf8'),'UNRELATED')
})

test('restoring an old batch cannot consume a later same-name file', t => {
  const root=fixture(t),a=path.join(root,'A','same'),b=path.join(root,'B','same')
  fs.mkdirSync(path.dirname(a));fs.mkdirSync(path.dirname(b))
  fs.writeFileSync(a,'FIRST');fs.writeFileSync(b,'SECOND')
  const first=moveToTrash([a],new Set([a]))
  restoreMoved(first.moved,first.batchId)
  const second=moveToTrash([b],new Set([b]))
  fs.unlinkSync(a)
  const result=restoreMoved(first.moved,first.batchId)
  assert.equal(result.results[0].ok,false)
  assert.equal(fs.existsSync(a),false)
  assert.equal(fs.readFileSync(second.moved[0].to,'utf8'),'SECOND')
  assert.notEqual(first.batchId,second.batchId)
})

test('restore refuses a replaced trash entry', t => {
  const root=fixture(t),source=path.join(root,'original')
  fs.writeFileSync(source,'ORIGINAL')
  const batch=moveToTrash([source],new Set([source]))
  fs.unlinkSync(batch.moved[0].to)
  fs.writeFileSync(batch.moved[0].to,'UNRELATED')
  assert.equal(restoreMoved(batch.moved,batch.batchId).results[0].ok,false)
  assert.equal(fs.existsSync(source),false)
  assert.equal(fs.readFileSync(batch.moved[0].to,'utf8'),'UNRELATED')
})

test('batch isolation preserves long original filenames', t => {
  const root=fixture(t),source=path.join(root,'a'.repeat(240)+'.txt')
  fs.writeFileSync(source,'ORIGINAL')
  const batch=moveToTrash([source],new Set([source]))
  assert.equal(batch.results[0].ok,true)
  assert.equal(path.basename(batch.moved[0].to),path.basename(source))
  assert.equal(restoreMoved(batch.moved,batch.batchId).results[0].ok,true)
  assert.equal(fs.readFileSync(source,'utf8'),'ORIGINAL')
})

test('cross-device move supports filesystems without hard links', async t => {
  const root=fixture(t),source=path.join(root,'source'),target=path.join(root,'target')
  fs.writeFileSync(source,'SOURCE')
  const link=fs.linkSync
  fs.linkSync=()=>{ throw Object.assign(new Error('not supported'),{code:'ENOTSUP'}) }
  try { await moveAcrossDevices(source,target) } finally { fs.linkSync=link }
  assert.equal(fs.readFileSync(target,'utf8'),'SOURCE')
  assert.equal(fs.existsSync(source),false)
  assert.ok(!fs.readdirSync(root).some(name=>name.startsWith('.deepclean-')))
})

test('destination created during verification is not overwritten', async t => {
  const root=fixture(t),source=path.join(root,'source'),target=path.join(root,'target')
  fs.writeFileSync(source,'SOURCE')
  const link=fs.linkSync
  fs.linkSync=(from,to)=>{fs.writeFileSync(to,'LATE FILE');return link(from,to)}
  try { await assert.rejects(moveAcrossDevices(source,target)) } finally { fs.linkSync=link }
  assert.equal(fs.readFileSync(source,'utf8'),'SOURCE')
  assert.equal(fs.readFileSync(target,'utf8'),'LATE FILE')
})

test('failed SHA-256 verification leaves source and removes only staging files', async t => {
  const root=fixture(t),source=path.join(root,'source'),target=path.join(root,'target')
  fs.writeFileSync(source,'SOURCE')
  const copy=fs.copyFileSync
  fs.copyFileSync=(from,to,flags)=>{copy(from,to,flags);fs.appendFileSync(to,'CORRUPTED')}
  try { await assert.rejects(moveAcrossDevices(source,target),/校验失败/) } finally { fs.copyFileSync=copy }
  assert.equal(fs.readFileSync(source,'utf8'),'SOURCE')
  assert.equal(fs.existsSync(target),false)
  assert.ok(!fs.readdirSync(root).some(name=>name.startsWith('.deepclean-')))
})

test('failure to remove source rolls back the newly published copy', async t => {
  const root=fixture(t),source=path.join(root,'source'),target=path.join(root,'target')
  fs.writeFileSync(source,'SOURCE')
  const unlink=fs.unlinkSync
  fs.unlinkSync=file=>{if(file===source)throw Object.assign(new Error('busy source'),{code:'EBUSY'});return unlink(file)}
  try { await assert.rejects(moveAcrossDevices(source,target),/busy source/) } finally { fs.unlinkSync=unlink }
  assert.equal(fs.readFileSync(source,'utf8'),'SOURCE')
  assert.equal(fs.existsSync(target),false)
})
