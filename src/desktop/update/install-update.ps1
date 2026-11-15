param([Parameter(Mandatory = $true)][string]$Job, [switch]$ReportOnly)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 3.0
$directory = Split-Path -Parent ([IO.Path]::GetFullPath($Job))
$result = Join-Path $directory 'result.json'
$replaced = $false
$started = $false
$script:progressWindow = $null
. (Join-Path $PSScriptRoot 'UpdateProgress.ps1')
try {
    $jobData = Get-Content -LiteralPath $Job -Raw -Encoding UTF8 | ConvertFrom-Json
    $target = [IO.Path]::GetFullPath([string]$jobData.target)
    $source = Join-Path $directory 'OrbitKanban-Portable.exe'
    $backup = Join-Path $directory 'previous.exe'
    $root = Split-Path -Parent $target
    $expectedParent = Join-Path $root 'data\updates'
    if ((Split-Path -Parent $directory) -ne $expectedParent -or
        (Split-Path -Leaf $directory) -notmatch '^[a-f0-9-]{36}$' -or
        [IO.Path]::GetExtension($target) -ne '.exe' -or
        $jobData.version -ne 1 -or $jobData.sha256 -notmatch '^[a-f0-9]{64}$' -or
        $jobData.size -lt 2 -or $jobData.size -gt 536870912 -or $jobData.pid -le 0) {
        throw 'Invalid update job.'
    }
    if (-not $ReportOnly) {
        $script:progressWindow = New-UpdateProgress $jobData.presentation
        Invoke-ProgressEvents
    }
    $deadline = [DateTime]::UtcNow.AddSeconds(120)
    $process = Get-Process -Id $jobData.pid -ErrorAction SilentlyContinue
    [IO.File]::WriteAllText((Join-Path $directory 'ready'), 'ready')
    if ($process) {
        while (-not $process.HasExited) {
            if ([DateTime]::UtcNow -ge $deadline) { throw 'OrbitKanban is still running. Close the app and retry the update.' }
            Invoke-ProgressEvents
            Start-Sleep -Milliseconds 50
        }
    }
    if (-not $ReportOnly) { Update-ProgressWindow $jobData.presentation.text.installing }
    # The portable parent can hold the launcher briefly after Electron exits.
    $replacement = $null
    while ([DateTime]::UtcNow -lt $deadline) {
        try { $replacement = [IO.File]::Open($target, 'Open', 'ReadWrite', 'None'); break }
        catch [IO.IOException] { Invoke-ProgressEvents; Start-Sleep -Milliseconds 100 }
    }
    if (-not $replacement) { throw 'The portable executable is still in use. Nothing was installed.' }
    $replacement.Dispose()
    $stream = [IO.File]::OpenRead($source)
    $sha = [Security.Cryptography.SHA256]::Create()
    try {
        $size = $stream.Length
        $buffer = New-Object byte[] 1048576
        while (($read = $stream.Read($buffer, 0, $buffer.Length)) -gt 0) {
            $null = $sha.TransformBlock($buffer, 0, $read, $buffer, 0)
            Invoke-ProgressEvents
        }
        $null = $sha.TransformFinalBlock($buffer, 0, 0)
        $digest = [BitConverter]::ToString($sha.Hash).Replace('-', '').ToLowerInvariant()
    }
    finally { $sha.Dispose(); $stream.Dispose() }
    if ($size -ne $jobData.size -or $digest -ne $jobData.sha256) {
        throw 'Update checksum or size does not match. Nothing was installed.'
    }
    [IO.File]::Replace($source, $target, $backup)
    $replaced = $true
    if (-not $ReportOnly) { Update-ProgressWindow $jobData.presentation.text.starting }
    $appReady = Join-Path $directory 'app-ready'
    if ([IO.File]::Exists($appReady)) { [IO.File]::Delete($appReady) }
    $env:ORBITKANBAN_UPDATE_READY = $appReady
    Start-Process -FilePath $target -WorkingDirectory $root -ErrorAction Stop | Out-Null
    $started = $true
    $deadline = [DateTime]::UtcNow.AddSeconds(120)
    while (-not [IO.File]::Exists($appReady) -or [IO.File]::ReadAllText($appReady) -ne 'ready') {
        if ([DateTime]::UtcNow -ge $deadline) { throw [string]$jobData.presentation.text.timeout }
        Invoke-ProgressEvents
        Start-Sleep -Milliseconds 50
    }
    [IO.File]::WriteAllText($result, '{"status":"installed"}')
    if ($script:progressWindow) { $script:progressWindow.Tag = $true; $script:progressWindow.Close() }
} catch {
    $failure = $_.Exception.Message
    if ($replaced -and -not $started) {
        try {
            [IO.File]::Replace($backup, $target, $null)
            Start-Process -FilePath $target -WorkingDirectory $root -ErrorAction Stop | Out-Null
        }
        catch { $failure += "`nRecovery failed: $($_.Exception.Message). Previous executable: $backup" }
    }
    [IO.File]::WriteAllText($result, (@{ status = 'error'; message = $failure } | ConvertTo-Json -Compress))
    [Console]::Error.WriteLine($failure)
    if ($script:progressWindow) {
        $translated = $jobData.presentation.errors.PSObject.Properties[$failure]
        $detail = if ($translated) { [string]$translated.Value } else { $failure }
        Update-ProgressWindow $jobData.presentation.text.failed $detail -Failure
        while ($script:progressWindow.IsVisible) { Invoke-ProgressEvents; Start-Sleep -Milliseconds 50 }
    }
    exit 1
}
