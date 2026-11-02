import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { renderToString } from 'react-dom/server'

const require = createRequire(import.meta.url)
const base = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')

function renderView(mutate, lang = 'zh') {
  const source = mutate(base)
  globalThis.localStorage = {
    getItem: (k) => (k === 'deepclean-lang' ? lang : k === 'deepclean-safety-ok' ? '1' : null),
    setItem: () => {},
  }
  let def
  globalThis.window = { __ModuleLoader__: { load(d) { def = d } } }
  eval(source)
  const mod = def.factory((id) => require(id))
  const regs = []
  mod.apply({ slots: { inject(_n, cb) { cb() }, register(s, c) { regs.push({ s, c }); return () => {} } } })
  const Panel = regs.find((r) => r.s.name === 'main').c
  return renderToString(require('react').createElement(Panel))
}

const cases = [
  ['home', (s) => s],
  ['space-tree', (s) => s.replace('useState("home")', 'useState("space")')],
  ['space-large', (s) => s.replace('useState("home")', 'useState("space")').replace('useState("tree")', 'useState("large")')],
  ['clean-junk', (s) => s.replace('useState("home")', 'useState("clean")')],
  ['clean-photos', (s) => s.replace('useState("home")', 'useState("clean")').replace('useState("junk")', 'useState("photos")')],
  ['history', (s) => s.replace('useState("home")', 'useState("history")')],
  ['settings', (s) => s.replace('useState("home")', 'useState("settings")')],
  ['home-wizard', (s) => s.replace('open: false, phase: "idle"', 'open: true, phase: "review"')],
  ['home-wizard-confirm', (s) => s.replace('open: false, phase: "idle"', 'open: true, phase: "confirm"')],
]

for (const [name, mutate] of cases) {
  test(`page renders: ${name}`, () => {
    assert.ok(renderView(mutate).length > 100)
  })
}

test('english pages render for every view', () => {
  for (const [name, mutate] of cases) {
    const html = renderView(mutate, 'en')
    assert.ok(html.length > 100, `${name} english render too short`)
  }
})

const mockOverview = {
  at: Date.now(),
  platform: 'darwin',
  whitelist: [],
  disk: { total: 500 * 1024 ** 3, used: 400 * 1024 ** 3, free: 100 * 1024 ** 3, mount: '/', at: Date.now() },
  history: [{ at: Date.now() - 86400000, free: 100e9, totalKb: 500000, elapsed: 20 }],
  cleanBatches: [{ batchId: 'b1', at: Date.now() - 3600000, count: 3, restorable: 2, items: [] }],
  scan: { status: 'done', progress: 100, stage: '完成', elapsed: 20, hasReport: true },
  report: {
    disk: { total: 500e9, used: 400e9, free: 100e9 },
    fda: { status: 'granted', detail: '4/4' },
    elapsed: 20,
    estimate: { safeKb: 200000, cacheKb: 50000, devKb: 120000, overlapKb: 0, totalKb: 370000 },
    leftoverGroups: [
      { baseId: 'com.test.media', name: 'Test Media', kb: 200000, bucket: 'safe', count: 1, paths: ['/tmp/x/media'], why: '媒体类 App 已卸载，缓存为主' },
      { baseId: 'com.test.chat', name: 'Test Chat', kb: 90000, bucket: 'confirm', count: 2, paths: ['/tmp/c1', '/tmp/c2'], why: '可能含聊天记录/文档/笔记' },
    ],
    caches: [{ path: '/tmp/cache-a', kb: 50000, system: false }, { path: '/tmp/cache-sys', kb: 10000, system: true }],
    devCaches: [
      { path: '/tmp/dev-a', kb: 60000, advice: '缓存，可重建', cleanable: true },
      { path: '/tmp/dev-b', kb: 60000, advice: 'Docker 镜像/卷；删了会丢容器数据，需确认', cleanable: false },
    ],
    browsers: [{ name: 'Chrome', path: '/tmp/browser', kb: 8000 }],
    special: [{ app: '企业微信', base: '/tmp/wecom', totalKb: 1000, categories: [
      { name: '缓存', kb: 500, paths: ['/tmp/wecom/c'], cleanable: true },
      { name: '聊天缓存', kb: 500, paths: ['/tmp/wecom/m'], cleanable: false },
    ] }],
    bigFiles: [{ path: '/tmp/big.bin', kb: 400000, ext: '.bin', mtime: 1700000000, atime: 1700000000, category: '工具数据' }],
  },
}
const mockPhotos = { scanned: 100, compared: 100, elapsed: 5, groups: [
  { id: 'g1', items: [{ path: '/tmp/p1/a.jpg', kb: 2000, mtime: 1 }, { path: '/tmp/p2/b.jpg', kb: 1500, mtime: 2 }], totalKb: 3500, wastedKb: 1500 },
] }

