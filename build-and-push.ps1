<#
.SYNOPSIS
    Builds and tests OrbitKanban and, only if everything passes, commits, pushes and publishes a GitHub release.

.DESCRIPTION
    All project paths are resolved from $PSScriptRoot; no workstation path is required.
    It can be invoked from another current directory with a relative path to this script.
    Sequence (any build or test failure stops the script before the commit):
      1. Git checks: active branch, reachable remote, no operation in progress, branch not behind the remote,
         no file that must stay unversioned among the changes (data, builds, dependencies, executables, files over 5 MB).
      2. npm run check and npm test, including task layout, required field validation and import/export.
      3. Smoke test from the sources (npm run smoke), including the form designer, required fields and update notifications.
      4. Portable build in dist-staging\<version>, without touching an executable that may be open in dist,
         verifying the version and the icon (identical to build\icon.ico, generated from app-logo.svg) of launcher and app.
      5. Smoke test of the packaged app (win-unpacked) and of the portable launcher, with isolated temporary files
         so that open instances are not disturbed.
      6. Copy of the tested executable to dist\OrbitKanban-Portable.exe, or to
         dist\OrbitKanban-Portable-<version>.exe if the former is running.
      7. Check that files did not change during build and tests, commit of all changes (empty if there are none),
         tag v<version> if the version is new, atomic push and verification on the remote.
      8. GitHub release with the portable executable and SHA-256 verification of the asset.
         Requires GitHub credentials with Contents write access, from Git Credential Manager or GH_TOKEN/GITHUB_TOKEN.

.PARAMETER Message
    Commit subject. Default: "OrbitKanban <version>".
.PARAMETER Remote
    Git remote to publish to. Default: origin.
.PARAMETER NoDeliver
    Does not copy the tested executable to dist.
.PARAMETER NoCoAuthor
    Does not add the Copilot Co-authored-by trailer to the commit message.

.EXAMPLE
    npm version 3.1.0 --no-git-tag-version --ignore-scripts
    pwsh -NoProfile -ExecutionPolicy Bypass -File .\build-and-push.ps1 -Message "3.1.0: configurable navigation sections"
    Close the local app first to replace dist\OrbitKanban-Portable.exe. Its data folder is never replaced.
    Add -NoDeliver only when the local executable must stay on the previous version.
#>
#Requires -Version 5.1

[CmdletBinding()]
param(
    [string]$Message,
    [string]$Remote = 'origin',
    [switch]$NoDeliver,
    [switch]$NoCoAuthor
)

Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false

$root = [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\')
$maxFileBytes = 5MB
$forbiddenPath = '(^|/)(data|dist|dist-staging|node_modules)/|\.(exe|dll|asar|7z|zip)$|(^|/)workspace\.json(\.bak)?$|browser-access-token|(^|/)\.env'
$emptyTree = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
$coAuthorTrailer = 'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>'
$script:stepNumber = 0

function Write-Step([string]$Text) {
    $script:stepNumber++
    Write-Host ''
    Write-Host ('==> {0}. {1}' -f $script:stepNumber, $Text) -ForegroundColor Cyan
}

function Invoke-Native {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [string[]]$ArgumentList = @(),
        [switch]$Capture,
        [switch]$AllowFailure
    )
    # Native tools write progress and warnings to stderr: only the exit code decides success.
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        if ($Capture) { $output = & $FilePath @ArgumentList } else { & $FilePath @ArgumentList | Out-Host }
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previous
    }
    if ($code -ne 0 -and -not $AllowFailure) { throw ('Command failed (exit code {0}): {1} {2}' -f $code, $FilePath, ($ArgumentList -join ' ')) }
    if ($Capture -and $code -eq 0 -and $null -ne $output) { return $output }
}

function Invoke-Git([string[]]$Arguments, [switch]$AllowFailure) {
    Invoke-Native -FilePath 'git' -ArgumentList (@('-c', 'core.safecrlf=false', '-c', 'core.quotepath=false') + $Arguments) -Capture -AllowFailure:$AllowFailure
}

