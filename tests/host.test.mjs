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
const tools = []
const ctx = {
  tools: { register(tool) { tools.push(tool) } },
  effect() {},
  inject(deps, cb) {
    if (deps.includes('webServer')) cb({ webServer: { register(r) { routes.push(r); return () => {} } } })
  },
}
plugin.apply(ctx)

function find(p) {
  // 先精确匹配，避免 /purge 命中 /quarantine/purge（路由表本身是 exact 匹配）。
  const exact = routes.find((r) => r.path === '/dsh-deepclean/api' + p)
  return exact || routes.find((r) => r.path.endsWith(p))
}
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
  for (const p of ['/overview', '/disk', '/scan', '/scan/cancel', '/clean', '/undo', '/history', '/restore', '/whitelist', '/photos', '/photos/scan', '/thumb', '/move', '/move/cancel', '/tree', '/reveal', '/state', '/permissions', '/quarantine', '/quarantine/purge']) {
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

test('allowed paths exclude admin, non-cleanable and system caches', () => {
  const report = {
    caches: [
      { path: '/tmp/ok-cache', kb: 1 },
      { path: 'C:\\Windows\\Temp', kb: 1, admin: true },
      { path: 'C:\\Users\\x\\AppData\\Local\\Temp', kb: 1, cleanable: false },
      { path: '/tmp/sys-cache', kb: 1, system: true },
      { path: '/tmp/running-cache', kb: 1, running: true },
    ],
    devCaches: [{ path: '/tmp/dev-ok', kb: 1 }, { path: '/tmp/dev-no', kb: 1, cleanable: false }],
    leftoverGroups: [
      { baseId: 'x.cache', bucket: 'safe', paths: ['/tmp/split-cache'], kb: 10, cachePart: true },
      { baseId: 'x', bucket: 'confirm', paths: ['/tmp/confirm-container'], kb: 20 },
    ],
    browsers: [
      { name: 'Chrome', path: '/tmp/browser-running', kb: 1, running: true },
      { name: 'Firefox', path: '/tmp/browser-idle', kb: 1, running: false },
    ],
  }
  const allowed = plugin.allowedPaths(report)
  assert.ok(allowed.has('/tmp/ok-cache'))
  assert.ok(allowed.has('/tmp/dev-ok'))
  assert.ok(allowed.has('/tmp/browser-idle'), 'idle browser cache stays cleanable')
  assert.ok(allowed.has('/tmp/split-cache'), 'split cache subfolders of an uninstalled app are cleanable')
  assert.ok(!allowed.has('/tmp/confirm-container'), 'the rest of a confirm leftover stays out of the allow-set')
  for (const blocked of ['C:\\Windows\\Temp', 'C:\\Users\\x\\AppData\\Local\\Temp', '/tmp/sys-cache', '/tmp/dev-no', '/tmp/running-cache', '/tmp/browser-running']) {
    assert.ok(!allowed.has(blocked), `${blocked} must stay out of the clean allow-set`)
  }
})

test('pruneReport drops cleaned rows and keeps partially cleaned groups', () => {
  const report = {
    leftoverGroups: [
      { baseId: 'a', paths: ['/x/a1'], kb: 10, bucket: 'safe' },
      { baseId: 'b', paths: ['/x/b1', '/x/b2'], kb: 20, bucket: 'safe' },
    ],
    caches: [{ path: '/x/c1', kb: 1 }, { path: '/x/c2', kb: 2 }],
    devCaches: [{ path: '/x/d1', kb: 1 }],
    browsers: [{ name: 'Chrome', path: '/x/br', kb: 1 }],
    appCaches: [{ baseId: 'app', paths: ['/x/ac1', '/x/ac2'], kb: 5 }],
    special: [{ app: '微信', categories: [{ name: '缓存', paths: ['/x/s1'], cleanable: true }] }],
    estimate: { safeKb: 30, cacheKb: 3, devKb: 1, totalKb: 34 },
  }
  const pruned = plugin.pruneReport(report, new Set(['/x/a1', '/x/b1', '/x/c1', '/x/br', '/x/ac1', '/x/s1']))
  assert.deepEqual(pruned.leftoverGroups.map((g) => g.baseId), ['b'], 'fully cleaned group removed')
  assert.deepEqual(pruned.leftoverGroups[0].paths, ['/x/b2'], 'partially cleaned group keeps remaining paths')
  assert.deepEqual(pruned.caches.map((c) => c.path), ['/x/c2'])
  assert.equal(pruned.devCaches.length, 1)
  assert.equal(pruned.browsers.length, 0)
  assert.deepEqual(pruned.appCaches[0].paths, ['/x/ac2'])
  assert.equal(pruned.special.length, 0, 'special app with no categories left is removed')
  assert.equal(pruned.estimate.totalKb, 34, 'estimate stays the scan-time snapshot')
  assert.deepEqual(plugin.pruneReport(report, new Set()).leftoverGroups.length, 2, 'empty set is a no-op')
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

test('permissions endpoint responds with a structured status', { skip: process.platform === 'win32' }, async () => {
  const { code, body } = await call('/permissions')
  assert.equal(code, 200)
  assert.match(body.text, /权限检查/)
  assert.ok(['ok', 'denied'].includes(body.status), 'status is derived from the scanner exit code')
})

test('open-privacy-settings is POST-only, darwin-only and dry-runnable', async () => {
  const route = find('/open-privacy-settings')
  assert.ok(route, 'missing route /open-privacy-settings')
  const getRes = mockRes()
  await route.handler(mockReq('GET', '/dsh-deepclean/api/open-privacy-settings'), getRes)
  assert.equal(getRes.code, 405)
  process.env.DEEPCLEAN_NO_OPEN = '1'
  try {
    const { code, body } = await call('/open-privacy-settings', 'POST', '{}')
    if (process.platform === 'darwin') {
      assert.equal(code, 200)
      assert.equal(body.ok, true)
    } else {
      assert.equal(code, 400)
    }
  } finally {
    delete process.env.DEEPCLEAN_NO_OPEN
  }
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

test('tree walk seeds the drill-down cache and confirms big files for moving', async () => {
  const home = process.env.HOME
  process.env.HOME = root
  const parent = path.join(root, 'tree-seed')
  const child = path.join(parent, 'child')
  fs.mkdirSync(child, { recursive: true })
  const big = path.join(child, 'big.bin')
  fs.writeFileSync(big, Buffer.alloc(12 * 1024 * 1024, 1)) // child 12MB ≥ 10MB → 进入 dirs 播种
  const dest = path.join(root, 'tree-seed-dest')
  fs.mkdirSync(dest)
  const getTree = async (p) => {
    const res = mockRes()
    await find('/tree').handler(mockReq('GET', '/dsh-deepclean/api/tree?path=' + encodeURIComponent(p)), res)
    return { code: res.code, body: JSON.parse(res.body || '{}') }
  }
  try {
    const first = await getTree(parent)
    assert.equal(first.code, 200)
    assert.ok(!('dirs' in first.body), 'wire response strips the dirs seeding map')
    assert.ok(first.body.bigFiles.some((f) => f.path === big), 'root walk reports the big file')
    const drilled = await getTree(child)
    assert.equal(drilled.code, 200)
    assert.equal(drilled.body.at, first.body.at, 'drill-down is served from the seeded cache, not a re-walk')
    assert.ok(drilled.body.children.some((c) => c.path === big))

    // tree 确认的路径可以直接搬家，不要求先有体检报告
    const unknown = await call('/move', 'POST', JSON.stringify({ paths: [path.join(parent, 'nope.bin')], destination: dest }))
    assert.equal(unknown.code, 400)
    const started = await call('/move', 'POST', JSON.stringify({ paths: [big], destination: dest }))
    assert.equal(started.code, 202, JSON.stringify(started.body))
    for (let i = 0; i < 50; i++) {
      const st = await call('/move')
      if (st.body.move.status !== 'running') break
      await new Promise((r) => setTimeout(r, 100))
    }
    assert.equal(fs.existsSync(big), false)
    assert.ok(fs.readdirSync(dest).some((n) => n.startsWith('big.bin')))
  } finally {
    if (home === undefined) delete process.env.HOME
    else process.env.HOME = home
  }
})

test('history replays legacy restores and refuses a reused destination from an old batch', async () => {
  const folder=path.join(root,'legacy-history')
  fs.mkdirSync(folder)
  const trashRoot=path.join(process.env.DEEPCLEAN_TRASH_DIR,'deepclean-legacy-history')
  fs.mkdirSync(trashRoot,{recursive:true})
  const a=path.join(folder,'A'),b=path.join(folder,'B'),shared=path.join(trashRoot,'old-trash-name')
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
  const trashRoot=path.join(process.env.DEEPCLEAN_TRASH_DIR,'deepclean-legacy-reuse')
  fs.mkdirSync(trashRoot,{recursive:true})
  const to=path.join(trashRoot,'shared'),log=path.join(process.env.DSH_HOME,'deepclean-audit.log')
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
  const trashRoot=path.join(process.env.DEEPCLEAN_TRASH_DIR,'deepclean-partial-history')
  fs.mkdirSync(trashRoot,{recursive:true})
  const fromA=path.join(folder,'A'),fromB=path.join(folder,'B'),toA=path.join(trashRoot,'trash-A'),toB=path.join(trashRoot,'trash-B')
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

test('restore reports a conflict honestly and can restore the batch as a copy', async () => {
  const folder=path.join(root,'restore-conflict')
  fs.mkdirSync(folder,{recursive:true})
  const trashRoot=path.join(process.env.DEEPCLEAN_TRASH_DIR,'deepclean-restore-conflict')
  fs.mkdirSync(trashRoot,{recursive:true})
  const from=path.join(folder,'keep.txt'),to=path.join(trashRoot,'keep.txt')
  fs.writeFileSync(from,'NEWER')                   // 原位置已有同名文件
  fs.writeFileSync(to,'OLDER')                     // 隔离区里仍有原文件
  const log=path.join(process.env.DSH_HOME,'deepclean-audit.log')
  fs.mkdirSync(path.dirname(log),{recursive:true})
  fs.appendFileSync(log,JSON.stringify({action:'clean',batchId:'conflict',moved:[{from,to}],results:[]})+'\n')
  const failed=await call('/restore','POST',JSON.stringify({batchId:'conflict'}))
  assert.equal(failed.code,200)
  assert.equal(failed.body.summary.failed,1)
  assert.equal(failed.body.summary.codes.exists,1)
  assert.equal(failed.body.results[0].code,'exists')
  assert.equal(fs.readFileSync(from,'utf8'),'NEWER','must not overwrite the existing file')
  assert.equal(fs.readFileSync(to,'utf8'),'OLDER','trash entry stays for a retry')
  const history=(await call('/history')).body.cleans.find(b=>b.batchId==='conflict')
  assert.equal(history.lastRestore.failed,1,'history records the failed restore')
  const copy=await call('/restore','POST',JSON.stringify({batchId:'conflict',onConflict:'rename'}))
  assert.equal(copy.body.summary.ok,1)
  assert.equal(copy.body.results[0].renamed,true)
  assert.equal(fs.readFileSync(copy.body.results[0].restoredTo,'utf8'),'OLDER')
  assert.equal(fs.readFileSync(from,'utf8'),'NEWER')
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


test('host registers the read-only inspection tool', () => {
  const names = tools.map((t) => t.name).sort()
  assert.deepEqual(names, ['disk_audit', 'disk_check_permissions', 'disk_inspect', 'disk_self_test'])
})

test('disk_inspect reports path facts without touching files', async () => {
  const home = process.env.HOME
  process.env.HOME = root
  const folder = path.join(root, 'inspect-fixture')
  fs.mkdirSync(folder, { recursive: true })
  const file = path.join(folder, 'blob.bin')
  fs.writeFileSync(file, Buffer.alloc(4096, 7))
  try {
    const tool = tools.find((t) => t.name === 'disk_inspect')
    const text = await tool.execute({ path: folder })
    assert.match(text, /只读路径检查/)
    assert.match(text, /类型：目录/)
    assert.match(text, /blob\.bin 4 KB/)
    assert.match(text, /未修改、未移动任何文件/)
    assert.equal(fs.existsSync(file), true, 'inspection must not move or delete files')
    const missing = await tool.execute({ path: path.join(root, 'inspect-missing') })
    assert.match(missing, /路径不存在/)
    const empty = await tool.execute({})
    assert.match(empty, /需要绝对路径/)
    if (process.platform !== 'win32') {
      const link = path.join(root, 'inspect-link')
      fs.symlinkSync(folder, link)
      const sym = await tool.execute({ path: link })
      assert.match(sym, /符号链接（未跟随）/)
      assert.equal(fs.existsSync(folder), true)
    }
  } finally {
    if (home === undefined) delete process.env.HOME
    else process.env.HOME = home
  }
})

test('cleanAnnotations records report sizes but never widens the allow-set', () => {
  const report = {
    leftoverGroups: [{ baseId: 'a', kb: 100, paths: ['/x/a1', '/x/a2'], bucket: 'safe' }],
    caches: [{ path: '/x/c1', kb: 5 }],
    devCaches: [{ path: '/x/d1', kb: 7 }],
    browsers: [{ name: 'Chrome', path: '/x/b1', kb: 9 }],
    appCaches: [{ baseId: 'p', kb: 11, paths: ['/x/p1', '/x/p2'] }],
    special: [{ app: '微信', categories: [{ name: '缓存', kb: 13, paths: ['/x/s1'] }] }],
  }
  const map = plugin.cleanAnnotations(report, ['/x/a2', '/x/c1', '/x/d1', '/x/b1', '/x/p2', '/x/s1', '/not/selected'])
  assert.deepEqual([...map.keys()].sort(), ['/x/a2', '/x/b1', '/x/c1', '/x/d1', '/x/p2', '/x/s1'])
  assert.equal(map.get('/x/a2').kb, 100, 'a grouped row is attributed once, to the selected path')
  assert.equal(map.get('/x/a2').category, 'leftover')
  assert.equal(map.get('/x/c1').kb, 5)
  assert.equal(map.get('/x/s1').kb, 13)
  assert.equal(plugin.cleanAnnotations(report, []).size, 0)
  assert.equal(plugin.cleanAnnotations(null, ['/x/c1']).size, 0)
  // The mapping is audit metadata only: it must not appear in the clean allow-set.
  const allowed = plugin.allowedPaths({ leftoverGroups: [], caches: [], devCaches: [], browsers: [] })
  assert.equal(allowed.size, 0)
})

test('splitBatches: keeps the 200 cap, covers every path in order', () => {
  const paths = Array.from({ length: 250 }, (_, i) => `/p/${i}`)
  const parts = plugin.splitBatches(paths)
  assert.deepEqual(parts.map((p) => p.length), [200, 50])
  assert.deepEqual(parts.flat(), paths)
  assert.deepEqual(plugin.splitBatches([], 10), [])
  assert.deepEqual(plugin.splitBatches(['a'], 10), [['a']])
  assert.deepEqual(plugin.splitBatches(paths, 0).map((p) => p.length), [200, 50], 'invalid limit falls back to MAX_BATCH')
})

test('prunePhotoResult: drops moved photos and dissolves groups under two items', () => {
  const result = {
    scanned: 6, compared: 6,
    groups: [
      { id: 'g1', items: [{ path: '/a', kb: 10 }, { path: '/b', kb: 8 }, { path: '/c', kb: 6 }], totalKb: 24, wastedKb: 14 },
      { id: 'g2', items: [{ path: '/d', kb: 10 }, { path: '/e', kb: 9 }], totalKb: 19, wastedKb: 9 },
    ],
  }
  const pruned = plugin.prunePhotoResult(result, new Set(['/a', '/e']))
  assert.equal(pruned.groups.length, 1)
  assert.equal(pruned.groups[0].id, 'g1')
  assert.deepEqual(pruned.groups[0].items.map((i) => i.path), ['/b', '/c'])
  assert.equal(pruned.groups[0].totalKb, 14)
  assert.equal(pruned.groups[0].wastedKb, 6, 'wasted = total - largest remaining')
  const untouched = plugin.prunePhotoResult(result, new Set())
  assert.equal(untouched.groups.length, 2, 'empty set is a no-op')
})


test('quarantine endpoint reports plugin batches and purges them', async () => {
  plugin.invalidateQuarantine()
  const batchDir = path.join(process.env.DEEPCLEAN_TRASH_DIR, 'deepclean-quarantine-test')
  fs.mkdirSync(batchDir, { recursive: true })
  const item = path.join(batchDir, 'q.bin')
  fs.writeFileSync(item, Buffer.alloc(2048))
  const from = path.join(root, 'quarantine-orig.bin')
  const log = path.join(process.env.DSH_HOME, 'deepclean-audit.log')
  fs.mkdirSync(path.dirname(log), { recursive: true })
  fs.appendFileSync(log, JSON.stringify({ action: 'clean', batchId: 'quarantine-test', moved: [{ from, to: item }], results: [] }) + '\n')
  plugin.invalidateQuarantine()
  const before = await call('/quarantine')
  assert.equal(before.code, 200)
  assert.ok(before.body.kb >= 2)
  assert.ok(before.body.batches.some((b) => b.batchId === 'quarantine-test'))
  const overview = await call('/overview')
  assert.ok(overview.body.quarantine && overview.body.quarantine.root, 'overview exposes quarantine')
  const purged = await call('/quarantine/purge', 'POST', JSON.stringify({ batchIds: ['quarantine-test'] }))
  assert.equal(purged.code, 200)
  assert.equal(purged.body.total.purged, 1)
  assert.equal(fs.existsSync(item), false)
  plugin.invalidateQuarantine()
  const after = await call('/quarantine')
  assert.ok(!after.body.batches.some((b) => b.batchId === 'quarantine-test'))
})


test('cloud and app-data paths are blocked from moving', () => {
  const cloud = path.join(root, 'fake-cloud')
  fs.mkdirSync(cloud, { recursive: true })
  const prev = process.env.DEEPCLEAN_CLOUD_ROOTS
  process.env.DEEPCLEAN_CLOUD_ROOTS = JSON.stringify([cloud])
  try {
    assert.equal(plugin.isCloudBackedPath(path.join(cloud, 'a.bin')), true)
    assert.equal(plugin.isCloudBackedPath(path.join(root, 'local.bin')), false)
    assert.match(plugin.moveBlockReason(path.join(cloud, 'a.bin')), /云盘/)
    assert.match(plugin.moveBlockReason(path.join(root, 'Pictures', 'Photos Library.photoslibrary', 'originals', 'a.jpg')), /App 数据/)
    assert.match(plugin.moveBlockReason(path.join(root, 'Library', 'Mail', 'V10', 'a.eml')), /App 数据/)
    assert.equal(plugin.moveBlockReason(path.join(root, 'Documents', 'movie.mkv')), '')
  } finally {
    if (prev === undefined) delete process.env.DEEPCLEAN_CLOUD_ROOTS
    else process.env.DEEPCLEAN_CLOUD_ROOTS = prev
  }
})


test('trimUndoneBatch removes restored entries so a retry can finish', () => {
  const moved = [{ from: '/a' }, { from: '/b' }, { from: '/c' }]
  const results = [{ path: '/a', ok: true }, { path: '/b', ok: false, code: 'exists' }, { path: '/c', ok: true }]
  assert.deepEqual(plugin.trimUndoneBatch(moved, results).map((m) => m.from), ['/b'])
  assert.deepEqual(plugin.trimUndoneBatch([], results), [])
})

test('state exposes lastBatchIds for split clean batches', async () => {
  const { code, body } = await call('/state')
  assert.equal(code, 200)
  assert.ok(Array.isArray(body.lastBatchIds))
})

test('quarantine purge requires explicit batchIds or all:true', async () => {
  const res = await call('/quarantine/purge', 'POST', JSON.stringify({}))
  assert.equal(res.code, 400)
  assert.match(res.body.error, /batchIds|all/)
})