function renderWithData(mutate, lang, overview = mockOverview) {
  const source = mutate(base)
    .replace('const [overview, setOverview] = useState(null);', 'const [overview, setOverview] = useState(globalThis.__TEST_OVERVIEW__ || null);')
    .replace('const [liveDisk, setLiveDisk] = useState(null);', 'const [liveDisk, setLiveDisk] = useState(globalThis.__TEST_DISK__ || null);')
    .replace('const [result, setResult] = useState(null);', 'const [result, setResult] = useState(globalThis.__TEST_PHOTOS__ || null);')
  globalThis.__TEST_OVERVIEW__ = overview
  globalThis.__TEST_DISK__ = overview.disk || null
  globalThis.__TEST_PHOTOS__ = mockPhotos
  globalThis.localStorage = {
    getItem: (k) => (k === 'deepclean-lang' ? lang : k === 'deepclean-safety-ok' ? '1' : null),
    setItem: () => {},
  }
  let def
  globalThis.window = { __ModuleLoader__: { load(d) { def = d } } }
  eval(source)
  const mod = def.factory((id) => require(id))
  const regs = []
  mod.apply({ slots: { inject(_n, cb) { cb() }, register(s, c) { regs.push({ s, c }); return () => {} } } })
  const Panel = regs.find((r) => r.s.name === 'main').c
  return renderToString(require('react').createElement(Panel))
}

for (const [name, mutate] of cases) {
  test(`page renders with data: ${name}`, () => {
    const html = renderWithData(mutate, 'zh')
    assert.ok(html.length > 100)
  })
  test(`page renders with data (english): ${name}`, () => {
    const html = renderWithData(mutate, 'en')
    assert.ok(html.length > 100)
  })
}

test('wizard shows recommended items with data', () => {
  const mutate = cases.find(([n]) => n === 'home-wizard')[1]
  const html = renderWithData(mutate, 'zh')
  assert.match(html, /体检结果/)
  assert.match(html, /清理推荐项/)
  assert.match(html, /Test Media/)
})

test('clean page separates content categories, risks and actions', () => {
  const mutate = cases.find(([n]) => n === 'clean-junk')[1]
  const zh = renderWithData(mutate, 'zh')
  for (const t of ['内容分类', '开发缓存', '浏览器缓存', '处理影响', '风险筛选', '移到废纸篓', '更多操作']) assert.ok(zh.includes(t), t)
  assert.ok(!zh.includes('选择 ≥'), 'advanced batch operations should not crowd the toolbar')
  const en = renderWithData(mutate, 'en')
  for (const t of ['Categories', 'Developer caches', 'Impact', 'Move to Trash', 'More actions']) assert.ok(en.includes(t), t)
})

test('photos page shows keep rules, folder filter and compare', () => {
  const mutate = cases.find(([n]) => n === 'clean-photos')[1]
  const zh = renderWithData(mutate, 'zh')
  for (const t of ['保留策略', '对比', '全部文件夹']) assert.match(zh, new RegExp(t))
  const en = renderWithData(mutate, 'en')
  for (const t of ['Keep rule', 'Compare', 'All folders']) assert.match(en, new RegExp(t))
})

const noScanOverview = {
  at: 0,
  platform: 'darwin',
  whitelist: [],
  history: [],
  cleanBatches: [],
  scan: { status: 'idle', progress: 0, stage: '', elapsed: 0, hasReport: false },
  report: null,
  disk: { total: 500 * 1024 ** 3, used: 400 * 1024 ** 3, free: 100 * 1024 ** 3, mount: '/', at: Date.now() },
}

test('home shows live disk total/used before any scan', () => {
  const html = renderWithData((s) => s, 'zh', noScanOverview)
  assert.match(html, /已用 400\.0 GB/)
  assert.match(html, /总容量 500\.0 GB/)
  assert.match(html, /当前可用 100\.0 GB/)
  assert.match(html, /实时/)
  assert.doesNotMatch(html, /可用 0B/, 'opening the panel must not show 0 B when a live snapshot exists')
  assert.match(html, /看看哪些空间可以整理/)
})

test('english home shows live disk numbers before any scan', () => {
  const html = renderWithData((s) => s, 'en', noScanOverview)
  assert.match(html, /Used 400\.0 GB/)
  assert.match(html, /Total 500\.0 GB/)
  assert.match(html, /100\.0 GB available/)
  assert.match(html, /Live/)
})

test('home falls back to scan report disk when host has no live snapshot', () => {
  const html = renderWithData((s) => s, 'zh', { ...mockOverview, disk: undefined })
  assert.match(html, /已用 372\.5 GB/)
  assert.match(html, /总容量 465\.7 GB/)
  assert.doesNotMatch(html, /实时/)
})


