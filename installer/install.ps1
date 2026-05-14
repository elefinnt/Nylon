<#
.SYNOPSIS
    Install or uninstall the Nylon CLI on Windows.

.DESCRIPTION
    Copies nylon.exe and the agent into %LOCALAPPDATA%\nylon,
    adds that folder to the current user's PATH, and verifies Node 22+ is
    installed. Run with -Uninstall to remove.

.EXAMPLE
    .\installer\install.ps1

.EXAMPLE
    .\installer\install.ps1 -Uninstall
#>
[CmdletBinding()]
param(
    [switch]$Uninstall,
    [string]$InstallRoot = (Join-Path $env:LOCALAPPDATA "nylon")
)

$ErrorActionPreference = "Stop"

function Write-Step($message) {
    Write-Host "==> $message" -ForegroundColor Cyan
}

function Write-Warn($message) {
    Write-Host "!! $message" -ForegroundColor Yellow
}

function Test-NodeOk {
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) { return $false }
    try {
        $versionString = & node --version
    } catch {
        return $false
    }
    if ($versionString -notmatch "^v(\d+)\.") { return $false }
    return [int]$Matches[1] -ge 22
}

function Add-ToUserPath($folder) {
    $current = [System.Environment]::GetEnvironmentVariable("Path", "User")
    if ([string]::IsNullOrEmpty($current)) { $current = "" }
    $entries = $current.Split(";", [System.StringSplitOptions]::RemoveEmptyEntries)
    if ($entries -contains $folder) { return $false }
    $next = ($entries + $folder) -join ";"
    [System.Environment]::SetEnvironmentVariable("Path", $next, "User")
    return $true
}

function Remove-FromUserPath($folder) {
    $current = [System.Environment]::GetEnvironmentVariable("Path", "User")
    if ([string]::IsNullOrEmpty($current)) { return $false }
    $entries = $current.Split(";", [System.StringSplitOptions]::RemoveEmptyEntries) |
        Where-Object { $_ -ne $folder }
    [System.Environment]::SetEnvironmentVariable("Path", ($entries -join ";"), "User")
    return $true
}

function Lock-DownConfig {
    $configDir = Join-Path $env:USERPROFILE ".nylon"
    $configFile = Join-Path $configDir "config.toml"
    if (-not (Test-Path $configFile)) { return }
    try {
        & icacls $configFile /inheritance:r | Out-Null
        & icacls $configFile /grant:r "$env:USERNAME:F" | Out-Null
    } catch {
        Write-Warn "Could not tighten ACLs on $configFile. Restrict it manually if you share this machine."
    }
}

function Do-Install {
    $sourceDir = Split-Path -Parent $PSCommandPath | Split-Path -Parent
    $sourceBinary = Join-Path $sourceDir "nylon.exe"
    $sourceAgent = Join-Path $sourceDir "agent"

    if (-not (Test-Path $sourceBinary)) {
        throw "Cannot find nylon.exe next to the installer. Run install.ps1 from the extracted release zip."
    }
    if (-not (Test-Path $sourceAgent)) {
        throw "Cannot find the agent folder next to the installer. The release zip is incomplete."
    }

    Write-Step "Installing Nylon into $InstallRoot"
    if (Test-Path $InstallRoot) {
        Remove-Item -Recurse -Force $InstallRoot
    }
    New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null

    Copy-Item $sourceBinary (Join-Path $InstallRoot "nylon.exe")
    Copy-Item -Recurse $sourceAgent (Join-Path $InstallRoot "agent")

    Write-Step "Adding $InstallRoot to your user PATH"
    $added = Add-ToUserPath $InstallRoot
    if ($added) {
        Write-Host "    added (close and reopen your terminal to pick it up)"
    } else {
        Write-Host "    already on PATH"
    }

    Write-Step "Checking Node version"
    if (Test-NodeOk) {
        $v = & node --version
        Write-Host "    found Node $v"
    } else {
        Write-Warn "Node 22 or newer was not found on PATH."
        Write-Warn "Install it from https://nodejs.org or run: winget install OpenJS.NodeJS.LTS"
    }

    Lock-DownConfig

    Write-Host ""
    Write-Host "Done. Next steps:" -ForegroundColor Green
    Write-Host "  1. Close and reopen your terminal."
    Write-Host "  2. Run:  nylon init"
    Write-Host "  3. Fill in your GitHub PAT and at least one provider API key."
    Write-Host "  4. Run:  nylon <pull-request-url>"
}

function Do-Uninstall {
    Write-Step "Removing $InstallRoot"
    if (Test-Path $InstallRoot) {
        Remove-Item -Recurse -Force $InstallRoot
        Write-Host "    removed"
    } else {
        Write-Host "    not installed at this location"
    }

    Write-Step "Removing $InstallRoot from your user PATH"
    if (Remove-FromUserPath $InstallRoot) {
        Write-Host "    removed"
    } else {
        Write-Host "    not on PATH"
    }

    Write-Host ""
    Write-Host "Nylon uninstalled. Your ~/.nylon folder was left in place." -ForegroundColor Green
}

if ($Uninstall) {
    Do-Uninstall
} else {
    Do-Install
}
