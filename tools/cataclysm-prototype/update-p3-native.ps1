param(
    [switch] $PrepareOnly,
    [string] $BaseRoot = 'C:/Users/Slaven/NovgorodNative/sources/cdda-base-0d8843f',
    [string] $BaseSha = '0d8843f1c500052c3e026e3da6f8edaf5e00b626',
    [string] $BuildRoot = 'C:/Users/Slaven/NovgorodNative/build/cdda-patched',
    [string] $StageParent = 'C:/Users/Slaven/NovgorodNative/stage',
    [string] $OverlayRoot = $PSScriptRoot
)

$ErrorActionPreference = 'Stop'
if (-not $PrepareOnly) { throw 'Only -PrepareOnly is implemented' }

function Invoke-Git([string] $root, [string[]] $arguments) {
    $result = & git -c "safe.directory=$root" -C $root @arguments
    if ($LASTEXITCODE -ne 0) { throw "git $($arguments -join ' ') failed in $root" }
    if ($null -ne $result) { Write-Output $result }
}

function Invoke-IndexGit([string[]] $arguments) {
    $previousIndex = $env:GIT_INDEX_FILE
    try {
        $env:GIT_INDEX_FILE = $indexPath
        Invoke-Git $BaseRoot $arguments
    } finally {
        $env:GIT_INDEX_FILE = $previousIndex
    }
}

