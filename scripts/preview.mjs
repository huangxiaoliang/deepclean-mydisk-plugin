/** Isolated UI preview: serves the actual handwritten bundle with in-memory demo APIs.
 * Run: node scripts/preview.mjs (no build, install, or user-file mutations).
 * ?data=1 opens with scan results. ?data=1&expired=1 previews an expired scan.
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
  state = { scenario: `${!!data}:${!!expired}`, report: data ? previewReport() : null, at: data ? Date.now() - (expired ? 11 * 60000 : 0) : 0, scan: { status: 'idle' }, startedAt: 0, whitelist: [], batches: [{ batchId: 'demo-previous', at: Date.now() - 3600000, count: 3, restorable: 3, items: [] }], requests: [], removed: [] }
}
reset(false)
function updateScan() {
  if (state.scan.status !== 'running') return
  const elapsed = Date.now() - state.startedAt
  if (elapsed > 3000) { state.report = previewReport(); state.at = Date.now(); state.scan = { status: 'done', full: true, progress: 100, elapsed: 3, stage: '完成' } }
  else state.scan = { status: 'running', progress: Math.min(95, Math.round(elapsed / 32)), elapsed: Math.floor(elapsed / 1000), stage: '扫描开发缓存' }
}
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DeepClean · 示例数据预览</title><style>html,body,#root{height:100%;margin:0}body{background:#fff}</style></head><body><div id="root"></div><script src="/runtime.js"></script><script>window.__ModuleLoader__={load(def){window.panelDefinition=def}};window.__previewErrors=[];window.addEventListener('error',e=>window.__previewErrors.push(e.message));window.addEventListener('unhandledrejection',e=>window.__previewErrors.push(String(e.reason)));</script><script src="/client.js"></script><script>(async()=>{const q=new URLSearchParams(location.search);await fetch('/__preview/reset?data='+q.get('data')+'&expired='+q.get('expired'));const React=require('react'),mod=window.panelDefinition.factory(require);let Panel;mod.apply({slots:{inject(_n,cb){cb()},register(spec,comp){if(spec.name==='main')Panel=comp;return()=>{}}}});require('react-dom/client').createRoot(document.getElementById('root')).render(React.createElement(Panel));})();</script></body></html>`
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
    if (api === '/overview') return json({ at: state.at, report: state.report, disk: disk(), scan: state.scan, whitelist: state.whitelist, platform: 'darwin', history: [], cleanBatches: state.batches })
    if (api === '/disk') return json({ disk: disk() })
    if (api === '/state') return json({ canUndo: state.batches.some(b => b.restorable), lastBatchId: state.batches.find(b => b.restorable)?.batchId })
    if (api === '/scan' && req.method === 'POST') { state.startedAt = Date.now(); state.scan = { status: 'running', progress: 0 }; return json({ scan: state.scan }) }
    if (api === '/scan') return json({ scan: state.scan })
    if (api === '/scan/cancel') { state.scan = { status: 'canceled', progress: 0 }; return json({ scan: state.scan }) }
    if (api === '/permissions') return json({ code: 0, text: '示例环境：权限检查通过' })
    if (api === '/clean') {
      if (!state.report || Date.now() - state.at > 600000) return json({ error: '扫描结果已过期，请先重新扫描' }, 409)
      const results = (body.paths || []).map(p => ({ path: p, ok: p.startsWith('/demo/') && !state.whitelist.some(w => p === w || p.startsWith(w + '/')), to: '/demo-trash/' + path.basename(p) }))
      const moved = results.filter(r => r.ok).length
      const batchId = String(Date.now())
      state.batches.unshift({ batchId, at: Date.now(), count: moved, restorable: moved, items: results.filter(r => r.ok).map(r => ({ from: r.path, to: r.to, exists: true })) })
      return json({ batchId, moved, results })
    }
    if (api === '/undo' || api === '/restore') { const batch = state.batches.find(b => b.batchId === body.batchId) || state.batches[0]; batch.restorable = 0; return json({ results: (batch.items || []).map(i => ({ path: i.from, ok: true })) }) }
    if (api === '/whitelist') { state.whitelist = body.paths || []; return json({ paths: state.whitelist }) }
    if (api === '/photos') return json({ scan: { status: 'idle' }, result: null })
    if (api === '/tree') {
      const folder = url.searchParams.get('path') || '/demo'
      return json({ path: folder, at: Date.now(), metric: 'allocated', unavailable: 1, skipped: 2, children: folder === '/demo' ? ['Library', 'Documents', 'Downloads', '.cache', 'Pictures', 'Desktop', 'Music', 'Other'].map((name,i) => ({ name, path: '/demo/' + name, isDir: true, kb: [32000000,8000000,3000000,2000000,1000000,500000,250000,100000][i] })) : [{name:'Archives',path:folder+'/Archives',isDir:true,kb:3000000}] })
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
