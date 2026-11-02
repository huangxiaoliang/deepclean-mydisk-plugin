import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-host-test-'))
process.env.DSH_HOME = path.join(root, 'dsh')
process.env.DEEPCLEAN_TRASH_DIR = path.join(root, 'trash')

const plugin = await import('../lib/index.js')

const routes = []
const ctx = {
  tools: { register() {} },
  effect() {},
  inject(deps, cb) {
    if (deps.includes('webServer')) cb({ webServer: { register(r) { routes.push(r); return () => {} } } })
  },
}
plugin.apply(ctx)

const find = (p) => routes.find((r) => r.path.endsWith(p))
function mockRes() {
  return { code: 0, body: '', writeHead(c) { this.code = c }, end(b) { this.body = b }, destroy() {} }
}
function mockReq(method, url, body) {
  const listeners = {}
  const req = { method, url, on(e, f) { (listeners[e] ||= []).push(f) }, destroy() {} }
  setTimeout(() => {
    if (body !== undefined) for (const f of listeners.data || []) f(Buffer.from(body))
    for (const f of listeners.end || []) f()
  }, 0)
  return req
}
async function call(p, method = 'GET', body) {
  const res = mockRes()
  await find(p).handler(mockReq(method, '/dsh-deepclean/api' + p, body), res)
  return { code: res.code, body: JSON.parse(res.body || '{}') }
}

test('host registers expected routes', () => {
  for (const p of ['/overview', '/disk', '/scan', '/scan/cancel', '/clean', '/undo', '/history', '/restore', '/whitelist', '/photos', '/photos/scan', '/thumb', '/move', '/move/cancel', '/tree', '/reveal', '/state', '/permissions']) {
    assert.ok(find(p), `missing route ${p}`)
  }
})

test('state starts clean', async () => {
  const { code, body } = await call('/state')
  assert.equal(code, 200)
  assert.equal(body.canUndo, false)
})

test('overview exposes live disk usage before any scan', async () => {
  const { code, body } = await call('/overview')
  assert.equal(code, 200)
  assert.equal(body.report, null, 'no scan has run yet')
  assert.ok(body.disk, 'overview must include a live disk snapshot')
  assert.ok(body.disk.total > 0, 'total must be positive')
  assert.ok(body.disk.used >= 0)
  assert.ok(body.disk.free >= 0)
  assert.ok(Math.abs(body.disk.used + body.disk.free - body.disk.total) < 2, 'used + free == total')
  assert.ok(typeof body.disk.mount === 'string' && body.disk.mount.length > 0)
  assert.ok(Date.now() - body.disk.at < 60000, 'snapshot is fresh')
})

test('disk endpoint returns a live snapshot matching fs.statfs', async () => {
  const { code, body } = await call('/disk')
  assert.equal(code, 200)
  assert.ok(body.disk, '/disk must return a snapshot')
  assert.ok(Math.abs(body.disk.used + body.disk.free - body.disk.total) < 2, 'used + free == total')
  const st = fs.statfsSync(body.disk.mount)
  const free = st.bavail * st.bsize
  const used = (st.blocks - st.bfree) * st.bsize
  assert.ok(Math.abs(body.disk.free - free) < 64 * 1024 * 1024)
  assert.ok(Math.abs(body.disk.used - used) < 64 * 1024 * 1024)
})

test('clean refuses without a fresh scan', async () => {
  const { code } = await call('/clean', 'POST', JSON.stringify({ paths: [] }))
  assert.equal(code, 409)
})

test('move refuses without a fresh scan', async () => {
  const { code } = await call('/move', 'POST', JSON.stringify({ paths: [], destination: root }))
  assert.equal(code, 400)
})

test('whitelist stores only absolute paths', async () => {
  const put = await call('/whitelist', 'PUT', JSON.stringify({ paths: ['relative/path', path.join(root, 'abs')] }))
  assert.equal(put.code, 200)
  assert.deepEqual(put.body.paths, [path.join(root, 'abs')])
  const get = await call('/whitelist')
  assert.deepEqual(get.body.paths, [path.join(root, 'abs')])
  await call('/whitelist', 'PUT', JSON.stringify({ paths: [] }))
})

test('photos starts idle', async () => {
  const { code, body } = await call('/photos')
  assert.equal(code, 200)
  assert.equal(body.scan.status, 'idle')
})

test('tree rejects paths outside home', { skip: process.platform === 'win32' }, async () => {
  const res = mockRes()
  await find('/tree').handler(mockReq('GET', '/dsh-deepclean/api/tree?path=' + encodeURIComponent('/etc')), res)
  assert.equal(res.code, 400)
})

test('permissions endpoint responds', { skip: process.platform === 'win32' }, async () => {
  const { code, body } = await call('/permissions')
  assert.equal(code, 200)
  assert.match(body.text, /权限检查/)
})