# Tree of the working directory as `git add -A` would commit it, computed on a copy of the index.
function Get-WorktreeTree {
    $indexPath = [IO.Path]::Combine($root, (Invoke-Git 'rev-parse', '--git-path', 'index'))
    $tempIndex = Join-Path ([IO.Path]::GetTempPath()) ('orbitkanban-index-{0}' -f [guid]::NewGuid().ToString('N'))
    if (Test-Path -LiteralPath $indexPath) { Copy-Item -LiteralPath $indexPath -Destination $tempIndex }
    $previousIndex = $env:GIT_INDEX_FILE
    $env:GIT_INDEX_FILE = $tempIndex
    try {
        $null = Invoke-Git 'add', '-A'
        return (Invoke-Git 'write-tree')
    } finally {
        $env:GIT_INDEX_FILE = $previousIndex
        Remove-Item -LiteralPath $tempIndex -Force -ErrorAction SilentlyContinue
    }
}

function Get-HeadTree {
    $tree = Invoke-Git 'rev-parse', '-q', '--verify', 'HEAD^{tree}' -AllowFailure
    if ($tree) { return $tree }
    return $emptyTree
}

function Get-ChangedEntries([string]$Tree) {
    foreach ($line in @(Invoke-Git 'diff-tree', '-r', '--no-renames', (Get-HeadTree), $Tree)) {
        if (-not $line) { continue }
        $meta, $path = $line -split "`t", 2
        $fields = $meta.Split(' ')
        [pscustomobject]@{ Status = $fields[4]; Blob = $fields[3]; Path = $path }
    }
}

function Assert-PublishableChanges($Entries) {
    $problems = foreach ($entry in $Entries) {
        if ($entry.Status -eq 'D') { continue }
        if ($entry.Path -match $forbiddenPath) { '{0}: data, builds, dependencies and executables must not be versioned' -f $entry.Path; continue }
        $size = [long](Invoke-Git 'cat-file', '-s', $entry.Blob)
        if ($size -gt $maxFileBytes) { '{0}: {1:N1} MB, over the {2} MB limit' -f $entry.Path, ($size / 1MB), ($maxFileBytes / 1MB) }
    }
    if ($problems) { throw ("Changes that cannot be published:`n  {0}`nRemove them or add them to .gitignore, then run the script again." -f ($problems -join "`n  ")) }
}

function Get-RemoteTagCommit([string]$Tag) {
    $direct = $null
    foreach ($line in @(Invoke-Git 'ls-remote', '--tags', $Remote, "refs/tags/$Tag*")) {
        if (-not $line) { continue }
        $hash, $ref = $line -split "`t", 2
        if ($ref -eq "refs/tags/$Tag^{}") { return $hash }
        if ($ref -eq "refs/tags/$Tag") { $direct = $hash }
    }
    return $direct
}

function Assert-ExecutableVersion([string]$Path, [string]$Version) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "The build did not produce $Path." }
    $actual = (Get-Item -LiteralPath $Path).VersionInfo.ProductVersion
    if ($actual -notmatch ('^{0}(\.0)?$' -f [regex]::Escape($Version))) { throw ("Version of {0}: '{1}', expected {2}." -f $Path, $actual, $Version) }
}

function Move-ReplacingFile([string]$Source, [string]$Destination) {
    if (Test-Path -LiteralPath $Destination) { [IO.File]::Replace($Source, $Destination, [NullString]::Value) }
    else { [IO.File]::Move($Source, $Destination) }
}

