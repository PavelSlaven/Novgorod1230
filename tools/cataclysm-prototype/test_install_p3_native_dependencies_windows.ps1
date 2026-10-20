#requires -Version 7.0
param(
    [string] $BuildEnvironmentScript = (Join-Path $PSScriptRoot 'p3-native-build-env.ps1'),
    [string] $InstallScript = (Join-Path $PSScriptRoot 'install-p3-native-dependencies.ps1')
)

$ErrorActionPreference = 'Stop'
. $BuildEnvironmentScript
$realRunner = ${function:Invoke-P3NativeBuildTool}
$root = Join-Path ([System.IO.Path]::GetTempPath()) ('p3-dependencies-' + [guid]::NewGuid().ToString('N'))
$buildRoot = Join-Path $root 'build with spaces'
$manifestRoot = Join-Path $buildRoot 'msvc-full-features'
$vcpkgRoot = Join-Path $root 'vcpkg'
$installRoot = Join-Path $root 'installed separately'
$fakeScript = Join-Path $root 'fake-vcpkg.ps1'
$recordPath = Join-Path $root 'calls.jsonl'
$entryScript = Join-Path $root 'install-p3-native-dependencies.ps1'
$entryEnvironmentScript = Join-Path $root 'p3-native-build-env.ps1'
$installLogs = [System.Collections.Generic.List[string]]::new()
$pwshExe = (Get-Process -Id $PID).Path
$mode = 'refuse'
$originalPath = $env:PATH
$originalAdditionalOptions = [Environment]::GetEnvironmentVariable('VcpkgAdditionalInstallOptions', 'Process')
$paths = @($manifestRoot, $buildRoot, $vcpkgRoot, (Join-Path $root 'work'),
    (Join-Path $root 'downloads/vcpkg'), (Join-Path $root 'downloads'),
    (Join-Path $root 'cache/vcpkg-binary'), (Join-Path $root 'cache'), $root)
