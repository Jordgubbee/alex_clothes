# alex_clothes

Ett Windows-program för FiveM-kläder. Med det kan du:
- importera kläder från GTA eller befintliga klädpaket,
- redigera texturer i 2D och se dem på GTA:s riktiga freemode-gubbar i 3D,
- dela upp kläderna i egna paket,
- exportera en färdig resurs som fungerar direkt på servern.

Språk: Swedish, Norwegian, Danish, Finnish, English.

## Installera

1. Ladda ner `alex_clothes-Setup-x.x.x.exe` under **Releases** och installera. Du får en genväg på skrivbordet och i startmenyn.
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
6. **Passform:** **Öppna i Blender** öppnar plagget med freemode-skelettet, så viktningen bevaras. Den rättade `.ydd`:n kommer tillbaka automatiskt.
7. **Exportera till FiveM:**
   - **Addon-paket** (rekommenderas) ger varje paket och kön egna filer:
     - `mp_m_freemode_01_<namn>^…`
     - `.ymt` (CPedVariationInfo, byggd och kontrollerad med CodeWalker)
     - `.meta` (ShopPedApparel)
     - `fxmanifest.lua` med `data_file 'SHOP_PED_APPAREL_META_FILE'`
   - **Ersätt GTA-plagg** byter ut freemode-plagg med samma nummer.

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
