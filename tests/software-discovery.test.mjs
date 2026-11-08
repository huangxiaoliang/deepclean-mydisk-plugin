import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { discoverSoftware, parseVendorUninstall } from '../lib/software-discovery.js'
const manager = (id, provider = 'npm') => ({ id, provider, file: '/demo/' + id + '/node', prefixArgs: [], stamps: [], bin: '/demo/' + id })

test('a missing global npm prefix means no global packages, not a broken source', async () => {
  const calls = []
  const result = await discoverSoftware({
    desktop: false,
    managers: [manager('node-a')],
    run: async (_file, args) => { calls.push(args[0]); if (args[0] === 'prefix') return '/demo/never-installed'; return JSON.stringify({ dependencies: { hello: { version: '1.0' } } }) },
  })
  assert.equal(calls.includes('list'), false, 'npm list must not run against a missing prefix')
  assert.equal(result.sources[0].status, 'ok')
  assert.equal(result.items.length, 0)
})

test('two npm environments retain separate installation identities', async () => {
  const result = await discoverSoftware({ desktop: false, managers: [manager('node-a'), manager('node-b')], run: async (file, args) => args[0] === 'prefix' ? (file.includes('node-a') ? process.cwd() : path.dirname(process.cwd())) : JSON.stringify({ dependencies: { hello: { version: '1.0.0' } } }) })
  assert.equal(result.items.length, 2)
  assert.notEqual(result.items[0].id, result.items[1].id)
  assert.ok(result.items.every(i => i.command.args.includes('--global') && i.command.args.includes('--ignore-scripts')))
})

