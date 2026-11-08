/** Read-only discovery. External invocations here are inventory queries only. */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const RES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../resources/scripts')
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
const validPackage = value => typeof value === 'string' && /^(?:@[a-z0-9_.-]+\/)?[a-z0-9][a-z0-9_.+@/-]*$/i.test(value) && value.length < 220 && !value.split('/').includes('..')
const runtime = /^(?:node(?:@.*)?|python(?:@.*)?|python3?(?:\.\d+)*|ruby(?:@.*)?|java|openjdk(?:@.*)?|npm|pipx|uv|homebrew|brew|dsh|deepseek-harness|deepclean-mydisk|corepack)$/i
const text = value => String(value || '').normalize('NFKC').replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, ' ').slice(0, 300)

// Interpreters and shells are never "the app's uninstaller", even when a registry
// entry points at them. Only a directly registered .exe is accepted.
const UNSAFE_UNINSTALLER = /^(?:cmd|powershell|pwsh|rundll32|wscript|cscript|mshta|reg|regedit|explorer|control|conhost)\.exe$/i
const WINDOWS_FILE = /^[a-zA-Z]:[\\/]/
const MSI_CODE = /\{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}/i

function splitArguments(text) {
  if (!text) return []
  const out = []
  let current = ''
  let quoted = false
  for (const ch of text) {
    if (ch === '"') { quoted = !quoted; continue }
    if (!quoted && /\s/.test(ch)) {
      if (current) { out.push(current); current = '' }
      continue
    }
    current += ch
    if (current.length > 512) return null
  }
  if (quoted) return null
  if (current) out.push(current)
  return out.length > 40 ? null : out
}

// Turns an ARP `UninstallString` into exactly one executable plus argv.
// The host never runs a command line from a string: only an absolute `.exe` path is
// accepted, interpreters are refused, and `msiexec` is routed to the MSI executor.
export function parseVendorUninstall(raw) {
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  if (!value || value.length > 2048 || /[\0\r\n]/.test(value)) return null
  let file = ''
  let rest = ''
  if (value.startsWith('"')) {
    const end = value.indexOf('"', 1)
    if (end < 3) return null
    file = value.slice(1, end)
    rest = value.slice(end + 1).trim()
  } else {
    const match = /^(.+?\.exe)(?:\s+([\s\S]*))?$/i.exec(value)
    if (!match) return null
    file = match[1]
    rest = (match[2] || '').trim()
  }
  if (!/\.exe$/i.test(file)) return null
  const base = file.slice(Math.max(file.lastIndexOf('\\'), file.lastIndexOf('/')) + 1).toLowerCase()
  if (base === 'msiexec.exe') {
    const code = MSI_CODE.exec(rest)
    return code ? { kind: 'msi', productCode: code[0] } : null
  }
  // Some installers register `C:\WINDOWS\..\ProgramData\...`; normalize instead of
  // refusing a path that resolves to a real location.
  if (!WINDOWS_FILE.test(file)) return null
  file = path.win32.normalize(file)
  if (!WINDOWS_FILE.test(file) || !/\.exe$/i.test(file)) return null
  if (UNSAFE_UNINSTALLER.test(path.win32.basename(file).toLowerCase())) return null
  const args = splitArguments(rest)
  return args ? { kind: 'vendor', file, args } : null
}

export function softwareEnv(extra = {}) {
  const env = { ...process.env, HOMEBREW_NO_AUTO_UPDATE: '1', HOMEBREW_NO_AUTOREMOVE: '1', HOMEBREW_NO_ANALYTICS: '1', HOMEBREW_NO_ENV_HINTS: '1', UV_NO_PROGRESS: '1', UV_NO_CONFIG: '1', npm_config_logs_max: '0', npm_config_update_notifier: 'false', NO_COLOR: '1', LC_ALL: 'C', ...extra }
  for (const name of ['NODE_OPTIONS', 'NODE_PATH', 'PYTHONPATH', 'PYTHONSTARTUP', 'BASH_ENV', 'ENV', 'RUBYOPT', 'RUBYLIB']) delete env[name]
  return env
}

