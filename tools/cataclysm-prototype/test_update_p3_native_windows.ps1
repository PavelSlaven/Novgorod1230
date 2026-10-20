param(
    [string] $Updater = (Join-Path $PSScriptRoot 'update-p3-native.ps1')
)

$ErrorActionPreference = 'Stop'
$root = Join-Path ([System.IO.Path]::GetTempPath()) ('p3-native-test-' + [guid]::NewGuid().ToString('N'))
$base = Join-Path $root 'base'
$overlay = Join-Path $root 'overlay'
$build = Join-Path $root 'build'
$stage = Join-Path $root 'stage'
New-Item -ItemType Directory -Path $base, $overlay, $stage | Out-Null

function Assert-StageCount([int] $expected) {
    $actual = @(Get-ChildItem -LiteralPath $stage -Directory).Count
    if ($actual -ne $expected) { throw "Stage directory count changed: expected $expected, got $actual; fixture: $root" }
}

New-Item -ItemType Directory -Path (Join-Path $base 'src') | Out-Null
[System.IO.File]::WriteAllText((Join-Path $base 'src/sequence.txt'), "step0`n")
[System.IO.File]::WriteAllText((Join-Path $base 'src/restore.txt'), "base bytes`n")
[System.IO.File]::WriteAllText((Join-Path $base 'src/deleted.txt'), "deleted base bytes`n")
[System.IO.File]::WriteAllText((Join-Path $base 'src/unmanaged.txt'), "unmanaged bytes`n")
[System.IO.File]::WriteAllText((Join-Path $base '.gitignore'), "*.lib`n*.ignored`n")
& git -C $base init -q
if ($LASTEXITCODE) { throw 'git init failed' }
& git -C $base add .
if ($LASTEXITCODE) { throw 'git add failed' }
& git -C $base -c user.name=Fixture -c user.email=fixture@example.test commit -qm fixture
if ($LASTEXITCODE) { throw 'git commit failed' }
$baseSha = (& git -C $base rev-parse HEAD).Trim()
$baseIndexEntries = (& git -C $base ls-files --stage) -join "`n"
if ($LASTEXITCODE) { throw 'git ls-files failed' }

$patchNames = @('native-input', 'native-persistence', 'native-item-identity',
    'native-rng-state', 'native-preload', 'native-semantic-input',
    'native-live-input', 'native-autosave-options')
for ($i = 0; $i -lt $patchNames.Count; $i++) {
    $before = $i
    $after = $i + 1
    $patch = "diff --git a/src/sequence.txt b/src/sequence.txt`n--- a/src/sequence.txt`n+++ b/src/sequence.txt`n@@ -1 +1 @@`n-step$before`n+step$after`n"
    if ($i -eq 0) {
        $patch += "diff --git a/src/restore.txt b/src/restore.txt`n--- a/src/restore.txt`n+++ b/src/restore.txt`n@@ -1 +1 @@`n-base bytes`n+patched bytes`n"
        $patch += "diff --git a/src/created.txt b/src/created.txt`nnew file mode 100644`n--- /dev/null`n+++ b/src/created.txt`n@@ -0,0 +1 @@`n+created bytes`n"
        $patch += "diff --git a/src/deleted.txt b/src/deleted.txt`ndeleted file mode 100644`n--- a/src/deleted.txt`n+++ /dev/null`n@@ -1 +0,0 @@`n-deleted base bytes`n"
    }
    [System.IO.File]::WriteAllText((Join-Path $overlay "$($patchNames[$i]).patch"), $patch)
}
[System.IO.File]::WriteAllBytes((Join-Path $overlay 'novgorod_semantic.cpp'), [byte[]](0, 1, 10, 255))
[System.IO.File]::WriteAllText((Join-Path $overlay 'novgorod_semantic.h'), 'fixture header')

$separator = [System.IO.Path]::DirectorySeparatorChar
$arguments = @('-NoProfile', '-File', $Updater, '-PrepareOnly', '-BaseRoot', "$base$separator",
    '-BaseSha', $baseSha, '-BuildRoot', "$build$separator", '-StageParent', "$stage$separator", '-OverlayRoot', "$overlay$separator")