function Resolve-Root([string] $path) {
    $full = [System.IO.Path]::GetFullPath($path)
    if ($full -eq [System.IO.Path]::GetPathRoot($full)) { return $full }
    return $full.TrimEnd('\', '/')
}

function Write-Manifest($manifest) {
    $temporary = "$manifestPath.$([guid]::NewGuid().ToString('N')).tmp"
    [System.IO.File]::WriteAllText($temporary, ($manifest | ConvertTo-Json -Depth 6), [System.Text.UTF8Encoding]::new($false))
    [System.IO.File]::Move($temporary, $manifestPath, $true)
}

function Get-Sha([string] $path) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { return $null }
    return (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Test-Generated([string] $path) {
    return $ignoredPaths.Contains($path) -or $path -eq 'src/version.h' -or
        $path -match '^(\.git|objwin)(/|$)' -or
        $path -match '^msvc-full-features/vcpkg_installed(/|$)' -or
        $path -match '^data/shaders/[^/]+\.(dxil|spv)$' -or
        $path -match '^(cataclysm-tiles\.(exe|pdb|ilk)|zzip\.(exe|pdb))$' -or
        $path -match '^tools/format/json_formatter[^/]*$'
}

$BaseRoot = Resolve-Root $BaseRoot
$BuildRoot = Resolve-Root $BuildRoot
$StageParent = Resolve-Root $StageParent
$OverlayRoot = Resolve-Root $OverlayRoot
$manifestPath = "$BuildRoot.manifest.json"
if (-not (Test-Path -LiteralPath $BaseRoot -PathType Container)) { throw "Pinned base is missing: $BaseRoot" }
$actualBaseSha = (Invoke-Git $BaseRoot @('rev-parse', 'HEAD')).Trim()
if ($actualBaseSha -ne $BaseSha) { throw "Pinned base SHA mismatch: $actualBaseSha" }
if (@(Invoke-Git $BaseRoot @('status', '--porcelain', '--untracked-files=no')).Count) {
    throw 'Pinned base has modified tracked files'
}

$patchNames = @('native-input', 'native-persistence', 'native-item-identity',
    'native-rng-state', 'native-preload', 'native-semantic-input',
    'native-live-input', 'native-autosave-options')
$inputs = [ordered]@{ base = $BaseSha }
foreach ($name in $patchNames) {
    $path = Join-Path $OverlayRoot "$name.patch"
    $hash = Get-Sha $path
    if (-not $hash) { throw "Patch is missing: $path" }
    $inputs[$name] = $hash
}
foreach ($name in @('novgorod_semantic.cpp', 'novgorod_semantic.h')) {
    $path = Join-Path $OverlayRoot $name
    $hash = Get-Sha $path
    if (-not $hash) { throw "Semantic source is missing: $path" }
    $inputs[$name] = $hash
}
$stampText = ($inputs.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join "`n"
$stampBytes = [System.Text.Encoding]::UTF8.GetBytes($stampText)
$stamp = [Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData($stampBytes)).ToLowerInvariant()

$indexPath = Join-Path ([System.IO.Path]::GetTempPath()) ('p3-native-' + [guid]::NewGuid().ToString('N') + '.index')
try {
    Invoke-IndexGit @('read-tree', $BaseSha) | Out-Null
    foreach ($name in $patchNames) {
        $patch = Join-Path $OverlayRoot "$name.patch"
        Invoke-IndexGit @('apply', '--cached', '--check', $patch) | Out-Null
        Invoke-IndexGit @('apply', '--cached', $patch) | Out-Null
    }

    $managed = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    foreach ($path in @(Invoke-IndexGit @('diff', '--cached', '--no-renames', '--name-only', $BaseSha))) { [void]$managed.Add($path.Replace('\', '/')) }
    foreach ($name in @('novgorod_semantic.cpp', 'novgorod_semantic.h')) { [void]$managed.Add("src/$name") }

    $previous = $null
    if (Test-Path -LiteralPath $manifestPath -PathType Leaf) {
        $previous = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
        if ($previous.base -ne $BaseSha) { throw 'Existing build manifest has another base SHA' }
        foreach ($property in $previous.paths.PSObject.Properties) { [void]$managed.Add($property.Name) }
        foreach ($property in $previous.pending.PSObject.Properties) { [void]$managed.Add($property.Name) }
    }
    if (-not (Test-Path -LiteralPath $BuildRoot -PathType Container)) {
        if ($previous) { throw 'Build worktree disappeared while its manifest remains' }
        $parent = Split-Path -Parent $BuildRoot
        if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent | Out-Null }
        Invoke-Git $BaseRoot @('worktree', 'add', '--quiet', '--detach', $BuildRoot, $BaseSha) | Out-Null
        Write-Manifest ([ordered]@{ base = $BaseSha; paths = [ordered]@{} })
        $previous = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    } elseif (-not $previous) {
        throw "Existing build has no manifest: $BuildRoot"
    }
    $buildSha = (Invoke-Git $BuildRoot @('rev-parse', 'HEAD')).Trim()
    if ($buildSha -ne $BaseSha) { throw 'Build worktree is not at the pinned base SHA' }

    $previousPaths = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    foreach ($property in $previous.paths.PSObject.Properties) { [void]$previousPaths.Add($property.Name) }
    foreach ($property in $previous.pending.PSObject.Properties) { [void]$previousPaths.Add($property.Name) }
    foreach ($relative in $previousPaths) {
        $actual = Get-Sha (Join-Path $BuildRoot $relative)
        $old = $previous.paths.PSObject.Properties[$relative]
        $pending = if ($previous.pending) { $previous.pending.PSObject.Properties[$relative] } else { $null }
        if ($actual -ne $old.Value -and (-not $pending -or $actual -ne $pending.Value)) {
            throw "Foreign byte edit in managed build path: $relative"
        }
    }
    $ignoredPaths = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    $status = @(Invoke-Git $BuildRoot @('status', '--porcelain', '--ignored', '--untracked-files=all', '-z')) -join "`n"
    foreach ($entry in $status.Split([char]0)) {
        if ($entry.StartsWith('!! ')) { [void]$ignoredPaths.Add($entry.Substring(3).Replace('\', '/')) }
    }
    $trackedPaths = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    foreach ($path in @(Invoke-Git $BuildRoot @('ls-files'))) { [void]$trackedPaths.Add($path.Replace('\', '/')) }
    foreach ($file in Get-ChildItem -LiteralPath $BuildRoot -Recurse -Force -File) {
        $relative = [System.IO.Path]::GetRelativePath($BuildRoot, $file.FullName).Replace('\', '/')
        if (Test-Generated $relative) { continue }
        if ($managed.Contains($relative)) { continue }
        if (-not $trackedPaths.Contains($relative)) { throw "Unknown build path: $relative" }
    }
    $changedTracked = @(
        Invoke-Git $BuildRoot @('diff', '--name-only', $BaseSha)
        Invoke-Git $BuildRoot @('diff', '--cached', '--name-only', $BaseSha)
    )
    foreach ($path in $changedTracked) {
        $relative = $path.Replace('\', '/')
        if (Test-Generated $relative) { continue }
        if ($previousPaths.Contains($relative)) { continue }
        if (-not $managed.Contains($relative)) {
            throw "Foreign byte edit in build path: $relative"
        }
        throw "Foreign byte edit in newly managed build path: $relative"
    }
    foreach ($relative in $managed) {
        if ($previousPaths.Contains($relative)) { continue }
        if (-not $trackedPaths.Contains($relative) -and (Test-Path -LiteralPath (Join-Path $BuildRoot $relative) -PathType Leaf)) {
            throw "Foreign addition at newly managed build path: $relative"
        }
    }

    if ($previous.stamp -eq $stamp -and -not $previous.pending) {
        Write-Host "Already prepared $BuildRoot; stamp $stamp"
        return
    }

    if (-not (Test-Path -LiteralPath $StageParent)) { New-Item -ItemType Directory -Path $StageParent | Out-Null }
    $stageRoot = Join-Path $StageParent ('cdda-patched-' + [guid]::NewGuid().ToString('N'))
    [System.IO.Directory]::CreateDirectory($stageRoot) | Out-Null
    Write-Host "Stage files: $stageRoot"
    $indexedPaths = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    foreach ($path in @(Invoke-IndexGit @('ls-files'))) { [void]$indexedPaths.Add($path.Replace('\', '/')) }
    foreach ($relative in $managed) {
        if ($indexedPaths.Contains($relative)) {
            Invoke-IndexGit @('checkout-index', "--prefix=$($stageRoot.Replace('\', '/'))/", '--', $relative) | Out-Null
        }
    }
    foreach ($name in @('novgorod_semantic.cpp', 'novgorod_semantic.h')) {
        $destination = Join-Path $stageRoot "src/$name"
        [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($destination)) | Out-Null
        [System.IO.File]::Copy((Join-Path $OverlayRoot $name), $destination, $true)
    }

    $newPaths = [ordered]@{}
    $oldPaths = [ordered]@{}
    foreach ($relative in @($managed | Sort-Object)) {
        $oldPaths[$relative] = Get-Sha (Join-Path $BuildRoot $relative)
        $newPaths[$relative] = Get-Sha (Join-Path $stageRoot $relative)
    }
    Write-Manifest ([ordered]@{ base = $BaseSha; stamp = $previous.stamp; paths = $oldPaths; pending = $newPaths })
    foreach ($relative in @($managed | Sort-Object)) {
        $source = Join-Path $stageRoot $relative
        $target = Join-Path $BuildRoot $relative
        $wanted = $newPaths[$relative]
        $actual = Get-Sha $target
        if ($wanted -ne $actual) {
            if ($wanted) {
                [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($target)) | Out-Null
                [System.IO.File]::Copy($source, $target, $true)
            } elseif (Test-Path -LiteralPath $target -PathType Leaf) {
                Remove-Item -LiteralPath $target
            }
        }
    }
    $next = [ordered]@{ base = $BaseSha; stamp = $stamp; paths = $newPaths }
    Write-Manifest $next
    Write-Host "Prepared $BuildRoot from $stageRoot; stamp $stamp"
} finally {
    if (Test-Path -LiteralPath $indexPath -PathType Leaf) { Remove-Item -LiteralPath $indexPath }
}
