import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const scriptPath = new URL('../resources/scripts/software-windows.ps1', import.meta.url)

// 这个脚本是 Windows 软件清单的真实入口；用与生产一致的 -EncodedCommand 方式跑，
// 顺便覆盖默认 Restricted 执行策略下的启动路径。
test('windows inventory script resolves Start menu names and protects resource packages', { skip: process.platform !== 'win32' }, () => {
  const helper = fs.readFileSync(scriptPath, 'utf8')
  assert.match(helper, /Get-StartApps/, 'friendly names come from the Start menu')
  assert.match(helper, /IsResourcePackage/, 'language/resource packages must be protected')
  const command = Buffer.from(`& {\n${helper}\n}`, 'utf16le').toString('base64')
  const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe')
  const result = spawnSync(powershell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', command], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  assert.equal(result.status, 0, String(result.stderr || '').slice(0, 500))
  const data = JSON.parse(result.stdout)
  assert.ok(Array.isArray(data.items) && data.items.length > 0)
  assert.ok(Array.isArray(data.errors))
  const appx = data.items.filter((item) => item.action === 'appx')
  assert.ok(appx.length > 0, 'the machine should expose at least one current-user Appx')
  for (const item of appx) {
    assert.equal(typeof item.identityName, 'string')
    assert.equal(typeof item.startName, 'string')
    assert.equal(typeof item.resourcePackage, 'boolean')
    assert.ok(String(item.name).trim().length > 0)
    if (item.resourcePackage) assert.equal(item.blockReason, 'protected_system')
  }
  assert.ok(appx.some((item) => item.startName), 'at least one installed package has a Start menu display name')
})
