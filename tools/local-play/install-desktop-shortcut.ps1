param(
  [string]$DestinationDirectory = [Environment]::GetFolderPath('Desktop')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repositoryRoot = [IO.Path]::GetFullPath(
  (Join-Path $PSScriptRoot '..\..')
)
$target = Join-Path $repositoryRoot 'play-local.cmd'
if (-not (Test-Path -LiteralPath $target -PathType Leaf)) {
  throw "One-click launcher not found: $target"
}
if (-not (Test-Path -LiteralPath $DestinationDirectory)) {
  New-Item -ItemType Directory -Path $DestinationDirectory | Out-Null
}

$shortcutName = -join @(
  [char]0x041D, [char]0x043E, [char]0x0432, [char]0x0433,
  [char]0x043E, [char]0x0440, [char]0x043E, [char]0x0434,
  ' ', '1', '2', '3', '0', ' ', [char]0x2014, ' ',
  [char]0x0438, [char]0x0433, [char]0x0440, [char]0x0430,
  [char]0x0442, [char]0x044C, '.', 'l', 'n', 'k'
)
$shortcutPath = Join-Path $DestinationDirectory $shortcutName
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $target
$shortcut.WorkingDirectory = $repositoryRoot
$shortcut.Description = 'Start Novgorod1230 Local Play'
$shortcut.WindowStyle = 1
$shortcut.Save()

Write-Output "Shortcut created: $shortcutPath"
