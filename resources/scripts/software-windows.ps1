# Read-only inventory: registry entries, current-user packages and Start menu names.
# This script never runs an uninstall command. It only reports what the registry
# registered; lib/software-discovery.js validates and parses UninstallString.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$items = [System.Collections.Generic.List[object]]::new()
$errors = [System.Collections.Generic.List[string]]::new()
$roots = @('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall')
foreach ($root in $roots) {
    if (!(Test-Path -LiteralPath $root)) { continue }
    try { $keys = Get-ChildItem -LiteralPath $root } catch { $errors.Add('registry_unavailable'); continue }
    foreach ($key in $keys) {
        # One broken key must not hide the rest of the root.
        try {
            $p = Get-ItemProperty -LiteralPath $key.PSPath
            if (!$p.DisplayName) { continue }
            $scope = if ($root.StartsWith('HKCU')) {'user'} else {'machine'}
            $publisher = [string]$p.Publisher
            # Runtimes are only protected when the display name is a known runtime
            # or a Microsoft component sets SystemComponent. A third-party installer
            # that wrongly sets SystemComponent stays a normal vendor entry.
            $runtimeName = $p.DisplayName -match '^(Microsoft )?(\.NET|ASP\.NET|Visual C\+\+)|^Microsoft (Windows Desktop Runtime|Edge WebView2 Runtime)|^(Python|Node\.js|Ruby|Java|OpenJDK)( |$)'
            # The host and the cleanup tool itself are never offered for uninstall.
            $hostName = $p.DisplayName -match 'DeepSeek|DeepClean|Harness'
            $runtime = $runtimeName -or $hostName -or (($p.SystemComponent -eq 1) -and $publisher -match '^Microsoft')
            $action = ''
            # Generic EXE entries stay unclassified here; lib/software-discovery.js
            # decides whether their UninstallString is a runnable vendor uninstaller.
            $reason = ''
            if ($runtime) {
                $reason = 'protected_runtime'
            } elseif ($p.WindowsInstaller -eq 1 -and $key.PSChildName -match '^\{[0-9A-Fa-f-]{36}\}$') {
                $action = 'msi'
            } elseif ($p.WinGetInstallerType -eq 'portable' -and $p.WinGetPackageIdentifier -and $p.WinGetSourceIdentifier) {
                $action = 'winget-portable'
            }
            $items.Add(@{
                key = $key.Name; name = [string]$p.DisplayName; version = [string]$p.DisplayVersion
                location = [string]$p.InstallLocation; publisher = $publisher; scope = $scope
                action = $action; blockReason = $reason; productCode = $key.PSChildName
                winGetId = [string]$p.WinGetPackageIdentifier; winGetSource = [string]$p.WinGetSourceIdentifier
                uninstallString = [string]$p.UninstallString; estimatedSizeKb = $p.EstimatedSize
            })
        } catch { $errors.Add('unreadable_registry_key') }
    }
}
$startNames = @{}
try {
    foreach ($sa in Get-StartApps) {
        $appId = [string]$sa.AppID
        if (!$appId) { continue }
        $family = $appId.Split('!')[0]
        if ($family -and !$startNames.ContainsKey($family)) { $startNames[$family] = [string]$sa.Name }
    }
} catch { $errors.Add('startapps_unavailable') }
$winGetFile = ''
try {
    foreach ($p in Get-AppxPackage) {
        # A single unreadable package is a warning, not a failed Appx source.
        try {
            if ($p.Name -eq 'Microsoft.DesktopAppInstaller' -and $p.PublisherId -eq '8wekyb3d8bbwe' -and $p.InstallLocation) {
                $winGetFile = Join-Path -Path $p.InstallLocation -ChildPath 'winget.exe'
            }
            $family = [string]$p.PackageFamilyName
            # 开始菜单里的显示名比包身份名（甚至 GUID）更适合展示；取不到时回退到身份名。
            $startName = ''
            if ($family -and $startNames.ContainsKey($family)) { $startName = [string]$startNames[$family] }
            $displayName = if ($startName) { $startName } else { [string]$p.Name }
            # 语言/资源包与框架包不可卸载；资源包在无 NonRemovable/IsFramework 时也要挡住。
            $protected = $p.NonRemovable -or $p.IsFramework -or $p.IsResourcePackage
            $items.Add(@{ key=$p.PackageFullName; name=$displayName; identityName=[string]$p.Name; startName=$startName; version=[string]$p.Version; location=$p.InstallLocation; scope='user'; action='appx'; packageFullName=$p.PackageFullName; resourcePackage=[bool]$p.IsResourcePackage; blockReason=$(if ($protected) {'protected_system'} elseif ($p.Name -match 'DeepSeek|DeepClean|Harness|Microsoft\.DesktopAppInstaller|WindowsAppRuntime') {'protected_runtime'} else {''}) })
        } catch { $errors.Add('unreadable_appx') }
    }
} catch { $errors.Add('appx_unavailable') }
@{items=@($items.ToArray()); errors=@($errors.ToArray()); winGetFile=$winGetFile} | ConvertTo-Json -Depth 6 -Compress
