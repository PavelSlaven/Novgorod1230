param(
    [string] $NativeBuildRoot,
    [switch] $Controls
)
$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$day = Get-Date -Format "yyyy-MM-dd"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$evidence = Join-Path $repo "artifacts/$day/task01/native-smoke-$stamp"
if (-not $NativeBuildRoot) { $NativeBuildRoot = Join-Path $repo "artifacts/2026-10-19/nativebuild" }
$nativeRoot = Join-Path $NativeBuildRoot "cataclysm-source"
$binary = Join-Path $NativeBuildRoot "build-release/tests/cata_test"
if (-not (Test-Path $binary)) { throw "Build cata_test first: $binary" }
New-Item -ItemType Directory -Path $evidence -Force | Out-Null
$nativeRootWsl = (& wsl.exe -e wslpath -a $nativeRoot).Trim()
$binaryWsl = (& wsl.exe -e wslpath -a $binary).Trim()

function Normalize-Log([string] $path) {
    $raw = [System.IO.File]::ReadAllText($path)
    $normalized = $raw.Replace("`r`n", "`n").Replace("`r", "`n")
    [System.IO.File]::WriteAllText($path, $normalized, [System.Text.UTF8Encoding]::new($false))
}

$results = @()
$failed = $false
$speechUserDir = Join-Path $evidence "speech-listeners"
New-Item -ItemType Directory -Path $speechUserDir -Force | Out-Null
$speechUserDirWsl = (& wsl.exe -e wslpath -a $speechUserDir).Trim()
$speechLogs = @()
$createLog = Join-Path $evidence "speech-create.raw.log"
& wsl.exe --cd $nativeRootWsl --exec env NOVGOROD_P4_MODE=create NOVGOROD_P4_WORLD=task01_speech `
    $binaryWsl --rng-seed 17 "--user-dir=$speechUserDirWsl" `
    "Novgorod semantic request uses native avatar primitives" 2>&1 | Tee-Object -FilePath $createLog
$createExit = $LASTEXITCODE
Normalize-Log $createLog
$speechLogs += [pscustomobject]@{
    stage = "create"; exit_code = $createExit; log = $createLog
    log_sha256 = (Get-FileHash -LiteralPath $createLog -Algorithm SHA256).Hash
}
$observationPath = Join-Path $speechUserDir "novgorod-p3-observation.json"
$applyExit = -1
$readbackPath = Join-Path $speechUserDir "novgorod-p3-operation-readback.json"
if ($createExit -eq 0 -and (Test-Path $observationPath)) {
    $observation = Get-Content -LiteralPath $observationPath -Raw | ConvertFrom-Json
    $avatar = $observation.actors | Where-Object { $_.actor_ref -eq "avatar" } | Select-Object -First 1
    $request = [ordered]@{
        schema = "p3_native_operation_request_v1"
        operation_id = "task01-deaf-listeners"
        actor_id = [string]$avatar.actor_id
        primitive = "speak"
        args = @{ utterance = "native listener smoke" }
        expected_native_observation = @{ actor_id = [string]$avatar.actor_id; turn = [int]$observation.turn }
    }
    $requestPath = Join-Path $speechUserDir "novgorod-p3-operation.json"
    [System.IO.File]::WriteAllText($requestPath, ($request | ConvertTo-Json -Compress -Depth 8),
        [System.Text.UTF8Encoding]::new($false))
    $applyLog = Join-Path $evidence "speech-apply.raw.log"
    & wsl.exe --cd $nativeRootWsl --exec env NOVGOROD_P4_MODE=apply NOVGOROD_P4_WORLD=task01_speech `
        $binaryWsl --rng-seed 17 "--user-dir=$speechUserDirWsl" `
        "Novgorod semantic request uses native avatar primitives" 2>&1 | Tee-Object -FilePath $applyLog
    $applyExit = $LASTEXITCODE
    Normalize-Log $applyLog
    $speechLogs += [pscustomobject]@{
        stage = "apply-speech"; exit_code = $applyExit; log = $applyLog
        log_sha256 = (Get-FileHash -LiteralPath $applyLog -Algorithm SHA256).Hash
    }
}
$speechPassed = ($createExit -eq 0 -and $applyExit -eq 0 -and (Test-Path $readbackPath))
$results += [pscustomobject]@{
    name = "p3-create-speech-deaf-listeners"; passed = $speechPassed
    user_dir = $speechUserDir; observation = $observationPath; readback = $readbackPath
    stages = $speechLogs
}
if (-not $speechPassed) { $failed = $true }

$cases = @(
    @{ Name = "novgorod-focused"; Filter = "[novgorod_semantic][item],[novgorod_semantic][pickup],[novgorod_semantic][json],[novgorod_item_uid]" }
)
if ($Controls) { $cases += @{ Name = "existing-controls"; Filter = "[item],[json],[pickup]" } }
foreach ($case in $cases) {
    $userDir = Join-Path $evidence $case.Name
    New-Item -ItemType Directory -Path $userDir -Force | Out-Null
    $userDirWsl = (& wsl.exe -e wslpath -a $userDir).Trim()
    $log = Join-Path $evidence "$($case.Name).raw.log"
    & wsl.exe --cd $nativeRootWsl --exec $binaryWsl --rng-seed 17 "--user-dir=$userDirWsl" $case.Filter 2>&1 |
        Tee-Object -FilePath $log
    $exit = $LASTEXITCODE
    Normalize-Log $log
    $saveFiles = @(Get-ChildItem -LiteralPath $userDir -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -match '[\\/]save[s]?[\\/]' -or $_.Name -match '\.(sav|gsav)$' })
    $results += [pscustomobject]@{
        name = $case.Name; filter = $case.Filter; exit_code = $exit
        passed = ($exit -eq 0)
        user_dir = $userDir; save_files = @($saveFiles | ForEach-Object FullName)
        log = $log; log_sha256 = (Get-FileHash -LiteralPath $log -Algorithm SHA256).Hash
    }
    if ($exit -ne 0 -or ($case.Name -eq "existing-controls" -and $saveFiles.Count -eq 0)) { $failed = $true }
}
[pscustomobject]@{
    upstream_commit = "0d8843f1c500052c3e026e3da6f8edaf5e00b626"
    binary = $binary
    binary_sha256 = (Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash
    cases = $results
} | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $evidence "result.json") -Encoding utf8
if ($failed) { throw "One or more native cases failed; see $evidence/result.json" }
Write-Host "PASS: $evidence"
