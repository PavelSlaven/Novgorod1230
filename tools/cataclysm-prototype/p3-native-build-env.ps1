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
        X_VCPKG_ASSET_SOURCES = "clear;x-script,`"$NodeExe`" `"$fetch`" {url} {dst} {sha512};x-block-origin"
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
