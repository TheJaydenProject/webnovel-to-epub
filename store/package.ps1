# Builds the store zip for Web Novel to EPUB.
#
# Entry names use forward slashes and manifest.json sits at the archive root,
# which Compress-Archive gets wrong on PowerShell 5.1.
#
# Excluded from the package: dev-only and already-archived material. The older
# release zips in the repo root would otherwise be shipped inside the upload.
#
# Usage: powershell -ExecutionPolicy Bypass -File store\package.ps1

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$repo = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $repo 'dist'

$excludedDirs = @('.git', '.claude', 'plans', 'tests', 'images', 'dist', 'store')
$excludedFiles = @('jszip.js')   # legacy duplicate of ui/vendor/jszip.min.js

$manifest = Get-Content (Join-Path $repo 'manifest.json') -Raw | ConvertFrom-Json
$zipPath = Join-Path $outDir ("webnovel-to-epub-{0}.zip" -f $manifest.version)

New-Item -ItemType Directory -Force -Path $outDir | Out-Null
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

$files = Get-ChildItem $repo -Recurse -File -Force | Where-Object {
    $relative = $_.FullName.Substring($repo.Length + 1).Replace('\', '/')
    $segments = $relative.Split('/')

    $inExcludedDir = $false
    foreach ($segment in $segments[0..($segments.Count - 2)]) {
        if ($excludedDirs -contains $segment) { $inExcludedDir = $true; break }
    }

    (-not $inExcludedDir) -and
    ($_.Extension -ne '.zip') -and
    ($excludedFiles -notcontains $_.Name) -and
    (-not $_.Name.StartsWith('.'))
}

$archive = [System.IO.Compression.ZipFile]::Open($zipPath, 'Create')
try {
    foreach ($file in $files) {
        $relative = $file.FullName.Substring($repo.Length + 1).Replace('\', '/')
        [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $archive, $file.FullName, $relative,
            [System.IO.Compression.CompressionLevel]::Optimal)
    }
}
finally {
    $archive.Dispose()
}

Write-Host ("Wrote {0} ({1:N0} bytes, {2} files)" -f $zipPath, (Get-Item $zipPath).Length, $files.Count)