function Copy-TestedExecutable([string]$Source, [string]$Version) {
    $distDir = Join-Path $root 'dist'
    $null = New-Item -ItemType Directory -Force -Path $distDir
    $target = Join-Path $distDir 'OrbitKanban-Portable.exe'
    $fallback = Join-Path $distDir "OrbitKanban-Portable-$Version.exe"
    $temp = Join-Path $distDir ('.OrbitKanban-Portable.{0}.tmp' -f [guid]::NewGuid().ToString('N'))
    $destination = $null
    Copy-Item -LiteralPath $Source -Destination $temp -Force
    try {
        $running = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -and [string]::Equals($_.Path, $target, [StringComparison]::OrdinalIgnoreCase) })
        if ($running.Count -gt 0) {
            Write-Warning ('{0} is running (PID {1}) and will not be replaced.' -f $target, (($running | ForEach-Object { $_.Id }) -join ', '))
        } else {
            try { Move-ReplacingFile $temp $target; $destination = $target }
            catch { Write-Warning ('Cannot replace {0}: {1}' -f $target, $_.Exception.Message) }
        }
        if (-not $destination) {
            Move-ReplacingFile $temp $fallback
            $destination = $fallback
            Write-Warning ('Executable saved as {0}: close the app and rename it to OrbitKanban-Portable.exe, or run the script again with the app closed.' -f $fallback)
        }
    } finally {
        if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Force }
    }
    $hash = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash
    if ($hash -ne (Get-FileHash -LiteralPath $Source -Algorithm SHA256).Hash) { throw "The copy does not match the source: $destination." }
    Write-Host "Executable delivered: $destination"
    return [pscustomobject]@{ Path = $destination; Sha256 = $hash }
}

