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

  $count = 0
  foreach ($line in [IO.File]::ReadAllLines($Jobs)) {
    if (-not $line.Trim()) { continue }
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
  Write-Output "ALEX_ERR $msg"
  exit 1
}
