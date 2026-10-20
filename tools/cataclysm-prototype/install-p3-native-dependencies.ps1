#requires -Version 7.0
param(
    [switch] $PreflightOnly,
    [switch] $Install,
    [string] $NativeRoot = 'C:/Users/Slaven/NovgorodNative',
    [string] $BuildRoot = (Join-Path $NativeRoot 'build/cdda-patched'),
    [string] $VcpkgRoot = (Join-Path $NativeRoot 'sources/vcpkg-f6672d8'),
    [string] $InstallRoot = (Join-Path $NativeRoot 'build/vcpkg-installed'),
    [string] $NodeExe = (Get-Command node -CommandType Application -ErrorAction Stop).Source
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'p3-native-build-env.ps1')
Invoke-P3NativeDependencyInstall -NativeRoot $NativeRoot -BuildRoot $BuildRoot -VcpkgRoot $VcpkgRoot -InstallRoot $InstallRoot -NodeExe $NodeExe -PreflightOnly:$PreflightOnly -Install:$Install
