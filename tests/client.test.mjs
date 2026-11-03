import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { renderToString } from 'react-dom/server'

const require = createRequire(import.meta.url)
const source = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')

function loadPanel(lang, extra = {}) {
  globalThis.localStorage = {
    getItem: (k) => (k === 'deepclean-lang' ? lang : k === 'deepclean-safety-ok' ? '1' : null),
    setItem: () => {},
  }
  let def
  globalThis.window = { __ModuleLoader__: { load(d) { def = d } } }
  eval(source)
  assert.ok(def, 'bundle must call __ModuleLoader__.load')
  const mod = def.factory((id) => require(id))
  const regs = []
  mod.apply({
    slots: { inject(_n, cb) { cb() }, register(spec, comp) { regs.push({ spec, comp }); return () => {} } },
    get: (name) => extra[name],
  })
  return { mod, regs }
}

/** A minimal client Session/Session Controller double for the AI bridge. */
function fakeSessions({ current = 'session-1', ok = true } = {}) {
  const calls = []
  const sessions = {
    list: {
      getSnapshot: () => ({
        ids: current ? [current] : [],
        byId: current ? { [current]: { id: current, retainedBy: { mainView: 1 } } } : {},
      }),
    },
    binding: (id) => ({
      sessionId: id,
      session: {
        prompt: async (content, mode) => {
          calls.push({ id, content, mode })
          return { ok }
        },
      },
    }),
  }
  return { sessions, calls }
}

test('client bundle registers sidebar panel and main view', () => {
  const { mod, regs } = loadPanel('zh')
  assert.deepEqual(Object.keys(mod).sort(), ['apply', 'inject'])
  assert.deepEqual(mod.inject, ['slots'], 'optional AI services are read with ctx.get so the panel still renders without them')
  assert.equal(regs.length, 2)
  assert.equal(regs.find((r) => r.spec.name === 'sidebar.panellist').spec.id, 'deepclean')
  assert.equal(regs.find((r) => r.spec.name === 'main').spec.key, 'deepclean')
})

test('client bundle renders Chinese and English', () => {
  const zh = loadPanel('zh')
  const zhHtml = renderToString(require('react').createElement(zh.regs.find((r) => r.spec.name === 'main').comp))
  assert.match(zhHtml, /开始扫描/)
  for (const label of ['体检', '空间', '清理', '历史', '设置']) assert.match(zhHtml, new RegExp(label))
  const en = loadPanel('en')
  const enHtml = renderToString(require('react').createElement(en.regs.find((r) => r.spec.name === 'main').comp))
  assert.match(enHtml, /Start scan/)
  assert.doesNotMatch(enHtml, /开始扫描/)
  for (const label of ['Checkup', 'Space', 'Clean', 'History', 'Settings']) assert.match(enHtml, new RegExp(label))
  assert.doesNotMatch(enHtml, /Similar photos/)
})

test('AI bridge injects a prompt into the current main-view session and returns to the conversation', async () => {
  const { sessions, calls } = fakeSessions()
  const panel = []
  const layout = { selectPanel: (id) => panel.push(id) }
  const { regs } = loadPanel('zh', { sessions, layout })
  const ai = regs.find((r) => r.spec.name === 'main').spec.inject().ai
  assert.equal(ai.available, true)
  const status = await ai.ask('  解释一下这条目  ')
  assert.equal(status, 'sent')
  assert.deepEqual(calls, [{ id: 'session-1', content: [{ type: 'text', text: '解释一下这条目' }], mode: 'queue' }])
  assert.deepEqual(panel, [null], 'the panel returns to the Conversation after sending')
})

test('AI bridge degrades without a current session, a failed send, or the session service', async () => {
  const noSession = fakeSessions({ current: null })
  const first = loadPanel('zh', { sessions: noSession.sessions, layout: { selectPanel() {} } })
  assert.equal(await first.regs.find((r) => r.spec.name === 'main').spec.inject().ai.ask('hi'), 'no-session')
  assert.equal(noSession.calls.length, 0)

  const failing = fakeSessions({ ok: false })
  const second = loadPanel('zh', { sessions: failing.sessions, layout: { selectPanel() {} } })
  assert.equal(await second.regs.find((r) => r.spec.name === 'main').spec.inject().ai.ask('hi'), 'error')

  const bare = loadPanel('zh')
  const third = bare.regs.find((r) => r.spec.name === 'main').spec.inject().ai
  assert.equal(third.available, false)
  assert.equal(await third.ask('hi'), 'unavailable')
})