test('bundled disk illustration serves PNG without a scan and rejects POST', async () => {
  const route = find('/assets/disk.png')
  assert.ok(route)
  const res = mockRes()
  await route.handler(mockReq('GET', '/dsh-deepclean/assets/disk.png'), res)
  assert.equal(res.code, 200)
  assert.ok(Buffer.isBuffer(res.body))
  assert.equal(res.body.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  const post = mockRes()
  await route.handler(mockReq('POST', '/dsh-deepclean/assets/disk.png'), post)
  assert.equal(post.code, 405)
})

test('Windows tree endpoint reports 1 MiB as 1024 KB with Unicode paths', { skip: process.platform !== 'win32' }, async () => {
  const home = process.env.HOME
  process.env.HOME = root
  try {
    const folder = path.join(root, '空间 测试')
    fs.mkdirSync(folder, { recursive: true })
    const target = path.join(folder, '一兆.bin')
    fs.writeFileSync(target, Buffer.alloc(1024 * 1024, 1))
    const res = mockRes()
    await find('/tree').handler(mockReq('GET', '/dsh-deepclean/api/tree?path=' + encodeURIComponent(folder)), res)
    assert.equal(res.code, 200)
    const entry = JSON.parse(res.body).children.find(c => c.path === target)
    assert.ok(entry, 'Unicode file must remain visible')
    assert.equal(entry.kb, 1024)
  } finally {
    if (home === undefined) delete process.env.HOME
    else process.env.HOME = home
  }
})

test('Windows thumbnail endpoint uses native decoder and preserves original BMP', { skip: process.platform !== 'win32' }, async () => {
  const home = process.env.HOME
  process.env.HOME = root
  try {
    const target = path.join(root, '图片 & 测试.bmp')
    const bmp = Buffer.alloc(70, 255)
    bmp.write('BM'); bmp.writeUInt32LE(70, 2); bmp.writeUInt32LE(0, 6); bmp.writeUInt32LE(54, 10)
    bmp.writeUInt32LE(40, 14); bmp.writeInt32LE(2, 18); bmp.writeInt32LE(2, 22)
    bmp.writeUInt16LE(1, 26); bmp.writeUInt16LE(24, 28)
    bmp.fill(0, 30, 54); bmp.writeUInt32LE(16, 34)
    fs.writeFileSync(target, bmp)
    const res = mockRes()
    await find('/thumb').handler(mockReq('GET', '/dsh-deepclean/api/thumb?path=' + encodeURIComponent(target)), res)
    assert.equal(res.code, 200, String(res.body))
    assert.equal(res.body.subarray(0, 2).toString('hex'), 'ffd8')
    assert.deepEqual(fs.readFileSync(target), bmp)
  } finally {
    if (home === undefined) delete process.env.HOME
    else process.env.HOME = home
  }
})

test('directory totals include hidden entries, report metadata and refuse links', async () => {
  const home = process.env.HOME
  process.env.HOME = root
  const folder = path.join(root, 'tree-hidden')
  fs.mkdirSync(folder)
  fs.writeFileSync(path.join(folder,'.hidden'),Buffer.alloc(8192,1))
  fs.writeFileSync(path.join(folder,'visible'),Buffer.alloc(8192,1))
  try {
    if(process.platform !== 'win32') fs.symlinkSync(os.tmpdir(),path.join(folder,'outside'))
    const res = mockRes()
    await find('/tree').handler(mockReq('GET','/dsh-deepclean/api/tree?path='+encodeURIComponent(folder)),res)
    assert.equal(res.code,200)
    const data=JSON.parse(res.body)
    assert.ok(data.children.some(c=>c.name==='.hidden' && c.kb>0))
    assert.ok(data.children.some(c=>c.name==='visible'))
    assert.ok(!data.children.some(c=>c.name==='outside'))
    assert.ok(data.at>0)
    fs.writeFileSync(path.join(folder,'new-file'), 'new')
    const refreshed=mockRes()
    await find('/tree').handler(mockReq('GET','/dsh-deepclean/api/tree?refresh=1&path='+encodeURIComponent(folder)),refreshed)
    assert.ok(JSON.parse(refreshed.body).children.some(c=>c.name==='new-file'))
    assert.ok(['allocated','logical'].includes(data.metric))
    if(process.platform !== 'win32') {
      const rejected=mockRes()
      await find('/tree').handler(mockReq('GET','/dsh-deepclean/api/tree?path='+encodeURIComponent(path.join(folder,'outside'))),rejected)
      assert.equal(rejected.code,400)
    }
    const dest=mockRes()
    await find('/destination').handler(mockReq('GET','/dsh-deepclean/api/destination?path='+encodeURIComponent(folder)),dest)
    assert.equal(dest.code,200)
    assert.ok(JSON.parse(dest.body).free>=0)
    assert.ok(!JSON.parse(dest.body).folders.some(c=>c.name==='outside'))
  } finally { if(home===undefined) delete process.env.HOME; else process.env.HOME=home }
})

test('history replays legacy restores and refuses a reused destination from an old batch', async () => {
  const folder=path.join(root,'legacy-history')
  fs.mkdirSync(folder)
  const a=path.join(folder,'A'),b=path.join(folder,'B'),shared=path.join(folder,'old-trash-name')
  fs.writeFileSync(shared,'SECOND')
  const log=path.join(process.env.DSH_HOME,'deepclean-audit.log')
  fs.mkdirSync(path.dirname(log),{recursive:true})
  const entries=[
    {action:'clean',batchId:'legacy-first',moved:[{from:a,to:shared}]},
    {action:'restore',batchId:'legacy-first',results:[{path:a,ok:true}]},
    {action:'clean',batchId:'legacy-second',moved:[{from:b,to:shared}]},
  ]
  fs.appendFileSync(log,entries.map(e=>JSON.stringify(e)).join('\n')+'\n')
  const history=(await call('/history')).body.cleans
  assert.equal(history.find(b=>b.batchId==='legacy-first').restorable,0)
  assert.equal(history.find(b=>b.batchId==='legacy-second').restorable,1)
  assert.equal((await call('/restore','POST',JSON.stringify({batchId:'legacy-first'}))).code,409)
  assert.equal(fs.readFileSync(shared,'utf8'),'SECOND')
  const restored=await call('/restore','POST',JSON.stringify({batchId:'legacy-second'}))
  assert.equal(restored.body.results[0].ok,true)
  assert.equal(fs.readFileSync(b,'utf8'),'SECOND')
  assert.equal(fs.existsSync(a),false)
})

test('legacy destination reuse without a restore log belongs only to the newest batch', async () => {
  const folder=path.join(root,'legacy-reuse')
  fs.mkdirSync(folder)
  const to=path.join(folder,'shared'),log=path.join(process.env.DSH_HOME,'deepclean-audit.log')
  fs.writeFileSync(to,'NEW')
  for(const [batchId,from] of [['reuse-old',path.join(folder,'old')],['reuse-new',path.join(folder,'new')]]) {
    fs.appendFileSync(log,JSON.stringify({action:'clean',batchId,moved:[{from,to}]})+'\n')
  }
  const history=(await call('/history')).body.cleans
  assert.equal(history.find(b=>b.batchId==='reuse-old').restorable,0)
  assert.equal(history.find(b=>b.batchId==='reuse-new').restorable,1)
})

test('partial legacy restores retain only the failed item for retry', async () => {
  const folder=path.join(root,'partial-history')
  fs.mkdirSync(folder)
  const fromA=path.join(folder,'A'),fromB=path.join(folder,'B'),toA=path.join(folder,'trash-A'),toB=path.join(folder,'trash-B')
  fs.writeFileSync(toA,'SOMEONE ELSE');fs.writeFileSync(toB,'RETRY')
  const entries=[{action:'clean',batchId:'partial',moved:[{from:fromA,to:toA},{from:fromB,to:toB}]},{action:'restore',batchId:'partial',results:[{path:fromA,ok:true},{path:fromB,ok:false}]}]
  fs.appendFileSync(path.join(process.env.DSH_HOME,'deepclean-audit.log'),entries.map(e=>JSON.stringify(e)).join('\n')+'\n')
  const batch=(await call('/history')).body.cleans.find(b=>b.batchId==='partial')
  assert.equal(batch.restorable,1)
  const restored=await call('/restore','POST',JSON.stringify({batchId:'partial'}))
  assert.deepEqual(restored.body.results.map(r=>r.path),[fromB])
  assert.equal(fs.readFileSync(fromB,'utf8'),'RETRY')
  assert.equal(fs.readFileSync(toA,'utf8'),'SOMEONE ELSE')
})

test('reclaim estimates logical and allocated bytes', async () => {
  fs.mkdirSync(process.env.DSH_HOME, { recursive: true })
  const file = path.join(root, 'reclaim.bin')
  fs.writeFileSync(file, Buffer.alloc(1234, 1))
  const { code, body } = await call('/reclaim', 'POST', JSON.stringify({ paths: [file] }))
  assert.equal(code, 200)
  assert.equal(body.logicalBytes, 1234)
  assert.ok(body.allocatedBytes >= 1234)
  assert.equal(body.files, 1)
})

test('purge permanently deletes a batch moved into the quarantine trash', async () => {
  const trashDir = path.join(process.env.DEEPCLEAN_TRASH_DIR, 'deepclean-testbatch')
  fs.mkdirSync(trashDir, { recursive: true })
  const item = path.join(trashDir, 'x.bin')
  fs.writeFileSync(item, 'x')
  const audit = path.join(process.env.DSH_HOME, 'deepclean-audit.log')
  fs.mkdirSync(process.env.DSH_HOME, { recursive: true })
  fs.appendFileSync(audit, JSON.stringify({ action: 'clean', batchId: 'testbatch', moved: [{ from: path.join(root, 'orig.bin'), to: item }], results: [] }) + '\n')
  const { code, body } = await call('/purge', 'POST', JSON.stringify({ batchId: 'testbatch' }))
  assert.equal(code, 200)
  assert.equal(body.purged, 1)
  assert.equal(fs.existsSync(item), false)
})
