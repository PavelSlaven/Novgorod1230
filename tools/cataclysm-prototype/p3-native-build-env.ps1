function Get-P3NativeBuildEnvironment {
    param(
        [Parameter(Mandatory)][string] $NativeRoot,
        [Parameter(Mandatory)][string] $BuildRoot,
        [Parameter(Mandatory)][string] $NodeExe,
        [string] $VcpkgRoot = 'C:/Users/Slaven/NovgorodNative/sources/vcpkg-f6672d8'
    )

    $NativeRoot = [System.IO.Path]::GetFullPath($NativeRoot)
    $BuildRoot = [System.IO.Path]::GetFullPath($BuildRoot)
    $NodeExe = [System.IO.Path]::GetFullPath($NodeExe)
    $VcpkgRoot = [System.IO.Path]::GetFullPath($VcpkgRoot)
    $downloads = Join-Path $NativeRoot 'downloads/vcpkg'
    $binaryCache = Join-Path $NativeRoot 'cache/vcpkg-binary'
    New-Item -ItemType Directory -Path $downloads, $binaryCache -Force | Out-Null
    $fetch = Join-Path $NativeRoot 'work/fetch.mjs'

    return @{
        VCPKG_DOWNLOADS = $downloads
        VCPKG_DEFAULT_BINARY_CACHE = $binaryCache
        VCPKG_DISABLE_METRICS = '1'
        VCPKG_OVERLAY_TRIPLETS = Join-Path $BuildRoot '.github/vcpkg_triplets'
        X_VCPKG_ASSET_SOURCES = "clear;x-script,`"$NodeExe`" `"$fetch`" {url} {dst} {sha512} 120000;x-block-origin"
        VCPKG_BINARY_SOURCES = $null
        VCPKG_ROOT = $VcpkgRoot
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
}

function Invoke-P3NativeBuildTool {
    param(
        [Parameter(Mandatory)][string] $FilePath,
        [Parameter(Mandatory)][string[]] $ArgumentList,
        [Parameter(Mandatory)][string] $WorkingDirectory,
        [Parameter(Mandatory)][hashtable] $Environment,
        [Parameter(Mandatory)][string] $LogPath
    )

    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $FilePath
    $startInfo.WorkingDirectory = [System.IO.Path]::GetFullPath($WorkingDirectory)
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    foreach ($argument in $ArgumentList) { [void] $startInfo.ArgumentList.Add($argument) }
    foreach ($name in @($startInfo.Environment.Keys)) {
        if ($name -like 'Vcpkg*' -or $name -eq 'Platform') {
            [void] $startInfo.Environment.Remove($name)
        }
    }
    foreach ($name in $Environment.Keys) {
        if ($null -eq $Environment[$name]) {
            [void] $startInfo.Environment.Remove($name)
        } else {
            $startInfo.Environment[$name] = [string] $Environment[$name]
        }
    }

    $logPath = [System.IO.Path]::GetFullPath($LogPath)
    New-Item -ItemType Directory -Path ([System.IO.Path]::GetDirectoryName($logPath)) -Force | Out-Null
    $writer = [System.IO.StreamWriter]::new($logPath, $false, [System.Text.UTF8Encoding]::new($false))
    $writer.AutoFlush = $true
    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    try {
        if (-not $process.Start()) { throw "Could not start native build tool: $FilePath" }
        $stdout = $process.StandardOutput.ReadLineAsync()
        $stderr = $process.StandardError.ReadLineAsync()
        while ($null -ne $stdout -or $null -ne $stderr) {
            $pending = [System.Collections.Generic.List[System.Threading.Tasks.Task]]::new()
            if ($null -ne $stdout) { $pending.Add($stdout) }
            if ($null -ne $stderr) { $pending.Add($stderr) }
            $completed = [System.Threading.Tasks.Task]::WhenAny($pending.ToArray()).GetAwaiter().GetResult()
            $line = ([System.Threading.Tasks.Task[string]] $completed).GetAwaiter().GetResult()
            if ($null -ne $line) { $writer.WriteLine($line) }
            if ($completed -eq $stdout) {
                $stdout = if ($null -eq $line) { $null } else { $process.StandardOutput.ReadLineAsync() }
            } else {
                $stderr = if ($null -eq $line) { $null } else { $process.StandardError.ReadLineAsync() }
            }
        }
        $process.WaitForExit()
        return $process.ExitCode
    } finally {
        $process.Dispose()
        $writer.Dispose()
    }
}

function Invoke-P3NativeDependencyInstall {
    param(
        [Parameter(Mandatory)][string] $NativeRoot,
        [Parameter(Mandatory)][string] $BuildRoot,
        [Parameter(Mandatory)][string] $NodeExe,
        [Parameter(Mandatory)][string] $VcpkgRoot,
        [Parameter(Mandatory)][string] $InstallRoot,
        [switch] $PreflightOnly
    )

    if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'Запустите установку зависимостей через PowerShell 7 (pwsh).' }
    $powershellDirectory = 'C:\Program Files\PowerShell\7'
    if (-not (Test-Path -LiteralPath (Join-Path $powershellDirectory 'pwsh.exe') -PathType Leaf)) {
        throw "PowerShell 7 не найден: $powershellDirectory. Установка зависимостей не начата."
    }
    $pathDirectories = @($env:PATH -split ';' | ForEach-Object { $_.Trim().Trim('"').TrimEnd([char[]]'\/').Replace('/', '\') })
    if ($powershellDirectory -notin $pathDirectories) {
        throw "Каталог PowerShell 7 отсутствует в унаследованном PATH: $powershellDirectory. Установка зависимостей не начата."
    }
    $NativeRoot = [System.IO.Path]::GetFullPath($NativeRoot)
    $BuildRoot = [System.IO.Path]::GetFullPath($BuildRoot)
    $VcpkgRoot = [System.IO.Path]::GetFullPath($VcpkgRoot)
    $InstallRoot = [System.IO.Path]::GetFullPath($InstallRoot)
    $manifestRoot = Join-Path $BuildRoot 'msvc-full-features'
    $vcpkgExe = Join-Path $VcpkgRoot 'vcpkg.exe'
    foreach ($path in @($vcpkgExe, $NodeExe, (Join-Path $manifestRoot 'vcpkg.json'))) {
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Не найден обязательный файл: $path. Установка зависимостей не начата." }
    }
    if ($InstallRoot -eq (Join-Path $manifestRoot 'vcpkg_installed')) {
        throw 'Для зависимостей требуется отдельный InstallRoot вне msvc-full-features/vcpkg_installed.'
    }
    $environment = Get-P3NativeBuildEnvironment -NativeRoot $NativeRoot -BuildRoot $BuildRoot -NodeExe $NodeExe -VcpkgRoot $VcpkgRoot
    $offlineEnvironment = $environment.Clone()
    $offlineEnvironment['X_VCPKG_ASSET_SOURCES'] = 'clear;x-block-origin'
    $preflightLog = Join-Path $NativeRoot 'work/vcpkg-powershell-preflight.log'
    $exitCode = Invoke-P3NativeBuildTool -FilePath $vcpkgExe -ArgumentList @('fetch', 'powershell-core') -WorkingDirectory $manifestRoot -Environment $offlineEnvironment -LogPath $preflightLog
    if ($exitCode -ne 0) {
        throw "Офлайн-предпроверка powershell-core завершилась с кодом $exitCode. Установка зависимостей не начата. Лог: $preflightLog"
    }
    if ($PreflightOnly) { return }
    $installLog = Join-Path $NativeRoot 'work/vcpkg-install.log'
    $arguments = @('install', '--triplet', 'x64-windows-static', "--x-install-root=$InstallRoot", '--clean-buildtrees-after-build', '--clean-packages-after-build')
    $exitCode = Invoke-P3NativeBuildTool -FilePath $vcpkgExe -ArgumentList $arguments -WorkingDirectory $manifestRoot -Environment $environment -LogPath $installLog
    if ($exitCode -ne 0) { throw "Установка зависимостей vcpkg завершилась с кодом $exitCode. Лог: $installLog" }
}
