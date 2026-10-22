param(
    [switch] $NativeOnly,
    [switch] $Reset,
    [switch] $Tiles,
    [string] $RuntimeRoot = "/home/slaven/cataclysm-recovery/task03-dev"
)
$ErrorActionPreference = "Stop"
$launcher = (& wsl.exe --exec wslpath -a (Join-Path $PSScriptRoot "run-p3-dev.sh")).Trim()
if ($LASTEXITCODE -ne 0) { throw "Не удалось определить WSL-путь launcher." }
$arguments = @($launcher, "--runtime-root", $RuntimeRoot)
if ($NativeOnly) { $arguments += "--native-only" }
if ($Reset) { $arguments += "--reset" }
if ($Tiles) {
    Write-Host "Окно WSLg может не появиться на рабочем столе Windows; текстовая версия запускается без ключа -Tiles."
} else {
    $arguments += "--text"
}
$previousWslEnv = $env:WSLENV
$previousSettingsPath = $env:RUS_LLM_SETTINGS_PATH
try {
    if (-not $NativeOnly -and -not $env:RUS_LLM_SETTINGS_PATH) {
        Push-Location (Join-Path $PSScriptRoot "../..")
        try {
            $script = 'const owner = await import("@rus/game-server"); process.stdout.write(Buffer.from(owner.defaultLlmSettingsPath(), "utf8").toString("base64"));'
            $encodedPath = $script | node --input-type=module -
            if ($LASTEXITCODE -ne 0) { throw "Не удалось определить путь настроек LLM." }
            $env:RUS_LLM_SETTINGS_PATH = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($encodedPath))
        } finally {
            Pop-Location
        }
    }
    if ($env:RUS_LLM_SETTINGS_PATH) {
        $entries = @($previousWslEnv -split ':' | Where-Object { $_ -and $_ -notmatch '^RUS_LLM_SETTINGS_PATH(/.*)?$' })
        $env:WSLENV = (@($entries) + "RUS_LLM_SETTINGS_PATH/p") -join ':'
    }
    & wsl.exe --exec bash @arguments
    if ($LASTEXITCODE -ne 0) { throw "Dev-запуск завершился с кодом $LASTEXITCODE." }
} finally {
    $env:WSLENV = $previousWslEnv
    $env:RUS_LLM_SETTINGS_PATH = $previousSettingsPath
}
