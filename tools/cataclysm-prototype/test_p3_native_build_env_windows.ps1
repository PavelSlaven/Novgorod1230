param(
    [string] $BuildEnvironmentScript = (Join-Path $PSScriptRoot 'p3-native-build-env.ps1')
)

$ErrorActionPreference = 'Stop'
. $BuildEnvironmentScript

$nativeRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('p3-build-env-' + [guid]::NewGuid().ToString('N'))
$buildRoot = Join-Path $nativeRoot 'build with spaces'
$nodeExe = Join-Path $nativeRoot 'node with spaces/node.exe'
$vcpkgRoot = 'C:/Users/Slaven/NovgorodNative/sources/vcpkg-f6672d8'
$logPath = Join-Path $nativeRoot 'child-environment.log'
$failureLogPath = Join-Path $nativeRoot 'child-failure.log'
$inheritedName = 'P3_NATIVE_INHERITED_PROBE'
$originalInherited = [Environment]::GetEnvironmentVariable($inheritedName, 'Process')
[Environment]::SetEnvironmentVariable($inheritedName, 'retained-value', 'Process')
$names = @(
    'VCPKG_DOWNLOADS', 'VCPKG_DEFAULT_BINARY_CACHE', 'VCPKG_DISABLE_METRICS',
    'VCPKG_OVERLAY_TRIPLETS', 'X_VCPKG_ASSET_SOURCES', 'VCPKG_BINARY_SOURCES',
    'VCPKG_ROOT', 'GIT_CONFIG_COUNT', 'GIT_CONFIG_KEY_0', 'GIT_CONFIG_VALUE_0',
    'CDDA_RELEASE_BUILD', 'BACKTRACE', 'VCPKG_FORCE_DOWNLOADED_BINARIES',
    'VCPKG_FORCE_SYSTEM_BINARIES', 'PKG_CONFIG', 'VCPKG_OVERLAY_PORTS',
    'VCPKG_DEFAULT_HOST_TRIPLET', 'VCPKG_VISUAL_STUDIO_PATH', 'VCPKG_KEEP_ENV_VARS',
    'X_VCPKG_RECURSIVE_DATA', 'NODE_OPTIONS', 'VCPKG_FEATURE_FLAGS',
    'X_VCPKG_REGISTRIES_CACHE', 'NODE_TLS_REJECT_UNAUTHORIZED'
)
$integrationNames = @(
    'VcpkgRoot', 'VcpkgTriplet', 'VcpkgEnableManifest', 'VcpkgManifestRoot',
    'VcpkgInstalledDir', 'VcpkgAdditionalInstallOptions', 'VcpkgAutoBootstrap',
    'VcpkgUnlistedIntegrationProbe',
    'vcpkglowercaseprobe', 'VCPKGUPPERCASEPROBE', 'platform'
)
$allNames = @($names) + $integrationNames
$original = @{}
foreach ($name in $allNames) {
    $original[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
    $foreignValue = if ($name -in @('CDDA_RELEASE_BUILD', 'BACKTRACE')) { '1' } else { 'foreign-value' }
    [Environment]::SetEnvironmentVariable($name, $foreignValue, 'Process')
}

try {
    $actual = Get-P3NativeBuildEnvironment -NativeRoot $nativeRoot -BuildRoot $buildRoot -NodeExe $nodeExe -VcpkgRoot $vcpkgRoot
    $expected = @{
        VCPKG_DOWNLOADS = Join-Path $nativeRoot 'downloads/vcpkg'
        VCPKG_DEFAULT_BINARY_CACHE = Join-Path $nativeRoot 'cache/vcpkg-binary'
        VCPKG_DISABLE_METRICS = '1'
        VCPKG_OVERLAY_TRIPLETS = Join-Path $buildRoot '.github/vcpkg_triplets'
        X_VCPKG_ASSET_SOURCES = 'clear;x-script,"' + $nodeExe + '" "' + (Join-Path $nativeRoot 'work/fetch.mjs') + '" {url} {dst} {sha512} 120000;x-block-origin'
        VCPKG_BINARY_SOURCES = $null
        VCPKG_ROOT = [System.IO.Path]::GetFullPath($vcpkgRoot)
        GIT_CONFIG_COUNT = '1'
        GIT_CONFIG_KEY_0 = 'http.sslBackend'
        GIT_CONFIG_VALUE_0 = 'openssl'
        CDDA_RELEASE_BUILD = $null
        BACKTRACE = $null
        VCPKG_FORCE_DOWNLOADED_BINARIES = $null
        VCPKG_FORCE_SYSTEM_BINARIES = $null
        PKG_CONFIG = $null
        VCPKG_OVERLAY_PORTS = $null
        VCPKG_DEFAULT_HOST_TRIPLET = $null
        VCPKG_VISUAL_STUDIO_PATH = $null
        VCPKG_KEEP_ENV_VARS = $null
        X_VCPKG_RECURSIVE_DATA = $null
        NODE_OPTIONS = $null
        VCPKG_FEATURE_FLAGS = $null
        X_VCPKG_REGISTRIES_CACHE = $null
        NODE_TLS_REJECT_UNAUTHORIZED = $null
    }
    if ($actual.Count -ne $expected.Count) { throw "Unexpected environment key count: $($actual.Count)" }
    foreach ($name in $names) {
        if (-not $actual.ContainsKey($name) -or $actual[$name] -cne $expected[$name]) {
            throw "Incorrect child environment value: $name"
        }
        $foreignValue = if ($name -in @('CDDA_RELEASE_BUILD', 'BACKTRACE')) { '1' } else { 'foreign-value' }
        if ([Environment]::GetEnvironmentVariable($name, 'Process') -cne $foreignValue) {
            throw "Parent environment changed: $name"
        }
    }
    New-Item -ItemType Directory -Path $buildRoot -Force | Out-Null
    $pwshExe = (Get-Process -Id $PID).Path
    $probe = @'
$names = @('VCPKG_DOWNLOADS', 'VCPKG_DEFAULT_BINARY_CACHE', 'VCPKG_DISABLE_METRICS', 'VCPKG_OVERLAY_TRIPLETS', 'X_VCPKG_ASSET_SOURCES', 'VCPKG_ROOT', 'GIT_CONFIG_COUNT', 'GIT_CONFIG_KEY_0', 'GIT_CONFIG_VALUE_0')
$values = @{}
foreach ($name in $names) { $values[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
$removed = @('VCPKG_BINARY_SOURCES', 'CDDA_RELEASE_BUILD', 'BACKTRACE', 'VCPKG_FORCE_DOWNLOADED_BINARIES', 'VCPKG_FORCE_SYSTEM_BINARIES', 'PKG_CONFIG', 'VCPKG_OVERLAY_PORTS', 'VCPKG_DEFAULT_HOST_TRIPLET', 'VCPKG_VISUAL_STUDIO_PATH', 'VCPKG_KEEP_ENV_VARS', 'X_VCPKG_RECURSIVE_DATA', 'NODE_OPTIONS', 'VCPKG_FEATURE_FLAGS', 'X_VCPKG_REGISTRIES_CACHE', 'NODE_TLS_REJECT_UNAUTHORIZED')
$values['REMOVED_KEYS'] = @([Environment]::GetEnvironmentVariables('Process').Keys | Where-Object { $_ -in $removed -or ($_ -like 'Vcpkg*' -and $_ -notin $names) -or $_ -eq 'Platform' })
$values['INHERITED_VALUE'] = [Environment]::GetEnvironmentVariable('P3_NATIVE_INHERITED_PROBE', 'Process')
$values['WORKING_DIRECTORY'] = (Get-Location).Path
$values | ConvertTo-Json -Compress
'@
    $exitCode = Invoke-P3NativeBuildTool -FilePath $pwshExe -ArgumentList @('-NoProfile', '-Command', $probe) -WorkingDirectory $buildRoot -Environment $actual -LogPath $logPath
    if ($exitCode -ne 0) { throw "Environment probe exited with code $exitCode" }
    $child = Get-Content -LiteralPath $logPath -Raw | ConvertFrom-Json -AsHashtable
    foreach ($name in $names) {
        if ($null -eq $expected[$name]) {
            if ($child['REMOVED_KEYS'] -contains $name) { throw "Removed environment key reached the child: $name" }
        } elseif ($child[$name] -cne $expected[$name]) {
            throw "Incorrect real child environment value: $name"
        }
        $foreignValue = if ($name -in @('CDDA_RELEASE_BUILD', 'BACKTRACE')) { '1' } else { 'foreign-value' }
        if ([Environment]::GetEnvironmentVariable($name, 'Process') -cne $foreignValue) { throw "Parent environment changed: $name" }
    }
    foreach ($name in $integrationNames) {
        if ($child['REMOVED_KEYS'] -contains $name) { throw "MSBuild integration key reached the child: $name" }
        if ([Environment]::GetEnvironmentVariable($name, 'Process') -cne 'foreign-value') { throw "Parent environment changed: $name" }
    }
    if (@($child['REMOVED_KEYS']).Count -ne 0) { throw "Unexpected removed keys reached the child: $($child['REMOVED_KEYS'] -join ', ')" }
    if ($child['INHERITED_VALUE'] -cne 'retained-value') { throw 'Unrelated inherited environment value missing' }
    if ($child['WORKING_DIRECTORY'] -cne $buildRoot) { throw 'Incorrect child working directory' }
    foreach ($platformName in @('platform', 'PLATFORM')) {
        [Environment]::SetEnvironmentVariable('Platform', $null, 'Process')
        [Environment]::SetEnvironmentVariable($platformName, 'foreign-value', 'Process')
        $exitCode = Invoke-P3NativeBuildTool -FilePath $pwshExe -ArgumentList @('-NoProfile', '-Command', $probe) -WorkingDirectory $buildRoot -Environment $actual -LogPath $logPath
        if ($exitCode -ne 0) { throw "Platform probe exited with code $exitCode" }
        $child = Get-Content -LiteralPath $logPath -Raw | ConvertFrom-Json -AsHashtable
        if (@($child['REMOVED_KEYS']).Count) { throw "Integration key reached the child for $platformName" }
        if ([Environment]::GetEnvironmentVariable($platformName, 'Process') -cne 'foreign-value') { throw "Parent environment changed: $platformName" }
    }
    $failureCode = Invoke-P3NativeBuildTool -FilePath $pwshExe -ArgumentList @('-NoProfile', '-Command', '[Console]::Error.WriteLine("child failure"); exit 7') -WorkingDirectory $buildRoot -Environment $actual -LogPath $failureLogPath
    if ($failureCode -ne 7) { throw "Incorrect failing child exit code: $failureCode" }
    if ((Get-Content -LiteralPath $failureLogPath -Raw) -notmatch 'child failure') { throw 'Child stderr missing from log' }
    foreach ($path in @($expected.VCPKG_DOWNLOADS, $expected.VCPKG_DEFAULT_BINARY_CACHE)) {
        if (-not (Test-Path -LiteralPath $path -PathType Container)) { throw "Cache directory missing: $path" }
    }
    Write-Host 'PASS: native build child environment'
} finally {
    [Environment]::SetEnvironmentVariable($inheritedName, $originalInherited, 'Process')
    foreach ($name in $allNames) {
        [Environment]::SetEnvironmentVariable($name, $original[$name], 'Process')
    }
    foreach ($path in @($logPath, $failureLogPath)) {
        if (Test-Path -LiteralPath $path -PathType Leaf) { Remove-Item -LiteralPath $path }
    }
    foreach ($path in @(
        (Join-Path $nativeRoot 'downloads/vcpkg'), (Join-Path $nativeRoot 'cache/vcpkg-binary'),
        (Join-Path $nativeRoot 'downloads'), (Join-Path $nativeRoot 'cache'), $buildRoot, $nativeRoot
    )) {
        if (Test-Path -LiteralPath $path -PathType Container) { Remove-Item -LiteralPath $path }
    }
}