export function readProcess(file, args, { env = {}, timeout = 25000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { shell: false, cwd: os.homedir(), env: softwareEnv(env), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = '', size = 0
    function stop(code) {
      clearTimeout(timer)
      child.stdout.destroy()
      child.stderr.destroy()
      child.kill()
      reject(Object.assign(new Error(code), { code }))
    }
    const timer = setTimeout(() => stop('source_timeout'), timeout)
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', chunk => {
      size += Buffer.byteLength(chunk)
      if (size > 8 * 1024 * 1024) stop('source_truncated')
      else out += chunk
    })
    child.stderr.on('data', chunk => {
      size += chunk.length
      if (size > 8 * 1024 * 1024) stop('source_truncated')
    })
    child.on('error', e => { clearTimeout(timer); reject(e) })
    child.on('close', code => {
      clearTimeout(timer)
      if (code !== 0) reject(Object.assign(new Error('source_failed'), { code: 'source_failed' }))
      else resolve(out.trim())
    })
  })
}

export function fileStamp(file) {
  const real = fs.realpathSync(file), st = fs.statSync(real)
  if (!st.isFile() || (process.platform !== 'win32' && (st.mode & 0o002))) throw new Error('unsafe_executable')
  if (process.platform !== 'win32') for (let p = path.dirname(real); p !== path.dirname(p); p = path.dirname(p)) {
    const parent = fs.statSync(p)
    if ((parent.mode & 0o002) || (typeof process.getuid === 'function' && ![0, process.getuid()].includes(parent.uid))) throw new Error('unsafe_executable')
  }
  return { path: real, dev: st.dev, ino: st.ino, size: st.size, mtime: st.mtimeMs }
}
function installationStamp(location) {
  try {
    const st = fs.lstatSync(location)
    if (st.isSymbolicLink()) return { symlink: true }
    const metadata = path.join(location, 'package.json')
    const info = fs.lstatSync(metadata, { throwIfNoEntry: false })
    const content = info?.isFile() && info.size <= 256 * 1024 ? digest(fs.readFileSync(metadata, 'utf8')) : null
    return { dev: st.dev, ino: st.ino, mtime: st.mtimeMs, metadata: content }
  } catch { return null }
}
function directories(root) {
  try { return fs.readdirSync(root, { withFileTypes: true }).filter(x => x.isDirectory()).slice(0, 60).map(x => path.join(root, x.name)) } catch { return [] }
}
function exists(p) { try { return fs.statSync(p).isFile() } catch { return false } }

export function managerCandidates(home = os.homedir(), platform = process.platform) {
  const win = platform === 'win32'
  const dirs = [...(process.env.PATH || '').split(path.delimiter).filter(p => path.isAbsolute(p)), path.join(home, '.local/bin'), '/opt/homebrew/bin', '/usr/local/bin']
  for (const root of [path.join(home, '.nvm/versions/node'), path.join(home, '.local/share/fnm/node-versions')]) {
    for (const v of directories(root)) dirs.push(path.join(v, 'bin'), path.join(v, 'installation/bin'))
  }
  const out = [], seen = new Set()
  for (const dir of [...new Set(dirs)]) for (const provider of ['brew', 'npm', 'pipx', 'uv']) {
    if (provider === 'brew' && win) continue
    let file = path.join(dir, provider + (win ? '.exe' : '')), prefixArgs = [], stamps = []
    if (provider === 'npm') {
      const node = path.join(dir, win ? 'node.exe' : 'node')
      let cli = path.join(dir, win ? 'node_modules/npm/bin/npm-cli.js' : '../lib/node_modules/npm/bin/npm-cli.js')
      try { if (!win && exists(path.join(dir, 'npm'))) cli = fs.realpathSync(path.join(dir, 'npm')) } catch {}
      if (!exists(node) || !exists(cli)) continue
      file = node; prefixArgs = [cli]
    }
    if (!exists(file)) continue
    try {
      stamps = [fileStamp(file), ...prefixArgs.map(fileStamp)]
      // Canonicalize execution identity, but keep the environment-specific directory.
      file = stamps[0].path
      prefixArgs = stamps.slice(1).map(stamp => stamp.path)
      const key = digest([provider, file, prefixArgs])
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ id: key, provider, file, prefixArgs, stamps, bin: dir })
    } catch { /* unsupported or unsafe executable */ }
  }
  return out
}