test('malformed manager output cannot authorize partial packages', async () => {
  const result = await discoverSoftware({ desktop: false, managers: [manager('node-a')], run: async (_f, args) => args[0] === 'prefix' ? process.cwd() : JSON.stringify({ dependencies: { hello: { version: '1.0' }, '--prefix=/': { version: '2.0' } } }) })
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

test('windows inventory runs the bundled script through an encoded command', async () => {
  const calls = []
  const result = await discoverSoftware({ platform: 'win32', managers: [], run: async (file, args) => { calls.push({ file, args }); return JSON.stringify({ errors: [], winGetFile: '', items: [] }) } })
  assert.equal(result.sources.find(source => source.id === 'desktop').status, 'ok')
  const desktop = calls.find(call => call.args.includes('-EncodedCommand'))
  assert.ok(desktop, 'desktop inventory must use -EncodedCommand')
  assert.ok(!desktop.args.includes('-File'), 'a script file would be blocked by the default Restricted policy')
  const encoded = desktop.args[desktop.args.indexOf('-EncodedCommand') + 1]
  const script = Buffer.from(encoded, 'base64').toString('utf16le')
  assert.match(script, /Get-AppxPackage/)
  assert.match(script, /Uninstall/)
})

test('registry entries without an install location keep separate identities', async () => {
  const entry = (key, name, location) => ({ key, name, version: '1.0', location, scope: 'machine', action: '', blockReason: 'vendor_uninstaller_required' })
  const data = { errors: [], winGetFile: '', items: [
    entry('arp-a', 'App A', ''),
    entry('arp-b', 'App B', ''),
    entry('arp-c', 'App C', 'C:\\Shared'),
    entry('arp-d', 'App D', 'C:\\Shared'),
  ] }
  const result = await discoverSoftware({ platform: 'win32', managers: [], run: async () => JSON.stringify(data) })
  assert.deepEqual(result.items.map(item => item.name).sort(), ['App A', 'App B', 'App C'])
})

test('a start menu lookup failure is a warning and resource packages stay protected', async () => {
  const appx = (key, name, identityName, extra = {}) => ({ key, name, identityName, startName: name, version: '1.0', location: 'C:\\Program Files\\WindowsApps\\' + key, scope: 'user', action: 'appx', packageFullName: key + '_1.0.0.0_x64__abc', resourcePackage: false, ...extra })
  const data = { errors: ['startapps_unavailable'], winGetFile: '', items: [
    appx('Microsoft.WindowsNotepad', '记事本', 'Microsoft.WindowsNotepad'),
    appx('Microsoft.LanguageResource', 'Language resource', 'Microsoft.LanguageResource', { resourcePackage: true, blockReason: 'protected_system' }),
  ] }
  const result = await discoverSoftware({ platform: 'win32', managers: [], run: async () => JSON.stringify(data) })
  const desktop = result.sources.find(source => source.id === 'desktop')
  assert.equal(desktop.status, 'ok', 'a cosmetic Start menu lookup failure must not break the source')
  assert.equal(desktop.warning, 'desktop_partial')
  assert.equal(desktop.unreadable, 1)
  const notepad = result.items.find(item => item.identityName === 'Microsoft.WindowsNotepad')
  assert.equal(notepad.name, '记事本')
  const resource = result.items.find(item => item.identityName === 'Microsoft.LanguageResource')
  assert.equal(resource.executable, false)
  assert.equal(resource.blockReason, 'protected_system')
})

test('vendor uninstall strings are parsed into one executable plus argv, never a shell', () => {
  assert.deepEqual(parseVendorUninstall('"C:\\Program Files\\Git\\unins000.exe" /VERYSILENT'), { kind: 'vendor', file: 'C:\\Program Files\\Git\\unins000.exe', args: ['/VERYSILENT'] })
  assert.deepEqual(parseVendorUninstall('C:\\Program Files\\7-Zip\\Uninstall.exe'), { kind: 'vendor', file: 'C:\\Program Files\\7-Zip\\Uninstall.exe', args: [] })
  assert.deepEqual(parseVendorUninstall('MsiExec.exe /X{9E3B2247-66B4-47B2-8C65-986CC86ADEA6}'), { kind: 'msi', productCode: '{9E3B2247-66B4-47B2-8C65-986CC86ADEA6}' })
  assert.equal(parseVendorUninstall('cmd /c del C:\\x'), null, 'a shell command is not an uninstaller')
  assert.equal(parseVendorUninstall('rundll32.exe dfshim.dll,ShArpMaintain x'), null)
  assert.equal(parseVendorUninstall('uninstall.exe /S'), null, 'relative paths are refused')
  assert.deepEqual(parseVendorUninstall('C:\\a\\..\\b\\unins.exe'), { kind: 'vendor', file: 'C:\\b\\unins.exe', args: [] }, 'a path that resolves is normalized')
  assert.equal(parseVendorUninstall('"C:\\a\\unins.exe /S'), null, 'unbalanced quotes are refused')
  assert.equal(parseVendorUninstall('C:\\a\\unins.exe "unterminated'), null)
  assert.equal(parseVendorUninstall(undefined), null)
})

test('a registered vendor uninstaller becomes runnable, interpreters stay blocked', { skip: process.platform !== 'win32' }, async () => {
  const exe = process.execPath
  const data = { errors: [], winGetFile: '', items: [
    { key: 'arp-vendor', name: 'Demo Vendor', version: '1.0', location: 'C:\\Demo\\Vendor', scope: 'machine', action: '', blockReason: '', uninstallString: `"${exe}" --version` },
    { key: 'arp-shell', name: 'Demo Shell', version: '1.0', location: 'C:\\Demo\\Shell', scope: 'machine', action: '', blockReason: '', uninstallString: 'cmd /c whoami' },
    { key: 'arp-msi', name: 'Demo Msi', version: '1.0', location: 'C:\\Demo\\Msi', scope: 'machine', action: '', blockReason: '', uninstallString: 'MsiExec.exe /X{9E3B2247-66B4-47B2-8C65-986CC86ADEA6}' },
  ] }
  const result = await discoverSoftware({ platform: 'win32', managers: [], run: async () => JSON.stringify(data) })
  const vendor = result.items.find(item => item.name === 'Demo Vendor')
  assert.equal(vendor.executable, true)
  assert.equal(vendor.command.kind, 'vendor')
  assert.deepEqual(vendor.command.args, ['--version'])
  assert.equal(vendor.action, 'vendor')
  assert.ok(vendor.warnings.includes('vendor_uninstaller'))
  const shell = result.items.find(item => item.name === 'Demo Shell')
  assert.equal(shell.executable, false)
  assert.equal(shell.blockReason, 'vendor_uninstaller_required')
  const msi = result.items.find(item => item.name === 'Demo Msi')
  assert.equal(msi.executable, true)
  assert.deepEqual(msi.command, { kind: 'msi' })
  assert.equal(msi.productCode, '{9E3B2247-66B4-47B2-8C65-986CC86ADEA6}')
})

test('a failed brew source does not block unrelated macOS apps', async () => {
  const app = { key: 'com.demo.one', name: 'Demo', version: '1.0', location: '/Applications/Demo.app', bundleId: 'com.demo.one', blockReason: '', action: 'move-app' }
  const result = await discoverSoftware({
    platform: 'darwin',
    managers: [manager('brew-a', 'brew')],
    run: async (file) => {
      if (file.includes('brew')) throw Object.assign(new Error('source_failed'), { code: 'source_failed' })
      return JSON.stringify({ items: [app], errors: [] })
    },
  })
  assert.equal(result.sources.find(source => source.name === 'brew').status, 'error')
  const demo = result.items.find(item => item.name === 'Demo')
  assert.equal(demo.blockReason, '')
  assert.equal(demo.executable, true)
})

test('a cask that ships pkg/uninstall stanzas is still runnable by brew', async () => {
  const data = { formulae: [], casks: [{ token: 'demo-app', name: ['Demo App'], installed: '1.0', artifacts: [{ pkg: ['Demo.pkg'] }] }] }
  const result = await discoverSoftware({ desktop: false, managers: [manager('brew-a', 'brew')], run: async (_file, args) => args[0] === '--prefix' ? '/demo/brew' : JSON.stringify(data) })
  const item = result.items.find(x => x.name === 'Demo App')
  assert.equal(item.executable, true)
  assert.equal(item.blockReason, '')
  assert.ok(item.warnings.includes('vendor_scripts'))
})

test('a brew service only blocks when it is actually running', async () => {
  const data = { formulae: [{ name: 'svc', installed: [{ version: '1.0', runtime_dependencies: [] }], service: { run: ['svc'] } }], casks: [] }
  const stopped = await discoverSoftware({ desktop: false, managers: [manager('brew-a', 'brew')], run: async (_file, args) => args[0] === '--prefix' ? '/demo/brew' : args[0] === 'services' ? '[]' : JSON.stringify(data) })
  assert.equal(stopped.items.find(x => x.name === 'svc').executable, true)
  const started = await discoverSoftware({ desktop: false, managers: [manager('brew-a', 'brew')], run: async (_file, args) => args[0] === '--prefix' ? '/demo/brew' : args[0] === 'services' ? JSON.stringify([{ name: 'svc', status: 'started' }]) : JSON.stringify(data) })
  assert.equal(started.items.find(x => x.name === 'svc').blockReason, 'service_requires_manual')
  const unknown = await discoverSoftware({ desktop: false, managers: [manager('brew-a', 'brew')], run: async (_file, args) => { if (args[0] === '--prefix') return '/demo/brew'; if (args[0] === 'services') throw Object.assign(new Error('source_failed'), { code: 'source_failed' }); return JSON.stringify(data) } })
  assert.equal(unknown.items.find(x => x.name === 'svc').blockReason, 'service_requires_manual', 'an unreadable service list stays fail-closed')
})

test('unknown dependency data only blocks the formula that lacks it', async () => {
  const data = { formulae: [
    { name: 'good', installed: [{ version: '1.0', runtime_dependencies: [] }] },
    { name: 'odd', installed: [{ version: '1.0' }] },
  ], casks: [] }
  const result = await discoverSoftware({ desktop: false, managers: [manager('brew-a', 'brew')], run: async (_file, args) => args[0] === '--prefix' ? '/demo/brew' : JSON.stringify(data) })
  assert.equal(result.items.find(x => x.name === 'good').executable, true)
  assert.equal(result.items.find(x => x.name === 'odd').blockReason, 'dependencies_unknown')
})

test('installer-reported size is carried as a fallback hint', async () => {
  const app = { key: 'arp-size', name: 'Sized App', version: '1.0', location: 'C:\\Demo\\Sized', scope: 'machine', action: '', blockReason: '', estimatedSizeKb: 12345 }
  const result = await discoverSoftware({ platform: 'win32', managers: [], run: async () => JSON.stringify({ errors: [], winGetFile: '', items: [app] }) })
  assert.equal(result.items[0].estimatedSizeKb, 12345)
  assert.equal(result.items[0].sizeBytes, null, 'the measured size is filled in by the host later')
  const bad = await discoverSoftware({ platform: 'win32', managers: [], run: async () => JSON.stringify({ errors: [], winGetFile: '', items: [{ ...app, key: 'arp-size-2', estimatedSizeKb: 'oops' }] }) })
  assert.equal(bad.items[0].estimatedSizeKb, null)
})

test('a linked global npm package is runnable with a warning', async () => {
  const result = await discoverSoftware({
    desktop: false,
    managers: [manager('node-a')],
    run: async (_file, args) => args[0] === 'prefix' ? process.cwd() : JSON.stringify({ dependencies: { hello: { version: '1.0.0', link: true } } }),
  })
  const item = result.items.find(x => x.name === 'hello')
  assert.equal(item.executable, true)
  assert.ok(item.warnings.includes('linked_package'))
})
