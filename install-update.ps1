param([Parameter(Mandatory = $true)][string]$Job, [switch]$ReportOnly)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 3.0
$directory = Split-Path -Parent ([IO.Path]::GetFullPath($Job))
$result = Join-Path $directory 'result.json'
$replaced = $false
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
    $deadline = [DateTime]::UtcNow.AddSeconds(120)
    $process = Get-Process -Id $jobData.pid -ErrorAction SilentlyContinue
    [IO.File]::WriteAllText((Join-Path $directory 'ready'), 'ready')
    if ($process) {
        if (-not $process.WaitForExit(120000)) { throw 'OrbitKanban is still running. Close the app and retry the update.' }
    }
    # The portable parent can hold the launcher briefly after Electron exits.
    $replacement = $null
    while ([DateTime]::UtcNow -lt $deadline) {
        try { $replacement = [IO.File]::Open($target, 'Open', 'ReadWrite', 'None'); break }
        catch [IO.IOException] { Start-Sleep -Milliseconds 250 }
    }
    if (-not $replacement) { throw 'The portable executable is still in use. Nothing was installed.' }
    $replacement.Dispose()
    $stream = [IO.File]::OpenRead($source)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $size = $stream.Length; $digest = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
    finally { $sha.Dispose(); $stream.Dispose() }
    if ($size -ne $jobData.size -or $digest -ne $jobData.sha256) {
        throw 'Update checksum or size does not match. Nothing was installed.'
    }
    [IO.File]::Replace($source, $target, $backup)
    $replaced = $true
    Start-Process -FilePath $target -WorkingDirectory $root -ErrorAction Stop | Out-Null
    [IO.File]::WriteAllText($result, '{"status":"installed"}')
} catch {
    $failure = $_.Exception.Message
    if ($replaced) {
        try { [IO.File]::Replace($backup, $target, $null); Start-Process -FilePath $target -WorkingDirectory $root | Out-Null }
        catch { $failure += "`nRecovery failed: $($_.Exception.Message). Previous executable: $backup" }
    }
    [IO.File]::WriteAllText($result, (@{ status = 'error'; message = $failure } | ConvertTo-Json -Compress))
    if ($ReportOnly) { [Console]::Error.WriteLine($failure) }
    else {
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.MessageBox]::Show($failure, 'OrbitKanban update', 'OK', 'Error') | Out-Null
    }
    exit 1
}