export async function discoverSoftware({ run = readProcess, managers = managerCandidates(), platform = process.platform, desktop = true } = {}) {
  const items = [], sources = []
  function add(m, key, name, version, location, metadata, args, options = {}) {
    if (!validPackage(key) || (m.provider === 'npm' && !/^(?:@[a-z0-9_.-]+\/)?[a-z0-9][a-z0-9_.-]*$/i.test(key)) || (['pipx', 'uv'].includes(m.provider) && !/^[a-z0-9][a-z0-9_.-]*$/i.test(key))) throw new Error('invalid_package_id')
    const blockReason = options.blockReason || (runtime.test(key) || /deepseek|deepclean|harness/i.test(key) ? 'protected_runtime' : '')
    const env = { PATH: m.bin + path.delimiter + (process.env.PATH || ''), ...options.env }
    items.push({ id: digest([m.id, key, location]), sourceId: m.id, provider: m.provider, packageId: key, name: text(name), version: text(version), location, kind: options.kind || 'terminal', sizeBytes: null, estimatedSizeKb: null,
      fingerprint: digest([m.stamps, metadata, installationStamp(location)]), executable: !blockReason, blockReason, warnings: options.warnings || ['reinstall_required', 'external_usage_unknown', 'data_not_removed'],
      command: { file: m.file, args: [...m.prefixArgs, ...args], env, stamps: m.stamps }, ...options.extra })
  }
  // Limit parallel process pressure; failures remain per-source, never become empty successful inventories.
  for (let offset = 0; offset < managers.length; offset += 3) await Promise.all(managers.slice(offset, offset + 3).map(async m => {
    const local = []
    const startIds = new Set(items.map(x => x.id))
    const source = { id: m.id, name: m.provider, location: m.bin, status: 'ok' }
    sources.push(source)
    const query = (args, env = {}) => run(m.file, [...m.prefixArgs, ...args], { env: { PATH: m.bin + path.delimiter + (process.env.PATH || ''), ...env } })
    try {
      if (m.provider === 'brew') {
        const data = JSON.parse(await query(['info', '--json=v2', '--installed']))
        if (!Array.isArray(data.formulae) || !Array.isArray(data.casks)) throw new Error('invalid_inventory')
        const prefix = await query(['--prefix'])
        if (!path.isAbsolute(prefix) || /[\r\n]/.test(prefix)) throw new Error('invalid_prefix')
        source.environment = prefix
        // Only a service that is actually running blocks uninstall. If brew services
        // cannot be read, formulae that declare a service stay blocked (fail closed).
        let startedServices = new Set()
        let servicesKnown = true
        if (data.formulae.some(f => f.service)) {
          try {
            const services = JSON.parse(await query(['services', 'list', '--json']))
            if (!Array.isArray(services)) throw new Error('invalid_inventory')
            startedServices = new Set(services.filter(row => row && row.status === 'started' && typeof row.name === 'string').map(row => row.name))
          } catch { servicesKnown = false }
        }
        for (const f of data.formulae) {
          if (!Array.isArray(f.installed) || !f.installed.length) throw new Error('invalid_inventory')
          const key = f.full_name || f.name
          const dependents = data.formulae.filter(other => other !== f && (other.installed || []).some(v => (v.runtime_dependencies || []).some(d => d.full_name === key || d.full_name === f.name))).map(x => x.name)
          const caskDependents = data.casks.filter(c => (c.depends_on?.formula || []).includes(f.name)).map(c => c.token)
          const deps = [...dependents, ...caskDependents]
          // A single keg with unknown dependency data only blocks that formula; the
          // real `brew uninstall` still refuses if another installed formula needs it.
          const dependenciesKnown = (f.installed || []).every(v => Array.isArray(v.runtime_dependencies))
          const serviceRunning = !!f.service && (!servicesKnown || startedServices.has(f.name) || startedServices.has(key))
          add(m, key, f.name, f.installed.map(v => v.version).join(', '), path.join(prefix, 'Cellar', f.name), f, ['uninstall', '--formula', key], { blockReason: deps.length ? 'has_dependents' : !dependenciesKnown ? 'dependencies_unknown' : serviceRunning ? 'service_requires_manual' : '', extra: { dependents: deps } })
        }
        for (const c of data.casks) {
          if (!c.installed) throw new Error('invalid_inventory')
          const app = (c.artifacts || []).flatMap(x => x.app || []).find(x => typeof x === 'string' && x.endsWith('.app'))
          // `brew uninstall --cask` runs the cask's own pkg/uninstall/installer
          // stanzas, so those artifacts are the manager's job, not a reason to block.
          add(m, c.full_token || c.token, c.name?.[0] || c.token, c.installed, app ? path.join('/Applications', path.basename(app)) : path.join(prefix, 'Caskroom', c.token), c, ['uninstall', '--cask', c.full_token || c.token], { kind: 'desktop', warnings: ['reinstall_required', 'vendor_scripts', 'data_retention_unknown'] })
        }
      } else if (m.provider === 'npm') {
        const prefix = await query(['prefix', '--global'])
        if (!path.isAbsolute(prefix) || /[\r\n]/.test(prefix)) throw new Error('invalid_prefix')
        source.environment = prefix
        // 配置了全局 prefix 但目录还不存在 = 从未装过全局包；npm list 对缺失目录
        // 会以 ENOENT 退出 1，不能把「没有全局包」误报成来源失败。
        if (!fs.existsSync(prefix)) return
        const data = JSON.parse(await query(['list', '--global', '--depth=0', '--json', '--prefix', prefix]))
        if (!data || typeof data !== 'object' || data.problems?.length) throw new Error('invalid_inventory')
        for (const [key, value] of Object.entries(data.dependencies || {})) {
          if (!value.version) throw new Error('invalid_inventory')
          const linked = !!(value.link || value.resolved?.startsWith('file:'))
          // `npm uninstall -g` removes the link itself (the source folder stays), so a
          // linked global package is runnable; the warning explains what is left behind.
          add(m, key, key, value.version, path.join(prefix, platform === 'win32' ? 'node_modules' : 'lib/node_modules', key), value,
            ['uninstall', '--global', '--ignore-scripts', '--no-audit', '--no-fund', '--prefix', prefix, key], { warnings: linked ? ['reinstall_required', 'external_usage_unknown', 'data_not_removed', 'linked_package'] : undefined })
        }
      } else if (m.provider === 'pipx') {
        const data = JSON.parse(await query(['list', '--json']))
        if (!data.venvs || typeof data.venvs !== 'object') throw new Error('invalid_inventory')
        const home = await query(['environment', '--value', 'PIPX_HOME'])
        if (!path.isAbsolute(home) || /[\r\n]/.test(home)) throw new Error('invalid_prefix')
        source.environment = home
        for (const [key, value] of Object.entries(data.venvs)) {
          const pkg = value.metadata?.main_package
          if (!pkg?.package_version) throw new Error('invalid_inventory')
          add(m, key, key, pkg.package_version, path.join(home, 'venvs', key), value, ['uninstall', key], { env: { PIPX_HOME: home }, warnings: ['reinstall_required', 'tool_environment', 'data_not_removed'], extra: { relatedPackages: Object.keys(value.metadata.injected_packages || {}).map(text) } })
        }
      } else if (m.provider === 'uv') {
        const home = await query(['tool', 'dir'])
        if (!path.isAbsolute(home) || /[\r\n]/.test(home)) throw new Error('invalid_prefix')
        source.environment = home
        const output = await query(['tool', 'list', '--color', 'never'], { UV_TOOL_DIR: home })
        let pkg = null
        for (const line of output.split(/\r?\n/).filter(Boolean)) {
          const match = /^([A-Za-z0-9][A-Za-z0-9_.-]*) v([^\s]+)(?: \(.*\))?$/.exec(line)
          if (match) { pkg = { name: match[1], version: match[2], commands: [] }; local.push(pkg) }
          else if (/^- [A-Za-z0-9_.-]+(?: \(.*\))?$/.test(line) && pkg) pkg.commands.push(line.slice(2))
          else throw new Error('unsupported_output')
        }
        for (const p of local) add(m, p.name, p.name, p.version, path.join(home, p.name), p, ['tool', 'uninstall', p.name], { env: { UV_TOOL_DIR: home }, warnings: ['reinstall_required', 'tool_environment', 'data_not_removed'] })
      }
    } catch (err) {
      source.status = 'error'; source.error = err.code || 'source_unavailable'
      // A source is atomic: never authorize its partially parsed results.
      for (let i = items.length - 1; i >= 0; i--) if (items[i].sourceId === m.id && !startIds.has(items[i].id)) items.splice(i, 1)
    }
  }))
  if (desktop && ['darwin', 'win32'].includes(platform)) {
    const source = { id: 'desktop', name: platform === 'darwin' ? 'macOS' : 'Windows', status: 'ok', location: '' }
    sources.push(source)
    try {
      let data
      if (platform === 'darwin') data = JSON.parse(await run('/usr/bin/python3', [path.join(RES, 'software-macos.py')]))
      else {
        // 与 photos-windows.ps1 / 缩略图一致：通过 -EncodedCommand 执行只读清单脚本。
        // 默认 Windows 客户端执行策略是 Restricted，`-File` 会被直接拒绝；
        // -EncodedCommand 以命令方式执行，不受脚本执行策略影响（GPO 下同理）。
        const helper = fs.readFileSync(path.join(RES, 'software-windows.ps1'), 'utf8')
        const command = Buffer.from(`& {\n${helper}\n}`, 'utf16le').toString('base64')
        data = JSON.parse(await run(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe'), ['-NoProfile', '-NonInteractive', '-EncodedCommand', command]))
      }
      if (!Array.isArray(data.items) || !Array.isArray(data.errors)) throw new Error('invalid_inventory')
      // 桌面来源按 App 隔离：单个 App 读不出来只提示告警，其余可读 App 仍可操作。
      // 只有容器根不可读或根是符号链接这类结构性错误才把整个来源标为 partial。
      const perAppErrors = new Set(['unreadable_app', 'symlink_metadata', 'startapps_unavailable', 'unreadable_registry_key', 'unreadable_appx'])
      const structuralErrors = data.errors.filter(error => !perAppErrors.has(error))
      if (structuralErrors.length) { source.status = 'partial'; source.error = 'desktop_partial' }
      else if (data.errors.length) { source.warning = 'desktop_partial'; source.unreadable = data.errors.length }
      let winGet = null
      if (platform === 'win32' && typeof data.winGetFile === 'string' && data.winGetFile) {
        try { winGet = fileStamp(data.winGetFile) } catch { /* use system Settings when WinGet is inaccessible */ }
      }
      for (const app of data.items) {
        // 注册表项可能没有 InstallLocation（空串）。若拿空串互相比较，第一个之后的
        // 所有无位置应用都会被当成「同一安装」丢掉；只在位置已知时去重。
        const managed = app.location ? items.find(i => i.kind === 'desktop' && i.location === app.location) : null
        if (managed) continue
        // brew 只影响它自己登记过的 App；brew 源读取失败不再把整张桌面清单标成不可用。
        if (platform === 'darwin' && items.some(i => i.provider === 'brew' && i.kind === 'desktop' && path.basename(i.location) === path.basename(app.location))) app.blockReason = 'source_unavailable'
        if (['msi', 'winget-portable'].includes(app.action) && data.items.filter(other => other.productCode?.toLowerCase() === app.productCode?.toLowerCase()).length > 1) app.blockReason = 'ambiguous_installation'
        if (app.action === 'move-app' && !['/Applications', '/Applications/Utilities', path.join(os.homedir(), 'Applications'), path.join(os.homedir(), 'Applications/Utilities')].includes(path.dirname(app.location))) app.blockReason = 'protected_path'
        let command = null
        const safeWindowsId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,219}$/.test(value)
        if (platform === 'darwin' && app.action === 'move-app' && path.isAbsolute(app.location) && app.location.endsWith('.app')) command = { kind: 'move-app' }
        if (platform === 'win32' && app.action === 'msi' && /^\{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}$/i.test(app.productCode || '')) command = { kind: 'msi' }
        if (platform === 'win32' && app.action === 'appx' && safeWindowsId(app.packageFullName)) command = { kind: 'appx' }
        if (winGet && app.action === 'winget-portable' && safeWindowsId(app.winGetId) && safeWindowsId(app.winGetSource) && safeWindowsId(app.productCode) && ['user', 'machine'].includes(app.scope)) {
          command = { file: winGet.path, stamps: [winGet], args: ['uninstall', '--product-code', app.productCode, '--exact', '--scope', app.scope, '--preserve', '--disable-interactivity'] }
        }
        // A registered vendor uninstaller is runnable only as one validated .exe plus
        // argv; shell strings, interpreters and msiexec are refused or routed to MSI.
        if (platform === 'win32' && !command && (!app.blockReason || app.blockReason === 'vendor_uninstaller_required')) {
          const parsed = parseVendorUninstall(app.uninstallString)
          if (parsed?.kind === 'msi') {
            app.action = 'msi'
            app.blockReason = ''
            app.productCode = parsed.productCode
            command = { kind: 'msi' }
          } else if (parsed?.kind === 'vendor') {
            try {
              command = { kind: 'vendor', file: parsed.file, args: parsed.args, stamps: [fileStamp(parsed.file)] }
              app.action = 'vendor'
              app.blockReason = ''
            } catch { command = null }
          }
        }
        const provider = app.action === 'winget-portable' ? 'WinGet' : source.name
        const warnings = app.action === 'move-app' ? ['app_only', 'move_no_space', 'restore_files_only']
          : app.action === 'vendor' ? ['reinstall_required', 'vendor_uninstaller', 'data_retention_unknown', 'system_authorization']
            : ['reinstall_required', 'data_retention_unknown', 'system_authorization']
        const { uninstallString, ...publicMetadata } = app
        // Installer-reported size (KB) is only a fallback; the host measures the
        // installation directory and overwrites this when measurement succeeds.
        const estimatedSizeKb = Number.isFinite(app.estimatedSizeKb) && app.estimatedSizeKb > 0 ? Math.round(app.estimatedSizeKb) : null
        items.push({ ...publicMetadata, name: text(app.name), version: text(app.version), id: digest(['desktop', app.key, app.location]), sourceId: 'desktop', sizeBytes: null, estimatedSizeKb, sizePartial: false, sizeSource: '',
          executable: !!command && !app.blockReason, blockReason: app.blockReason || (command ? '' : 'vendor_uninstaller_required'), fingerprint: digest([app, command]), warnings, command, provider, kind: app.action === 'winget-portable' ? 'terminal' : 'desktop' })
      }
    } catch (err) { source.status = 'error'; source.error = err.code || 'source_unavailable' }
  }
  if (!managers.length) sources.push({ id: 'managers', name: 'Package managers', status: 'missing', error: 'no_managers', location: '' })
  // Multiple manager binaries may address the same environment. Keep one canonical instance.
  const owners = new Map()
  items.sort((a, b) => a.sourceId.localeCompare(b.sourceId))
  for (let i = 0; i < items.length;) {
    const item = items[i], key = JSON.stringify([item.provider, item.location, item.packageId || item.key])
    const owner = owners.get(key)
    if (owner) {
      if (owner.version !== item.version) { owner.executable = false; owner.blockReason = 'ambiguous_installation' }
      items.splice(i, 1)
    } else { owners.set(key, item); i++ }
  }
  items.sort((a, b) => a.id.localeCompare(b.id)); sources.sort((a, b) => a.id.localeCompare(b.id))
  return { items, sources }
}
