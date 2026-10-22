param([switch] $UseCurrentConsoleEncoding)
$ErrorActionPreference = "Stop"
$launcher = Join-Path $PSScriptRoot "run-p3-dev.ps1"
$previous = @{}
foreach ($name in @("LOCALAPPDATA", "RUS_LLM_SETTINGS_PATH", "WSLENV")) {
    $previous[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
}
$previousConsoleOutputEncoding = [Console]::OutputEncoding
$launcherCalls = [System.Collections.Generic.List[object]]::new()
function wsl.exe {
    $global:LASTEXITCODE = 0
    if ($args[1] -eq "wslpath") { return "/mnt/c/repo with spaces/run-p3-dev.sh" }
    $launcherCalls.Add(@{
        Arguments = @($args)
        Settings = $env:RUS_LLM_SETTINGS_PATH
        WslEnv = $env:WSLENV
    })
}
function Assert-Equal($actual, $expected) {
    if ($actual -cne $expected) { throw "Launcher assertion failed: expected <$expected>, got <$actual>." }
}
try {
    if (-not $UseCurrentConsoleEncoding) {
        [Console]::OutputEncoding = [Text.Encoding]::GetEncoding(866)
    }
    $env:LOCALAPPDATA = "C:\launcher test\настройки"
    $env:RUS_LLM_SETTINGS_PATH = $null
    $env:WSLENV = "EXISTING/u:RUS_LLM_SETTINGS_PATH/u:ANOTHER/p"
    & $launcher -RuntimeRoot "/home/test/runtime with spaces" -Reset
    $defaultLaunch = $launcherCalls[-1]
    Assert-Equal $defaultLaunch.Settings (Join-Path $env:LOCALAPPDATA "Novgorod1230/llm-settings.json")
    Assert-Equal $defaultLaunch.WslEnv "EXISTING/u:ANOTHER/p:RUS_LLM_SETTINGS_PATH/p"
    Assert-Equal ($defaultLaunch.Arguments -join '|') "--exec|bash|/mnt/c/repo with spaces/run-p3-dev.sh|--runtime-root|/home/test/runtime with spaces|--reset|--text"
    Assert-Equal $env:RUS_LLM_SETTINGS_PATH $null
    Assert-Equal $env:WSLENV "EXISTING/u:RUS_LLM_SETTINGS_PATH/u:ANOTHER/p"

    Push-Location ([IO.Path]::GetTempPath())
    try {
        $outsideRoot = (Get-Location).Path
        & $launcher
        Assert-Equal $launcherCalls[-1].Settings $defaultLaunch.Settings
        Assert-Equal ($launcherCalls[-1].Arguments -join '|') "--exec|bash|/mnt/c/repo with spaces/run-p3-dev.sh|--runtime-root|/home/slaven/cataclysm-recovery/task03-dev|--text"
        Assert-Equal (Get-Location).Path $outsideRoot
        Assert-Equal $env:RUS_LLM_SETTINGS_PATH $null
    } finally {
        Pop-Location
    }

    $env:RUS_LLM_SETTINGS_PATH = "C:\fake settings\owner.json"
    & $launcher
    Assert-Equal $launcherCalls[-1].Settings "C:\fake settings\owner.json"
    Assert-Equal $env:RUS_LLM_SETTINGS_PATH "C:\fake settings\owner.json"

    $env:RUS_LLM_SETTINGS_PATH = $null
    function node { throw "NativeOnly must not resolve LLM settings." }
    & $launcher -NativeOnly
    Assert-Equal $launcherCalls[-1].Settings $null
    Assert-Equal ($launcherCalls[-1].Arguments -join '|') "--exec|bash|/mnt/c/repo with spaces/run-p3-dev.sh|--runtime-root|/home/slaven/cataclysm-recovery/task03-dev|--native-only|--text"
    Assert-Equal $env:RUS_LLM_SETTINGS_PATH $null

    $tilesOutput = & $launcher -NativeOnly -Tiles 6>&1 | Out-String
    Assert-Equal ($launcherCalls[-1].Arguments -join '|') "--exec|bash|/mnt/c/repo with spaces/run-p3-dev.sh|--runtime-root|/home/slaven/cataclysm-recovery/task03-dev|--native-only"
    Assert-Equal $tilesOutput.Trim() "Окно WSLg может не появиться на рабочем столе Windows; текстовая версия запускается без ключа -Tiles."

    $launcherParameters = @((Get-Command $launcher).Parameters.Keys)
    Assert-Equal ($launcherParameters -contains "Text") $false
    Assert-Equal ($launcherParameters -contains "Tiles") $true
    Write-Output "PASS: default owner path from repo/outside cwd, explicit fake override, WSLENV forwarding/restoration, NativeOnly, default --text, Tiles without --text with WSLg message, -Text removed."
} finally {
    [Console]::OutputEncoding = $previousConsoleOutputEncoding
    foreach ($name in $previous.Keys) {
        [Environment]::SetEnvironmentVariable($name, $previous[$name], "Process")
    }
    Remove-Item Function:node -ErrorAction SilentlyContinue
    Remove-Item Function:wsl.exe -ErrorAction SilentlyContinue
}
