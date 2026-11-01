import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { renderToString } from 'react-dom/server'

const require = createRequire(import.meta.url)
const source = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')

function loadPanel(lang) {
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
  mod.apply({ slots: { inject(_n, cb) { cb() }, register(spec, comp) { regs.push({ spec, comp }); return () => {} } } })
  return { mod, regs }
}

test('client bundle registers sidebar panel and main view', () => {
  const { mod, regs } = loadPanel('zh')
  assert.deepEqual(Object.keys(mod).sort(), ['apply', 'inject'])
  assert.deepEqual(mod.inject, ['slots'])
  assert.equal(regs.length, 2)
  assert.equal(regs.find((r) => r.spec.name === 'sidebar.panellist').spec.id, 'deepclean')
  assert.equal(regs.find((r) => r.spec.name === 'main').spec.key, 'deepclean')
})

test('client bundle renders Chinese and English', () => {
  const zh = loadPanel('zh')
  const zhHtml = renderToString(require('react').createElement(zh.regs.find((r) => r.spec.name === 'main').comp))
  assert.match(zhHtml, /快速扫描/)
  for (const label of ['体检', '空间', '清理', '历史', '设置']) assert.match(zhHtml, new RegExp(label))
  const en = loadPanel('en')
  const enHtml = renderToString(require('react').createElement(en.regs.find((r) => r.spec.name === 'main').comp))
  assert.match(enHtml, /Quick scan/)
  assert.doesNotMatch(enHtml, /快速扫描/)
  for (const label of ['Checkup', 'Space', 'Clean', 'History', 'Settings']) assert.match(enHtml, new RegExp(label))
  assert.doesNotMatch(enHtml, /Similar photos/)
})

test('client bundle contains safety copy and platform-aware commands', () => {
  assert.match(source, /Moves only/)
  assert.match(source, /Why here/)
  assert.match(source, /Move-Item -LiteralPath/)
  assert.doesNotMatch(source, /rm -rf/)
})
