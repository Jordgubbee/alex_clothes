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
    # "inject|ydd|target|source|out|name": lägger modellen ur source.ydd i pedens .ydd under namnet
    # (t.ex. head_000_r) och tar bort pedens modell med samma nummer (_r eller _u).
    # "inject|ytd|target|out|spec.json": spec { remove: "head_diff_000_", add: [{ file, name }] }.
    # "extract|in.ydd|out.ydd|namn": en ny .ydd med bara modellen med det namnet (t.ex. head_000_r).
    if ($line.StartsWith('extract|')) {
      $null, $in, $out, $name = $line.Split('|')
      $yddType = $asm.GetType('CodeWalker.GameFiles.YddFile')
      $file = [Activator]::CreateInstance($yddType); $file.Load([IO.File]::ReadAllBytes($in))
      $d = $file.DrawableDict
      $want = & $hashOf $name
      $idx = -1
      for ($i = 0; $i -lt $d.Hashes.Length; $i++) { if ([uint32]$d.Hashes[$i] -eq $want) { $idx = $i } }
      if ($idx -lt 0) { throw "Hittar inte $name i $([IO.Path]::GetFileName($in))" }
      $arr = [Array]::CreateInstance($d.Drawables.data_items.GetType().GetElementType(), 1)
      $arr[0] = $d.Drawables.data_items[$idx]
      $arr[0].Name = $name
      $d.Hashes = [uint32[]]@($want)
      $d.Drawables.data_items = $arr
      $d.HashesCount1 = $d.HashesCount2 = $d.DrawablesCount1 = $d.DrawablesCount2 = [uint16]1
      [IO.File]::WriteAllBytes($out, $file.Save())
      $count++
      continue
    }
    if ($line.StartsWith('inject|')) {
      $parts = $line.Split('|')
      if ($parts[1] -eq 'ydd') {
        $null, $null, $target, $source, $out, $name = $parts
        $yddType = $asm.GetType('CodeWalker.GameFiles.YddFile')
        $file = [Activator]::CreateInstance($yddType); $file.Load([IO.File]::ReadAllBytes($target))
        $src = [Activator]::CreateInstance($yddType); $src.Load([IO.File]::ReadAllBytes($source))
        if (-not $src.DrawableDict -or $src.DrawableDict.Drawables.data_items.Length -lt 1) { throw "Hittar ingen modell i $([IO.Path]::GetFileName($source))" }
        $newDr = $src.DrawableDict.Drawables.data_items[0]
        $newDr.Name = $name
        $base = $name -replace '_[ru]$', ''
        $drop = @((& $hashOf "$($base)_r"), (& $hashOf "$($base)_u"), (& $hashOf $base))
        $d = $file.DrawableDict

        # Pedens skelett (från någon av dess modeller). Modellen kopplas om dit: varje ben-nummer i modellen
        # pekar på källans skelett (t.ex. freemode, 128 ben) och byts mot samma ben (samma tag) i pedens
        # skelett. Finns inte benet hos peden används närmaste förälder som finns.
        $targetSkel = $null
        foreach ($dr in $d.Drawables.data_items) { if ($dr.Skeleton -and $dr.Skeleton.Bones -and $dr.Skeleton.Bones.Items.Length -gt 0) { $targetSkel = $dr.Skeleton; break } }
        $srcSkel = $newDr.Skeleton
        if ($targetSkel -and $srcSkel -and $srcSkel.Bones -and $srcSkel.Bones.Items.Length -gt 0) {
          $byTag = @{}
          foreach ($b in $targetSkel.Bones.Items) { $byTag[[int]$b.Tag] = [int]$b.Index }
          $srcBones = $srcSkel.Bones.Items
          $map = @{}
          for ($i = 0; $i -lt $srcBones.Length; $i++) {
            $b = $srcBones[$i]
            $guard = 0
            while ($b -and -not $byTag.ContainsKey([int]$b.Tag) -and $b.ParentIndex -ge 0 -and $guard -lt 200) { $b = $srcBones[$b.ParentIndex]; $guard++ }
            $map[$i] = if ($b -and $byTag.ContainsKey([int]$b.Tag)) { $byTag[[int]$b.Tag] } else { 0 }
          }
          foreach ($m in $newDr.AllModels) {
            foreach ($g in $m.Geometries) {
              if (-not $g.BoneIds) { continue }
              $ids = [uint16[]]@($g.BoneIds | ForEach-Object { if ($map.ContainsKey([int]$_)) { [uint16]$map[[int]$_] } else { [uint16]0 } })
              $g.BoneIds = $ids
            }
          }
        }
        if ($targetSkel) {
          # En egen kopia av pedens skelett: samma objekt i två modeller ger trasiga pekare i spelet
          # ("Invalid fixup") även om CodeWalker kan läsa filen.
          $sb = [Text.StringBuilder]::new()
          $targetSkel.WriteXml($sb, 1)
          $xdoc = [System.Xml.XmlDocument]::new()
          $xdoc.LoadXml("<Skeleton>$($sb.ToString())</Skeleton>")
          $copy = [Activator]::CreateInstance($targetSkel.GetType())
          $copy.ReadXml($xdoc.DocumentElement)
          $newDr.Skeleton = $copy
          # Låga byten i SkeletonBinding = antal ben i skelettet (freemode 128, peden t.ex. 102).
          $boneCount = [uint32]$targetSkel.Bones.Items.Length
          foreach ($m in $newDr.AllModels) { if ($m.SkeletonBinding -band 0xFF00) { $m.SkeletonBinding = ([uint32]$m.SkeletonBinding -band 0xFFFFFF00) -bor $boneCount } }
        }
        $rows = @()
        for ($i = 0; $i -lt $d.Hashes.Length; $i++) {
          $h = [uint32]$d.Hashes[$i]
          if ($drop -contains $h) { continue }
          $rows += [pscustomobject]@{ h = $h; d = $d.Drawables.data_items[$i] }
        }
        $rows += [pscustomobject]@{ h = (& $hashOf $name); d = $newDr }
        $rows = @($rows | Sort-Object { [uint32]$_.h })
        $arr = [Array]::CreateInstance($d.Drawables.data_items.GetType().GetElementType(), $rows.Count)
        for ($i = 0; $i -lt $rows.Count; $i++) { $arr[$i] = $rows[$i].d }
        $d.Hashes = [uint32[]]@($rows | ForEach-Object { [uint32]$_.h })
        $d.Drawables.data_items = $arr
        $d.HashesCount1 = $d.HashesCount2 = $d.DrawablesCount1 = $d.DrawablesCount2 = [uint16]$rows.Count
        $saved = $file.Save()
        $check = [Activator]::CreateInstance($yddType); $check.Load($saved)
        if ($check.DrawableDict.Hashes.Length -ne $rows.Count) { throw "Kontrollen misslyckades för $([IO.Path]::GetFileName($out))" }
      } else {
        $null, $null, $target, $out, $specPath = $parts
        $spec = Get-Content $specPath -Raw -Encoding UTF8 | ConvertFrom-Json
        $ytdType = $asm.GetType('CodeWalker.GameFiles.YtdFile')
        $file = [Activator]::CreateInstance($ytdType); $file.Load([IO.File]::ReadAllBytes($target))
        $list = [Activator]::CreateInstance([Collections.Generic.List``1].MakeGenericType($asm.GetType('CodeWalker.GameFiles.Texture')))
        # copy: [{ from, to }] – en kopia av en befintlig textur under nytt namn (görs innan något tas bort).
        $copies = @()
        foreach ($c in @($spec.copy | Where-Object { $_ })) {
          $copy = [Activator]::CreateInstance($ytdType); $copy.Load([IO.File]::ReadAllBytes($target))
          $src = $copy.TextureDict.Textures.data_items | Where-Object { $_.Name.ToLowerInvariant() -eq ([string]$c.from).ToLowerInvariant() } | Select-Object -First 1
          if ($src) { $src.Name = [string]$c.to; $src.NameHash = & $hashOf ([string]$c.to); $copies += $src }
        }
        foreach ($tex in $file.TextureDict.Textures.data_items) { if (-not $tex.Name.ToLowerInvariant().StartsWith([string]$spec.remove)) { $list.Add($tex) } }
        foreach ($c in $copies) { $list.Add($c) }
        foreach ($a in $spec.add) {
          $src = [Activator]::CreateInstance($ytdType); $src.Load([IO.File]::ReadAllBytes([string]$a.file))
          $tex = $src.TextureDict.Textures.data_items[0]
          if (-not $tex) { throw "Hittar ingen textur i $([IO.Path]::GetFileName([string]$a.file))" }
          $tex.Name = [string]$a.name
          $tex.NameHash = & $hashOf ([string]$a.name)
          $list.Add($tex)
        }
        $file.TextureDict.BuildFromTextureList($list)
        $saved = $file.Save()
        $check = [Activator]::CreateInstance($ytdType); $check.Load($saved)
        if ($check.TextureDict.Textures.data_items.Length -ne $list.Count) { throw "Kontrollen misslyckades för $([IO.Path]::GetFileName($out))" }
      }
      [IO.File]::WriteAllBytes($out, $saved)
      $count++
      continue
    }
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