$wrongBaseArguments = $arguments.Clone()
$wrongBaseArguments[[array]::IndexOf($wrongBaseArguments, '-BaseSha') + 1] = ('0' * 40)
& pwsh @wrongBaseArguments
if ($LASTEXITCODE -eq 0 -or (Test-Path -LiteralPath $build)) { throw 'Mismatched base SHA was accepted' }
Assert-StageCount 0
[System.IO.File]::WriteAllText((Join-Path $base 'src/sequence.txt'), "modified base`n")
& pwsh @arguments
if ($LASTEXITCODE -eq 0 -or (Test-Path -LiteralPath $build)) { throw 'Modified base was accepted' }
Assert-StageCount 0
[System.IO.File]::WriteAllText((Join-Path $base 'src/sequence.txt'), "step0`n")
& pwsh @arguments
if ($LASTEXITCODE) { throw "First prepare failed; fixture: $root" }
Assert-StageCount 1
if (-not (Test-Path (Join-Path $build 'src/sequence.txt'))) { throw 'Build path was not created' }
if (([System.IO.File]::ReadAllText((Join-Path $build 'src/sequence.txt'))) -ne "step8`n") { throw 'Patch order is wrong' }
if ([Convert]::ToHexString([System.IO.File]::ReadAllBytes((Join-Path $build 'src/novgorod_semantic.cpp'))) -ne '00010AFF') {
    throw 'Semantic source bytes changed'
}
$manifestPath = "$build.manifest.json"
$first = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($first.stamp -notmatch '^[a-f0-9]{64}$' -or $first.paths.'src/sequence.txt' -notmatch '^[a-f0-9]{64}$') {
    throw 'Stamp or per-path manifest missing'
}
$mtime = (Get-Item -LiteralPath (Join-Path $build 'src/sequence.txt')).LastWriteTimeUtc
$firstStage = (Get-ChildItem -LiteralPath $stage -Directory | Select-Object -First 1).FullName
$firstStageBytes = [System.IO.File]::ReadAllBytes((Join-Path $firstStage 'src/sequence.txt'))
if ((Test-Path -LiteralPath (Join-Path $firstStage '.git')) -or
    (Test-Path -LiteralPath (Join-Path $firstStage 'src/unmanaged.txt')) -or
    (Test-Path -LiteralPath (Join-Path $firstStage '.gitignore'))) { throw 'Stage contains more than managed paths' }
if (Test-Path -LiteralPath (Join-Path $build 'src/deleted.txt')) { throw 'Patch deletion was not applied' }
if (((& git -C $base ls-files --stage) -join "`n") -ne $baseIndexEntries -or $LASTEXITCODE) { throw 'Prepare changed the pinned base index' }
$stageCount = @(Get-ChildItem -LiteralPath $stage -Directory).Count
$generated = @('cataclysm-tiles.exe', 'tools/format/JsonFormatter-lib-vcpkg-static-Release-x64.lib',
    'data/shaders/x.frag.spv', 'objwin/a.obj', 'ignored directory/extra.ignored')
foreach ($relative in $generated) {
    $path = Join-Path $build $relative
    [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($path)) | Out-Null
    [System.IO.File]::WriteAllText($path, 'generated bytes')
}
& pwsh @arguments
if ($LASTEXITCODE) { throw "Repeated prepare failed; fixture: $root" }
Assert-StageCount $stageCount
$second = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($first.stamp -ne $second.stamp -or $mtime -ne (Get-Item -LiteralPath (Join-Path $build 'src/sequence.txt')).LastWriteTimeUtc) {
    throw 'Identical prepare rewrote source'
}
foreach ($relative in $generated) {
    if ([System.IO.File]::ReadAllText((Join-Path $build $relative)) -ne 'generated bytes') { throw "Generated file changed: $relative" }
}
$unmanaged = Join-Path $build 'src/unmanaged.txt'
[System.IO.File]::WriteAllText($unmanaged, 'foreign tracked bytes')
& pwsh @arguments
if ($LASTEXITCODE -eq 0 -or [System.IO.File]::ReadAllText($unmanaged) -ne 'foreign tracked bytes') { throw 'Foreign tracked file was accepted or changed' }
Assert-StageCount $stageCount
[System.IO.File]::WriteAllText($unmanaged, "unmanaged bytes`n")
$unknown = Join-Path $build 'unknown.txt'
[System.IO.File]::WriteAllText($unknown, 'unknown bytes')
& pwsh @arguments
if ($LASTEXITCODE -eq 0 -or [System.IO.File]::ReadAllText($unknown) -ne 'unknown bytes') { throw 'Unknown untracked file was accepted or changed' }
Assert-StageCount $stageCount
Remove-Item -LiteralPath $unknown
$manifestBytes = [System.IO.File]::ReadAllBytes($manifestPath)
Remove-Item -LiteralPath $manifestPath
try {
    & pwsh @arguments
    if ($LASTEXITCODE -eq 0) { throw 'Existing build without manifest was accepted' }
    Assert-StageCount $stageCount
} finally {
    [System.IO.File]::WriteAllBytes($manifestPath, $manifestBytes)
}
$lastPatch = Join-Path $overlay 'native-autosave-options.patch'
[System.IO.File]::WriteAllText($lastPatch, ([System.IO.File]::ReadAllText($lastPatch)).Replace('+step8', '+step9'))
& pwsh @arguments
if ($LASTEXITCODE) { throw "Changed patch prepare failed; fixture: $root" }
$third = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($third.stamp -eq $second.stamp -or [System.IO.File]::ReadAllText((Join-Path $build 'src/sequence.txt')) -ne "step9`n") {
    throw 'Changed patch did not change stamp and managed bytes'
}
if ([Convert]::ToHexString([System.IO.File]::ReadAllBytes((Join-Path $firstStage 'src/sequence.txt'))) -ne [Convert]::ToHexString($firstStageBytes)) {
    throw 'Previous stage was changed'
}
$firstPatch = Join-Path $overlay 'native-input.patch'
$patchText = [System.IO.File]::ReadAllText($firstPatch)
[System.IO.File]::WriteAllText($firstPatch, $patchText.Substring(0, $patchText.IndexOf('diff --git a/src/restore.txt')))
& pwsh @arguments
if ($LASTEXITCODE) { throw 'Removing paths from patches failed' }
if ([System.IO.File]::ReadAllText((Join-Path $build 'src/restore.txt')) -ne "base bytes`n" -or
    [System.IO.File]::ReadAllText((Join-Path $build 'src/deleted.txt')) -ne "deleted base bytes`n" -or
    (Test-Path -LiteralPath (Join-Path $build 'src/created.txt'))) { throw 'Removed patch paths were not restored or deleted' }
