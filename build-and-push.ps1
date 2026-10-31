<#
.SYNOPSIS
    Costruisce e testa OrbitKanban e, solo se tutto passa, fa commit e push su GitHub.

.DESCRIPTION
    Sequenza (qualsiasi errore di build o test interrompe lo script prima del commit):
      1. Controlli Git: ramo attivo, remoto raggiungibile, nessuna operazione in corso, ramo non indietro rispetto
         al remoto, nessun file da non versionare tra le modifiche (dati, build, dipendenze, eseguibili, file oltre 5 MB).
      2. npm run check e npm test.
      3. Smoke test dai sorgenti (npm run smoke).
      4. Build portable in dist-staging\<versione>, senza toccare l'eseguibile eventualmente aperto in dist.
      5. Smoke test dell'app impacchettata (win-unpacked) e del launcher portable, con file temporanei isolati
         per non interferire con eventuali istanze aperte.
      6. Copia dell'eseguibile testato in dist\OrbitKanban-Portable.exe, oppure in
         dist\OrbitKanban-Portable-<versione>.exe se quello è in esecuzione.
      7. Controllo che i file non siano cambiati durante build e test, commit di tutte le modifiche (vuoto se non ce ne sono),
         tag v<versione> se la versione è nuova, push atomico e verifica sul remoto.

.PARAMETER Message
    Oggetto del commit. Predefinito: "OrbitKanban <versione>".
.PARAMETER Remote
    Remoto Git su cui pubblicare. Predefinito: origin.
.PARAMETER NoDeliver
    Non copia l'eseguibile testato in dist.
.PARAMETER NoCoAuthor
    Non aggiunge il trailer Co-authored-by di Copilot al messaggio di commit.

.EXAMPLE
    pwsh -NoProfile -ExecutionPolicy Bypass -File .\build-and-push.ps1 -Message "Filtro per release date"
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
    if ($code -ne 0 -and -not $AllowFailure) { throw ('Comando non riuscito (codice {0}): {1} {2}' -f $code, $FilePath, ($ArgumentList -join ' ')) }
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
        if ($entry.Path -match $forbiddenPath) { '{0}: dati, build, dipendenze o eseguibili non vanno versionati' -f $entry.Path; continue }
        $size = [long](Invoke-Git 'cat-file', '-s', $entry.Blob)
        if ($size -gt $maxFileBytes) { '{0}: {1:N1} MB, oltre il limite di {2} MB' -f $entry.Path, ($size / 1MB), ($maxFileBytes / 1MB) }
    }
    if ($problems) { throw ("Modifiche non pubblicabili:`n  {0}`nRimuovile o aggiungile a .gitignore, poi rilancia lo script." -f ($problems -join "`n  ")) }
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
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "La build non ha prodotto $Path." }
    $actual = (Get-Item -LiteralPath $Path).VersionInfo.ProductVersion
    if ($actual -notmatch ('^{0}(\.0)?$' -f [regex]::Escape($Version))) { throw ("Versione di {0}: '{1}', attesa {2}." -f $Path, $actual, $Version) }
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
            Write-Warning ('{0} è in esecuzione (PID {1}) e non viene sostituito.' -f $target, (($running | ForEach-Object { $_.Id }) -join ', '))
        } else {
            try { Move-ReplacingFile $temp $target; $destination = $target }
            catch { Write-Warning ('Impossibile sostituire {0}: {1}' -f $target, $_.Exception.Message) }
        }
        if (-not $destination) {
            Move-ReplacingFile $temp $fallback
            $destination = $fallback
            Write-Warning ('Eseguibile salvato come {0}: chiudi l''app e rinominalo in OrbitKanban-Portable.exe, oppure rilancia lo script ad app chiusa.' -f $fallback)
        }
    } finally {
        if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Force }
    }
    $hash = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash
    if ($hash -ne (Get-FileHash -LiteralPath $Source -Algorithm SHA256).Hash) { throw "Copia non integra: $destination." }
    Write-Host "Eseguibile consegnato: $destination"
    return [pscustomobject]@{ Path = $destination; Sha256 = $hash }
}