try {
    [Environment]::SetEnvironmentVariable('VcpkgAdditionalInstallOptions', '--foreign-option', 'Process')
    New-Item -ItemType Directory -Path $manifestRoot, $vcpkgRoot -Force | Out-Null
    Set-Content -LiteralPath (Join-Path $manifestRoot 'vcpkg.json') -Value '{}'
    Set-Content -LiteralPath (Join-Path $vcpkgRoot 'vcpkg.exe') -Value 'test substitute'
    Copy-Item -LiteralPath $InstallScript -Destination $entryScript
    Set-Content -LiteralPath $entryEnvironmentScript -Value @'
. $BuildEnvironmentScript
Set-Item -Path Function:Invoke-P3NativeBuildTool -Value $testRunner
'@
    Set-Content -LiteralPath $fakeScript -Value @'
param([string] $RecordPath, [string] $Mode, [string] $ArgumentsBase64)
$toolArguments = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($ArgumentsBase64)) | ConvertFrom-Json
@{
    args = @($toolArguments)
    cwd = (Get-Location).Path
    assets = $env:X_VCPKG_ASSET_SOURCES
    path = $env:PATH
    downloads = $env:VCPKG_DOWNLOADS
    overlay = $env:VCPKG_OVERLAY_TRIPLETS
    version = $PSVersionTable.PSVersion.Major
    additional = [Environment]::GetEnvironmentVariable('VcpkgAdditionalInstallOptions', 'Process')
} | ConvertTo-Json -Compress | Add-Content -LiteralPath $RecordPath
if ($toolArguments[0] -eq 'fetch' -and $Mode -eq 'refuse') { [Console]::Error.WriteLine('powershell-core unavailable offline'); exit 19 }
if ($toolArguments[0] -eq 'install') { [Console]::WriteLine("manifest install evidence: $Mode") }
exit 0
'@
    function Invoke-P3NativeBuildTool {
        param($FilePath, $ArgumentList, $WorkingDirectory, $Environment, $LogPath, [switch] $NoClobber)
        if ($FilePath -ne (Join-Path $vcpkgRoot 'vcpkg.exe')) { throw "Unexpected tool: $FilePath" }
        if ($Environment.ContainsKey('PATH')) { throw 'Build environment must inherit PATH without overriding it' }
        $argumentsJson = ConvertTo-Json -InputObject @($ArgumentList) -Compress
        $argumentsBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($argumentsJson))
        if ($ArgumentList[0] -eq 'install') { $installLogs.Add($LogPath) }
        & $realRunner -FilePath $pwshExe -ArgumentList @('-NoProfile', '-File', $fakeScript, $recordPath, $mode, $argumentsBase64) -WorkingDirectory $WorkingDirectory -Environment $Environment -LogPath $LogPath -NoClobber:$NoClobber
    }
    $testRunner = ${function:Invoke-P3NativeBuildTool}
    function Get-Date { $installTimestamp }
    $parameters = @{ NativeRoot = $root; BuildRoot = $buildRoot; NodeExe = $pwshExe; VcpkgRoot = $vcpkgRoot; InstallRoot = $installRoot }
    $env:PATH = "$env:SystemRoot\System32"
    $missingToolPath = $env:PATH
    $failure = $null
    try { Invoke-P3NativeDependencyInstall @parameters } catch { $failure = $_ }
    if (-not $failure -or $failure.ToString() -notmatch 'PowerShell.*PATH') { throw "Missing PowerShell directory in inherited PATH did not fail explicitly. Actual failure: $failure" }
    if (Test-Path -LiteralPath $recordPath) { throw 'Missing PowerShell directory started vcpkg' }
    if ($env:PATH -cne $missingToolPath) { throw 'Preflight changed parent PATH' }
    $env:PATH = $originalPath
    $forbiddenRoot = Join-Path $manifestRoot 'vcpkg_installed'
    foreach ($forbiddenPath in @(
        $forbiddenRoot, ($forbiddenRoot + '\'), ($forbiddenRoot + '/'),
        (Join-Path $manifestRoot 'vcpkg_installed\..\vcpkg_installed\'),
        [System.IO.Path]::GetRelativePath((Get-Location).Path, $forbiddenRoot),
        $forbiddenRoot.ToUpperInvariant()
    )) {
        $guardParameters = $parameters.Clone()
        $guardParameters.InstallRoot = $forbiddenPath
        $failure = $null
        try { Invoke-P3NativeDependencyInstall @guardParameters } catch { $failure = $_ }
        if (-not $failure -or $failure.ToString() -notmatch 'отдельный InstallRoot') { throw "Manifest InstallRoot was not refused: $forbiddenPath. Actual failure: $failure" }
        if (Test-Path -LiteralPath $recordPath) { throw 'Forbidden InstallRoot started vcpkg' }
    }
    $failure = $null
    try { Invoke-P3NativeDependencyInstall @parameters -Install } catch { $failure = $_ }
    if (-not $failure -or $failure.ToString() -notmatch 'powershell-core.*19') { throw 'Offline tool refusal did not fail explicitly' }
    $calls = @(Get-Content -LiteralPath $recordPath | ConvertFrom-Json -AsHashtable)
    if ($calls.Count -ne 1 -or ($calls[0].args -join ' ') -cne 'fetch powershell-core') { throw 'Install ran after failed preflight' }
    $mode = 'available'
    Remove-Item -LiteralPath $recordPath
    & $entryScript @parameters
    $calls = @(Get-Content -LiteralPath $recordPath | ConvertFrom-Json -AsHashtable)
    if ($calls.Count -ne 1 -or ($calls[0].args -join ' ') -cne 'fetch powershell-core' -or $calls[0].assets -cne 'clear;x-block-origin') { throw 'Default entry point started install or enabled the downloader' }
    if ($installLogs.Count -ne 0) { throw 'Default entry point opened an install log' }
    Remove-Item -LiteralPath $recordPath
    & $entryScript @parameters -PreflightOnly
    $calls = @(Get-Content -LiteralPath $recordPath | ConvertFrom-Json -AsHashtable)
    if ($calls.Count -ne 1 -or ($calls[0].args -join ' ') -cne 'fetch powershell-core') { throw 'PreflightOnly started install' }
    Remove-Item -LiteralPath $recordPath
    $installTimestamp = [datetime]::Parse('2026-10-20T01:02:03.1234567Z', [cultureinfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::RoundtripKind)
    & $entryScript @parameters -Install
    $calls = @(Get-Content -LiteralPath $recordPath | ConvertFrom-Json -AsHashtable)
    if ($calls.Count -ne 2) { throw 'Expected offline preflight followed by manifest install' }
    if (($calls[0].args -join ' ') -cne 'fetch powershell-core' -or $calls[0].assets -cne 'clear;x-block-origin') { throw 'Tool preflight can access origin or script downloader' }
    $expectedArguments = @('install', '--triplet', 'x64-windows-static', '--host-triplet=x64-windows-static', "--x-install-root=$installRoot", '--clean-buildtrees-after-build', '--clean-packages-after-build')
    if (($calls[1].args -join '|') -cne ($expectedArguments -join '|')) {
        throw "Manifest install arguments differ. Actual: $(ConvertTo-Json -InputObject @($calls[1].args) -Compress). Expected: $(ConvertTo-Json -InputObject $expectedArguments -Compress)"
    }
    foreach ($call in $calls) {
        if ($call.cwd -cne $manifestRoot -or $call.version -lt 7) { throw 'Wrong manifest directory or PowerShell version' }
        if ($call.path -cne $originalPath) { throw 'Child PATH differs from inherited PATH' }
        if ($call.downloads -ne (Join-Path $root 'downloads/vcpkg') -or $call.overlay -ne (Join-Path $buildRoot '.github/vcpkg_triplets')) { throw 'Preflight and install environment differ' }
        if ($call.additional) { throw 'Inherited MSBuild options reached vcpkg' }
    }
    if ($calls[1].assets -notmatch '\{sha512\} 120000;x-block-origin$') { throw 'Install downloader timeout missing' }
    if ($installLogs.Count -ne 1 -or [System.IO.Path]::GetFileName($installLogs[0]) -cne 'vcpkg-install-20261020T0102031234567Z.log') { throw 'Install log name does not contain the UTC timestamp' }
    $firstLog = Get-Content -LiteralPath $installLogs[0] -Raw
    if ($firstLog -notmatch 'manifest install evidence: available') { throw 'First install evidence missing from its log' }
    $installTimestamp = [datetime]::Parse('2026-10-20T01:02:04.1234567Z', [cultureinfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::RoundtripKind)
    $mode = 'second-attempt'
    Remove-Item -LiteralPath $recordPath
    & $entryScript @parameters -Install
    $calls = @(Get-Content -LiteralPath $recordPath | ConvertFrom-Json -AsHashtable)
    if ($calls.Count -ne 2 -or $calls[0].args[0] -cne 'fetch' -or $calls[1].args[0] -cne 'install') { throw 'Repeated install did not run fetch before install' }
    if ($installLogs.Count -ne 2 -or $installLogs[0] -ceq $installLogs[1]) { throw 'Install runs reused a log path' }
    if ((Get-Content -LiteralPath $installLogs[0] -Raw) -cne $firstLog) { throw 'Repeated install overwrote earlier evidence' }
    $secondLog = Get-Content -LiteralPath $installLogs[1] -Raw
    if ($secondLog -notmatch 'manifest install evidence: second-attempt') { throw 'Second install evidence missing from its log' }
    Remove-Item -LiteralPath $recordPath
    $mode = 'collision-attempt'
    $failure = $null
    try { & $entryScript @parameters -Install } catch { $failure = $_ }
    if (-not $failure) { throw 'Install log collision was not refused' }
    $calls = @(Get-Content -LiteralPath $recordPath | ConvertFrom-Json -AsHashtable)
    if ($calls.Count -ne 1 -or ($calls[0].args -join ' ') -cne 'fetch powershell-core') { throw 'Install log collision started install' }
    if ((Get-Content -LiteralPath $installLogs[1] -Raw) -cne $secondLog) { throw 'Install log collision overwrote existing evidence' }
    Remove-Item -LiteralPath (Join-Path $vcpkgRoot 'vcpkg.exe')
    $failure = $null
    try { Invoke-P3NativeDependencyInstall @parameters } catch { $failure = $_ }
    if (-not $failure -or $failure.ToString() -notmatch 'vcpkg.exe') { throw 'Missing vcpkg did not fail explicitly' }
    if (@(Get-Content -LiteralPath $recordPath).Count -ne 1) { throw 'Missing tool started a child process' }
    Write-Host 'PASS: offline native dependency preflight and manifest install contract'
} finally {
    $env:PATH = $originalPath
    [Environment]::SetEnvironmentVariable('VcpkgAdditionalInstallOptions', $originalAdditionalOptions, 'Process')
    Set-Item -Path Function:Invoke-P3NativeBuildTool -Value $realRunner
    foreach ($path in (@($fakeScript, $recordPath, $entryScript, $entryEnvironmentScript, (Join-Path $manifestRoot 'vcpkg.json'), (Join-Path $vcpkgRoot 'vcpkg.exe'), (Join-Path $root 'work/vcpkg-powershell-preflight.log')) + @($installLogs))) {
        if (Test-Path -LiteralPath $path -PathType Leaf) { Remove-Item -LiteralPath $path }
    }
    foreach ($path in $paths) {
        if (Test-Path -LiteralPath $path -PathType Container) { Remove-Item -LiteralPath $path }
    }
}