$validLastPatch = [System.IO.File]::ReadAllText($lastPatch)
[System.IO.File]::WriteAllText($lastPatch, $validLastPatch.Replace('-step7', '-conflict'))
$beforeConflict = [System.IO.File]::ReadAllText($manifestPath)
$stageCount = @(Get-ChildItem -LiteralPath $stage -Directory).Count
& pwsh @arguments
if ($LASTEXITCODE -eq 0 -or [System.IO.File]::ReadAllText($manifestPath) -ne $beforeConflict -or
    [System.IO.File]::ReadAllText((Join-Path $build 'src/sequence.txt')) -ne "step9`n") { throw 'Conflicting patch was accepted or changed the build' }
Assert-StageCount $stageCount
[System.IO.File]::WriteAllText($lastPatch, $validLastPatch)
$header = Join-Path $build 'src/novgorod_semantic.h'
[System.IO.File]::WriteAllBytes((Join-Path $overlay 'novgorod_semantic.cpp'), [byte[]](9, 8, 7))
[System.IO.File]::WriteAllText((Join-Path $overlay 'novgorod_semantic.h'), 'updated header')
(Get-Item -LiteralPath $header).IsReadOnly = $true
try {
    & pwsh @arguments
    if ($LASTEXITCODE -eq 0) { throw 'Read-only destination did not interrupt copying' }
} finally {
    (Get-Item -LiteralPath $header).IsReadOnly = $false
}
$interrupted = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$cpp = Join-Path $build 'src/novgorod_semantic.cpp'
if (-not $interrupted.pending -or [Convert]::ToHexString([System.IO.File]::ReadAllBytes($cpp)) -ne '090807' -or
    [System.IO.File]::ReadAllText($header) -ne 'fixture header') { throw 'Fixture did not interrupt a partially copied update with pending manifest' }
[System.IO.File]::WriteAllText($cpp, 'foreign during pending')
$stageCount = @(Get-ChildItem -LiteralPath $stage -Directory).Count
& pwsh @arguments
if ($LASTEXITCODE -eq 0 -or [System.IO.File]::ReadAllText($cpp) -ne 'foreign during pending') { throw 'Foreign edit during pending update was accepted or changed' }
Assert-StageCount $stageCount
[System.IO.File]::WriteAllBytes($cpp, [byte[]](9, 8, 7))
& pwsh @arguments
if ($LASTEXITCODE) { throw 'Interrupted prepare could not resume' }
$resumed = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($resumed.PSObject.Properties.Name -contains 'pending' -or [System.IO.File]::ReadAllText($header) -ne 'updated header') {
    throw 'Resumed prepare did not finish pending update'
}
[System.IO.File]::WriteAllText((Join-Path $build 'src/sequence.txt'), 'foreign edit')
$stageCount = @(Get-ChildItem -LiteralPath $stage -Directory).Count
& pwsh @arguments
if ($LASTEXITCODE -eq 0) { throw 'Unknown byte edit was accepted despite matching stamp' }
Assert-StageCount $stageCount
if (([System.IO.File]::ReadAllText((Join-Path $build 'src/sequence.txt'))) -ne 'foreign edit') {
    throw 'Unknown byte edit was overwritten'
}
if (((& git -C $base ls-files --stage) -join "`n") -ne $baseIndexEntries -or $LASTEXITCODE) { throw 'Prepare changed the pinned base index' }
$worktrees = (& git -C $base worktree list --porcelain) -join "`n"
if ($LASTEXITCODE -ne 0 -or $worktrees.Contains('cdda-patched-')) { throw 'Prepare registered a stage worktree' }
Write-Host "PASS: fixture remains at $root"