test('first-run checkup wizard defaults to a full scan', () => {
  assert.match(source, /wizardStart = useCallback\(\(full = true\)/)
  assert.match(source, /startScan\(full\)/)
  assert.match(source, /onClick: \(\) => wizardStart\(false\)/, 'quick scan stays available as an explicit option')
})

test('client bundle contains safety copy and platform-aware commands', () => {
  assert.match(source, /Moves by default|Moves only/)
  assert.match(source, /never automatically purged/)
  assert.match(source, /Move-Item -LiteralPath/)
  assert.doesNotMatch(source, /rm -rf/)
})

test('AI prompts stay read-only and forbid commands', () => {
  assert.match(source, /不要输出删除\/清理命令/, 'prompt rules forbid delete commands')
  assert.match(source, /只读工具（disk_inspect）返回的事实/, 'item prompts accept facts from the read-only tool only')
  assert.match(source, /可调用只读工具 disk_inspect/, 'item prompts can point the model at the read-only inspection tool')
  assert.doesNotMatch(source, /session\.prompt\([^)]*'steer'/, 'the panel never steers an in-flight turn')
})

/** Load the bundle with the prompt builders exposed for behavioural checks. */
function loadInstrumented(lang = 'zh') {
  globalThis.localStorage = { getItem: () => lang, setItem: () => {} }
  let def
  globalThis.window = { __ModuleLoader__: { load(d) { def = d } } }
  eval(source.replace('exports.apply = apply;', 'exports.__test = { aiReportDigest, aiItemPrompt, aiReviewPrompt };\nexports.apply = apply;'))
  const mod = def.factory((id) => require(id))
  mod.apply({ slots: { inject(_n, cb) { cb() }, register() { return () => {} } } })
  return mod.__test
}

test('AI report digest carries risk totals, category totals and unlisted aggregates', () => {
  const { aiReportDigest } = loadInstrumented('zh')
  const gb = 1024 * 1024 // report sizes are KB
  const rows = [
    { id: 'd:pnpm', category: 'dev', name: 'pnpm 缓存', paths: ['/Users/x/Library/pnpm/store'], kb: 2.27 * gb, note: 'pnpm store prune', checkable: true, recommended: true, protected: false },
    { id: 'd:codex', category: 'dev', name: 'Codex 运行缓存', paths: ['/x/codex'], kb: 1.58 * gb, note: 'Codex 缓存，需要时会重新下载', checkable: true, recommended: true, protected: false },
    { id: 'c:homebrew', category: 'other', name: 'Homebrew', paths: ['/x/brew'], kb: 552.6 * 1024, note: '缓存可重新生成', checkable: true, recommended: false, protected: false },
    { id: 'c:uv', category: 'other', name: 'uv', paths: ['/x/uv'], kb: 45.5 * 1024, note: '缓存可重新生成', checkable: true, recommended: false, protected: false },
    ...Array.from({ length: 12 }, (_, i) => ({ id: `c:rest${i}`, category: 'other', name: `rest${i}`, paths: [`/x/rest${i}`], kb: 1024, note: '缓存可重新生成', checkable: true, recommended: false, protected: false })),
    { id: 'g:txdocs', category: 'leftover', name: '腾讯文档', paths: ['/x/txdocs'], kb: 509.4 * 1024, note: '可能含聊天记录/文档/笔记', checkable: false, recommended: false, protected: false },
    { id: 'b:chrome', category: 'browser', name: 'Chrome · 缓存', paths: ['/x/chrome'], kb: 1.23 * gb, note: 'App 正在运行，退出后可清理', checkable: false, recommended: false, protected: false },
    { id: 'c:mine', category: 'other', name: '我的项目缓存', paths: ['/x/mine'], kb: 200 * 1024, note: '已加入保护，不会移动', checkable: false, recommended: false, protected: true },
  ]
  const report = {
    platform: 'macos', elapsed: 37.8, fda: { status: 'granted' },
    disk: { total: 228.27e9, used: 145.86e9, free: 82.41e9 },
    estimate: { safeKb: 0, cacheKb: 2.05 * gb, devKb: 4.48 * gb, totalKb: 6.52 * gb },
    bigFiles: [{ path: '/x/thread_history_1.sqlite', kb: 499.7 * 1024, ext: '.sqlite', mtime: Math.floor(Date.now() / 1000) }],
  }
  const text = aiReportDigest('zh', report, rows, Date.now())
  assert.match(text, /按分类合计/)
  assert.match(text, /推荐清理（2 项，合计 3\.85G）/)
  assert.match(text, /可选清理（14 项，合计/)
  assert.match(text, /另有 8 项未列出，合计/)
  assert.match(text, /App 正在运行[,，]退出后可清理/, 'needs-review rows keep their concrete reason')
  assert.match(text, /受保护（面板不会清理）（1 项，合计 200\.0M）/)
  assert.match(text, /可能含聊天记录\/文档\/笔记/)
  assert.match(text, /范围说明/)
  assert.match(text, /不等于整盘占用分布/)
  assert.match(text, /面板估算合计（已去重、不含需确认）：6\.52G/)
  assert.doesNotMatch(text, /pnpm store prune|npm cache clean --force/, 'digest must not leak shell commands from scanner advice')
  assert.match(text, /pnpm 缓存 · 2\.27G · 开发缓存 · 安装依赖时可能重新下载/, 'pnpm store must say it re-downloads on install')
  const en = aiReportDigest('en', report, rows, Date.now(), )
  assert.match(en, /Totals by category/)
  assert.match(en, /more not listed/)
})
