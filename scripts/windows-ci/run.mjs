/** Windows CI coordinator. Runs every phase even when an earlier test fails. */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

if (process.platform !== 'win32') {
  console.error('Windows acceptance requires Windows; no native coverage can be claimed on this platform.')
  process.exit(1)
}
const root = fileURLToPath(new URL('../../', import.meta.url))
const scripts = path.join(root, 'scripts', 'windows-ci')
const out = path.join(root, 'acceptance-report', 'windows-ci')
fs.mkdirSync(out, { recursive: true })
const environment = {
  at: new Date().toISOString(), commit: process.env.GITHUB_SHA || null,
  runnerImage: process.env.ImageOS || null, imageVersion: process.env.ImageVersion || null,
  os: os.release(), arch: process.arch, node: process.version,
  nativeDesktopTested: false, realUserDataUsed: false,
}
fs.writeFileSync(path.join(out, 'environment.json'), JSON.stringify(environment, null, 2))
const steps = []
const env = { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', DEEPCLEAN_CI_REPORT_DIR: out }
function run(name, cmd, args, timeout = 180000) {
  console.log(`\n== ${name}`)
  const started = Date.now()
  const r = spawnSync(cmd, args, { cwd: root, env, encoding: 'utf8', timeout, maxBuffer: 32 * 1024 * 1024, windowsHide: true })
  const log = `${r.stdout || ''}${r.stderr || ''}${r.error ? '\n' + r.error.stack : ''}`
  fs.writeFileSync(path.join(out, `${name}.log`), log)
  console.log(log)
  const result = { name, passed: r.status === 0 && !r.error, exitCode: r.status,
    signal: r.signal, elapsedMs: Date.now() - started, log: `${name}.log` }
  steps.push(result)
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ environment, steps }, null, 2))
  return { ...result, output: log }
}

// New UUID + nonexistent file: volume.ps1 refuses to reuse/format existing images.
const image = path.join(os.tmpdir(), `deepclean-ci-${crypto.randomUUID()}.vhd`)
env.DEEPCLEAN_TEST_IMAGE = image
try {
  const python = process.env.pythonLocation ? path.join(process.env.pythonLocation, 'python.exe') : 'python.exe'
  run('python-version', python, ['--version'])
  run('existing-suite', process.execPath, ['--test', '--test-reporter=tap'])
  run('browser-scan', python, [path.join(scripts, 'scanner.py')], 120000)
  const volume = run('volume-setup', 'powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', path.join(scripts, 'volume.ps1'), '-ImagePath', image], 90000)
  const match = volume.output.match(/^DEEPCLEAN_TEST_VOLUME=([A-Za-z]:\\)\s*$/m)
  if (volume.passed && match) env.DEEPCLEAN_TEST_VOLUME = match[1]
  else console.error('Separate test volume unavailable; the cross-volume test will fail explicitly.')
  run('native-scenarios', process.execPath, ['--test', '--test-reporter=tap', path.join(scripts, 'cases.mjs')])
} finally {
  // Attempt cleanup even if attachment only partially succeeded.
  if (fs.existsSync(image)) {
    run('volume-cleanup', 'powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      '$ErrorActionPreference="Stop";$i=Get-DiskImage -ImagePath $env:DEEPCLEAN_TEST_IMAGE;if($i.Attached){Dismount-DiskImage -ImagePath $env:DEEPCLEAN_TEST_IMAGE}'], 60000)
  }
  const passed = steps.every(s => s.passed)
  const markdown = [
    '# Windows acceptance', '', `Commit: \`${environment.commit || 'local'}\``,
    `OS: ${environment.os} / ${environment.arch}; Node ${environment.node}`, '',
    '| Phase | Result | Seconds | Log |', '|---|---|---:|---|',
    ...steps.map(s => `| ${s.name} | ${s.passed ? 'PASS' : 'FAIL'} | ${(s.elapsedMs / 1000).toFixed(1)} | ${s.log} |`), '',
    passed ? '**Acceptance passed.**' : '**Acceptance failed. Inspect failed phase logs in the artifact.**', '',
    'Uses synthetic files only. This is native Windows Server acceptance, not Windows 11 desktop, DSH GUI, OneDrive sync, VSS or real chat-app validation.',
    'Known product defects are asserted as failures, never marked as expected passes.', '',
  ].join('\n')
  fs.writeFileSync(path.join(out, 'summary.md'), markdown)
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown)
  process.exitCode = passed ? 0 : 1
}
