/** Isolated UI preview: serves the actual handwritten bundle with in-memory demo APIs.
 * Run: node scripts/preview.mjs (no build, install, or user-file mutations).
 * ?data=1 opens with scan results. ?data=1&expired=1 previews an expired scan.
 * DEEPCLEAN_PREVIEW_FDA=denied previews the Full Disk Access banner (macOS denied state).
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { previewReport } from '../tests/fixtures/preview-report.mjs'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(root, 'package.json'))
const domRequire = createRequire(require.resolve('react-dom/client'))
const packages = { react: ['react', 'react.production.js'], 'react-dom': ['react-dom', 'react-dom.production.js'], 'react-dom/client': ['react-dom', 'react-dom-client.production.js'], scheduler: ['scheduler', 'scheduler.production.js'] }
const factories = Object.entries(packages).map(([name, [pkg, file]]) => `${JSON.stringify(name)}:function(module,exports,require){${fs.readFileSync(path.join(path.dirname(domRequire.resolve(pkg)), 'cjs', file), 'utf8')}\n}`).join(',')
const runtime = `(()=>{const modules={${factories}},cache={};window.require=function require(id){if(cache[id])return cache[id].exports;if(!modules[id])throw Error('Unknown preview module '+id);const module={exports:{}};cache[id]=module;modules[id](module,module.exports,require);return module.exports}})();`
const disk = () => ({ ...previewReport().disk, mount: '/demo', at: Date.now() })
let state
function reset(data, expired = false) {
  const now = Date.now()
  const history = data ? [
    { at: now - 14 * 86400000, platform: 'darwin', free: 88e9, total: 228e9, elapsed: 19, safeKb: 900000, cacheKb: 1700000, devKb: 2600000, totalKb: 5200000 },
    { at: now - 7 * 86400000, platform: 'darwin', free: 91e9, total: 228e9, elapsed: 20, safeKb: 800000, cacheKb: 1800000, devKb: 2700000, totalKb: 5300000 },
    { at: now - 2 * 86400000, platform: 'darwin', free: 93e9, total: 228e9, elapsed: 21, safeKb: 800000, cacheKb: 1800000, devKb: 2800000, totalKb: 5400000 },
  ] : []
  const derivedData = '/demo/Library/Developer/Xcode/DerivedData'
  const batches = data ? [{
    batchId: 'demo-previous', at: new Date(now - 3 * 86400000).toISOString(), count: 3, restorable: 3,
    // 演示「清了又长回来」：清理时与当前报告里的 DerivedData 都是 1.6 GB。
    items: [
      { from: derivedData, to: '/demo-trash/DerivedData', exists: true, kb: 1.6 * 1024 * 1024, category: 'dev' },
      { from: '/demo/.npm/_cacache', to: '/demo-trash/_cacache', exists: true, kb: .8 * 1024 * 1024, category: 'dev' },
    ],
  }] : []
  state = { scenario: `${!!data}:${!!expired}`, report: data ? previewReport() : null, at: data ? now - (expired ? 11 * 60000 : 0) : 0, scan: { status: 'idle' }, startedAt: 0, whitelist: [], history, batches, requests: [], removed: [] }
}
reset(false)
function updateScan() {
  if (state.scan.status !== 'running') return
  const elapsed = Date.now() - state.startedAt
  if (elapsed > 3000) { state.report = previewReport(); state.at = Date.now(); state.scan = { status: 'done', full: true, progress: 100, elapsed: 3, stage: '完成' } }
  else state.scan = { status: 'running', progress: Math.min(95, Math.round(elapsed / 32)), elapsed: Math.floor(elapsed / 1000), stage: '扫描开发缓存' }
}
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DeepClean · 示例数据预览</title><style>html,body,#root{height:100%;margin:0}body{background:#fff}</style></head><body><div id="root"></div><script src="/runtime.js"></script><script>window.__ModuleLoader__={load(def){window.panelDefinition=def}};window.__previewErrors=[];window.addEventListener('error',e=>window.__previewErrors.push(e.message));window.addEventListener('unhandledrejection',e=>window.__previewErrors.push(String(e.reason)));</script><script src="/client.js"></script><script>(async()=>{const q=new URLSearchParams(location.search);await fetch('/__preview/reset?data='+q.get('data')+'&expired='+q.get('expired'));const React=require('react'),mod=window.panelDefinition.factory(require);let Panel;window.__previewAiPrompts=[];const previewAi={available:true,ask:async(text)=>{window.__previewAiPrompts.push(text);console.log('[preview AI prompt]\n'+text);return 'sent'}};mod.apply({slots:{inject(_n,cb){cb()},register(spec,comp){if(spec.name==='main')Panel=comp;return()=>{}}}});require('react-dom/client').createRoot(document.getElementById('root')).render(React.createElement(Panel,{ai:previewAi}));})();</script></body></html>`
const quarantine = () => {
  const batches = state.batches.filter((b) => b.restorable > 0)
  const kbOf = (b) => (b.items || []).reduce((m, i) => m + (Number(i.kb) || 0), 0)
  return {
    root: '/demo/.Trash',
    kb: batches.reduce((n, b) => n + kbOf(b), 0),
    files: batches.reduce((n, b) => n + (b.items || []).length, 0),
    batches: batches.map((b) => ({ batchId: b.batchId, kb: kbOf(b), files: (b.items || []).length, at: Number(b.at) || Date.now() })),
    truncated: false,
    systemTrashKb: 204800,
  }
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
    if (url.pathname === '/__preview/reset') { const data = url.searchParams.get('data') === '1'; const expired = url.searchParams.get('expired') === '1'; if (state.scenario !== `${data}:${expired}`) reset(data, expired); return json({ demo: true }) }
    if (url.pathname === '/__preview/state') return json({ ...state, console: 'Browser exceptions are also captured in window.__previewErrors' })
    let body = ''
    for await (const chunk of req) body += chunk
    body = body ? JSON.parse(body) : {}
    const api = url.pathname.replace('/dsh-deepclean/api', '')
    if (req.method !== 'GET') state.requests.push({ api, body })
    updateScan()
    if (api === '/overview') return json({ at: state.at, report: state.report, disk: disk(), scan: state.scan, whitelist: state.whitelist, platform: 'darwin', history: state.history, cleanBatches: state.batches, quarantine: quarantine() })
    if (api === '/quarantine') return json(quarantine())
    if (api === '/reclaim') { const n = (body.paths || []).length; return json({ logicalBytes: n * 104857600, allocatedBytes: n * 100663296, files: n * 12, truncated: false, snapshots: 2 }) }
    if (api === '/quarantine/purge') { const ids = Array.isArray(body.batchIds) && body.batchIds.length ? new Set(body.batchIds) : null; let purged = 0; for (const b of state.batches) { if (b.restorable > 0 && (!ids || ids.has(b.batchId))) { purged += (b.items || []).length; b.restorable = 0 } } return json({ total: { purged, freedBytes: purged * 1048576 }, batches: [], results: [] }) }
    if (api === '/purge') { const b = state.batches.find((x) => x.batchId === body.batchId) || state.batches[0]; if (b) b.restorable = 0; return json({ batchId: b && b.batchId, purged: 1, freedBytes: 1048576, results: [] }) }
    if (api === '/disk') return json({ disk: disk() })
    if (api === '/state') { const ids = state.batches.filter(b => b.restorable > 0).map(b => b.batchId); return json({ canUndo: ids.length > 0, lastBatchId: ids[ids.length - 1] || null, lastBatchIds: ids }) }
    if (api === '/scan' && req.method === 'POST') { state.startedAt = Date.now(); state.scan = { status: 'running', progress: 0 }; return json({ scan: state.scan }) }
    if (api === '/scan') return json({ scan: state.scan })
    if (api === '/scan/cancel') { state.scan = { status: 'canceled', progress: 0 }; return json({ scan: state.scan }) }
    if (api === '/permissions') {
      const denied = process.env.DEEPCLEAN_PREVIEW_FDA === 'denied'
      return json(denied
        ? { code: 2, status: 'denied', text: '权限检查：macOS 完全磁盘访问 = **未授权**（示例环境模拟）\n\n1. 打开「系统设置」→「隐私与安全性」→「完全磁盘访问权限」\n2. 点「+」添加 DeepSeek Harness（或打开已有开关）\n3. 完全退出并重新打开 DeepSeek Harness' }
        : { code: 0, status: 'ok', text: '示例环境：权限检查通过' })
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
    if (api === '/undo' || api === '/restore') { const ids = Array.isArray(body.batchIds) ? body.batchIds : (body.batchId ? [body.batchId] : []); const targets = ids.length ? state.batches.filter(b => ids.includes(b.batchId)) : [state.batches[0]]; const results = []; for (const batch of targets) { if (!batch) continue; batch.restorable = 0; results.push(...(batch.items || []).map(i => ({ path: i.from, ok: true }))); } return json({ batchId: targets[0] && targets[0].batchId, results, summary: { ok: results.length, failed: 0, codes: {} }, auditOk: true }) }
    if (api === '/whitelist') { state.whitelist = body.paths || []; return json({ paths: state.whitelist }) }
    if (api === '/photos') return json({ scan: { status: 'idle' }, result: null })
    if (api === '/tree') {
      const folder = url.searchParams.get('path') || '/demo'
      const bigFiles = [
        { path: folder + '/Archives/preview-4k.mkv', kb: 4200000, mtime: Math.floor(Date.now() / 1000) - 86400 * 120 },
        { path: folder + '/demo-video.mp4', kb: 900000, mtime: Math.floor(Date.now() / 1000) - 86400 * 20 },
      ]
      return json({ path: folder, at: Date.now(), metric: 'allocated', unavailable: 1, skipped: 2, bigFiles, children: folder === '/demo' ? ['Library', 'Documents', 'Downloads', '.cache', 'Pictures', 'Desktop', 'Music', 'Other'].map((name,i) => ({ name, path: '/demo/' + name, isDir: true, kb: [32000000,8000000,3000000,2000000,1000000,500000,250000,100000][i] })) : [{name:'Archives',path:folder+'/Archives',isDir:true,kb:3000000}] })
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