test('scan-in-progress shows pending categories instead of zero cleanup results', () => {
  const mutate = (s) => cases.find(([n]) => n === 'clean-junk')[1](s)
    .replaceAll('useState({ status: "idle" })', 'useState({ status: "running", progress: 40 })')
  const html = renderWithData(mutate, 'zh', noScanOverview)
  assert.ok(html.includes('待统计'))
  assert.ok(html.includes('正在查找可整理的文件'))
  assert.ok(!html.includes('0 项 · 0B'))
  assert.ok(!html.includes('<table class="dc-file-table"'))
})

test('protected paths and read-only developer data never enter movable totals', () => {
  const mutate = cases.find(([n]) => n === 'clean-junk')[1]
  const overview = { ...mockOverview, whitelist: ['/tmp/dev-a'], report: { ...mockOverview.report,
    leftoverGroups: [], caches: [], browsers: [], special: [] } }
  const html = renderWithData(mutate, 'zh', overview)
  assert.ok(html.includes('受保护'))
  assert.ok(html.includes('需确认'))
  assert.match(html, /建议处理<strong>0 B<\/strong>/)
  assert.ok(!html.includes('aria-label="选择 dev-a"'))
  assert.ok(!html.includes('aria-label="选择 dev-b"'))
})

test('overlapping browser/developer caches are counted once', () => {
  const mutate = cases.find(([n]) => n === 'clean-junk')[1]
  const overview = { ...mockOverview, report: { ...mockOverview.report, leftoverGroups: [], special: [],
    devCaches: [{ path: '/demo/Caches/tool', kb: 1024, cleanable: true }],
    browsers: [{ name: 'Browser', path: '/demo/Caches/browser', kb: 1024 }],
    caches: [{ path: '/demo/Caches', kb: 2048 }, { path: '/demo/Caches/tool', kb: 1024 }] } }
  const html = renderWithData(mutate, 'zh', overview)
  assert.match(html, /建议处理<strong>2 MB<\/strong>/)
})

test('expired reports allow inspection but disable cleanup selection', () => {
  const html = renderWithData(cases.find(([n]) => n === 'clean-junk')[1], 'zh', { ...mockOverview, at: Date.now() - 11 * 60000 })
  assert.ok(html.includes('扫描结果已过期'))
  assert.match(html, /aria-label="选择 dev-a"[^>]*disabled=""/)
})

test('space offers full scan for missing coverage and separates filtered empty results', () => {
  const mutate = cases.find(([n]) => n === 'space-large')[1]
  const empty = { ...mockOverview, report: { ...mockOverview.report, bigFiles: [] } }
  assert.match(renderWithData(mutate, 'zh', noScanOverview), /先扫描，查找占用较大的文件/)
  assert.match(renderWithData(mutate, 'zh', empty), /当前体检未覆盖大文件/)
  const full = s => mutate(s).replaceAll('const [scan, setScan] = useState({ status: "idle" });', 'const [scan, setScan] = useState({ status: "done", full: true });')
  assert.match(renderWithData(full, 'zh', empty), /没有发现大文件/)
  assert.match(renderWithData(full, 'en', empty), /No large files found/)
  const filtered = s => full(s).replace('useState("");\n            const [minSize', 'useState("unmatched");\n            const [minSize')
  assert.match(renderWithData(filtered, 'zh'), /清除筛选/)
})

test('large files from expired reports and protected locations cannot be selected', () => {
  const mutate = cases.find(([n]) => n === 'space-large')[1]
  for (const overview of [{...mockOverview, at:Date.now()-11*60000}, {...mockOverview,whitelist:['/tmp']}]) {
    const html = renderWithData(mutate,'zh',overview)
    assert.match(html,/aria-label="选择 \/tmp\/big.bin"[^>]*disabled=""/)
  }
})

test('space chart includes all items in total and aggregates the tail consistently', () => {
  const children = Array.from({length:9},(_,i)=>({path:'/demo/'+i,name:'item'+i,kb:1024,isDir:true}))
  const mutate=s=>cases.find(([n])=>n==='space-tree')[1](s).replace('const [data, setData] = useState(null);','const [data, setData] = useState('+JSON.stringify({path:'/demo',at:Date.now(),children,metric:'allocated'})+');')
  const html=renderView(mutate)
  assert.ok(html.includes('9 MB'))
  assert.ok(html.includes('item8'))
  assert.ok(html.includes('其他'))
  assert.ok(html.includes('33%'))
  assert.ok(!html.includes('NaN'))
})

test('moving all known large files does not mislabel the scan as missing coverage', () => {
  const mutate=s=>cases.find(([n])=>n==='space-large')[1](s).replace('useState({status:"idle",done:0,total:0})','useState({status:"done",done:1,total:1,results:[{path:"/tmp/big.bin",ok:true}]})')
  const html=renderWithData(mutate,'zh')
  assert.ok(html.includes('没有发现大文件'))
  assert.ok(!html.includes('当前体检未覆盖大文件，请进行完整扫描</p>'))
})
