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

const UPDATE_AVAILABLE = '{ supported: true, updatable: true, updateAvailable: true, installedVersion: "0.13.1", latestVersion: "0.14.0", reason: "", checkedAt: 1700000000000 }'

// 更新状态由 useEffect 拉取；SSR 不执行副作用，所以用源码替换把夹具塞进 useState 初值。
function withUpdate(head) {
  return (s) => {
    let out = s.replace('const [updateInfo, setUpdateInfo] = useState(null);', `const [updateInfo, setUpdateInfo] = useState(${UPDATE_AVAILABLE});`)
    return head ? head(out) : out
  }
}

const cases = [
  ['home', (s) => s],
  ['space-tree', (s) => s.replace('useState("home")', 'useState("space")')],
  ['space-large', (s) => s.replace('useState("home")', 'useState("space")').replace('useState("tree")', 'useState("large")')],
  ['clean-junk', (s) => s.replace('useState("home")', 'useState("clean")')],
  ['clean-photos', (s) => s.replace('useState("home")', 'useState("clean")').replace('useState("junk")', 'useState("photos")')],
  ['software', (s) => s.replace('useState("home")', 'useState("software")')],
  ['software-journal-error', (s) => s.replace('useState("home")', 'useState("software")').replace('useState({ items: [], sources: [], jobs: [] })', 'useState({ items: [], sources: [], jobs: [], journalError: true })')],
  ['software-source-warning', (s) => s.replace('useState("home")', 'useState("software")').replace('useState({ items: [], sources: [], jobs: [] })', 'useState({ items: [], sources: [{ id: "desktop", name: "macOS", location: "", status: "ok", warning: "desktop_partial" }], jobs: [] })')],
  ['software-partial-source', (s) => s.replace('useState("home")', 'useState("software")').replace('useState({ items: [], sources: [], jobs: [] })', 'useState({ at: 1, sources: [{ id: "desktop", name: "macOS", location: "", status: "partial", error: "desktop_partial" }], jobs: [], items: [' +
    '{ id: "readable", sourceId: "desktop", provider: "macOS", name: "Readable App", version: "1", kind: "desktop", location: "/Applications/Readable.app", executable: true, warnings: [] },' +
    '{ id: "blocked", sourceId: "desktop", provider: "macOS", name: "Blocked App", version: "1", kind: "desktop", location: "/Applications/Blocked.app", executable: false, blockReason: "application_running", warnings: [] }' +
  '] })')],
  ['software-all-sources-failed', (s) => s.replace('useState("home")', 'useState("software")').replace('useState({ items: [], sources: [], jobs: [] })', 'useState({ at: 1, sources: [{ id: "desktop", name: "Windows", location: "", status: "error", error: "source_failed" }, { id: "npm", name: "npm", location: "", status: "error", error: "source_failed" }], jobs: [], items: [] })')],
  ['software-grouped', (s) => s.replace('useState("home")', 'useState("software")').replace('useState({ items: [], sources: [], jobs: [] })', 'useState({ at: 1, sources: [{ id: "desktop", name: "macOS", location: "", status: "ok" }], jobs: [], items: [' +
    '{ id: "zeta", sourceId: "desktop", provider: "macOS", name: "Zeta App", version: "1", kind: "desktop", location: "/Applications/Zeta.app", executable: true, warnings: [] },' +
    '{ id: "alpha", sourceId: "desktop", provider: "macOS", name: "Alpha App", version: "1", kind: "desktop", location: "/Applications/Alpha.app", executable: true, warnings: [] },' +
    '{ id: "run", sourceId: "desktop", provider: "macOS", name: "Running App", version: "1", kind: "desktop", location: "/Applications/Running.app", executable: false, blockReason: "application_running", warnings: [] },' +
    '{ id: "prot", sourceId: "desktop", provider: "macOS", name: "Protected App", version: "1", kind: "desktop", location: "/System/Applications/Protected.app", executable: false, blockReason: "protected_system", warnings: [] }' +
  '] })')],
  ['history', (s) => s.replace('useState("home")', 'useState("history")')],
  ['settings', (s) => s.replace('useState("home")', 'useState("settings")')],
  ['home-update-badge', withUpdate()],
  ['settings-update', withUpdate((s) => s.replace('useState("home")', 'useState("settings")'))],
  ['update-dialog', withUpdate((s) => s.replace('const [updateOpen, setUpdateOpen] = useState(false);', 'const [updateOpen, setUpdateOpen] = useState(true);'))],
  ['update-dialog-updating', withUpdate((s) => s.replace('const [updateOpen, setUpdateOpen] = useState(false);', 'const [updateOpen, setUpdateOpen] = useState(true);').replace('const [updating, setUpdating] = useState(false);', 'const [updating, setUpdating] = useState(true);'))],
  ['update-dialog-done', withUpdate((s) => s.replace('const [updateOpen, setUpdateOpen] = useState(false);', 'const [updateOpen, setUpdateOpen] = useState(true);').replace('const [updateResult, setUpdateResult] = useState(null);', 'const [updateResult, setUpdateResult] = useState({ ok: true, to: "0.14.0", restartRequired: true });'))],
  ['update-dialog-failed', withUpdate((s) => s.replace('const [updateOpen, setUpdateOpen] = useState(false);', 'const [updateOpen, setUpdateOpen] = useState(true);').replace('const [updateResult, setUpdateResult] = useState(null);', 'const [updateResult, setUpdateResult] = useState({ ok: false, errorCode: "operation-error" });'))],
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

test('update badge appears next to the product title only when a compatible update exists', () => {
  const mutate = cases.find(([n]) => n === 'home-update-badge')[1]
  const zh = renderWithData(mutate, 'zh', mockOverview)
  assert.match(zh, /class="dc-update-badge"/, 'badge must render in the header')
  assert.match(zh, /更新插件/)
  const en = renderWithData(mutate, 'en', mockOverview)
  assert.match(en, /Update plugin/)
  const plain = renderWithData((s) => s, 'zh', mockOverview)
  assert.doesNotMatch(plain, /class="dc-update-badge"/, 'no badge without an available update')
})

test('update dialog names the version pair and explains the restart', () => {
  const mutate = cases.find(([n]) => n === 'update-dialog')[1]
  const zh = renderWithData(mutate, 'zh', mockOverview)
  assert.match(zh, /当前版本 0\.13\.1，新版本 0\.14\.0。/)
  assert.match(zh, /重启 DSH/)
  assert.match(zh, /立即更新/)
  const en = renderWithData(mutate, 'en', mockOverview)
  assert.match(en, /Current version 0\.13\.1; new version 0\.14\.0\./)
  assert.match(en, /Restart DSH/)
  assert.match(en, /Update now/)
})

test('update dialog reports finished and failed states', () => {
  const done = renderWithData(cases.find(([n]) => n === 'update-dialog-done')[1], 'zh', mockOverview)
  assert.match(done, /已更新到 0\.14\.0/)
  assert.match(done, /关闭/)
  assert.doesNotMatch(done, /立即更新/)
  const failed = renderWithData(cases.find(([n]) => n === 'update-dialog-failed')[1], 'zh', mockOverview)
  assert.match(failed, /更新失败/)
  assert.match(failed, /重试/)
  const failedEn = renderWithData(cases.find(([n]) => n === 'update-dialog-failed')[1], 'en', mockOverview)
  assert.match(failedEn, /The update failed/)
})

test('settings page shows update status and the manual check', () => {
  const zh = renderWithData(cases.find(([n]) => n === 'settings-update')[1], 'zh', mockOverview)
  for (const t of ['插件更新', '当前版本', '可用版本', '状态']) assert.ok(zh.includes(t), t)
  assert.match(zh, /有新版本可用/)
  assert.match(zh, /检查更新/)
  const en = renderWithData(cases.find(([n]) => n === 'settings-update')[1], 'en', mockOverview)
  assert.ok(en.includes('Plugin updates'))
  assert.match(en, /Update available/)
  assert.match(en, /Check for updates/)
})

test('settings page shows readable environment facts and contact links', () => {
  const mutate = cases.find(([n]) => n === 'settings')[1]
  const overview = {
    ...mockOverview,
    quarantine: { root: '/Users/test/.Trash', kb: 2048, systemTrashKb: 8192, batches: [] },
    paths: {
      audit: '/Users/test/.dsh/deepclean-audit.log',
      history: '/Users/test/.dsh/deepclean-history.json',
      whitelist: '/Users/test/.dsh/deepclean-whitelist.json',
    },
  }
  const zh = renderWithData(mutate, 'zh', overview)
  for (const t of [
    '平台: macOS',
    '权限: 完全磁盘访问已授权',
    '废纸篓（本插件占用）: /Users/test/.Trash · 2.0M',
    '系统废纸篓共 8.0M',
    '审计日志: /Users/test/.dsh/deepclean-audit.log',
    '反馈与联系',
    'coolway.me@gmail.com',
    'huang_xiao_liang',
    'huangxiaoliang/deepclean-mydisk-plugin',
    '★ Star 项目',
    '问题反馈',
    'href="mailto:coolway.me@gmail.com"',
    'href="https://github.com/huangxiaoliang/deepclean-mydisk-plugin"',
    'href="https://github.com/huangxiaoliang/deepclean-mydisk-plugin/issues/new/choose"',
  ]) assert.ok(zh.includes(t), t)

  const en = renderWithData(mutate, 'en', overview)
  for (const t of ['Platform: macOS', 'Permission: Full Disk Access granted', 'Trash (this plugin): /Users/test/.Trash', 'Feedback &amp; contact', 'Star project', 'Issues']) {
    assert.ok(en.includes(t), t)
  }

  const win = renderWithData(mutate, 'zh', { ...overview, platform: 'win32' })
  assert.match(win, /平台: Windows/)
  assert.match(win, /权限: 不适用（仅 macOS 需要完全磁盘访问）/)
  assert.match(win, /隔离区（本插件占用）: \/Users\/test\/\.Trash/)
})

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

test('a failed process snapshot is explained instead of claiming apps are running', () => {
  const overview = {
    ...mockOverview,
    report: {
      ...mockOverview.report,
      processSnapshot: 'unavailable',
      browsers: [{ name: 'Chrome', path: '/tmp/chrome-cache', kb: 1024, running: true }],
    },
  }
  const clean = (s) => s.replace('useState("home")', 'useState("clean")')
  const zh = renderWithData(clean, 'zh', overview)
  assert.match(zh, /无法确认应用运行状态，本轮不开放浏览器与应用缓存清理/)
  assert.match(zh, /无法确认运行状态，暂不开放清理/)
  assert.doesNotMatch(zh, /App 正在运行/)
  const en = renderWithData(clean, 'en', overview)
  assert.match(en, /Could not verify which apps are running/)
  assert.match(en, /Running state could not be verified/)
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

test('a scan blocked by a software uninstall says so instead of "scan already running"', () => {
  // 面板与照片页各有一个 note state，这里只改主面板（最后一个）。
  const NOTE_STATE = 'const [note, setNote] = useState("");'
  const withNote = (s) => {
    const at = s.lastIndexOf(NOTE_STATE)
    return s.slice(0, at) + 'const [note, setNote] = useState("软件卸载进行中，请先在软件页完成核验");' + s.slice(at + NOTE_STATE.length)
  }
  const zh = renderWithData(withNote, 'zh', noScanOverview)
  assert.match(zh, /软件卸载进行中，请先在软件页完成核验/)
  assert.doesNotMatch(zh, /扫描已在进行中/)
  const en = renderWithData(withNote, 'en', noScanOverview)
  assert.match(en, /A software uninstall is in progress/)
  assert.match(en, /Software page/)
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

test('a Python probe failure shows the cause on the scan and photo pages', () => {
  const overview = { ...noScanOverview, platform: 'win32' }
  const failed = (s) => s.replaceAll('const [scan, setScan] = useState({ status: "idle" });',
    'const [scan, setScan] = useState({ status: "error", errorCode: "python_probe_failed", error: "Python 探测失败（py -3：启动被拒绝；python：探测超时）。请检查 Python 是否能在本机启动，然后重试。" });')
  const photos = cases.find(([name]) => name === 'clean-photos')[1]
  for (const view of [failed, (s) => photos(failed(s))]) {
    const html = renderWithData(view, 'en', overview)
    assert.match(html, /Could not check Python \(py -3: launch was blocked; python: check timed out\)/)
    assert.doesNotMatch(html, /Ask DSH to install Python/)
  }
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

test('settings and the permission card use the latest definite Full Disk Access result', () => {
  const settingsWith = (observations) => (s) => s.replace('useState("home")', 'useState("settings")')
    .replace('useState({ status: "", text: "" })',
      `useState(() => ${JSON.stringify(observations)}.reduce((current, observation) => recordFda(current, observation, ""), { status: "", text: "" }))`)
  const denied = { status: 'denied', revision: 2 }
  const unknown = { status: 'unknown', revision: 3 }
  const granted = { status: 'granted', revision: 4 }

  for (const observations of [[denied, unknown], [unknown, denied], [{ ...denied, revision: 5 }, granted]]) {
    const html = renderWithData(settingsWith(observations), 'zh', mockOverview)
    assert.match(html, /权限: 完全磁盘访问未授权/)
    assert.match(html, /class="dc-permission"/)
  }
  const enabled = renderWithData(settingsWith([denied, granted, denied]), 'zh', noScanOverview)
  assert.match(enabled, /权限: 完全磁盘访问已授权/)
  assert.doesNotMatch(enabled, /class="dc-permission"/)
  const unconfirmed = renderWithData(settingsWith([unknown]), 'zh', noScanOverview)
  assert.match(unconfirmed, /权限: 无法确认/)
  assert.doesNotMatch(unconfirmed, /class="dc-permission"/)
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
  const inject=(html,limit)=>html
    .replace('const [data, setData] = useState(null);','const [data, setData] = useState('+JSON.stringify({path:'/demo',at:Date.now(),children,metric:'allocated'})+');')
    .replace('const [selectedPath, setSelectedPath] = useState("");','const [selectedPath, setSelectedPath] = useState(null);')
    .replace('const [limit, setLimit] = useState(20);',`const [limit, setLimit] = useState(${limit});`)
  const collapsed=renderView(s=>inject(cases.find(([n])=>n==='space-tree')[1](s),3))
  assert.match(collapsed, /<button[^>]*aria-label="其他 · 6 MB · 67%" aria-pressed="true"/)
  assert.match(collapsed, /<button[^>]*>查看其他项目<\/button>/)
  // 9 行全部显示时不再是「查看其他项目」，避免点了没有变化的无效操作。
  const expanded=renderView(s=>inject(cases.find(([n])=>n==='space-tree')[1](s),20))
  assert.match(expanded, /<button[^>]*>查看明细<\/button>/)
  assert.ok(!expanded.includes('查看其他项目'))
})

test('space tree localizes cloud counts, hard links and skip reasons', () => {
  const children = [
    { path: '/demo/cloud', name: 'cloud', kb: 2048, isDir: true, cloud: true },
    { path: '/demo/shared.bin', name: 'shared.bin', kb: 1024, isDir: false, shared: true },
    { path: '/demo/dup.bin', name: 'dup.bin', kb: 0, isDir: false, shared: true, dedup: true },
  ]
  const data = {
    path: '/demo', at: Date.now(), children, metric: 'logical', partial: true,
    skippedCloud: 2, cloudFiles: 3, sharedFiles: 4, sharedDupKb: 1024,
    bigFilesCap: 50, unavailable: 1, skipped: 2,
  }
  const mutate = s => cases.find(([n]) => n === 'space-tree')[1](s)
    .replace('const [data, setData] = useState(null);', `const [data, setData] = useState(${JSON.stringify(data)});`)
  const zh = renderView(mutate)
  assert.match(zh, /跳过云占位文件 3 个/)
  assert.match(zh, /硬链接 4 个；重复部分/)
  assert.match(zh, /未能读取 1 项/)
  assert.match(zh, /跳过链接或系统别名 2 项/)
  assert.match(zh, /硬链接（大小已计入其他位置）/)
  const en = renderView(mutate, 'en')
  assert.match(en, /Skipped cloud placeholder files: 3/)
  assert.match(en, /Hard links: 4/)
  assert.match(en, /Hard link \(size already counted elsewhere\)/)
})

test('tree errors localize by stable code instead of raw host text', () => {
  const casesByCode = [
    ['tree_missing', '目录不存在或已被删除', 'no longer exists'],
    ['tree_denied', '无权读取该目录', 'Cannot read this folder'],
    ['tree_timeout', '目录统计超时', 'timed out'],
    ['tree_symlink', '链接或个人文件夹之外的路径不可浏览', 'cannot be browsed'],
    ['tree_outside', '只允许浏览个人文件夹', 'Only your home folder'],
  ]
  for (const [code, zhText, enText] of casesByCode) {
    const mutate = s => cases.find(([n]) => n === 'space-tree')[1](s)
      .replace('const [error, setError] = useState(null);', `const [error, setError] = useState(${JSON.stringify({ code, message: 'ENOENT: raw' })});`)
    const zh = renderView(mutate)
    assert.ok(zh.includes(zhText), `${code} zh`)
    assert.ok(!zh.includes('ENOENT'), `${code} must not leak raw fs text`)
    const en = renderView(mutate, 'en')
    assert.ok(en.includes(enText), `${code} en: ${en.slice(0, 200)}`)
  }
  // 打开位置失败走独立错误通道：重试只重开位置，不重新统计目录。
  const reveal = s => cases.find(([n]) => n === 'space-tree')[1](s)
    .replace('const [error, setError] = useState(null);', 'const [error, setError] = useState({ code: "reveal", path: "/demo/a", message: "x" });')
  assert.ok(renderView(reveal).includes('无法打开位置'))
  assert.ok(renderView(reveal, 'en').includes('Could not open location'))
})

test('refreshing keeps the tide map mounted to avoid a layout jump', () => {
  const children = [
    { path: '/demo/a', name: 'a', kb: 1024, isDir: true },
    { path: '/demo/b', name: 'b', kb: 512, isDir: true },
  ]
  const data = { path: '/demo', at: Date.now(), children, metric: 'allocated' }
  const mutate = s => cases.find(([n]) => n === 'space-tree')[1](s)
    .replace('const [data, setData] = useState(null);', `const [data, setData] = useState(${JSON.stringify(data)});`)
    .replace('const [loading, setLoading] = useState(false);', 'const [loading, setLoading] = useState(true);')
  const html = renderView(mutate)
  assert.match(html, /class="dc-tide-map-wrap" aria-busy="true"/)
  assert.match(html, /class="dc-tide-band"/)
  assert.ok(html.includes('停止加载'))
  assert.ok(!html.includes('<svg class="dc-tide-loading-wave"'), 'no second wave while the map stays mounted')
})

test('scoped large files surface the per-folder cap and hard-link note', () => {
  const scoped = {
    scope: '/demo/dir', at: Date.now(), cap: 20,
    files: [{ path: '/demo/dir/shared.bin', kb: 800000, mtime: Math.floor(Date.now() / 1000) - 86400, shared: true }],
  }
  const mutate = s => cases.find(([n]) => n === 'space-large')[1](s)
    .replace('const [spaceScope, setSpaceScope] = useState("");', 'const [spaceScope, setSpaceScope] = useState("/demo/dir");')
    .replace('const [spaceFiles, setSpaceFiles] = useState(null);', `const [spaceFiles, setSpaceFiles] = useState(${JSON.stringify(scoped)});`)
  const zh = renderWithData(mutate, 'zh', noScanOverview)
  assert.match(zh, /最多 20 个/)
  assert.match(zh, /显示 1 个文件/)
  assert.match(zh, /硬链接：移动只减少引用/)
  const en = renderWithData(mutate, 'en', noScanOverview)
  assert.match(en, /up to 20/)
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

test('space only shows group capacity when all measured paths belong to the directory', () => {
  const children = ['a', 'b', 'c', 'd'].map(name => ({ name, path: '/demo/' + name, kb: 4 * 1024 ** 2, isDir: true }))
  const mutate = s => cases.find(([name]) => name === 'space-tree')[1](s)
    .replace('const [data, setData] = useState(null);', `const [data, setData] = useState(${JSON.stringify({ path: '/demo', children })});`)
  const report = { leftoverGroups: [
    { baseId: 'cross', bucket: 'safe', paths: ['/demo/a/cache', '/demo/b/cache'], kb: 3 * 1024 ** 2 },
    { baseId: 'inside', bucket: 'safe', paths: ['/demo/c/one', '/demo/c/two'], kb: 2 * 1024 ** 2 },
    { baseId: 'pruned', bucket: 'safe', paths: ['/demo/d/cache'], kb: 1 * 1024 ** 2, kbIncomplete: true },
  ] }
  const html = renderWithData(mutate, 'zh', { ...mockOverview, report })
  assert.equal((html.match(/其中 1 个路径可清理/g) || []).length, 4, 'three rows and the selected directory show counts')
  assert.match(html, /其中可清理 2\.0 GB/)
  assert.doesNotMatch(html, /其中可清理 [13]\.0 GB/)
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
    batchId: 'mixed', at: now - 86400000, count: 6, restorable: 2, restored: 2, purged: true,
    items: [
      { from: '/demo/live', exists: true, kb: null },
      { from: '/demo/restored', restored: true, restoredTo: '/demo/restored (restored)', restoredAt: now - 3000, kb: 1024, category: 'leftover', kbScope: 'path' },
      { from: '/demo/deleted', deleted: true, deletedAt: now - 2000, kb: 2048, category: 'dev' },
      { from: '/demo/unknown', exists: false, kb: null },
      { from: '/demo/group-restored', restored: true, restoredAt: now - 1000, kb: 4 * 1024 ** 2, category: 'leftover' },
      { from: '/demo/group-live', exists: true, category: 'leftover' },
    ],
  }] }
  const html = renderWithData(mutate, 'en', overview)
  assert.match(html, /Restored · 1 items · About 1 MB/)
  assert.match(html, /Restored to \/demo\/restored \(restored\)/)
  assert.match(html, /Permanently deleted · 1 items · About 2 MB/)
  assert.match(html, /Outcome unrecorded · 1 items/)
  assert.match(html, /Still restorable · 2 items</)
  assert.doesNotMatch(html, /4\.0 GB/)
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
      items: [{ from: '/tmp/x/media', to: '/trash/media', exists: true, kb: 100000, category: 'leftover', kbScope: 'path' }],
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

test('software page offers an explicit journal reset, including in English', () => {
  const mutate = cases.find(([name]) => name === 'software-journal-error')[1]
  assert.match(renderView(mutate), /重置操作记录/)
  assert.match(renderView(mutate, 'en'), /Reset operation history/)
})

test('software page shows a partial desktop warning without hiding readable apps', () => {
  const mutate = cases.find(([name]) => name === 'software-source-warning')[1]
  assert.match(renderView(mutate), /部分应用无法读取；已读取的应用仍可单独处理/)
  assert.match(renderView(mutate, 'en'), /the readable ones can still be handled individually/)
})

test('software page keeps readable apps actionable when the desktop source is partial', () => {
  const mutate = cases.find(([name]) => name === 'software-partial-source')[1]
  const zh = renderView(mutate)
  assert.match(zh, /Readable App/)
  assert.match(zh, /预览卸载/, 'readable app keeps its uninstall action')
  assert.ok(zh.indexOf('Readable App') < zh.indexOf('暂不能处理'), 'readable app stays in the actionable list')
  assert.ok(zh.indexOf('Blocked App') > zh.indexOf('暂不能处理'), 'blocked app stays in the collapsed section')
  assert.match(zh, /部分应用无法读取/)
})

test('software page reports when every source failed instead of an empty result', () => {
  const mutate = cases.find(([name]) => name === 'software-all-sources-failed')[1]
  const zh = renderView(mutate)
  assert.match(zh, /所有软件来源都读取失败/)
  assert.ok(!zh.includes('没有匹配的软件'), 'a total source failure is not an empty result')
  assert.match(zh, /来源查询失败/)
  const en = renderView(mutate, 'en')
  assert.match(en, /Every software source failed/)
  assert.ok(!en.includes('No matching software'))
})

test('software page sorts actionable items by name and groups blocked ones by reason', () => {
  const mutate = cases.find(([name]) => name === 'software-grouped')[1]
  const zh = renderView(mutate)
  assert.ok(zh.includes('暂不能处理'), 'blocked section summary')
  assert.ok(zh.indexOf('Alpha App') < zh.indexOf('Zeta App'), 'actionable items sorted by name')
  assert.ok(zh.indexOf('Zeta App') < zh.indexOf('暂不能处理'), 'actionable items come before the blocked section')
  assert.ok(zh.indexOf('Running App') > zh.indexOf('暂不能处理'), 'blocked items stay inside the collapsed section')
  assert.ok(zh.indexOf('应用正在运行或无法确认运行状态') < zh.indexOf('系统组件受保护'), 'blocked groups follow the fixed reason order')
  const en = renderView(mutate, 'en')
  assert.ok(en.includes('Not actionable yet'), 'english blocked section summary')
  assert.ok(en.indexOf('Alpha App') < en.indexOf('Zeta App'), 'english actionable items sorted by name')
})
