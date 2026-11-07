/** Isolated UI preview: serves the actual handwritten bundle with in-memory demo APIs.
 * Run: node scripts/preview.mjs (no build, install, or user-file mutations).
 * ?data=1 opens with scan results. ?data=1&expired=1 previews an expired scan.
 * DEEPCLEAN_PREVIEW_FDA=denied previews the Full Disk Access banner (macOS denied state).
 * DEEPCLEAN_PREVIEW_PYTHON=missing previews Windows Python setup; ?ai=no-session tests clipboard fallback.
 * ?update=available|none|link|error previews the plugin update badge, up-to-date, link-install and unavailable states; ?dialog=1 opens it; ?view=settings opens the settings page.
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { previewReport } from '../tests/fixtures/preview-report.mjs'
import { softwareInventory } from '../tests/fixtures/software-inventory.mjs'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(root, 'package.json'))
const domRequire = createRequire(require.resolve('react-dom/client'))
const packages = { react: ['react', 'react.production.js'], 'react-dom': ['react-dom', 'react-dom.production.js'], 'react-dom/client': ['react-dom', 'react-dom-client.production.js'], scheduler: ['scheduler', 'scheduler.production.js'] }
const factories = Object.entries(packages).map(([name, [pkg, file]]) => `${JSON.stringify(name)}:function(module,exports,require){${fs.readFileSync(path.join(path.dirname(domRequire.resolve(pkg)), 'cjs', file), 'utf8')}\n}`).join(',')
const runtime = `(()=>{const modules={${factories}},cache={};window.require=function require(id){if(cache[id])return cache[id].exports;if(!modules[id])throw Error('Unknown preview module '+id);const module={exports:{}};cache[id]=module;modules[id](module,module.exports,require);return module.exports}})();`
const disk = () => ({ ...previewReport().disk, mount: '/demo', at: Date.now() })
const permissionDenied = process.env.DEEPCLEAN_PREVIEW_FDA === 'denied'
const pythonMissing = process.env.DEEPCLEAN_PREVIEW_PYTHON === 'missing'
const pythonError = { errorCode: 'python_unavailable', error: '示例环境：找不到可用的 Python 3' }
let updateMode = 'available'
let fdaRevision = 0
let state
let software = { items: [], sources: [], jobs: [], at: 0, token: 'preview-software' }
let softwarePlans = new Map()
function reset(data, expired = false) {
  const now = Date.now()
  const history = data ? [
    { at: now - 14 * 86400000, platform: 'darwin', free: 88e9, total: 228e9, elapsed: 19, safeKb: 900000, cacheKb: 1700000, devKb: 2600000, totalKb: 5200000 },
    { at: now - 7 * 86400000, platform: 'darwin', free: 91e9, total: 228e9, elapsed: 20, safeKb: 800000, cacheKb: 1800000, devKb: 2700000, totalKb: 5300000 },
    { at: now - 2 * 86400000, platform: 'darwin', free: 93e9, total: 228e9, elapsed: 21, safeKb: 800000, cacheKb: 1800000, devKb: 2800000, totalKb: 5400000 },
  ] : []
  const derivedData = '/demo/Library/Developer/Xcode/DerivedData'
  const day = 86400000
  const gb = 1024 * 1024
  const batches = data ? [{
    batchId: 'demo-browser', at: now - 2 * day, count: 1, restorable: 1,
    items: [{ from: '/demo/Library/Caches/Chrome', to: '/demo-trash/Chrome', exists: true, kb: 3.2 * gb, category: 'browser' }],
  }, {
    batchId: 'demo-previous', at: now - 6 * day, count: 3, restorable: 0, restored: 1, purged: true,
    // 演示同一批次分流：1 GB 已恢复，5 GB 已永久删除。
    items: [
      { from: derivedData, to: '/demo-trash/DerivedData', exists: false, deleted: true, deletedAt: now - day, kb: 1.6 * gb, category: 'dev' },
      { from: '/demo/.npm/_cacache', to: '/demo-trash/_cacache', exists: false, restored: true, restoredAt: now - 4 * day, kb: 1 * gb, category: 'dev' },
      { from: '/demo/.gradle/caches', to: '/demo-trash/gradle', exists: false, deleted: true, deletedAt: now - day, kb: 3.4 * gb, category: 'dev' },
    ],
  }] : []
  state = { scenario: `${!!data}:${!!expired}`, report: data ? previewReport() : null, at: data ? now - (expired ? 11 * 60000 : 0) : 0, scan: { status: 'idle' }, startedAt: 0, whitelist: [], history, batches, requests: [], removed: [] }
}
reset(false)
function updateScan() {
  if (state.scan.status !== 'running') return
  const elapsed = Date.now() - state.startedAt
  if (pythonMissing) {
    state.scan = { ...state.scan, status: 'error', ...pythonError }
    return
  }
  if (permissionDenied) {
    state.scan = { status: 'error', progress: 0, errorCode: 'full_disk_access_required', error: '示例环境：完全磁盘访问权限未授权', fda: { status: 'denied', revision: state.scanFdaRevision } }
    return
  }
  if (elapsed > 3000) { state.report = previewReport(); state.at = Date.now(); state.scan = { status: 'done', full: true, progress: 100, elapsed: 3, stage: '完成', fda: { status: 'granted', revision: state.scanFdaRevision } } }
  else state.scan = { status: 'running', progress: Math.min(95, Math.round(elapsed / 32)), elapsed: Math.floor(elapsed / 1000), stage: '扫描开发缓存' }
}
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DeepClean · 示例数据预览</title><style>html,body,#root{height:100%;margin:0}body{background:#fff}</style></head><body><div id="root"></div><script src="/runtime.js"></script><script>window.__ModuleLoader__={load(def){window.panelDefinition=def}};window.__previewErrors=[];window.addEventListener('error',e=>window.__previewErrors.push(e.message));window.addEventListener('unhandledrejection',e=>window.__previewErrors.push(String(e.reason)));</script><script src="/client.js"></script><script>(async()=>{const q=new URLSearchParams(location.search);await fetch('/__preview/reset?data='+q.get('data')+'&expired='+q.get('expired')+'&update='+q.get('update'));const React=require('react'),mod=window.panelDefinition.factory(require);let Panel;window.__previewAiPrompts=[];const previewAi={available:true,ask:async(text)=>{if(q.get('ai')==='no-session')return 'no-session';window.__previewAiPrompts.push(text);console.log('[preview AI prompt]\\n'+text);return 'sent'}};mod.apply({slots:{inject(_n,cb){cb()},register(spec,comp){if(spec.name==='main')Panel=comp;return()=>{}}}});require('react-dom/client').createRoot(document.getElementById('root')).render(React.createElement(Panel,{ai:previewAi}));if(q.get('dialog')==='1')setTimeout(()=>{const b=document.querySelector('.dc-update-badge');if(b)b.click()},400);if(q.get('view')==='settings')setTimeout(()=>{[...document.querySelectorAll('.dc-nav button')].find(b=>b.textContent.trim()==='设置')?.click()},400);})();</script></body></html>`
const quarantine = () => {
  const batches = state.batches.filter((b) => b.restorable > 0)
  const kbOf = (b) => b.items.filter(i => i.exists).reduce((m, i) => m + (Number(i.kb) || 0), 0)
  return {
    root: '/demo/.Trash',
    kb: batches.reduce((n, b) => n + kbOf(b), 0),
    files: batches.reduce((n, b) => n + b.restorable, 0),
    batches: batches.map((b) => ({ batchId: b.batchId, kb: kbOf(b), files: b.restorable, at: Number(b.at) || Date.now() })),
    truncated: false,
    systemTrashKb: 204800,
  }
}
function finishBatch(batch, action) {
  if (!batch) return []
  const items = batch.items.filter(item => item.exists)
  const at = Date.now()
  for (const item of items) {
    item.exists = false
    item[action] = true
    item[action + 'At'] = at
  }
  batch.restorable = 0
  batch.restored = batch.items.filter(item => item.restored).length
  batch.purged = batch.items.some(item => item.deleted)
  return items
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const json = (body, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)) }
  const bytes = (file, type) => { res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(fs.readFileSync(file)) }
  try {
    if (url.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(html) }
    if (url.pathname === '/runtime.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end(runtime) }
    if (url.pathname === '/client.js') return bytes(path.join(root, 'lib/client.js'), 'text/javascript')
    if (url.pathname === '/dsh-deepclean/assets/disk.png') return bytes(path.join(root, 'resources/images/disk.png'), 'image/png')
    if (url.pathname === '/__preview/reset') { const data = url.searchParams.get('data') === '1'; const expired = url.searchParams.get('expired') === '1'; updateMode = url.searchParams.get('update') || 'available'; if (state.scenario !== `${data}:${expired}`) reset(data, expired); return json({ demo: true }) }
    if (url.pathname === '/__preview/state') return json({ ...state, console: 'Browser exceptions are also captured in window.__previewErrors' })
    let body = ''
    for await (const chunk of req) body += chunk
    body = body ? JSON.parse(body) : {}
    const api = url.pathname.replace('/dsh-deepclean/api', '')
    if (req.method !== 'GET') state.requests.push({ api, body })
    updateScan()
    if (api === '/software') return json(software)
    if (api === '/software/open') return json({ ok: true })
    if (api === '/software/scan') { software = { ...software, ...softwareInventory() }; return json(software, 202) }
    if (api === '/software/plan') {
      const item = software.items.find(i => i.id === body.itemId)
      if (!item || !item.executable) return json({ error: 'not_found' }, 409)
      const plan = { id: 'plan-' + Date.now(), item, expiresAt: Date.now() + 600000, size: { bytes: 38 * 1024 ** 2, partial: false }, reversible: item.action === 'move-app' }
      softwarePlans.set(plan.id, plan)
      return json(plan)
    }
    if (api === '/software/execute') {
      const plan = softwarePlans.get(body.planId)
      if (!plan || body.confirmed !== true) return json({ error: 'plan_missing' }, 409)
      if (software.active) return json({ error: 'busy' }, 409)
      softwarePlans.delete(plan.id)
      const job = { id: 'job-' + Date.now(), item: plan.item, status: 'running', startedAt: Date.now() }
      software.jobs.unshift(job); software.active = job.id
      setTimeout(() => {
        job.status = process.env.DEEPCLEAN_PREVIEW_SOFTWARE === 'failed' ? 'failed' : 'completed'
        if (job.status === 'completed') software.items = software.items.filter(i => i.id !== job.item.id)
        else job.error = 'still_installed'
        software.active = null; job.finishedAt = Date.now()
      }, 1800)
      return json(job, 202)
    }
    if (api === '/update-check') {
      const at = Date.now()
      if (updateMode === 'none') return json({ supported: true, reason: 'up_to_date', updatable: true, updateAvailable: false, installedVersion: '0.13.1', latestVersion: '0.13.1', checkedAt: at })
      if (updateMode === 'link') return json({ supported: true, reason: 'not_updatable', updatable: false, updateAvailable: false, installedVersion: '0.13.1', latestVersion: '', checkedAt: at })
      if (updateMode === 'error') return json({ supported: false, reason: 'manager_unavailable', updatable: false, updateAvailable: false, installedVersion: '0.13.1', latestVersion: '', checkedAt: at })
      return json({ supported: true, reason: '', updatable: true, updateAvailable: true, installedVersion: '0.13.1', latestVersion: '0.14.0', checkedAt: at })
    }
    if (api === '/update') {
      if (body.confirm !== true) return json({ error: 'invalid_request' }, 400)
      return json({ ok: true, from: '0.13.1', to: '0.14.0', application: 'restart-required', stage: 'install', restartRequired: true })
    }
    if (api === '/overview') return json({ at: state.at, report: state.report, disk: disk(), scan: state.scan, whitelist: state.whitelist, platform: pythonMissing ? 'win32' : 'darwin', history: state.history, cleanBatches: state.batches, quarantine: quarantine() })
    if (api === '/quarantine') return json(quarantine())
    if (api === '/reclaim') { const n = (body.paths || []).length; return json({ logicalBytes: n * 104857600, allocatedBytes: n * 100663296, files: n * 12, truncated: false, snapshots: 2 }) }
    if (api === '/quarantine/purge' || api === '/purge') {
      const ids = api === '/purge' ? [body.batchId] : body.batchIds
      const targets = state.batches.filter(b => b.restorable > 0 && (ids ? ids.includes(b.batchId) : body.all === true))
      const items = targets.flatMap(batch => finishBatch(batch, 'deleted'))
      const summary = { purged: items.length, freedBytes: Math.round(items.reduce((n, i) => n + (i.kb || 0) * 1024, 0)) }
      const results = items.map(i => ({ from: i.from, to: i.to, ok: true }))
      return json(api === '/purge' ? { batchId: body.batchId, ...summary, results } : { total: summary, batches: [], results })
    }
    if (api === '/disk') return json({ disk: disk() })
    if (api === '/state') { const ids = state.batches.filter(b => b.restorable > 0).map(b => b.batchId); return json({ canUndo: ids.length > 0, lastBatchId: ids[ids.length - 1] || null, lastBatchIds: ids }) }
    if (api === '/scan' && req.method === 'POST') { state.startedAt = Date.now(); state.scanFdaRevision = ++fdaRevision; state.scan = { status: 'running', progress: 0, full: !!body.full }; return json({ scan: state.scan }) }
    if (api === '/scan') return json({ scan: state.scan })
    if (api === '/scan/cancel') { state.scan = { status: 'canceled', progress: 0 }; return json({ scan: state.scan }) }
    if (api === '/permissions') {
      if (pythonMissing) return json(pythonError, 500)
      const result = permissionDenied
        ? { code: 2, status: 'denied', text: '权限检查：macOS 完全磁盘访问 = **未授权**（示例环境模拟）\n\n1. 打开「系统设置」→「隐私与安全性」→「完全磁盘访问权限」\n2. 点「+」添加 DeepSeek Harness（或打开已有开关）\n3. 完全退出并重新打开 DeepSeek Harness' }
        : { code: 0, status: 'ok', text: '示例环境：权限检查通过' }
      return json({ ...result, fda: { status: permissionDenied ? 'denied' : 'granted', revision: ++fdaRevision } })
    }
    if (api === '/open-privacy-settings') return json({ ok: true })
    if (api === '/clean') {
      if (!state.report || Date.now() - state.at > 600000) return json({ error: '扫描结果已过期，请先重新扫描' }, 409)
      const results = (body.paths || []).map(p => ({ path: p, ok: p.startsWith('/demo/') && !state.whitelist.some(w => p === w || p.startsWith(w + '/')), to: '/demo-trash/' + path.basename(p) }))
      const moved = results.filter(r => r.ok).length
      const batchId = String(Date.now())
      const items = results.filter(r => r.ok).map((r, i) => ({ from: r.path, to: r.to, exists: true, kb: 1024 * (i + 1) }))
      state.batches.unshift({ batchId, at: Date.now(), count: moved, restorable: moved, items })
      return json({ batchId, batchIds: [batchId], moved, results, batches: [{ batchId, moved, results }], auditOk: true })
    }
    if (api === '/undo' || api === '/restore') {
      const ids = Array.isArray(body.batchIds) ? body.batchIds : (body.batchId ? [body.batchId] : [])
      const targets = ids.length ? state.batches.filter(b => ids.includes(b.batchId)) : [state.batches[0]]
      const results = targets.flatMap(batch => finishBatch(batch, 'restored')).map(i => ({ path: i.from, ok: true }))
      return json({ batchId: targets[0]?.batchId, results, summary: { ok: results.length, failed: 0, codes: {} }, auditOk: true })
    }
    if (api === '/whitelist') { state.whitelist = body.paths || []; return json({ paths: state.whitelist }) }
    if (api === '/photos/scan' && pythonMissing) {
      state.photosScan = { status: 'error', ...pythonError }
      return json({ scan: state.photosScan }, 202)
    }
    if (api === '/photos') return json({ scan: state.photosScan || { status: 'idle' }, result: null })
    if (api === '/tree') {
      if (pythonMissing) return json(pythonError, 400)
      const folder = url.searchParams.get('path') || '/demo'
      const root = folder === '/demo'
      const bigFiles = [
        { path: folder + '/Archives/preview-4k.mkv', kb: 4200000, mtime: Math.floor(Date.now() / 1000) - 86400 * 120, shared: true },
        { path: folder + '/demo-video.mp4', kb: 900000, mtime: Math.floor(Date.now() / 1000) - 86400 * 20 },
      ]
      const children = root
        ? ['Library', 'Documents', 'Downloads', '.cache', 'Pictures', 'Desktop', 'Music', 'Other'].map((name, i) => ({ name, path: '/demo/' + name, isDir: true, kb: [32000000, 8000000, 3000000, 2000000, 1000000, 500000, 250000, 100000][i] }))
          .concat([{ name: 'hardlink-demo.mkv', path: '/demo/hardlink-demo.mkv', isDir: false, kb: 0, shared: true, dedup: true }])
        : [{ name: 'Archives', path: folder + '/Archives', isDir: true, kb: 3000000 }]
      return json({
        path: folder, at: Date.now(), metric: 'allocated', unavailable: 1, skipped: 2, partial: true,
        skippedCloud: root ? 1 : 0, cloudFiles: root ? 12 : 0,
        sharedFiles: root ? 2 : 0, sharedDupKb: root ? 4200000 : 0,
        bigFilesCap: root ? 50 : 20, bigFiles, children,
      })
    }
    if (api === '/destination') { const p=url.searchParams.get('path'); return json({path:p,parent:p==='/Backup'?null:'/Backup',free:500e9,folders:p==='/Backup'?[{name:'Archive',path:'/Backup/Archive'}]:[]}) }
    if (api === '/move' && req.method === 'POST') { state.move={status:'running',done:0,total:body.paths.length,destination:body.destination,startedAt:Date.now(),paths:body.paths,results:[]}; return json({count:body.paths.length,move:state.move}) }
    if (api === '/move/cancel') {state.move.status='canceled';return json({ok:true})}
    if (api === '/move') { if(state.move?.status==='running' && Date.now()-state.move.startedAt>1500){state.move.status='done';state.move.done=state.move.total;state.move.results=state.move.paths.map(path=>({path,ok:true,to:state.move.destination+'/'+path.split('/').pop()}))} return json({move:state.move || {status:'idle'}}) }
    if (api === '/reveal') return json({ok:true})
    if (api === '/volumes') return json({ volumes: [{path:'/Backup',label:'Backup',free:500e9}] })
    return json({ error: 'Preview endpoint unavailable' }, 404)
  } catch (err) { json({ error: err.message }, 500) }
})
const port = Number(process.env.DEEPCLEAN_PREVIEW_PORT || 4173)
server.listen(port, '127.0.0.1', () => console.log(`Isolated preview: http://127.0.0.1:${port} (synthetic data only)`))
