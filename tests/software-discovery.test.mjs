import test from 'node:test'
import assert from 'node:assert/strict'
import { discoverSoftware } from '../lib/software-discovery.js'
const manager = (id, provider = 'npm') => ({ id, provider, file: '/demo/' + id + '/node', prefixArgs: [], stamps: [], bin: '/demo/' + id })

test('two npm environments retain separate installation identities', async () => {
  const result = await discoverSoftware({ desktop: false, managers: [manager('node-a'), manager('node-b')], run: async (file, args) => args[0] === 'prefix' ? file.replace('/node', '') : JSON.stringify({ dependencies: { hello: { version: '1.0.0' } } }) })
  assert.equal(result.items.length, 2)
  assert.notEqual(result.items[0].id, result.items[1].id)
  assert.ok(result.items.every(i => i.command.args.includes('--global') && i.command.args.includes('--ignore-scripts')))
})

test('malformed manager output cannot authorize partial packages', async () => {
  const result = await discoverSoftware({ desktop: false, managers: [manager('node-a')], run: async (_f, args) => args[0] === 'prefix' ? '/demo/a' : JSON.stringify({ dependencies: { hello: { version: '1.0' }, '--prefix=/': { version: '2.0' } } }) })
  assert.equal(result.items.length, 0)
  assert.equal(result.sources[0].status, 'error')
})

test('brew reverse dependencies and runtimes cannot be uninstalled', async () => {
  const data = { formulae: [{ name: 'openssl', installed: [{ version: '3', runtime_dependencies: [] }] }, { name: 'node', installed: [{ version: '24', runtime_dependencies: [{ full_name: 'openssl' }] }] }], casks: [] }
  const result = await discoverSoftware({ desktop: false, managers: [manager('brew-a', 'brew')], run: async (_f, args) => args[0] === '--prefix' ? '/demo/brew' : JSON.stringify(data) })
  assert.equal(result.items.find(x => x.name === 'openssl').blockReason, 'has_dependents')
  assert.equal(result.items.find(x => x.name === 'node').blockReason, 'protected_runtime')
})

test('unknown uv format fails closed instead of reporting no installed tools', async () => {
  const result = await discoverSoftware({ desktop: false, managers: [manager('uv-a', 'uv')], run: async (_f, args) => args[1] === 'dir' ? '/demo/tools' : 'new-format: hello=1.0' })
  assert.equal(result.sources[0].status, 'error')
  assert.deepEqual(result.items, [])
})

test('WinGet portable is bound to a product code and scope, while generic EXEs use system settings', async () => {
  const data = { errors: [], winGetFile: process.execPath, items: [
    { key: 'arp-portable', name: 'Demo Tool', version: '1.0', location: 'C:\\Demo\\Portable', scope: 'user', action: 'winget-portable', productCode: 'Demo.Tool_Source', winGetId: 'Demo.Tool', winGetSource: 'Source' },
    { key: 'arp-exe', name: 'Demo App', version: '1.0', location: 'C:\\Demo\\App', scope: 'machine', action: '', blockReason: 'vendor_uninstaller_required', uninstallString: 'cmd /c invalid' },
  ] }
  const result = await discoverSoftware({ platform: 'win32', managers: [], run: async () => JSON.stringify(data) })
  const portable = result.items.find(x => x.provider === 'WinGet')
  assert.deepEqual(portable.command?.args, ['uninstall', '--product-code', 'Demo.Tool_Source', '--exact', '--scope', 'user', '--preserve', '--disable-interactivity'])
  assert.equal(result.items.find(x => x.name === 'Demo App').executable, false)
})

test('one unreadable app is a warning, a broken app root is a partial source', async () => {
  const app = { key: 'com.demo.one', name: 'Demo', version: '1.0', location: '/Applications/Demo.app', bundleId: 'com.demo.one', blockReason: '', action: 'move-app' }
  const run = data => async () => JSON.stringify(data)
  const warned = await discoverSoftware({ platform: 'darwin', managers: [], run: run({ items: [app], errors: ['unreadable_app'] }) })
  const warnedDesktop = warned.sources.find(source => source.id === 'desktop')
  assert.equal(warnedDesktop.status, 'ok')
  assert.equal(warnedDesktop.warning, 'desktop_partial')
  assert.equal(warnedDesktop.unreadable, 1)
  assert.equal(warned.items.length, 1)

  const partial = await discoverSoftware({ platform: 'darwin', managers: [], run: run({ items: [app], errors: ['symlink_root'] }) })
  const partialDesktop = partial.sources.find(source => source.id === 'desktop')
  assert.equal(partialDesktop.status, 'partial')
  assert.equal(partialDesktop.error, 'desktop_partial')
})
