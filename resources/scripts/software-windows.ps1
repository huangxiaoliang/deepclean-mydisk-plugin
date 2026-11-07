# Read-only: registry and current-user package inventory. Never runs UninstallString.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$items = [System.Collections.Generic.List[object]]::new()
$errors = [System.Collections.Generic.List[string]]::new()
$roots = @('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall')
foreach ($root in $roots) {
    if (!(Test-Path -LiteralPath $root)) { continue }
    try {
        foreach ($key in Get-ChildItem -LiteralPath $root) {
            $p = Get-ItemProperty -LiteralPath $key.PSPath
            if (!$p.DisplayName) { continue }
            $scope = if ($root.StartsWith('HKCU')) {'user'} else {'machine'}
            $action = ''
            $reason = 'vendor_uninstaller_required'
            if ($p.SystemComponent -or $p.DisplayName -match 'DeepSeek|DeepClean|Harness|Visual C\+\+|\.NET|Python|Node.js') {
                $reason = 'protected_runtime'
            } elseif ($p.WindowsInstaller -eq 1 -and $key.PSChildName -match '^\{[0-9A-Fa-f-]{36}\}$') {
                $action = 'msi'
                $reason = ''
            } elseif ($p.WinGetInstallerType -eq 'portable' -and $p.WinGetPackageIdentifier -and $p.WinGetSourceIdentifier) {
                $action = 'winget-portable'
                $reason = ''
            }
            $items.Add(@{
                key = $key.Name; name = [string]$p.DisplayName; version = [string]$p.DisplayVersion
                location = [string]$p.InstallLocation; publisher = [string]$p.Publisher; scope = $scope
                action = $action; blockReason = $reason; productCode = $key.PSChildName
                winGetId = [string]$p.WinGetPackageIdentifier; winGetSource = [string]$p.WinGetSourceIdentifier
            })
        }
    } catch { $errors.Add('registry_unavailable') }
}
$winGetFile = ''
try {
    foreach ($p in Get-AppxPackage) {
        if ($p.Name -eq 'Microsoft.DesktopAppInstaller' -and $p.PublisherId -eq '8wekyb3d8bbwe' -and $p.InstallLocation) {
            $winGetFile = Join-Path -Path $p.InstallLocation -ChildPath 'winget.exe'
        }
        $items.Add(@{ key=$p.PackageFullName; name=$p.Name; version=[string]$p.Version; location=$p.InstallLocation; scope='user'; action='appx'; packageFullName=$p.PackageFullName; blockReason=$(if ($p.NonRemovable -or $p.IsFramework) {'protected_system'} elseif ($p.Name -match 'DeepSeek|DeepClean|Harness|Microsoft\.DesktopAppInstaller|WindowsAppRuntime') {'protected_runtime'} else {''}) })
    }
} catch { $errors.Add('appx_unavailable') }
@{items=@($items.ToArray()); errors=@($errors.ToArray()); winGetFile=$winGetFile} | ConvertTo-Json -Depth 6 -Compress
