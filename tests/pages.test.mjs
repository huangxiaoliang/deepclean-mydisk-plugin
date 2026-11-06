import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { renderToString } from 'react-dom/server'

const require = createRequire(import.meta.url)
// 归一化换行：Windows checkout 可能是 CRLF，而下面的视图注入依赖精确的 LF 片段。
const base = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n')

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

function renderWithData(mutate, lang, overview = mockOverview, photos = mockPhotos, ai = null) {
  const source = mutate(base)
    .replace('const [overview, setOverview] = useState(null);', 'const [overview, setOverview] = useState(globalThis.__TEST_OVERVIEW__ || null);')
    .replace('const [liveDisk, setLiveDisk] = useState(null);', 'const [liveDisk, setLiveDisk] = useState(globalThis.__TEST_DISK__ || null);')
    .replace('const [result, setResult] = useState(null);', 'const [result, setResult] = useState(globalThis.__TEST_PHOTOS__ || null);')
  globalThis.__TEST_OVERVIEW__ = overview
  globalThis.__TEST_DISK__ = overview.disk || null
  globalThis.__TEST_PHOTOS__ = photos
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
  return renderToString(require('react').createElement(Panel, ai ? { ai } : null))
}

function aiStub() {
  const calls = []
  return { calls, ai: { available: true, ask: async (text) => { calls.push(text); return 'sent' } } }
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
  assert.match(html, /扫描结果/)
  assert.match(html, /清理推荐项/)
  assert.match(html, /Test Media/)
})