$startedAt = Get-Date
$commitCreated = $false
$tagCreated = $false
Push-Location -LiteralPath $root
try {
    Write-Step 'Controlli preliminari'
    foreach ($tool in 'git', 'node', 'npm.cmd') {
        if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "$tool non trovato nel PATH." }
    }
    $top = Invoke-Git 'rev-parse', '--show-toplevel'
    if ([IO.Path]::GetFullPath($top).TrimEnd('\') -ne $root) { throw "Lo script deve stare nella radice del repository ($top)." }
    $branch = Invoke-Git 'symbolic-ref', '--short', '-q', 'HEAD' -AllowFailure
    if (-not $branch) { throw 'HEAD non è su un ramo (detached HEAD): passa a un ramo prima di pubblicare.' }
    $remoteUrl = Invoke-Git 'remote', 'get-url', $Remote
    foreach ($marker in 'MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply') {
        if (Test-Path -LiteralPath ([IO.Path]::Combine($root, (Invoke-Git 'rev-parse', '--git-path', $marker)))) {
            throw "Operazione Git in corso ($marker): completala o annullala prima di pubblicare."
        }
    }
    if (Invoke-Git 'diff', '--name-only', '--diff-filter=U') { throw 'Ci sono conflitti Git non risolti.' }

    Write-Host "Aggiorno i riferimenti da $Remote ($remoteUrl)..."
    $null = Invoke-Git 'fetch', '--quiet', '--no-tags', $Remote
    $upstream = "refs/remotes/$Remote/$branch"
    $hasUpstream = [bool](Invoke-Git 'rev-parse', '-q', '--verify', $upstream -AllowFailure)
    if ($hasUpstream) {
        $behind = [int](Invoke-Git 'rev-list', '--count', "HEAD..$upstream")
        if ($behind -gt 0) { throw ('Il ramo {0} è indietro di {1} commit rispetto a {2}/{0}: integra prima le modifiche remote (git pull --rebase).' -f $branch, $behind, $Remote) }
    }

    $version = [string](Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
    if ($version -notmatch '^\d+\.\d+\.\d+$') { throw "Versione non valida in package.json: '$version'." }
    $tag = "v$version"
    $testedTree = Get-WorktreeTree
    $changes = @(Get-ChangedEntries $testedTree)
    Assert-PublishableChanges $changes
    Write-Host ('Ramo {0}, versione {1}, {2} file modificati.' -f $branch, $version, $changes.Count)
    foreach ($entry in $changes) { Write-Host ('  {0} {1}' -f $entry.Status, $entry.Path) }

    Write-Step 'Controllo sintassi e test unitari'
    Invoke-Native 'npm.cmd' @('run', 'check')
    Invoke-Native 'npm.cmd' @('test')

    Write-Step 'Smoke test dai sorgenti'
    Invoke-Native 'npm.cmd' @('run', 'smoke')

    Write-Step "Build portable $version"
    $outDir = Join-Path $root "dist-staging\$version"
    $launcher = Join-Path $outDir 'OrbitKanban-Portable.exe'
    $internal = Join-Path $outDir 'win-unpacked\OrbitKanban.exe'
    $buildStartedAt = Get-Date
    Invoke-Native 'npm.cmd' @('run', 'dist', '--', '--out', $outDir)
    Assert-ExecutableVersion $launcher $version
    Assert-ExecutableVersion $internal $version
    if ((Get-Item -LiteralPath $launcher).LastWriteTime -lt $buildStartedAt.AddSeconds(-5)) { throw "$launcher non è stato rigenerato dalla build." }

    Write-Step 'Smoke test dell''eseguibile impacchettato'
    $smokeScript = Join-Path $root 'smoke.js'
    Invoke-Native 'node' @($smokeScript, $internal)
    Invoke-Native 'node' @($smokeScript, $launcher)

    $delivered = $null
    if (-not $NoDeliver) {
        Write-Step 'Consegna dell''eseguibile'
        $delivered = Copy-TestedExecutable -Source $launcher -Version $version
    }

    Write-Step 'Commit'
    if ((Get-WorktreeTree) -ne $testedTree) { throw 'I file del progetto sono cambiati durante build e test: rilancia lo script per testare la versione attuale.' }
    if ($testedTree -eq (Get-HeadTree)) {
        Write-Host 'Nessuna modifica ai sorgenti: creo un commit vuoto per registrare la build verificata.'
    }
    $null = Invoke-Git 'add', '-A'
    if ((Invoke-Git 'write-tree') -ne $testedTree) { throw 'L''indice Git non corrisponde ai file testati.' }
    $subject = if ($Message -and $Message.Trim()) { $Message.Trim() } else { "OrbitKanban $version" }
    $lines = @($subject, '', "Build $version verified before commit:", '- npm run check and npm test', '- source smoke test', '- packaged app smoke test (win-unpacked)', '- portable launcher smoke test')
    if (-not $NoCoAuthor) { $lines += @('', $coAuthorTrailer) }
    $messageFile = Join-Path ([IO.Path]::GetTempPath()) ('orbitkanban-commit-{0}.txt' -f [guid]::NewGuid().ToString('N'))
    [IO.File]::WriteAllText($messageFile, (($lines -join "`n") + "`n"), (New-Object Text.UTF8Encoding $false))
    try { Invoke-Native 'git' @('commit', '--allow-empty', '--quiet', '--cleanup=whitespace', '-F', $messageFile) }
    finally { Remove-Item -LiteralPath $messageFile -Force -ErrorAction SilentlyContinue }
    $commitCreated = $true
    $head = Invoke-Git 'rev-parse', 'HEAD'
    Write-Host ('Commit {0}: {1}' -f $head.Substring(0, 7), (Invoke-Git 'log', '-1', '--format=%s'))

    Write-Step 'Tag e push'
    $localTag = Invoke-Git 'rev-parse', '-q', '--verify', "refs/tags/$tag^{commit}" -AllowFailure
    $remoteTag = Get-RemoteTagCommit $tag
    $pushTag = $false
    if (-not $localTag -and -not $remoteTag) {
        Invoke-Native 'git' @('tag', '-a', $tag, '-m', "OrbitKanban $version")
        $tagCreated = $true
        $pushTag = $true
    } elseif ($localTag -eq $head -and -not $remoteTag) {
        $pushTag = $true
    } elseif (($localTag -and $localTag -ne $head) -or ($remoteTag -and $remoteTag -ne $head)) {
        Write-Warning "Il tag $tag esiste già su un altro commit: la versione in package.json non è cambiata, quindi il tag non viene spostato."
    }
    $refs = @($branch)
    if ($pushTag) { $refs += "refs/tags/$tag" }
    Invoke-Native 'git' (@('push', '--atomic', '--set-upstream', $Remote) + $refs)
    $remoteHead = ([string](Invoke-Git 'ls-remote', $Remote, "refs/heads/$branch") -split "`t")[0]
    if ($remoteHead -ne $head) { throw ('Verifica non riuscita: {0}/{1} punta a {2} invece di {3}.' -f $Remote, $branch, $remoteHead, $head) }
    if ($pushTag -and (Get-RemoteTagCommit $tag) -ne $head) { throw "Verifica non riuscita: il tag $tag non risulta pubblicato su $Remote." }

    Write-Host ''
    Write-Host ('Completato in {0:hh\:mm\:ss}: build, test, commit e push riusciti.' -f ((Get-Date) - $startedAt)) -ForegroundColor Green
    Write-Host ('  Versione:   {0}' -f $version)
    Write-Host ('  Commit:     {0} su {1}/{2} ({3})' -f $head, $Remote, $branch, $remoteUrl)
    Write-Host ('  Tag:        {0}' -f $(if ($pushTag) { "$tag pubblicato" } elseif ($remoteTag -eq $head) { "$tag già pubblicato" } else { "$tag non spostato (versione invariata)" }))
    Write-Host '  Launcher:   testato'
    if ($delivered) { Write-Host ('  Eseguibile: {0} (SHA-256 {1})' -f $delivered.Path, $delivered.Sha256) }
    else { Write-Host ('  Eseguibile: {0} (non copiato in dist)' -f $launcher) }
} catch {
    Write-Host ''
    Write-Host ('ERRORE: {0}' -f $_.Exception.Message) -ForegroundColor Red
    if ($commitCreated -or $tagCreated) {
        Write-Host 'Commit e/o tag creati in locale ma non pubblicati: risolvi il problema e rilancia lo script per completare il push.' -ForegroundColor Yellow
    } else {
        Write-Host 'Nessun commit né push eseguito.' -ForegroundColor Yellow
    }
    exit 1
} finally {
    Pop-Location
}
