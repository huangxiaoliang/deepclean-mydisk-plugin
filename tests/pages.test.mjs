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

test('clean page shows overview counts and selection tools', () => {
  const mutate = cases.find(([n]) => n === 'clean-junk')[1]
  const zh = renderWithData(mutate, 'zh')
  for (const t of ['全选', '清空', '选择 ≥', '已卸载 App 的缓存']) assert.match(zh, new RegExp(t))
  const en = renderWithData(mutate, 'en')
  for (const t of ['Select all', 'Clear', 'Select ≥']) assert.match(en, new RegExp(t))
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
  assert.match(html, /已用 400\.00G/)
  assert.match(html, /共 500\.00G/)
  assert.match(html, /可用 100\.00G/)
  assert.match(html, /实时/)
  assert.doesNotMatch(html, /可用 0B/, 'opening the panel must not show 0 B when a live snapshot exists')
  assert.match(html, /还没有体检结果/)
})

test('english home shows live disk numbers before any scan', () => {
  const html = renderWithData((s) => s, 'en', noScanOverview)
  assert.match(html, /Used 400\.00G/)
  assert.match(html, /Total 500\.00G/)
  assert.match(html, /Free 100\.00G/)
  assert.match(html, /Live/)
})

test('home falls back to scan report disk when host has no live snapshot', () => {
  const html = renderWithData((s) => s, 'zh', { ...mockOverview, disk: undefined })
  assert.match(html, /已用 372\.53G/)
  assert.match(html, /共 465\.66G/)
  assert.doesNotMatch(html, /实时/)
})
