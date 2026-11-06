# Bygger binära .ymt-filer (CPedVariationInfo) från CodeWalker-XML med CodeWalker.Core.dll.
#
#   powershell -File build_ymt.ps1 -CodeWalker <mapp> -Jobs <jobs.txt>
# jobs.txt: en rad per fil, "<in.ymt.xml>|<ut.ymt>". Varje fil läses tillbaka efteråt som kontroll.
# En rad "toxml|<in.ymt>|<ut.xml>" gör tvärtom: läser en befintlig .ymt (t.ex. en peds) som XML.
# Skriver "ALEX_OK <antal>" eller "ALEX_ERR <meddelande>".
param(
  [Parameter(Mandatory)] [string]$CodeWalker,
  [Parameter(Mandatory)] [string]$Jobs
)
$ErrorActionPreference = 'Stop'
try {
  $asm = [Reflection.Assembly]::UnsafeLoadFrom((Join-Path $CodeWalker 'CodeWalker.Core.dll'))
  $xmlMeta = $asm.GetType('CodeWalker.GameFiles.XmlMeta')
  $metaFormat = $asm.GetType('CodeWalker.GameFiles.MetaFormat')
  $ymtType = $asm.GetType('CodeWalker.GameFiles.YmtFile')
  $loadRes = $asm.GetType('CodeWalker.GameFiles.RpfFile').GetMethods() | Where-Object { $_.Name -eq 'LoadResourceFile' } | Select-Object -First 1
  $getData = $xmlMeta.GetMethod('GetData')
  $rsc = [Enum]::Parse($metaFormat, 'RSC')

  $gen = $asm.GetType('CodeWalker.GameFiles.JenkHash').GetMethods() | Where-Object { $_.Name -eq 'GenHash' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType -eq [string] } | Select-Object -First 1
  $hashOf = { param($s) [uint32]$gen.Invoke($null, @($s.ToLowerInvariant())) }

  $count = 0
  foreach ($line in [IO.File]::ReadAllLines($Jobs)) {
    if (-not $line.Trim()) { continue }
    # "rename|ydd|in|out|map.json" eller "rename|ytd|…": döper om modeller/texturer inuti filen
    # (map.json: [{ "from": "head_001_r", "to": "head_000_r" }], to = "" tar bort). Ordningen byggs om
    # efter namnens hash, som spelet kräver.
    if ($line.StartsWith('rename|')) {
      $null, $kind, $in, $out, $mapPath = $line.Split('|')
      $ren = @{}
      # PowerShell 5 lämnar JSON-listan som ett enda objekt – packa upp den först.
      $pairs = Get-Content $mapPath -Raw -Encoding UTF8 | ConvertFrom-Json
      foreach ($p in $pairs) { $ren[(& $hashOf ([string]$p.from))] = [string]$p.to }
      $bytes = [IO.File]::ReadAllBytes($in)
      if ($kind -eq 'ydd') {
        $file = [Activator]::CreateInstance($asm.GetType('CodeWalker.GameFiles.YddFile'))
        $file.Load($bytes)
        $d = $file.DrawableDict
        $rows = @()
        for ($i = 0; $i -lt $d.Hashes.Length; $i++) {
          $h = [uint32]$d.Hashes[$i]
          $dr = $d.Drawables.data_items[$i]
          if ($ren.ContainsKey($h)) {
            if (-not $ren[$h]) { continue }
            $dr.Name = $ren[$h]
            $h = & $hashOf $ren[$h]
          }
          $rows += [pscustomobject]@{ h = $h; d = $dr }
        }
        $rows = @($rows | Sort-Object { [uint32]$_.h })
        $arr = [Array]::CreateInstance($d.Drawables.data_items.GetType().GetElementType(), $rows.Count)
        for ($i = 0; $i -lt $rows.Count; $i++) { $arr[$i] = $rows[$i].d }
        $d.Hashes = [uint32[]]@($rows | ForEach-Object { [uint32]$_.h })
        $d.Drawables.data_items = $arr
        $d.HashesCount1 = $d.HashesCount2 = $d.DrawablesCount1 = $d.DrawablesCount2 = [uint16]$rows.Count
        $saved = $file.Save()
        $check = [Activator]::CreateInstance($asm.GetType('CodeWalker.GameFiles.YddFile'))
        $check.Load($saved)
        if ($check.DrawableDict.Hashes.Length -ne $rows.Count) { throw "Kontrollen misslyckades för $([IO.Path]::GetFileName($out))" }
      } else {
        $file = [Activator]::CreateInstance($asm.GetType('CodeWalker.GameFiles.YtdFile'))
        $file.Load($bytes)
        $list = [Activator]::CreateInstance([Collections.Generic.List``1].MakeGenericType($asm.GetType('CodeWalker.GameFiles.Texture')))
        foreach ($tex in $file.TextureDict.Textures.data_items) {
          $h = & $hashOf $tex.Name
          if ($ren.ContainsKey($h)) {
            if (-not $ren[$h]) { continue }
            $tex.Name = $ren[$h]
            $tex.NameHash = & $hashOf $ren[$h]
          }
          $list.Add($tex)
        }
        $file.TextureDict.BuildFromTextureList($list)
        $saved = $file.Save()
        $check = [Activator]::CreateInstance($asm.GetType('CodeWalker.GameFiles.YtdFile'))
        $check.Load($saved)
        if ($check.TextureDict.Textures.data_items.Length -ne $list.Count) { throw "Kontrollen misslyckades för $([IO.Path]::GetFileName($out))" }
      }
      [IO.File]::WriteAllBytes($out, $saved)
      $count++
      continue
    }
    if ($line.StartsWith('toxml|')) {
      $null, $in, $out = $line.Split('|')
      $ymt = [Activator]::CreateInstance($ymtType)
      $loadRes.MakeGenericMethod($ymtType).Invoke($null, [object[]]@($ymt, [IO.File]::ReadAllBytes($in), [uint32]2)) | Out-Null
      $getXml = $asm.GetType('CodeWalker.GameFiles.MetaXml').GetMethods() | Where-Object { $_.Name -eq 'GetXml' -and $_.GetParameters()[0].ParameterType.Name -eq 'YmtFile' } | Select-Object -First 1
      $xml = $getXml.Invoke($null, [object[]]@($ymt, $null))
      if (-not $xml) { throw "CodeWalker kunde inte läsa $([IO.Path]::GetFileName($in))" }
      [IO.File]::WriteAllText($out, $xml, [Text.UTF8Encoding]::new($false))
      $count++
      continue
    }
    $in, $out = $line.Split('|')
    $doc = [System.Xml.XmlDocument]::new()
    $doc.Load($in)
    $bytes = $getData.Invoke($null, [object[]]@($doc.PSObject.BaseObject, $rsc, [IO.Path]::GetFileName($out)))
    if (-not $bytes -or $bytes.Length -lt 16) { throw "CodeWalker kunde inte bygga $([IO.Path]::GetFileName($out))" }
    [IO.File]::WriteAllBytes($out, $bytes)

    # Kontroll: läs tillbaka filen så att en trasig .ymt aldrig hamnar i exporten.
    $check = [Activator]::CreateInstance($ymtType)
    $loadRes.MakeGenericMethod($ymtType).Invoke($null, [object[]]@($check, $bytes, [uint32]2)) | Out-Null
    # Vanliga peds har inget dlcName (Meta.Name är tomt) – kontrollera i stället att innehållet går att läsa.
    $getXml = $asm.GetType('CodeWalker.GameFiles.MetaXml').GetMethods() | Where-Object { $_.Name -eq 'GetXml' -and $_.GetParameters()[0].ParameterType.Name -eq 'YmtFile' } | Select-Object -First 1
    $back = if ($check.Meta) { $getXml.Invoke($null, [object[]]@($check, $null)) } else { $null }
    if (-not $back -or $back -notmatch '<CPedVariationInfo>' -or $back -notmatch '<availComp>') { throw "Kontrollen misslyckades för $([IO.Path]::GetFileName($out))" }
    $count++
  }
  Write-Output "ALEX_OK $count"
} catch {
  $msg = $_.Exception.InnerException.Message
  if (-not $msg) { $msg = $_.Exception.Message }
  $msg = "$msg (rad $($_.InvocationInfo.ScriptLineNumber))"
  Write-Output "ALEX_ERR $msg"
  exit 1
}
