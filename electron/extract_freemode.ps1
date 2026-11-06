# Plockar ut freemode-gubbarna ur användarens egen GTA V-installation med CodeWalker.Core.dll.
# Samma filer som man annars exporterar för hand i OpenIV:
#   x64v.rpf\models\cdimages\streamedpeds_mp.rpf\mp_m_freemode_01(.yft + mapp)
#
#   powershell -File extract_freemode.ps1 -CodeWalker <mapp> -Gta <mapp> -Out <mapp>
#   ... -List                                    listar alla filer i båda freemode-mapparna (JSON)
#   ... -Out <mapp> -Ped <modell> -Names a,b,c   plockar ut bara de namngivna filerna (t.ex. head_005_r.ydd)
# Skriver "ALEX_OK <antal>" eller "ALEX_ERR <meddelande>".
param(
  [Parameter(Mandatory)] [string]$CodeWalker,
  [Parameter(Mandatory)] [string]$Gta,
  [string]$Out,
  [string]$Ped,
  [string]$Names,
  [switch]$List
)
$ErrorActionPreference = 'Stop'

# hand_000 är tom hos freemode – händerna sitter i uppr. Mannens feet_000 är en sko (_u), kvinnans barfota (_r).
$Parts = @('head', 'uppr', 'lowr', 'feet')

try {
  $dll = Join-Path $CodeWalker 'CodeWalker.Core.dll'
  if (-not (Test-Path $dll)) { throw "Hittar inte CodeWalker.Core.dll i $CodeWalker" }
  # UnsafeLoadFrom fungerar även när Windows markerat DLL:en som nedladdad.
  $asm = [Reflection.Assembly]::UnsafeLoadFrom($dll)
  $keys = $asm.GetType('CodeWalker.GameFiles.GTA5Keys')
  $rpfType = $asm.GetType('CodeWalker.GameFiles.RpfFile')
  $builder = $asm.GetType('CodeWalker.GameFiles.ResourceBuilder')

  # Signaturen skiljer mellan CodeWalker-versioner: (path), (path, gen9) eller (path, gen9, key).
  $load = $keys.GetMethods() | Where-Object { $_.Name -eq 'LoadFromPath' } | Sort-Object { $_.GetParameters().Count } | Select-Object -Last 1
  $loadArgs = @()
  foreach ($p in $load.GetParameters()) {
    if ($p.Position -eq 0) { $loadArgs += $Gta }
    elseif ($p.ParameterType -eq [bool]) { $loadArgs += $false }
    else { $loadArgs += $null }
  }
  $load.Invoke($null, [object[]]$loadArgs) | Out-Null

  $x64v = Join-Path $Gta 'x64v.rpf'
  if (-not (Test-Path $x64v)) { throw "Hittar inte x64v.rpf i $Gta" }
  $rpf = [Activator]::CreateInstance($rpfType, [object[]]@([string]$x64v, [string]'x64v.rpf'))
  $noop = [Action[string]] { param($s) }
  $rpf.ScanStructure($noop, $noop)

  # Samla alla filposter rekursivt (x64v.rpf innehåller nästlade .rpf-filer).
  $entries = New-Object System.Collections.Generic.List[object]
  $stack = New-Object System.Collections.Stack
  $stack.Push($rpf)
  while ($stack.Count -gt 0) {
    $r = $stack.Pop()
    foreach ($e in $r.AllEntries) { if ($e.GetType().Name -like '*FileEntry') { $entries.Add(@{ rpf = $r; entry = $e }) } }
    if ($r.Children) { foreach ($c in $r.Children) { $stack.Push($c) } }
  }

  $peds = @('mp_m_freemode_01', 'mp_f_freemode_01')
  if ($List) {
    $index = @{}
    foreach ($ped in $peds) {
      $index[$ped] = @($entries | Where-Object { $_.entry.Path.ToLower() -like "*streamedpeds_mp.rpf\$ped\*" } | ForEach-Object { $_.entry.Name.ToLower() })
    }
    # Alla peds som finns i spelet (för att skilja GTA-peds från addon-peds). De ligger i flera arkiv:
    # x64*.rpf i spelmappen och DLC-paketen i update\x64\dlcpacks.
    $pedNames = New-Object System.Collections.Generic.HashSet[string]
    $archives = @(Get-ChildItem -Path $Gta -Filter 'x64*.rpf' -File) + @(Get-ChildItem -Path (Join-Path $Gta 'update\x64\dlcpacks') -Filter 'dlc.rpf' -File -Recurse -ErrorAction SilentlyContinue)
    foreach ($a in $archives) {
      try {
        $top = [Activator]::CreateInstance($rpfType, [object[]]@([string]$a.FullName, [string]$a.Name))
        $top.ScanStructure($noop, $noop)
        $st = New-Object System.Collections.Stack
        $st.Push($top)
        while ($st.Count -gt 0) {
          $r = $st.Pop()
          foreach ($e in $r.AllEntries) {
            $n = $e.Name.ToLower()
            if ($n.EndsWith('.yft') -and $e.Path.ToLower() -like '*ped*') { [void]$pedNames.Add($n.Substring(0, $n.Length - 4)) }
          }
          if ($r.Children) { foreach ($c in $r.Children) { $st.Push($c) } }
        }
      } catch {
        # Ett arkiv som inte går att läsa hoppas över.
      }
    }
    $index['__peds'] = @($pedNames | Sort-Object)
    Write-Output ("ALEX_OK " + ($index | ConvertTo-Json -Compress -Depth 3))
    exit 0
  }
  if ($Ped) { $peds = @($Ped) }

  $count = 0
  foreach ($ped in $peds) {
    $dir = Join-Path $Out $ped
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $want = @("$ped.yft")
    foreach ($p in $Parts) { $want += "${p}_000_r.ydd", "${p}_000_u.ydd", "${p}_diff_000_a_whi.ytd", "${p}_diff_000_a_uni.ytd" }
    if ($Names) { $want = @($Names.ToLower().Split(',') | ForEach-Object { $_.Trim() }) }
    foreach ($item in $entries) {
      $e = $item.entry
      $path = $e.Path.ToLower()
      $name = $e.Name.ToLower()
      $inPed = $path -like "*streamedpeds_mp.rpf\$ped\*" -or $path -like "*streamedpeds_mp.rpf\$ped.yft"
      if (-not $inPed -or ($want -notcontains $name)) { continue }
      $data = $item.rpf.ExtractFile($e)
      # ExtractFile ger uppackad rådata. Packa om med RSC7-huvud så att filen blir som en OpenIV-export.
      if ($data -and $e.GetType().Name -eq 'RpfResourceFileEntry') {
        $data = $builder::AddResourceHeader($e, $builder::Compress($data))
      }
      if ($data) {
        [IO.File]::WriteAllBytes((Join-Path $dir $name), $data)
        $count++
      }
    }
  }
  if ($count -eq 0) { throw 'Hittade inga freemode-filer i x64v.rpf.' }
  Write-Output "ALEX_OK $count"
} catch {
  $msg = $_.Exception.InnerException.Message
  if (-not $msg) { $msg = $_.Exception.Message }
  Write-Output "ALEX_ERR $msg"
  exit 1
}
