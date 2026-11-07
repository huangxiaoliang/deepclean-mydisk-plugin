import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

// Like pages.test.mjs, seed only initial page/data. Execute the real button
// handlers with a small hook driver; no DOM or network service is involved.
function panelDriver({ startView = 'clean', cleanBatches = [], wizardBatchId = '' } = {}) {
  const overview = { at: Date.now(), platform: 'darwin', whitelist: [], history: [], cleanBatches,
    scan: { status: 'done' }, report: { home: '/demo', caches: [], devCaches: [], browsers: [], leftoverGroups: [] } }
  let source = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  const seeds = [
    ['useState("home")', 'useState(' + JSON.stringify(startView) + ')'],
    ['const [overview, setOverview] = useState(null);', `const [overview, setOverview] = useState(${JSON.stringify(overview)});`],
    ['const [lastCleanResult, setLastCleanResult] = useState(null);', 'const [lastCleanResult, setLastCleanResult] = useState({batchIds:["batch-a","batch-b"],moved:2,kb:2048,allocated:2097152});'],
  ]
  if (wizardBatchId) {
    seeds.push(['const [wizard, setWizard] = useState({ open: false, phase: "idle", batchId: "", batchIds: [], releasedKb: 0, error: "" });',
      'const [wizard, setWizard] = useState(' + JSON.stringify({ open: true, phase: 'done', batchId: wizardBatchId, batchIds: [wizardBatchId], releasedKb: 1024 }) + ');'])
  }
  for (const [from,to] of seeds) { assert.ok(source.includes(from), 'initial-state fixture must match'); source = source.replace(from,to) }
  const hooks = []
  let cursor = 0, definition, Panel
  const React = {
    Fragment: Symbol('fragment'),
    createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) }),
    useState(initial) {
      const index = cursor++
      if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial
      return [hooks[index], value => { hooks[index] = typeof value === 'function' ? value(hooks[index]) : value }]
    },
    useRef(initial) { const index = cursor++; return hooks[index] ||= { current: initial } },
    useEffect() {}, useCallback: callback => callback,
  }
  const requests = []
  const fetch = async (url, options = {}) => {
    if (options.method === 'POST') requests.push({ url, body: JSON.parse(options.body) })
    return { ok: true, json: async () => url.endsWith('/overview') ? overview : url.endsWith('/state') ? { canUndo: false } : { total: { purged: 2, freedBytes: 2097152 } } }
  }
  new Function('window', 'localStorage', 'fetch', source)(
    { __ModuleLoader__: { load(value) { definition = value } } }, { getItem: () => null, setItem() {} }, fetch)
  definition.factory(() => React).apply({ slots: { inject(_name, cb) { cb() }, register(spec, component) {
    if (spec.name === 'main') Panel = component
  } } })
  let tree
  function render() { cursor = 0; tree = Panel(); return tree }
  function text(node) { return node == null || node === false ? '' : typeof node !== 'object' ? String(node) : node.children.map(text).join('') }
  function find(node, label) {
    if (!node || typeof node !== 'object') return null
    if (node.type === 'button' && (typeof label === 'function' ? label(node, text(node)) : text(node) === label)) return node
    for (const child of node.children) { const match = find(child, label); if (match) return match }
    return null
  }
  async function click(label) {
    const button = find(tree, label)
    assert.ok(button, 'button missing: ' + label)
    assert.ok(!button.props.disabled, 'button disabled: ' + label)
    await button.props.onClick()
    render()
  }
  render()
  return { requests, click, text: () => text(tree), hasButton: label => !!find(tree, label) }
}

test('permanent deletion requires a second confirmation and targets every batch of this cleanup', async () => {
  const driver = panelDriver()
  await driver.click('永久删除并释放')
  assert.equal(driver.requests.length, 0, 'first click must never submit a purge')
  assert.match(driver.text(), /无法撤销/)
  await driver.click('取消')
  assert.equal(driver.requests.length, 0, 'cancel must never submit a purge')
  await driver.click('永久删除并释放')
  await driver.click('确认永久删除')
  assert.deepEqual(driver.requests, [{ url: '/dsh-deepclean/api/quarantine/purge', body: { batchIds: ['batch-a', 'batch-b'] } }])
})

function cleanupBatch(batchId, category, age, restorable = true) {
  return {
    batchId, at: Date.now() - age, count: 1, restorable: restorable ? 1 : 0,
    items: [{ from: '/demo/' + batchId, category, kb: 1024, exists: restorable, restored: !restorable }],
  }
}

const older = cleanupBatch('older', 'dev', 2000)
const latest = cleanupBatch('latest', 'browser', 1000)
const pickOlder = (node) => node.props['aria-label']?.startsWith('开发缓存 · ')

test('home recent-cleanup link opens its own batch after selecting an older one', async () => {
  const driver = panelDriver({ startView: 'history', cleanBatches: [latest, older] })
  await driver.click(pickOlder)
  await driver.click('永久删除此批次')
  await driver.click('体检')
  await driver.click('查看与恢复')
  assert.ok(!driver.hasButton('确认永久删除'), 'a previous batch confirmation must not carry over')
  await driver.click('恢复此批次')
  assert.deepEqual(driver.requests, [{ url: '/dsh-deepclean/api/restore', body: { batchId: 'latest' } }])
})

test('home recent-cleanup link shows a finished batch without offering to restore an older one', async () => {
  const finished = cleanupBatch('finished', 'browser', 1000, false)
  const driver = panelDriver({ startView: 'home', cleanBatches: [finished, older] })
  await driver.click('查看与恢复')
  assert.ok(driver.hasButton(node => node.props['aria-pressed'] && node.props['aria-label']?.startsWith('浏览器缓存 · ')))
  assert.ok(!driver.hasButton('恢复此批次'))
})

test('cleanup result opens the last batch of that cleanup even with another newer batch', async () => {
  const own = cleanupBatch('batch-b', 'app', 1500)
  const driver = panelDriver({ startView: 'history', cleanBatches: [latest, own, older] })
  await driver.click(pickOlder)
  await driver.click('清理')
  await driver.click('清理历史')
  await driver.click('恢复此批次')
  assert.deepEqual(driver.requests, [{ url: '/dsh-deepclean/api/restore', body: { batchId: 'batch-b' } }])
})

test('wizard result opens its own batch', async () => {
  const driver = panelDriver({ startView: 'home', cleanBatches: [latest, older], wizardBatchId: older.batchId })
  await driver.click('清理历史')
  await driver.click('恢复此批次')
  assert.deepEqual(driver.requests, [{ url: '/dsh-deepclean/api/restore', body: { batchId: 'older' } }])
})

test('an unavailable linked batch never falls back to a different restore action', async () => {
  const driver = panelDriver({ cleanBatches: [older] })
  await driver.click('清理历史')
  assert.match(driver.text(), /找不到要查看的清理批次/)
  assert.ok(!driver.hasButton('恢复此批次'))
  await driver.click(pickOlder)
  await driver.click('恢复此批次')
  assert.deepEqual(driver.requests, [{ url: '/dsh-deepclean/api/restore', body: { batchId: 'older' } }])
})
