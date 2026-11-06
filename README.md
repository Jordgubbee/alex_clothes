# alex_clothes

Ett Windows-program för FiveM-kläder. Med det kan du:
- importera kläder från GTA eller befintliga klädpaket,
- redigera texturer i 2D och se dem på GTA:s riktiga freemode-gubbar i 3D,
- dela upp kläderna i egna paket,
- exportera en färdig resurs som fungerar direkt på servern.

Språk: Swedish, Norwegian, Danish, Finnish, English.

## Ladda ner

**[⬇ alex_clothes-Setup (installation)](https://github.com/Jordgubbee/alex_clothes/releases/latest)** – välj `alex_clothes-x.x.x-win64.exe` (eller `.zip`) under *Assets*.

Blockerar webbläsaren filen? Ladda ner **.zip**-versionen i stället och packa upp den, eller:
- **Edge:** klicka på ··· vid nedladdningen › *Behåll* › *Visa mer* › *Behåll ändå*.
- **Chrome:** öppna nedladdningar (Ctrl+J) › *Behåll farlig fil*.
- **Windows SmartScreen:** *Mer information* › *Kör ändå*.

Varningarna kommer för att appen inte är signerad med ett köpt certifikat, inte för att något är fel.

## Installera

1. Ladda ner `alex_clothes-x.x.x-win64.exe` under **Releases** och installera. Du får en genväg på skrivbordet och i startmenyn.
2. Installera [Blender](https://www.blender.org/download/) 4.2 eller nyare och [Sollumz](https://github.com/Sollumz/Sollumz/releases) (Edit › Preferences › Add-ons › Install from Disk).
3. Starta alex_clothes. Blender och GTA V hittas automatiskt. [CodeWalker.Core](https://github.com/dexyfex/CodeWalker) (MIT) följer med appen.

## Så fungerar det

1. **Hämta gubbarna:** klicka **Hämta från mitt GTA**. Då läses `mp_m_freemode_01` och `mp_f_freemode_01` in ur ditt eget GTA V, med originalskelettet (`.yft`). Det görs bara en gång.
2. **Importera:** dra in `.ydd`/`.ytd`-filer eller hela mappar (även undermappar), eller använd **Filer…** / **Mapp…**.
   - Kategori, nummer och kön läses från filnamnet.
   - Filer från befintliga addonpaket (t.ex. `mp_f_freemode_01_ems_f_clothes^jbib_000_u.ydd`) hamnar automatiskt i rätt paket.
3. **Paket:** skapa paket som `polis` och `ambulans`.
   - Välj namnmall (`polis`, `polis_clothes`, `polis_m_clothes` …) eller skriv exakt namn för kille och tjej.
   - Ctrl/Skift+klicka plagg i listan för att flytta flera till ett annat paket.
4. **Redigera:** ta bort loggor, klonstämpel, pensel, text, bilder, färgjustering och nya färgvarianter.
5. **Flera texturer i samma plagg** (t.ex. ett hölster med taser, pistol och radio):
   - GTA laddar bara en `.ytd` per färgvariant, så resten blir fel in game.
   - **Slå ihop till en textur** gör följande:
     - lägger texturerna i en atlas,
     - flyttar modellens UV i Blender,
     - slår ihop normal- och spec-kartorna,
     - behåller alla färgvarianter.
6. **Passform:**
   - **Passa in** nere till vänster i 3D-vyn: dra i handtagen för att flytta, rotera och skala plagget på peden. Under **Passform i 3D** finns exakta reglage och **Blås upp** mot klippning.
   - **Spara i modellen (för spelet)** bygger in passformen i `.ydd`:n, så plagget sitter likadant i FiveM.
   - **Öppna i Blender** öppnar plagget med freemode-skelettet för större ändringar. Den rättade `.ydd`:n kommer tillbaka automatiskt.
   - **Pedens utseende:** menyn **Ped** i 3D-vyn byter ansikte, frisyr och kläder (nummer och färg) på peden. På freemode-gubbarna hämtas de ur ditt GTA första gången du väljer dem; på egna peds väljs bland pedens egna varianter. På egna peds följer utseendet med i exporten: valt ansikte/plagg blir pedens nr 000/A, och med **Lås peden till utseendet i 3D-vyn** tas pedens andra varianter av de delarna bort, så att spelet inte slumpar fram originalet. På freemode-gubbarna påverkar menyn bara 3D-vyn.
   - **Dölj delar:** dubbelklicka på t.ex. ansiktet, eller välj **Dold** i Ped-menyn. Ett eget plagg i samma del (t.ex. ett eget huvud) ersätter pedens automatiskt.
7. **Exportera till FiveM:**
   - **Addon-paket** (rekommenderas) ger varje paket och kön egna filer:
     - `mp_m_freemode_01_<namn>^…`
     - `.ymt` (CPedVariationInfo, byggd och kontrollerad med CodeWalker)
     - `.meta` (ShopPedApparel)
     - `fxmanifest.lua` med `data_file 'SHOP_PED_APPAREL_META_FILE'`
   - **Ersätt GTA-plagg** byter ut freemode-plagg med samma nummer.
   - **Egna peds** exporteras som en hel ped i `stream/<ped>/`:
     - pedens alla filer (`.yft`, `.ydd`, `.ytd`, `.ymt`, props) med dina ändringar,
     - en uppdaterad `.ymt` om du lagt till plagg eller färgvarianter,
     - `peds.meta` och `data_file 'PED_METADATA_FILE'` om det är en addon-ped (pedens egen `peds.meta` används om den fanns i mappen).
     - Ta bort pedens gamla resurs från servern, annars krockar filerna.
   - **Addon-kläder till en egen ped:** välj peden och använd **Addon-kläder till …** längst ner i plagglistan. Plaggen får nästa lediga nummer efter pedens egna. Det fungerar för peds med en fil per plagg; peds med allt i en fil (t.ex. `s_m_y_cop_01`) kan bara få nya texturer.

Packa upp zip:en i `resources/` och lägg till `ensure <namn>` i `server.cfg`. Kläderna syns i illenium-appearance, qb-clothing, esx_skin, fivem-appearance med flera.

### Kontroller innan export

Exporten stoppas om något skulle ge fel i FiveM:
- plagg som saknar `.ydd` eller texturer,
- fler än 26 färgvarianter,
- ogiltiga eller krockande paketnamn,
- fler än 255 plagg per kategori.

Du får en varning för:
- texturer som inte är 2-potens eller är större än 2048,
- modeller över 16 MB,
- plagg med flera texturer som inte är ihopslagna.

## Tangenter

| Tangent | Verktyg |
| --- | --- |
| V | flytta |
| M | markera |
| J | ta bort logga |
| S | klonstämpel (Alt+klick = källa) |
| B | pensel |
| E | sudd |
| G | fyll |
| T | text |
| L | bild |
| I | pipett |
| [ ] | penselstorlek |
| 0 | anpassa |
| Ctrl+Z / Ctrl+Y | ångra / gör om |
| Mellanslag + dra | panorera |

## Utveckla

```bash
npm install
npm run dev      # appen med hot reload
npm run dist     # installer + portabel exe i release/
```

`npm run build` kontrollerar först att alla texter är översatta (`scripts/check-i18n.mjs`). För att publicera: höj `version` i `package.json` och pusha en tagg (`git tag v1.1.0 && git push --tags`). Då bygger GitHub Actions `.exe`-filerna under Releases.

alex_clothes innehåller inga filer från Rockstar Games. GTA-filer läses bara från användarens egen installation.
