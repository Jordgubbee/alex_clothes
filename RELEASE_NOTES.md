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

### Nytt i 1.0.10
- **Ansiktet och kläderna du valt syns in game och i OpenIV** – det du väljer i Ped-menyn på en egen ped följer nu med i exporten. Varianten du valt (eller den du har målat på) blir pedens nr 000/A, som är den spelet och OpenIV visar
- **Lås peden till utseendet i 3D-vyn** (på som standard) – pedens andra varianter av delarna du valt eller ändrat tas bort, så att spelet inte slumpar fram originalansiktet. Stäng av i exportfönstret om spelarna ska kunna byta mellan pedens varianter
- Fungerar både på peds med en fil per plagg och på peds med allt i en fil (t.ex. `s_m_y_cop_01`)
- En ped följer med i exporten även om du bara har ändrat dess utseende i Ped-menyn
- **Rättat:** exporten kunde krascha för peds med allt i en fil efter att projektet öppnats igen

### Nytt i 1.0.9
- **Egna peds fungerar in game** – exporten lägger nu med hela peden (`.yft`, `.ydd`, `.ytd`, `.ymt`, props) med dina ändringar, i stället för bara de ändrade filerna. Det gör också att du kan öppna hela resultatet i OpenIV
- **Addon-peds får `peds.meta`** och `PED_METADATA_FILE` i fxmanifest automatiskt (pedens egen `peds.meta` används om den fanns)
- **Addon-kläder till en egen ped** – knappen **Addon-kläder till …** längst ner i plagglistan. Plaggen får nästa lediga nummer och läggs in i pedens `.ymt` vid export
- **Ändringar sparas överallt** – byter du huvud, byxor m.m. i Ped-menyn syns dina redigerade texturer på den delen, och pedens valda utseende sparas i projektet
- Tydligare filnamn i exporten för egna peds

### Nytt i 1.0.8
- **Byt ansikte, frisyr och kläder på peden** – menyn **Ped** i 3D-vyn: välj nummer och färg för varje del (46 ansikten, frisyrer, tröjor, byxor, skor …). På freemode-gubbarna hämtas delarna ur ditt eget GTA första gången; på egna peds väljer du bland pedens egna varianter
- Välj **Dold** för att ta bort en del, eller dubbelklicka på den. **Återställ peden** tar tillbaka grundutseendet
- Utseendet sparas till nästa gång och påverkar bara 3D-vyn – inte exporten

### Nytt i 1.0.7
- **Dölj pedens delar** – dubbelklicka på ansiktet (eller överkropp, ben, fötter) för att dölja det, eller använd menyn **Kroppsdelar** i 3D-vyn. **Visa alla** tar tillbaka allt
- Ett eget plagg i samma del (t.ex. ett eget huvud eller ansikte) ersätter pedens automatiskt i 3D, som i spelet

### Nytt i 1.0.6
- **Passa in plagg i 3D** – handtag direkt i 3D-vyn: flytta, rotera och skala plagget så att det sitter rätt på peden (även egna peds/NPC:er)
- **Exakta reglage** under Passform i 3D: flytta X/Y/Z, rotera, storlek, bredd, höjd, djup och "Blås upp" mot klippning
- **Spara i modellen (för spelet)** – passformen byggs in i .ydd:n med Sollumz, i alla LOD:er, och viktningen mot skelettet behålls – plagget sitter likadant i FiveM

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
