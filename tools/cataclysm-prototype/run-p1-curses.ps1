param(
    [switch] $Smoke,
    [string] $NativeBuildRoot,
    [string] $P1FixtureSave
)
$ErrorActionPreference = "Stop"
if (-not $Smoke) { throw "Pass -Smoke to run the automated P1 curses flow." }
$repo = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$day = Get-Date -Format "yyyy-MM-dd"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
if (-not $NativeBuildRoot) {
    $NativeBuildRoot = Join-Path $repo "artifacts/2026-10-19/nativebuild"
}
if (-not $P1FixtureSave) {
    $P1FixtureSave = Join-Path $repo "artifacts/2026-10-19/task01/native-smoke-20261019-052229/existing-controls/save"
}
$sourceRoot = Join-Path $NativeBuildRoot "cataclysm-source"
$binary = Join-Path $NativeBuildRoot "build-release/src/cataclysm"
$fixtureWorlds = @(Get-ChildItem -LiteralPath $P1FixtureSave -Directory)
if (-not (Test-Path $binary)) { throw "Native curses binary missing: $binary" }
if ($fixtureWorlds.Count -ne 1) { throw "Expected one P1 fixture world under $P1FixtureSave" }
$sourceGfx = Join-Path $sourceRoot "gfx"
$runtimeGfx = Join-Path $sourceRoot "data/gfx"
$tilesets = @(Get-ChildItem -LiteralPath $runtimeGfx -Filter tileset.txt -Recurse -File -ErrorAction SilentlyContinue)
if ($tilesets.Count -eq 0) {
    New-Item -ItemType Directory -Path $runtimeGfx -Force | Out-Null
    Get-ChildItem -LiteralPath $sourceGfx -Force | Copy-Item -Destination $runtimeGfx -Recurse -Force
}
if (@(Get-ChildItem -LiteralPath $runtimeGfx -Filter tileset.txt -Recurse -File -ErrorAction SilentlyContinue).Count -eq 0) {
    throw "Runtime graphics have no tileset.txt: $runtimeGfx"
}
$userDir = Join-Path $repo "artifacts/$day/task01/p1-curses-$stamp"
$saveDir = Join-Path $userDir "save"
New-Item -ItemType Directory -Path $userDir -Force | Out-Null
Copy-Item -LiteralPath $P1FixtureSave -Destination $saveDir -Recurse
$buildRootWsl = (& wsl.exe -e wslpath -a $NativeBuildRoot).Trim()
$userDirWsl = (& wsl.exe -e wslpath -a $userDir).Trim()
$ptyLogWsl = (& wsl.exe -e wslpath -a (Join-Path $userDir "curses.pty")).Trim()
$driverWsl = (& wsl.exe -e wslpath -a (Join-Path $PSScriptRoot "native_curses_smoke.py")).Trim()
& wsl.exe --exec python3 $driverWsl $buildRootWsl $userDirWsl $ptyLogWsl
if ($LASTEXITCODE -ne 0) { throw "Native curses smoke failed; evidence: $userDir" }
$verification = Join-Path $userDir "verification.json"
if (-not (Test-Path $verification)) { throw "Native curses smoke lacks save verification: $verification" }
Write-Host "PASS: $userDir"
