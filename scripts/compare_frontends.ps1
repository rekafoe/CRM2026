param(
  [string]$LeftRoot = "D:\CRM\src",
  [string]$RightRoot = "D:\CRM\frontend\src",
  [string]$ReportPath = "D:\CRM\compare-frontends-report.json"
)

$ErrorActionPreference = "Stop"

function Get-RelPath([string]$Base, [string]$Full) {
  $baseNorm = ([IO.Path]::GetFullPath($Base)).TrimEnd('\')
  $fullNorm = ([IO.Path]::GetFullPath($Full))
  if ($fullNorm.StartsWith($baseNorm, [System.StringComparison]::OrdinalIgnoreCase)) {
    return $fullNorm.Substring($baseNorm.Length).TrimStart('\')
  }
  return $Full
}

$extRegex = '\.(ts|tsx|js|jsx|css|json)$'

Write-Host "Comparing:"
Write-Host "  Left : $LeftRoot"
Write-Host "  Right: $RightRoot"

$leftFiles = Get-ChildItem $LeftRoot -Recurse -File | Where-Object { $_.Name -match $extRegex }
$rightFiles = Get-ChildItem $RightRoot -Recurse -File | Where-Object { $_.Name -match $extRegex }

$rightMap = @{}
foreach ($f in $rightFiles) {
  $rel = Get-RelPath $RightRoot $f.FullName
  $rightMap[$rel] = $f.FullName
}

$leftMap = @{}
foreach ($f in $leftFiles) {
  $rel = Get-RelPath $LeftRoot $f.FullName
  $leftMap[$rel] = $f.FullName
}

$same = New-Object System.Collections.Generic.List[object]
$diff = New-Object System.Collections.Generic.List[object]
$leftOnly = New-Object System.Collections.Generic.List[object]
$rightOnly = New-Object System.Collections.Generic.List[object]

foreach ($rel in $leftMap.Keys) {
  if ($rightMap.ContainsKey($rel)) {
    $l = $leftMap[$rel]
    $r = $rightMap[$rel]
    $lh = (Get-FileHash $l -Algorithm SHA256).Hash
    $rh = (Get-FileHash $r -Algorithm SHA256).Hash
    if ($lh -eq $rh) {
      $same.Add([pscustomobject]@{ rel = $rel; left = $l; right = $r })
    } else {
      $diff.Add([pscustomobject]@{ rel = $rel; left = $l; right = $r })
    }
  } else {
    $leftOnly.Add([pscustomobject]@{ rel = $rel; left = $leftMap[$rel] })
  }
}

foreach ($rel in $rightMap.Keys) {
  if (-not $leftMap.ContainsKey($rel)) {
    $rightOnly.Add([pscustomobject]@{ rel = $rel; right = $rightMap[$rel] })
  }
}

$report = [pscustomobject]@{
  generatedAt = (Get-Date).ToString("o")
  leftRoot = $LeftRoot
  rightRoot = $RightRoot
  summary = @{
    same = $same.Count
    diff = $diff.Count
    leftOnly = $leftOnly.Count
    rightOnly = $rightOnly.Count
  }
  same = $same
  diff = $diff
  leftOnly = $leftOnly
  rightOnly = $rightOnly
}

$report | ConvertTo-Json -Depth 6 | Set-Content -Path $ReportPath -Encoding UTF8

Write-Host ""
Write-Host ("SAME     : {0}" -f $same.Count)
Write-Host ("DIFF     : {0}" -f $diff.Count)
Write-Host ("LEFT ONLY: {0}" -f $leftOnly.Count)
Write-Host ("RIGHTONLY: {0}" -f $rightOnly.Count)
Write-Host ""
Write-Host "Top SAME (first 40):"
$same | Select-Object -First 40 | Format-Table -AutoSize
Write-Host ""
Write-Host "Top DIFF (first 40):"
$diff | Select-Object -First 40 | Format-Table -AutoSize
Write-Host ""
Write-Host "Report saved to: $ReportPath"


