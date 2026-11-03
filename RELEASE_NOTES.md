## alex_clothes

Ett enkelt Windows-program för FiveM-kläder:
- redigera GTA V-plagg i 2D (ta bort loggor, lägg till text och loggor som lager, färga om),
- se dem på GTA:s riktiga freemode-gubbar i 3D,
- exportera färdiga addon-paket som fungerar direkt på servern.

### Ladda ner
- **alex_clothes-x.x.x-win64.exe** – installerar appen med genväg på skrivbordet och i startmenyn (rekommenderas)
- **alex_clothes-x.x.x-portable.exe** – körs direkt utan installation
- **.zip** – samma filer packade, om webbläsaren blockerar .exe

### Du behöver
1. GTA V installerat (Steam, Rockstar eller Epic)
2. [Blender](https://www.blender.org/download/) 4.2 eller nyare
3. [Sollumz](https://github.com/Sollumz/Sollumz/releases) i Blender (Edit › Preferences › Add-ons › Install from Disk)

Freemode-gubbarna hämtas automatiskt ur ditt eget GTA första gången du startar appen. Inga Rockstar-filer följer med programmet.

### Om Windows varnar eller blockerar
Appen är inte signerad med ett köpt certifikat.
- **"Windows skyddade datorn"**: klicka **Mer information → Kör ändå**.
- **Edge**: ··· vid nedladdningen › Behåll › Visa mer › Behåll ändå. **Chrome**: Ctrl+J › Behåll farlig fil.
- **Smart App Control** (Windows 11) kan stoppa osignerade program helt. Använd då den portabla versionen eller stäng av Smart App Control under Windows-säkerhet › App- och webbläsarkontroll.

### Nytt i 1.0.5
- **Flytta loggor mellan texturer** – välj en logga eller text och "Lägg på andra texturer…": kopiera eller flytta den till andra färgvarianter eller plagg, på exakt samma plats och i samma storlek
- **Gör inbrända loggor till lager** – markera en logga i texturen och välj "Gör till lager" eller "Klipp ut till lager"
- **Egna peds** – lägg till vilken ped som helst (GTA-ped eller addon-ped) under Inställningar › Egna peds, se den i 3D och gör egna texturer till dess kläder och ansikten; exporten bygger om pedens .ytd med bara dina ändringar
- Ny kategori: Huvud & ansikte

### Nytt i 1.0.4
- **Startsida med historik** – allt sparas automatiskt; öppna gamla projekt eller skapa nya
- **Export rättad** – spara direkt i en mapp (t.ex. serverns resources) eller som .zip, med förlopp
- **Stora och små bokstäver** i namn behålls (eller välj allt med små bokstäver)
- **Mappstruktur** per paket och kön, eller allt i stream/
- **Tyget ser ut som tyg** – plaggens egna normal-kartor (veck, sömmar, väv), tygmaterial och bättre ljus i 3D
