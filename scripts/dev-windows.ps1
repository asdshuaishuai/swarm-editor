$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RootDirectory = Split-Path -Parent $PSScriptRoot
Set-Location $RootDirectory

$Mode = "run"
$UseConfigurationCache = $true
$ExtraArguments = [System.Collections.Generic.List[string]]::new()

function Show-Usage {
    @"
Swarm Editor Windows development launcher

Usage: .\scripts\dev-windows.ps1 [run|compile|test|build|pi] [options] [-- Gradle args]

Modes:
  run      Prepare pi and run the desktop application (default)
  compile  Incrementally compile desktop Kotlin sources without rebuilding pi
  test     Run all Kotlin tests
  build    Run the complete project build
  pi       Build only the vendored pi runtime

Options:
  --no-configuration-cache  Disable Gradle configuration cache
  -h, --help                Show this help

Examples:
  .\scripts\dev-windows.ps1
  .\scripts\dev-windows.ps1 compile
  .\scripts\dev-windows.ps1 test -- --stacktrace
"@
}

for ($Index = 0; $Index -lt $args.Count; $Index++) {
    $Argument = $args[$Index]
    switch ($Argument) {
        { $_ -in @("run", "compile", "test", "build", "pi") } {
            $Mode = $Argument
            break
        }
        "--no-configuration-cache" {
            $UseConfigurationCache = $false
            break
        }
        { $_ -in @("-h", "--help") } {
            Show-Usage
            exit 0
        }
        "--" {
            for ($ExtraIndex = $Index + 1; $ExtraIndex -lt $args.Count; $ExtraIndex++) {
                $ExtraArguments.Add($args[$ExtraIndex])
            }
            $Index = $args.Count
            break
        }
        default {
            Write-Error "Unknown option: $Argument"
        }
    }
}

if ($env:OS -ne "Windows_NT") {
    throw "This launcher supports Windows only."
}

function Require-Command([string]$Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Missing required command: $Name"
    }
}

Require-Command "java"
$GradleWrapper = Join-Path $RootDirectory "gradlew.bat"
if (-not (Test-Path -Path $GradleWrapper -PathType Leaf)) {
    throw "Missing Gradle wrapper: $GradleWrapper"
}

$JavaVersionLine = (& java -version 2>&1 | Select-Object -First 1).ToString()
if ($JavaVersionLine -notmatch 'version "(?<major>\d+)') {
    throw "Unable to determine the active Java version."
}
$JavaMajor = [int]$Matches.major
if ($JavaMajor -lt 21) {
    throw "JDK 21 or newer is required; active Java is $JavaMajor."
}

if ($Mode -ne "compile") {
    Require-Command "node"
    if (-not (Get-Command "npm.cmd" -ErrorAction SilentlyContinue) -and
        -not (Get-Command "npm" -ErrorAction SilentlyContinue)) {
        throw "Missing required command: npm"
    }

    $NodeVersionText = (& node --version).TrimStart("v")
    $NodeVersion = [version]$NodeVersionText
    $MinimumNodeVersion = [version]"22.19.0"
    if ($NodeVersion -lt $MinimumNodeVersion) {
        throw "Node.js 22.19.0 or newer is required; active Node.js is $NodeVersionText."
    }
}

$Tasks = switch ($Mode) {
    "run" { @(":backend:preparePiRuntime", ":desktopApp:run") }
    "compile" { @(":desktopApp:compileKotlin") }
    "test" { @("test") }
    "build" { @("build") }
    "pi" { @(":backend:preparePiRuntime") }
}

$GradleArguments = [System.Collections.Generic.List[string]]::new()
$GradleArguments.AddRange([string[]]$Tasks)
$GradleArguments.Add("--parallel")
$GradleArguments.Add("--build-cache")
if ($UseConfigurationCache) {
    $GradleArguments.Add("--configuration-cache")
}
$GradleArguments.AddRange($ExtraArguments)

Write-Host "Swarm Editor Windows dev · $Mode"
Write-Host "Tasks: $($Tasks -join ' ')"
$Stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

$GradleArgumentArray = $GradleArguments.ToArray()
& $GradleWrapper @GradleArgumentArray
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

$Stopwatch.Stop()
Write-Host "Completed in $([math]::Round($Stopwatch.Elapsed.TotalSeconds, 1))s."