$startedAt = Get-Date
$commitCreated = $false
$tagCreated = $false
$pushed = $false
Push-Location -LiteralPath $root
try {
    Write-Step 'Preliminary checks'
    foreach ($tool in 'git', 'node', 'npm.cmd') {
        if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "$tool was not found in PATH." }
    }
    $top = Invoke-Git 'rev-parse', '--show-toplevel'
    if ([IO.Path]::GetFullPath($top).TrimEnd('\') -ne $root) { throw "The script must live in the repository root ($top)." }
    $branch = Invoke-Git 'symbolic-ref', '--short', '-q', 'HEAD' -AllowFailure
    if (-not $branch) { throw 'HEAD is not on a branch (detached HEAD): switch to a branch before publishing.' }
    $remoteUrl = Invoke-Git 'remote', 'get-url', $Remote
    $releaseHelper = Join-Path $root 'tools\GitHubRelease.js'
    Invoke-Native 'node' @($releaseHelper, '--remote', $remoteUrl, '--check')
    foreach ($marker in 'MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply') {
        if (Test-Path -LiteralPath ([IO.Path]::Combine($root, (Invoke-Git 'rev-parse', '--git-path', $marker)))) {
            throw "A Git operation is in progress ($marker): complete or abort it before publishing."
        }
    }
    if (Invoke-Git 'diff', '--name-only', '--diff-filter=U') { throw 'There are unresolved Git conflicts.' }

    Write-Host "Updating references from $Remote ($remoteUrl)..."
    $null = Invoke-Git 'fetch', '--quiet', '--no-tags', $Remote
    $upstream = "refs/remotes/$Remote/$branch"
    $hasUpstream = [bool](Invoke-Git 'rev-parse', '-q', '--verify', $upstream -AllowFailure)
    if ($hasUpstream) {
        $behind = [int](Invoke-Git 'rev-list', '--count', "HEAD..$upstream")
        if ($behind -gt 0) { throw ('Branch {0} is {1} commit(s) behind {2}/{0}: integrate the remote changes first (git pull --rebase).' -f $branch, $behind, $Remote) }
    }

    $version = [string](Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
    if ($version -notmatch '^\d+\.\d+\.\d+$') { throw "Invalid version in package.json: '$version'." }
    $tag = "v$version"
    $testedTree = Get-WorktreeTree
    $changes = @(Get-ChangedEntries $testedTree)
    Assert-PublishableChanges $changes
    $localTag = Invoke-Git 'rev-parse', '-q', '--verify', "refs/tags/$tag^{commit}" -AllowFailure
    $remoteTag = Get-RemoteTagCommit $tag
    if ($localTag -and $remoteTag -and $localTag -ne $remoteTag) { throw "The local tag $tag does not match the remote: resolve the conflict without overwriting the published tag." }
    if ($remoteTag) {
        $null = Invoke-Git 'fetch', '--quiet', '--no-tags', $Remote, "refs/tags/$tag"
        $tagTree = Invoke-Git 'rev-parse', 'FETCH_HEAD^{tree}'
    } elseif ($localTag) {
        $tagTree = Invoke-Git 'rev-parse', "$localTag^{tree}"
    } else { $tagTree = $null }
    if ($tagTree -and $tagTree -ne $testedTree) { throw "Tag $tag contains different sources: bump the version (npm version patch --no-git-tag-version --ignore-scripts) before publishing a new release." }
    Write-Host ('Branch {0}, version {1}, {2} modified files.' -f $branch, $version, $changes.Count)
    foreach ($entry in $changes) { Write-Host ('  {0} {1}' -f $entry.Status, $entry.Path) }

    Write-Step 'Syntax check and unit tests'
    Invoke-Native 'npm.cmd' @('run', 'check')
    Invoke-Native 'npm.cmd' @('test')

    Write-Step 'Smoke test from the sources'
    Invoke-Native 'npm.cmd' @('run', 'smoke')

    Write-Step "Portable build $version"
    $outDir = Join-Path $root "dist-staging\$version"
    $launcher = Join-Path $outDir 'OrbitKanban-Portable.exe'
    $internal = Join-Path $outDir 'win-unpacked\OrbitKanban.exe'
    $buildStartedAt = Get-Date
    Invoke-Native 'npm.cmd' @('run', 'dist', '--', '--out', $outDir)
    Assert-ExecutableVersion $launcher $version
    Assert-ExecutableVersion $internal $version
    Invoke-Native 'node' @((Join-Path $root 'tools\AppIcon.js'), '--verify', (Join-Path $root 'build\icon.ico'), $launcher, $internal)
    if ((Get-Item -LiteralPath $launcher).LastWriteTime -lt $buildStartedAt.AddSeconds(-5)) { throw "$launcher was not regenerated by the build." }
    $testedLauncherHash = (Get-FileHash -LiteralPath $launcher -Algorithm SHA256).Hash

    Write-Step 'Smoke test of the packaged executable'
    $smokeScript = Join-Path $root 'tools\smoke.js'
    Invoke-Native 'node' @($smokeScript, $internal)
    Invoke-Native 'node' @($smokeScript, $launcher)
    if ((Get-FileHash -LiteralPath $launcher -Algorithm SHA256).Hash -ne $testedLauncherHash) { throw 'The executable changed during the tests: build not published.' }

    $delivered = $null
    if (-not $NoDeliver) {
        Write-Step 'Delivering the executable'
        $delivered = Copy-TestedExecutable -Source $launcher -Version $version
    }

    Write-Step 'Commit'
    if ((Get-WorktreeTree) -ne $testedTree) { throw 'Project files changed during build and tests: run the script again to test the current version.' }
    if ($testedTree -eq (Get-HeadTree)) {
        Write-Host 'No source changes: creating an empty commit to record the verified build.'
    }
    $null = Invoke-Git 'add', '-A'
    if ((Invoke-Git 'write-tree') -ne $testedTree) { throw 'The Git index does not match the tested files.' }
    $subject = if ($Message -and $Message.Trim()) { $Message.Trim() } else { "OrbitKanban $version" }
    $lines = @($subject, '', "Build $version verified before commit:", '- npm run check and npm test', '- source smoke test', '- packaged app smoke test (win-unpacked)', '- portable launcher smoke test')
    if (-not $NoCoAuthor) { $lines += @('', $coAuthorTrailer) }
    $messageFile = Join-Path ([IO.Path]::GetTempPath()) ('orbitkanban-commit-{0}.txt' -f [guid]::NewGuid().ToString('N'))
    [IO.File]::WriteAllText($messageFile, (($lines -join "`n") + "`n"), (New-Object Text.UTF8Encoding $false))
    try { Invoke-Native 'git' @('commit', '--allow-empty', '--quiet', '--cleanup=whitespace', '-F', $messageFile) }
    finally { Remove-Item -LiteralPath $messageFile -Force -ErrorAction SilentlyContinue }
    $commitCreated = $true
    $head = Invoke-Git 'rev-parse', 'HEAD'
    if ((Invoke-Git 'rev-parse', 'HEAD^{tree}') -ne $testedTree) { throw 'The commit does not contain exactly the tested sources: push cancelled.' }
    Write-Host ('Commit {0}: {1}' -f $head.Substring(0, 7), (Invoke-Git 'log', '-1', '--format=%s'))

    Write-Step 'Tag and push'
    $localTag = Invoke-Git 'rev-parse', '-q', '--verify', "refs/tags/$tag^{commit}" -AllowFailure
    $remoteTag = Get-RemoteTagCommit $tag
    $pushTag = $false
    if (-not $localTag -and -not $remoteTag) {
        Invoke-Native 'git' @('tag', '-a', $tag, '-m', "OrbitKanban $version")
        $tagCreated = $true
        $pushTag = $true
    } elseif ($localTag -and -not $remoteTag) {
        $pushTag = $true
    } else {
        Write-Host "Tag $tag already exists on the verified sources and is not moved."
    }
    $expectedTag = if ($localTag) { $localTag } elseif ($remoteTag) { $remoteTag } else { $head }
    $refs = @($branch)
    if ($pushTag) { $refs += "refs/tags/$tag" }
    Invoke-Native 'git' (@('push', '--atomic', '--set-upstream', $Remote) + $refs)
    $pushed = $true
    $remoteHead = ([string](Invoke-Git 'ls-remote', $Remote, "refs/heads/$branch") -split "`t")[0]
    if ($remoteHead -ne $head) { throw ('Verification failed: {0}/{1} points to {2} instead of {3}.' -f $Remote, $branch, $remoteHead, $head) }
    if ((Get-RemoteTagCommit $tag) -ne $expectedTag) { throw "Verification failed: tag $tag does not appear to be published correctly on $Remote." }

    Write-Step 'GitHub release'
    if ((Get-FileHash -LiteralPath $launcher -Algorithm SHA256).Hash -ne $testedLauncherHash) { throw 'The executable changed after the tests: release cancelled.' }
    $release = (Invoke-Native 'node' @($releaseHelper, '--remote', $remoteUrl, '--tag', $tag, '--commit', $head, '--tree', $testedTree, '--asset', $launcher) -Capture) | ConvertFrom-Json
    if ($release.sha256 -ne $testedLauncherHash) { throw 'The release checksum does not match the tested executable.' }

    Write-Host ''
    Write-Host ('Completed in {0:hh\:mm\:ss}: build, tests, commit, push and release succeeded.' -f ((Get-Date) - $startedAt)) -ForegroundColor Green
    Write-Host ('  Version:    {0}' -f $version)
    Write-Host ('  Commit:     {0} on {1}/{2} ({3})' -f $head, $Remote, $branch, $remoteUrl)
    Write-Host ('  Tag:        {0}' -f $(if ($pushTag) { "$tag published" } elseif ($remoteTag -eq $head) { "$tag already published" } else { "$tag not moved (unchanged version)" }))
    Write-Host '  Launcher:   tested'
    Write-Host ('  Release:    {0}' -f $release.url)
    if ($delivered) { Write-Host ('  Executable: {0} (SHA-256 {1})' -f $delivered.Path, $delivered.Sha256) }
    else { Write-Host ('  Executable: {0} (not copied to dist)' -f $launcher) }
} catch {
    Write-Host ''
    Write-Host ('ERROR: {0}' -f $_.Exception.Message) -ForegroundColor Red
    if ($pushed) {
        Write-Host 'The push was done, but publishing is not complete. Fix the error and run the script again to verify the remote and complete the release.' -ForegroundColor Yellow
    } elseif ($commitCreated -or $tagCreated) {
        Write-Host 'Commit and/or tag created locally but not published: fix the problem and run the script again to complete the push.' -ForegroundColor Yellow
    } else {
        Write-Host 'No commit or push was made.' -ForegroundColor Yellow
    }
    exit 1
} finally {
    Pop-Location
}