test('clean page separates content categories, risks and actions', () => {
  const mutate = cases.find(([n]) => n === 'clean-junk')[1]
  const zh = renderWithData(mutate, 'zh')
  for (const t of ['内容分类', '开发缓存', '浏览器缓存', '清理影响', '风险筛选', '移到废纸篓', '更多操作']) assert.ok(zh.includes(t), t)
  assert.ok(!zh.includes('选择 ≥'), 'advanced batch operations should not crowd the toolbar')
  const en = renderWithData(mutate, 'en')
  for (const t of ['Categories', 'Developer caches', 'Cleanup impact', 'Move to Trash', 'More actions']) assert.ok(en.includes(t), t)
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

test('Full Disk Access scan failure shows one actionable notice instead of scanner output', () => {
  const blocked = (s) => s.replaceAll('const [scan, setScan] = useState({ status: "idle" });',
    'const [scan, setScan] = useState({ status: "error", errorCode: "full_disk_access_required", error: "CLI details --force" });')
  const zh = renderWithData(blocked, 'zh', noScanOverview, mockPhotos, aiStub().ai)
  assert.equal((zh.match(/class="dc-permission"/g) || []).length, 1)
  assert.match(zh, /扫描已停止，缺少完全磁盘访问权限/)
  assert.match(zh, /打开系统设置/)
  assert.match(zh, /aria-expanded="false">查看开启步骤/)
  assert.doesNotMatch(zh, /扫描失败，请重试|--force|按 ⌘Q 退出|问 AI 为什么扫不到/)

  const otherError = renderWithData((s) => blocked(s).replaceAll('errorCode: "full_disk_access_required", error: "CLI details --force"', 'errorCode: "", error: "unrelated scanner error"'), 'zh', noScanOverview)
  assert.match(otherError, /扫描失败，请重试/)
  assert.match(otherError, /unrelated scanner error/)
  assert.doesNotMatch(otherError, /class="dc-permission"/)
})

test('Windows Python setup is shown for a missing runtime and localized', () => {
  const overview = { ...noScanOverview, platform: 'win32' }
  const blocked = (s) => s.replaceAll('const [scan, setScan] = useState({ status: "idle" });',
    'const [scan, setScan] = useState({ status: "error", errorCode: "python_unavailable", error: "internal probe details" });')
  const zh = renderWithData(blocked, 'zh', overview, mockPhotos, aiStub().ai)
  assert.match(zh, /让 DSH 帮我安装 Python/)
  assert.match(zh, /在对话中确认安装/)
  assert.doesNotMatch(zh, /internal probe details|AI 解释这次失败/)
  const en = renderWithData(blocked, 'en', overview)
  assert.match(en, /Ask DSH to install Python/)
  assert.match(en, /restart DSH and try again/)

  const unrelated = (s) => blocked(s).replaceAll('errorCode: "python_unavailable"', 'errorCode: ""')
  assert.doesNotMatch(renderWithData(unrelated, 'zh', overview), /让 DSH 帮我安装 Python/)
})

test('Full Disk Access setup steps and manual fallback are localized', () => {
  const expanded = (s) => s
    .replace('useState({ status: "", text: "" })', 'useState({ status: "denied", text: "CLI details --force" })')
    .replace('const [permSteps, setPermSteps] = useState(false);', 'const [permSteps, setPermSteps] = useState(true);')
    .replace('const [privacySettingsFailed, setPrivacySettingsFailed] = useState(false);', 'const [privacySettingsFailed, setPrivacySettingsFailed] = useState(true);')
  const en = renderWithData(expanded, 'en', noScanOverview)
  assert.match(en, /Full Disk Access is required to scan/)
  assert.match(en, /Could not open System Settings/)
  assert.match(en, /System Settings → Privacy &amp; Security → Full Disk Access/)
  assert.match(en, /select DeepSeek Harness in Applications/)
  assert.match(en, /Press ⌘Q to quit DeepSeek Harness/)
  assert.match(en, /Return to Disk checkup and click Start scan/)
  assert.doesNotMatch(en, /--force/)
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
  assert.match(html, /预计可释放<strong>0 B<\/strong>/)
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
  assert.match(html, /预计可释放<strong>2 MB<\/strong>/)
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
  assert.match(renderWithData(mutate, 'zh', empty), /当前扫描未覆盖大文件/)
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

test('scoped large-file view uses folder analysis data without a scan report', () => {
  const scoped = { scope: '/demo/dir', at: Date.now(), files: [{ path: '/demo/dir/movie.mkv', kb: 800000, mtime: Math.floor(Date.now() / 1000) - 86400 * 30 }] }
  const mutate = (s) => cases.find(([n]) => n === 'space-large')[1](s)
    .replace('const [spaceScope, setSpaceScope] = useState("");', 'const [spaceScope, setSpaceScope] = useState("/demo/dir");')
    .replace('const [spaceFiles, setSpaceFiles] = useState(null);', `const [spaceFiles, setSpaceFiles] = useState(${JSON.stringify(scoped)});`)
  const zh = renderWithData(mutate, 'zh', noScanOverview)
  assert.ok(zh.includes('movie.mkv'), 'folder-analysis files render without a scan report')
  assert.ok(zh.includes('来源：目录统计'))
  assert.ok(!zh.includes('先扫描，查找占用较大的文件'))
  assert.ok(zh.includes('aria-label="选择 /demo/dir/movie.mkv"'), 'fresh folder analysis allows selection')
  const en = renderWithData(mutate, 'en', noScanOverview)
  assert.ok(en.includes('Source: folder analysis'))
})

test('scoped large files from stale folder analysis cannot be selected', () => {
  const scoped = { scope: '/demo/dir', at: Date.now() - 11 * 60000, files: [{ path: '/demo/dir/movie.mkv', kb: 800000, mtime: 1 }] }
  const mutate = (s) => cases.find(([n]) => n === 'space-large')[1](s)
    .replace('const [spaceScope, setSpaceScope] = useState("");', 'const [spaceScope, setSpaceScope] = useState("/demo/dir");')
    .replace('const [spaceFiles, setSpaceFiles] = useState(null);', `const [spaceFiles, setSpaceFiles] = useState(${JSON.stringify(scoped)});`)
  const html = renderWithData(mutate, 'zh', noScanOverview)
  assert.ok(html.includes('目录统计已过期'))
  assert.match(html, /aria-label="选择 \/demo\/dir\/movie.mkv"[^>]*disabled=""/)
})

test('space waves use the full total and preserve the area of the aggregated tail', () => {
  const children = Array.from({length:9},(_,i)=>({path:'/demo/'+i,name:'item'+i,kb:1024,isDir:true}))
  const mutate=s=>cases.find(([n])=>n==='space-tree')[1](s).replace('const [data, setData] = useState(null);','const [data, setData] = useState('+JSON.stringify({path:'/demo',at:Date.now(),children,metric:'allocated'})+');')
  const html=renderView(mutate)
  assert.ok(html.includes('9 MB'))
  assert.ok(html.includes('item8'))
  assert.ok(html.includes('其他'))
  assert.ok(html.includes('其他 · 6 MB · 67%'))
  assert.ok(!html.includes('NaN'))
  const paths = [...html.matchAll(/class="dc-tide-band" d="([^"]+)"/g)].map(([, d]) => d)
  const heights = paths.map(d => {
    const [, top, bottom] = d.match(/1000 ([\d.]+) L1000 ([\d.]+)/)
    return Number(bottom) - Number(top)
  })
  assert.equal(paths.length, 4)
  assert.ok(Math.abs(heights[3] / heights.reduce((a, b) => a + b) - 6 / 9) < 1e-9)
})

test('space waves expose selectable labels and an action for the aggregated tail', () => {
  const children = Array.from({length:9},(_,i)=>({path:'/demo/'+i,name:'item'+i,kb:1024,isDir:true}))
  const mutate=s=>cases.find(([n])=>n==='space-tree')[1](s)
    .replace('const [data, setData] = useState(null);','const [data, setData] = useState('+JSON.stringify({path:'/demo',at:Date.now(),children,metric:'allocated'})+');')
    .replace('const [selectedPath, setSelectedPath] = useState("");','const [selectedPath, setSelectedPath] = useState(null);')
  const html=renderView(mutate)
  assert.match(html, /<button[^>]*aria-label="其他 · 6 MB · 67%" aria-pressed="true"/)
  assert.match(html, /<button[^>]*>查看其他项目<\/button>/)
})

test('space tree marks cleanable portions from the fresh report', () => {
  const children = [{path:'/tmp',name:'tmp',kb:300000,isDir:true},{path:'/var',name:'var',kb:5000,isDir:true}]
  const mutate=s=>cases.find(([n])=>n==='space-tree')[1](s).replace('const [data, setData] = useState(null);','const [data, setData] = useState('+JSON.stringify({path:'/demo',at:Date.now(),children,metric:'allocated'})+');')
  const zh = renderWithData(mutate,'zh')
  assert.ok(zh.includes('其中可清理'), 'folders with cleanable entries show a badge')
  assert.equal((zh.match(/其中可清理/g) || []).length, 2, 'only /tmp has the estimate, in its inspector and table row')
  const stale = renderWithData(mutate,'zh',{ ...mockOverview, at: Date.now()-11*60000 })
  assert.ok(!stale.includes('其中可清理'), 'stale reports must not promise cleanable space')
  const en = renderWithData(mutate,'en')
  assert.match(en, /cleanable/)
})

test('moving all known large files does not mislabel the scan as missing coverage', () => {
  const mutate=s=>cases.find(([n])=>n==='space-large')[1](s).replace('useState({status:"idle",done:0,total:0})','useState({status:"done",done:1,total:1,results:[{path:"/tmp/big.bin",ok:true}]})')
  const html=renderWithData(mutate,'zh')
  assert.ok(html.includes('没有发现大文件'))
  assert.ok(!html.includes('当前扫描未覆盖大文件，请进行完整扫描</p>'))
})

test('clean page shows installed app cache category', () => {
  const mutate = cases.find(([n]) => n === 'clean-junk')[1]
  const overview = { ...mockOverview, report: { ...mockOverview.report,
    appCaches: [{ baseId: 'com.test.app', app: 'Test App', kb: 5000, paths: ['/tmp/appcache/Caches'], running: false, cleanable: true, count: 1 }] } }
  const zh = renderWithData(mutate, 'zh', overview)
  assert.match(zh, /应用缓存/)
  assert.match(zh, /Test App/)
  const en = renderWithData(mutate, 'en', overview)
  assert.match(en, /App cache/)
})

test('windows admin and in-use temp caches are view-only', () => {
  const mutate = cases.find(([n]) => n === 'clean-junk')[1]
  const overview = { ...mockOverview, platform: 'win32', report: { ...mockOverview.report,
    leftoverGroups: [], devCaches: [], browsers: [], special: [], appCaches: [],
    caches: [
      { path: 'C:/Windows/Temp', kb: 100000, admin: true, advice: '需要管理员权限；建议用「磁盘清理」处理' },
      { path: 'C:/Users/demo/AppData/Local/Temp', kb: 200000, cleanable: false, advice: '程序运行中持续使用；建议用「磁盘清理」处理' },
      { path: 'C:/Users/demo/AppData/Local/CrashDumps', kb: 50000, advice: '缓存，可重建' },
    ] } }
  const zh = renderWithData(mutate, 'zh', overview)
  assert.ok(zh.includes('需要管理员权限；建议用「磁盘清理」处理'))
  assert.ok(zh.includes('程序运行中持续使用；建议用「磁盘清理」处理'))
  assert.ok(zh.includes('aria-label="选择 CrashDumps"'), 'cleanable cache stays selectable')
  assert.ok(!zh.includes('aria-label="选择 Temp"'), 'locked temp rows must not be selectable')
  assert.match(zh, /预计可释放<strong>49 MB<\/strong>/, 'only the cleanable cache counts toward the estimate')
  const en = renderWithData(mutate, 'en', overview)
  assert.ok(en.includes('Requires administrator rights; use Windows Disk Cleanup instead'))
  assert.ok(en.includes('In use by running programs; use Windows Disk Cleanup instead'))
})

test('windows large files show modification age instead of unknown', () => {
  const mutate = cases.find(([n]) => n === 'space-large')[1]
  const overview = { ...mockOverview, platform: 'win32', report: { ...mockOverview.report,
    bigFiles: [{ path: 'C:\\Users\\demo\\Downloads\\big.iso', kb: 400000, mtime: Math.floor(Date.now() / 1000 - 200.5 * 86400) }] } }
  const zh = renderWithData(mutate, 'zh', overview)
  assert.match(zh, /超过 200 天未修改/)
  assert.ok(!zh.includes('修改时间未知'))
})

// 页面 fixture 长期固定 platform:'darwin'，Windows 的「隔离区 / quarantine」文案
// 只有 aiReportDigest 单测覆盖，从未真正渲染过。这里用 win32 overview 渲染首页。
test('windows overview renders the quarantine term, not the trash term', () => {
  const mutate = cases.find(([n]) => n === 'home')[1]
  const overview = { ...mockOverview, platform: 'win32' }
  const zh = renderWithData(mutate, 'zh', overview)
  assert.ok(zh.includes('隔离区'), 'Windows copy must say 隔离区')
  assert.ok(!zh.includes('废纸篓'), 'Windows copy must not say 废纸篓')
  const en = renderWithData(mutate, 'en', overview)
  assert.match(en, /quarantine/, 'English Windows copy must say quarantine')
  assert.doesNotMatch(en, /Trash/, 'English Windows copy must not say Trash')
})

test('photos page handles Windows path separators', () => {
  const mutate = cases.find(([n]) => n === 'clean-photos')[1]
  const winPhotos = { scanned: 4, compared: 4, elapsed: 1, groups: [
    { id: 'g1', items: [
      { path: 'C:\\Users\\demo\\Pictures\\a.jpg', kb: 2000, mtime: 1, size: 2000000 },
      { path: 'C:\\Users\\demo\\Downloads\\a copy.jpg', kb: 1500, mtime: 2, size: 1500000 }], totalKb: 3500, wastedKb: 1500 },
    { id: 'g2', items: [
      { path: 'C:\\Users\\demo\\Desktop\\b.jpg', kb: 900, mtime: 3, size: 900000 },
      { path: 'C:\\Users\\demo\\Pictures\\b copy.jpg', kb: 800, mtime: 4, size: 800000 }], totalKb: 1700, wastedKb: 800 },
  ] }
  const zh = renderWithData(mutate, 'zh', mockOverview, winPhotos)
  assert.ok(zh.includes('>a.jpg<'), 'filename must be the base name, not the full backslash path')
  assert.ok(!zh.includes('C:\\Users\\demo\\Pictures\\a.jpg</div>'))
  for (const dir of ['C:/Users/demo/Pictures', 'C:/Users/demo/Downloads', 'C:/Users/demo/Desktop']) {
    assert.ok(zh.includes(`<option value="${dir}">`), `folder filter option ${dir}`)
  }
  const en = renderWithData(mutate, 'en', mockOverview, winPhotos)
  assert.ok(en.includes('>a.jpg<'))
})

test('running browser cache is view-only and excluded from movable totals', () => {
  const mutate = cases.find(([n]) => n === 'clean-junk')[1]
  const overview = { ...mockOverview, report: { ...mockOverview.report,
    leftoverGroups: [], devCaches: [], caches: [], special: [], appCaches: [],
    browsers: [
      { name: 'Chrome', path: '/tmp/browser-running', kb: 8000, running: true },
      { name: 'Firefox', path: '/tmp/browser-idle', kb: 4000, running: false },
    ] } }
  const zh = renderWithData(mutate, 'zh', overview)
  assert.ok(zh.includes('App 正在运行，退出后可清理'))
  assert.ok(!zh.includes('aria-label="选择 Chrome'), 'running browser row has no checkbox')
  assert.ok(zh.includes('aria-label="选择 Firefox'), 'idle browser stays selectable')
  assert.match(zh, /预计可释放<strong>4 MB<\/strong>/, 'only the idle browser counts')
  const en = renderWithData(mutate, 'en', overview)
  assert.ok(en.includes('App is running; quit it before cleaning'))
})

test('read-only rows offer reveal in the detail panel', () => {
  const mutate = (s) => cases.find(([n]) => n === 'clean-junk')[1](s)
    .replace('const [expanded, setExpanded] = useState("");', 'const [expanded, setExpanded] = useState("g:com.test.chat");')
  const zh = renderWithData(mutate, 'zh', mockOverview)
  assert.match(zh, /仅供查看，不提供清理/)
  assert.match(zh, /打开位置/)
  const en = renderWithData(mutate, 'en', mockOverview)
  assert.match(en, /Show location/)
})

test('fda banner shows on home and clean pages when permission is denied', () => {
  const deny = (s) => s.replace('useState({ status: "", text: "" })', 'useState({ status: "denied", text: "probe details" })')
  const home = renderWithData((s) => deny(s), 'zh', mockOverview)
  assert.match(home, /扫描前需要开启完全磁盘访问权限/)
  assert.match(home, /打开系统设置/)
  assert.match(home, /查看开启步骤/)
  assert.doesNotMatch(home, /重新检查|probe details/)
  const clean = renderWithData((s) => deny(cases.find(([n]) => n === 'clean-junk')[1](s)), 'zh', mockOverview)
  assert.match(clean, /打开系统设置/)
  const en = renderWithData((s) => deny(s), 'en', mockOverview)
  assert.match(en, /Full Disk Access is required to scan/)
  assert.match(en, /Open System Settings/)
  const granted = renderWithData((s) => s, 'zh', mockOverview)
  assert.ok(!granted.includes('打开系统设置'), 'granted status renders no banner')
})

test('history offers permanent deletion of a batch', () => {
  const mutate = cases.find(([n]) => n === 'history')[1]
  const zh = renderWithData(mutate, 'zh')
  assert.match(zh, /永久删除此批次/)
})

test('history distinguishes partial outcomes without estimating missing sizes', () => {
  const now = Date.now()
  const mutate = cases.find(([n]) => n === 'history')[1]
  const overview = { ...mockOverview, cleanBatches: [{
    batchId: 'mixed', at: now - 86400000, count: 4, restorable: 1, restored: 1, purged: true,
    items: [
      { from: '/demo/live', exists: true, kb: null },
      { from: '/demo/restored', restored: true, restoredAt: now - 3000, kb: 1024 },
      { from: '/demo/deleted', deleted: true, deletedAt: now - 2000, kb: 2048 },
      { from: '/demo/unknown', exists: false, kb: null },
    ],
  }] }
  const html = renderWithData(mutate, 'en', overview)
  assert.match(html, /Restored · 1 items · About 1 MB/)
  assert.match(html, /Permanently deleted · 1 items · About 2 MB/)
  assert.match(html, /Outcome unrecorded · 1 items/)
  assert.match(html, /Still restorable · 1 items</)
  assert.match(html, /Dashed ribbons indicate batches with missing size data/)
})

test('wizard confirm estimates real release', () => {
  const mutate = cases.find(([n]) => n === 'home-wizard-confirm')[1]
  const zh = renderWithData(mutate, 'zh')
  assert.match(zh, /正在估算实际释放/)
})

// ── AI（只读解释）入口 ────────────────────────────────────────────────────
test('home offers an AI checkup explanation only when the AI entry is wired', () => {
  const { ai } = aiStub()
  const zh = renderWithData((s) => s, 'zh', mockOverview, mockPhotos, ai)
  assert.match(zh, /让 AI 解读这次体检/)
  assert.match(zh, /问 AI|让 AI 解读/, 'AI actions render on the checkup page')
  const en = renderWithData((s) => s, 'en', mockOverview, mockPhotos, ai)
  assert.match(en, /Ask AI to explain this checkup/)
  const plain = renderWithData((s) => s, 'zh', mockOverview)
  assert.ok(!plain.includes('让 AI 解读这次体检'), 'no AI entry without the bridge')
})

test('clean page offers per-item AI explanation and pre-clean review', () => {
  const { ai } = aiStub()
  const clean = cases.find(([n]) => n === 'clean-junk')[1]
  const stateBlock = 'const [sel, setSel] = useState({});\n\t\t\tconst [expanded, setExpanded] = useState("");\n\t\t\tconst [confirming, setConfirming] = useState(false);'
  const detail = (s) => clean(s).replace('const [expanded, setExpanded] = useState("");', 'const [expanded, setExpanded] = useState("d:/tmp/dev-a");')
  const unknownOverview = {
    ...mockOverview,
    report: { ...mockOverview.report, leftoverGroups: [
      { baseId: 'com.unknown.app', name: 'com.unknown.app', kb: 50000, bucket: 'safe', count: 1, paths: ['/tmp/x/unknown'], why: '媒体类 App 已卸载，缓存为主' },
    ] },
  }
  const zh = renderWithData(detail, 'zh', unknownOverview, mockPhotos, ai)
  assert.match(zh, /问 AI/)
  assert.match(zh, /未收录/, 'uncatalogued leftover entries are marked')
  const review = (s) => clean(s).replace(stateBlock, 'const [sel, setSel] = useState({ "/tmp/dev-a": true });\n\t\t\tconst [expanded, setExpanded] = useState("d:/tmp/dev-a");\n\t\t\tconst [confirming, setConfirming] = useState(true);')
  const confirm = renderWithData(review, 'zh', mockOverview, mockPhotos, ai)
  assert.match(confirm, /已选 1 项/)
  assert.match(confirm, /复核这 1 项/)
  const en = renderWithData(review, 'en', mockOverview, mockPhotos, ai)
  assert.match(en, /Have AI review these 1 items/)
})

test('history shows trend, regrowth and an AI analysis entry', () => {
  const { ai } = aiStub()
  const overview = {
    ...mockOverview,
    history: [
      { at: Date.now() - 7 * 86400000, free: 90e9, totalKb: 500000, elapsed: 20 },
      { at: Date.now(), free: 94e9, totalKb: 400000, elapsed: 21 },
    ],
    cleanBatches: [{
      batchId: 'b1', at: new Date(Date.now() - 3 * 86400000).toISOString(), count: 1, restorable: 1,
      items: [{ from: '/tmp/x/media', to: '/trash/media', exists: true, kb: 100000, category: 'leftover' }],
    }],
  }
  const mutate = cases.find(([n]) => n === 'history')[1]
  const zh = renderWithData(mutate, 'zh', overview, mockPhotos, ai)
  assert.match(zh, /趋势与复清/)
  assert.match(zh, /过去 7 天：可用 83\.82G → 87\.54G/)
  assert.match(zh, /清了又长回来/)
  assert.match(zh, /清过 97\.7M，现在 195\.3M/)
  assert.match(zh, /让 AI 分析趋势/)
  const en = renderWithData(mutate, 'en', overview, mockPhotos, ai)
  assert.match(en, /Trends and regrowth/)
  assert.match(en, /Ask AI to analyze trends/)
})

test('large files offer an AI "what is this" entry when wired', () => {
  const { ai } = aiStub()
  const mutate = cases.find(([n]) => n === 'space-large')[1]
  const zh = renderWithData(mutate, 'zh', mockOverview, mockPhotos, ai)
  assert.match(zh, /这是什么/)
  const en = renderWithData(mutate, 'en', mockOverview, mockPhotos, ai)
  assert.match(en, /What is this\?/)
  const plain = renderWithData(mutate, 'zh', mockOverview)
  assert.ok(!plain.includes('这是什么'), 'no AI action without the bridge')
})


test('split cache rows from uninstalled leftovers are cleanable and labelled', () => {
  const overview = {
    ...mockOverview,
    report: { ...mockOverview.report, leftoverGroups: [
      { baseId: 'com.tencent.txdocs.cache', name: '腾讯文档', cachePart: true, bucket: 'safe', kb: 60000, count: 2, paths: ['/tmp/txdocs/Data/Library/Caches', '/tmp/txdocs/Data/tmp'], why: '已卸载 App 的缓存子目录，可重建；文档/聊天等数据仍保留' },
      { baseId: 'com.tencent.txdocs', name: '腾讯文档', bucket: 'confirm', kb: 40000, count: 1, paths: ['/tmp/txdocs'], why: '可能含聊天记录/文档/笔记；其中缓存子目录已单独列出（可清理）' },
    ] },
  }
  const mutate = cases.find(([n]) => n === 'clean-junk')[1]
  const zh = renderWithData(mutate, 'zh', overview)
  assert.match(zh, /腾讯文档 · 缓存/, 'the split row gets a cache suffix')
  assert.match(zh, /aria-label="选择 腾讯文档 · 缓存"/, 'the split row is selectable')
  assert.doesNotMatch(zh, /未收录/, 'no unknown badge for the split row')
  const en = renderWithData(mutate, 'en', overview)
  assert.match(en, /Tencent Docs · Cache|腾讯文档 · Cache/)
})

// ── PR-1：恢复诚实反馈 + 对比弹层可访问性 ────────────────────────────────
test('photo compare dialog uses theme tokens and dialog semantics', () => {
  assert.match(base, /role: "dialog"/)
  assert.match(base, /aria-modal/)
  assert.match(base, /"aria-labelledby": "dc-compare-title"/)
  assert.doesNotMatch(base, /--dsh-bg/, 'no undefined DSH theme variable (dark-on-dark bug)')
  assert.match(base, /另存为副本恢复/)
})

test('history surfaces a failed restore and offers restore-as-copy', () => {
  const mutate = cases.find(([n]) => n === 'history')[1]
  const overview = {
    ...mockOverview,
    cleanBatches: [{
      batchId: 'b1', at: Date.now() - 3600000, count: 3, restorable: 1, items: [],
      lastRestore: { at: Date.now() - 60000, ok: 2, failed: 1, codes: { exists: 1 } },
    }],
  }
  const zh = renderWithData(mutate, 'zh', overview)
  assert.match(zh, /上次恢复失败 1 项/)
  assert.match(zh, /另存为副本恢复/)
  const en = renderWithData(mutate, 'en', overview)
  assert.match(en, /Restore as a copy/)
})

test('photo compare dialog renders open with readable theme and dialog semantics', () => {
  const photosView = cases.find(([n]) => n === 'clean-photos')[1]
  const open = (s) => photosView(s).replace('const [compare, setCompare] = useState("");', 'const [compare, setCompare] = useState("g1");')
  const html = renderWithData(open, 'zh')
  assert.match(html, /role="dialog"/)
  assert.match(html, /aria-modal="true"/)
  assert.match(html, /id="dc-compare-title"/)
  assert.match(html, /选择保留的照片/)
  assert.doesNotMatch(html, /--dsh-bg/)
  assert.match(html, /background:var\(--dc-bg\)/)
})

// ── PR-2：批量上限说明与照片选择管理 ─────────────────────────────────────
test('batch limit is explained and photo selection can be cleared', () => {
  assert.match(base, /将分 \{n\} 批执行（每批最多 200 项）/)
  assert.match(base, /清空选择/)
  assert.match(base, /撤销照片清理/)
  assert.match(base, /batchIds/)
})


// ── PR-3：隔离区中心与两阶段释放口径 ─────────────────────────────────────
test('home and history surface quarantine usage and a delete-all entry', () => {
  const overview = {
    ...mockOverview,
    quarantine: {
      root: '/demo/.Trash', kb: 204800, files: 3, truncated: false, systemTrashKb: 409600,
      batches: [{ batchId: 'q1', kb: 204800, files: 3, at: Date.now() }],
    },
  }
  const home = renderWithData((s) => s, 'zh', overview)
  assert.match(home, /废纸篓里还有/)
  assert.match(home, /查看并释放/)
  assert.match(home, /系统废纸篓共/)
  const history = renderWithData(cases.find(([n]) => n === 'history')[1], 'zh', overview)
  assert.match(history, /隔离区\/废纸篓/)
  assert.match(history, /永久删除全部（1 批）/)
  const en = renderWithData((s) => s, 'en', overview)
  assert.match(en, /Review and release/)
})

test('release copy separates moving out from freeing space', () => {
  const mutate = cases.find(([n]) => n === 'home-wizard-confirm')[1]
  const zh = renderWithData(mutate, 'zh')
  assert.match(zh, /本次移出/)
  assert.match(zh, /立即释放 0/)
  assert.match(base, /永久删除本批次后可释放约/)
  assert.match(base, /永久删除并释放/)
  assert.match(base, /可用空间现在不会变化/)
})


// ── 复核修复：恢复/批量失败的如实文案 ───────────────────────────────────
test('restore and batch failures are surfaced in copy', () => {
  assert.match(base, /恢复记录写入失败/)
  assert.match(base, /部分批次失败/)
  assert.match(base, /另存为副本/)
})

test('clean list orders cleanable rows before needs-review and protected rows', () => {
  const overview = { ...mockOverview, whitelist: ['/tmp/dev-b'] }
  const mutate = cases.find(([n]) => n === 'clean-junk')[1]
  const html = renderWithData(mutate, 'zh', overview)
  const order = [...html.matchAll(/data-risk="(recommended|optional|review|protected)"/g)].map((m) => m[1])
  assert.ok(order.length > 3, 'rows should render')
  const rank = { recommended: 0, optional: 1, review: 2, protected: 3 }
  const ranks = order.map((r) => rank[r])
  assert.deepEqual([...ranks].sort((a, b) => a - b), ranks, `risk groups must stay grouped: ${order.join(',')}`)
  assert.ok(order.includes('review'), 'needs-review rows present')
  assert.equal(order[order.length - 1], 'protected', 'protected rows come last')
})

test('overlapping application and developer rows cannot bypass a running browser in the UI', () => {
  const overview = { ...mockOverview, report: { ...mockOverview.report,
    caches: [], special: [], leftoverGroups: [],
    devCaches: [{ path: '/tmp/Google/Chrome/sub-cache', kb: 10000, cleanable: true }],
    appCaches: [{ baseId: 'google', app: 'Google', paths: ['/tmp/Google'], kb: 20000, cleanable: true }],
    browsers: [{ name: 'Chrome', path: '/tmp/Google/Chrome', kb: 8000, running: true }],
  } }
  const html = renderWithData(cases.find(([name]) => name === 'clean-junk')[1], 'zh', overview)
  assert.ok(!html.includes('aria-label="选择 Google'), 'parent cache is read-only')
  assert.ok(!html.includes('aria-label="选择 sub-cache'), 'descendant cache is read-only')
  assert.ok(html.includes('App 正在运行，退出后可清理'))
})
