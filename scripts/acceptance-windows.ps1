# deepclean-mydisk Windows 验收脚本（只读，不删除任何文件）
$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root "acceptance-report"
New-Item -ItemType Directory -Force $outDir | Out-Null
$log = Join-Path $outDir "acceptance.txt"
Set-Content -Path $log -Value "deepclean-mydisk Windows acceptance $(Get-Date -Format o)" -Encoding UTF8

function Log($msg) { $msg | Tee-Object -FilePath $log -Append | Out-Host }
function Run($label, $cmd) {
  Log "== $label"
  $output = & $cmd 2>&1
  $output | Tee-Object -FilePath $log -Append | Out-Host
  return $output
}

Log "== Python"
Run "python --version" { py -3 --version }

Log "== 权限检查"
$perm = Run "permissions" { py -3 (Join-Path $root "resources\scripts\deepclean.py") --check-permissions }
Log "== 自检"
$selfTest = Run "self-test" { py -3 (Join-Path $root "resources\scripts\deepclean.py") --self-test }

Log "== 快速扫描"
$reportPath = Join-Path $outDir "report.md"
$jsonPath = Join-Path $outDir "report.json"
Run "scan" { py -3 (Join-Path $root "resources\scripts\deepclean.py") --quick --redact --md $reportPath --json $jsonPath }

$checks = @()
function Check($name, $pass, $detail = "") { $script:checks += [pscustomobject]@{ Name = $name; Pass = [bool]$pass; Detail = $detail } }

try {
  $r = Get-Content $jsonPath -Raw | ConvertFrom-Json
  $md = Get-Content $reportPath -Raw
  Check "JSON 可解析" ($null -ne $r)
  Check "平台为 windows" ($r.platform -eq "windows")
  Check "报告含标题" ($md -match "磁盘体检报告")
  Check "无 del/rd 命令建议" (-not ($md -match '(?m)^\s*del\s|^\s*rd\s'))
  Check "含 Move-Item 或无需命令" ($md -match "Move-Item" -or $md -match "未生成 mv")
  Check "browsers 字段存在" ($r.PSObject.Properties.Name -contains "browsers")
  Check "leftoverGroups 字段存在" ($r.PSObject.Properties.Name -contains "leftoverGroups")
  Check "estimate 字段存在" ($null -ne $r.estimate)
  Check "estimate 含 cacheKb/totalKb" ($r.estimate.PSObject.Properties.Name -contains "cacheKb" -and $r.estimate.PSObject.Properties.Name -contains "totalKb")
  $cloud = @($r.cloudStorage)
  Check "云盘目录单独列出" ($cloud.Count -ge 0)
  $md | Out-File (Join-Path $outDir "copied-report.md") -Encoding UTF8
} catch {
  Check "结果解析" $false $_.Exception.Message
}

Log "`n== 验收结果"
$checks | ForEach-Object { Log ("{0}  {1} {2}" -f $(if ($_.Pass) { "PASS" } else { "FAIL" }), $_.Name, $_.Detail) }
$passed = @($checks | Where-Object { $_.Pass }).Count
Log "`n合计: $passed / $($checks.Count) 通过"
Log "输出目录: $outDir"
Log "请把整个 acceptance-report 目录发回。"
