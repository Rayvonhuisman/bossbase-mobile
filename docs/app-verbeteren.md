# App verbeteren — checklist en voortgang

Branch: `app-verbeteren` (vanaf `main`). Alleen deze branch wordt gepusht; niets
naar `main`, geen nieuwe app- of PWA-versie. Het dashboard (`~/BossBase`) is alleen
voorbeeld. Testen alleen met testbedrijven (TEST Stamvol Bouw BV).

Legenda: `[x]` klaar · `[ ]` open · `[~]` bewust open (met reden)

## Formaten (elke pagina)

Minimaal: iPhone SE (375×667), iPhone 12/13/14 (390×844), iPhone 17 Pro Max
(440×956), iPad mini (744×1133), iPad Air (820×1180), iPad Pro 12,9" (1024×1366),
iPad staand en liggend. Screenshots in `docs/screenshots/`.

- [ ] Screenshots van de belangrijkste schermen per formaat
- [ ] Spacing zijkanten, uitlijning, niets afgesneden — per pagina nagelopen

## Algemeen

- [x] 1. Filters en tabbladen onthouden per gebruiker (`useOnthouden`, op het toestel): werkbonnen, projecten (status, facturatie), offertes, facturen, activiteiten (+ medewerker), relaties (filter + tab Klanten/Leveranciers), uren (ik/team, soort, medewerker), kosten (weergave, periode, klant, categorie), agenda (dag/week/maand), planning (dag/week, medewerker/voertuig). Zoektekst bewust niet. Een filter dat niet meer bestaat valt terug op de standaard. Materialen heeft alleen zoeken
- [x] 2. "bus/bussen" → "voertuig/voertuigen" in de hele app (4 teksten: werkbonformulier ×2, Instellingen › Voertuigen ×2; verder alleen code-namen)
- [x] 3. Route-knop opent de kaartenapp: één helper (`lib/routeLinks.ts`) voor klantkaart, leverancier, werkbon (bouwde eigen Google-link), agenda en homepage. iPhone/iPad: Apple Kaarten (in de app keuze als Google Maps erop staat; `LSApplicationQueriesSchemes` toegevoegd, werkt pas na een nieuwe build); Android: Google Maps-route; altijd route i.p.v. zoeken. Projectkaart krijgt een route-knop in punt 9
- [x] 4. Adres zoeken zoals het dashboard (PDOK Locatieserver, zelfde aanroepen als `AdresZoeker.jsx`): nieuwe klant, klant bewerken, leverancier (nieuw/bewerken), werkbon-locatie (één regel), Instellingen › Bedrijfsprofiel, afspraak-locatie (vrije tekst blijft kunnen). Velden blijven met de hand te wijzigen

## Per pagina

### 5. Homepage
- [x] Donkere modus uit de kop, keuze in Instellingen › Mijn profiel › Weergave
- [x] Boss rechtsboven: zijn hoofd (`boss-gids.png` uit de rondleiding)
- [x] Widgets vergeleken met het dashboard en afwijkingen gefixt (zie Rapport homepage)
- [x] Widget "Nieuwe aanvragen": nieuwste 6 uit de eerste fase (zoals de dashboardtegel), rij → projectkaart, kop en voet → pipeline; de KPI-tegel "Nieuwe aanvragen" onder Overzicht is vervallen (dubbel)

### 6. Agenda
- [x] Inhoud (afspraken, werkbonnen per geplande dag met jouw tijd, ingeplande activiteiten via hun agenda-item) gelijk aan dashboard; persoonlijk, met gedeelde werkruimte alles. Een ingeplande activiteit opent nu de activiteit (was het afspraakformulier, alleen-lezen)
- [x] Weergaven: dag/week/maand zoals het dashboard; uurvenster nu uit Instellingen (`agenda_start_uur`/`agenda_eind_uur`, standaard 07–20) i.p.v. vast 08–17. Bewust anders gelaten (ontwerp app): maandweergave met stippen i.p.v. titels, weekblokjes niet los aantikbaar (tik op de dag toont de lijst)
- [x] Afspraak aanmaken/wijzigen met de velden van het dashboard: titel, type (Afspraak/Klus/Opname/Activiteit — werd niet opgeslagen), datum, van/tot (nieuw 09:00–10:00, eind schuift mee, leeg = een uur; bewerken wiste de eindtijd), klant, project (nieuw), locatie (adres zoeken), notities; "Klant openen" / "Project openen"; klanttijdlijn "Afspraak ingepland: … op 15 okt" zoals het dashboard. Getest: aangemaakt, gecontroleerd in de database, verwijderd. Het dashboard kent geen deelnemers, herinnering of herhaling bij een afspraak
- [ ] Notitielog met @vermeldingen bij een afspraak (dashboard: `comments` + meldingen)
- [ ] Werkbon maken vanuit een afspraak, en "Werkbon inplannen" zonder planningsmodule

### 7. Planning
- [x] Kalender in de stijl van de agenda: weekstrip met dag, datum en stip (tik = die dag), dag/week, per medewerker en per voertuig; periodelabel past op de telefoon
- [x] Niet-ingeplande werkbonnen: tik = inplannen (dag, tijd, ploeg met verantwoordelijke, ook per e-mail) zoals QuickPlanModal. Getest: WB-166 ingepland op 20-10 09:00–12:00 (dag, agenda-item en melding gecontroleerd; blijft ingepland in het testbedrijf)
- [x] Blok aantikken: details, tijd aanpassen per persoon (medewerkersweergave) of per dag (`verzetTijd` van het dashboard), en "Dagen, ploeg en voertuig aanpassen" via het werkbonformulier (zoals de DetailModal). Getest: Daan op WB-161 12-10 naar 08:00 (eigen tijd, melding, planning_wijzigingen, agenda-item) en terug
- [x] iPad-indeling zoals het dashboard: rooster met medewerkers/voertuigen als rijen en dagen als kolommen (bestond al; tijd in smalle kolommen past nu). Slepen en rekken zoals in het dashboard zit er niet in: op een touchscherm via tikken + tijd kiezen
- [x] Zelfde rechten, module en meldingen: pagina recht `planning` + module planning; wijzigen = recht planning + module (`magSlepen`), niet bij alleen-lezen of een ondertekende werkbon; meldingen "verzet"/"ingepland"/"afgehaald" + `planning_wijzigingen` (dagelijkse samenvatting) + toewijzing (optioneel per mail, nieuw ook vanuit het werkbonformulier) + agenda-items; per-dag meldingen bij meerdaagse klussen (ontbrak in de app)

### 8. Werkbon
- [x] Kaartje bovenaan strak en uitgelijnd (knoppen behouden): kop alleen nummer + status (titel liep af en klant stond dubbel), project + Bewerken op één regel, volledige titel, klant als link, feiten in rijen met vaste icoonkolom (locatie, planning, verantwoordelijk, medewerkers, voertuigen), minder witruimte boven
- [x] Planning in de werkbon gecontroleerd tegen dashboard: regels zoals `PlanningRegels` (venster per dag, eigen tijd alleen als die afwijkt, "niemand toegewezen", "geen tijd", voorbije dagen doffer, voertuigregel met inzittenden en bezetting)
- [x] Taken en uren gecontroleerd: taken en meerwerk met een invoerregel onderaan (TakenSection) i.p.v. een venster, tellers in de kop zoals het dashboard; uren-kop "· 23,5u", km ook bij 0
- [x] Foto's: drie knoppen naast elkaar (Voor/Tijdens/Na, met teller), per soort een rij voorbeelden; tik = schermvullend in de app (`FotoViewer`: vegen, pijlen, sluiten, verwijderen) i.p.v. een browsertab. Getest met upload + verwijderen als testgebruiker
- [x] Rest van de werkbon gelijk aan het dashboard (WerkbonPageV2 + WerkbonAfrondenModal): afronden met drie uitkomsten (klant tekent op het toestel via `sign-werkbon`, link per mail met de PDF als bijlage, zonder handtekening) en "Laten ondertekenen"; "Werkbon als PDF" (byte-gelijk aan het dashboard, `npm run pdf:vergelijk-werkbon`); ondertekende bon via `document-url` + vangnet `getekende-pdf-nazenden`; Kosten (inkopen) met recht `kosten` + module; Wkb-waarschuwing; @-vermeldingen in notities; materiaalregels inline bewerken; foto verwijderen: eerst het bestand, dan de rij. Screenshots: `docs/screenshots/werkbon/`

### 9. Pipeline en projectkaart
- [x] Aanvraag prominent: eigen kaart met groene rand, tekst in een groen vak "Wat de klant vraagt" (na feedback 15-10), websitevelden zoals het dashboard, Bel/Mail/Route
- [x] Redesign eerste blok (fase, toegewezen aan, …) — getoond en akkoord 15-10 (`docs/screenshots/projectkaart-voorstel/`). Oorzaak leeg vlak: `flexBasis: 140` van een veld in een kolom
- [ ] Alle functies van de projectkaart in het dashboard

### 10. Projecten
- [ ] Projectkaart (zie 9)
- [x] Filter onthouden (zie 1)
- [x] Bedragwidgets iets meer kleur: totale projectwaarde groen, te factureren amber (als er iets openstaat), zoals "nog te factureren" in het dashboard

### 11. Relaties en klantkaart
- [x] Adres zoeken (zie 4)
- [x] Route naar kaartenapp (zie 3)

### 12. Uren
- [ ] Werking gecontroleerd tegen dashboard
- [x] Melding werkbonuren vs werkdaguren alleen als het bedrijf uren bijhoudt + uitleg. Voorstel en gebouwd: de oranje meldingen ("Werkdaguren ontbreken", "Uren kloppen niet", "!" in de weekbalk) zijn weg; daarvoor in de plaats de herinnering van het dashboard als kaart "Vul je werkdag in" (homepage en Uren): alleen als de urenherinnering aan staat (Instellingen › Standaardwaarden), niet voor de eigenaar/admin, niet zonder personeel, niet voor uitgesloten medewerkers, alleen op herinneringsdagen; dagen waarop je ingepland stond (werkbondag in je ploeg of activiteit) zonder werkdaguren, laatste 14 dagen; met uitleg werkdag- vs werkbonuren, "Invullen" opent Uren schrijven op die dag, "Later" verbergt hem voor het ingestelde interval. Getest: Pieter (medewerker) 12 open dagen, gelijk aan het dashboard; Niels (admin) geen kaart
- [ ] Wat ontbreekt t.o.v. dashboard

### 13. Materialen
- [ ] Gecontroleerd tegen dashboard

### 14. Offertes
- [x] Widget "Geaccepteerd" groen (aantal en bedrag)
- [x] Openen: zijmarges in het detailpaneel (inhoud scrolt nu ook), geen printscherm meer, dezelfde PDF als het dashboard (A4; byte-gelijk getest op BB-149 en BB-F140, pdfOpbouw.js uit het dashboard overgenomen met een test die afwijkingen meldt), terug met het kruisje
- [x] PDF-weergave schermvullend met tik-laag (`PdfWeergave`): kruisje, Delen (iPhone/iPad: deelmenu met Druk af), Printen als aparte knop waar delen niet kan printen (Android, computer). Pagina's als A4 onder elkaar, knijpen om te zoomen. Op web via iframe, in de app via WebView, zelfde pagina (pdf.js)
- [ ] Alle functies gecontroleerd

### 15. Facturen
- [x] Zelfde PDF-weergave en fixes als offertes; "PDF bekijken" toont het bewaarde bestand (wat de klant kreeg, of het origineel uit de boekhouding) en anders de PDF zoals het dashboard hem maakt — gelijk aan de paperclip in het dashboard
- [x] Groen voor betaald (tegel "Betaald deze maand")
- [ ] Alle functies gecontroleerd

### 16. Kosten
- [ ] Werking, totalen en filters gecontroleerd

### 17. Wat ik vergeten ben
- [ ] Hele app nogmaals langs, elke pagina en elk venster tegen het dashboard

## Zelf gevonden (naast de punten hierboven)

- [x] Facturen: tegel "Openstaand" en "Verlopen"/te-laat rekenden anders dan het dashboard (concepten en creditnota's telden mee). Nu `isVerlopen` en `openstaandPerFactuur` van het dashboard (audit H9/M18); getest: 164 · € 0 · 19 verlopen, gelijk aan het dashboard
- [x] Offerte-/factuurdetail: inhoud scrolde niet (lange offertes vielen weg) en had geen zijmarges
- [x] Projectkaart: geen route-knop → Bel/Mail/Route in het aanvraagblok
- [x] Werkbon: route-knop bouwde een eigen Google-link (iOS opende een webpagina)
- [x] iPad in de app: `supportsTablet` aan, iPad alle standen (staand en liggend), iPhone blijft staand, Android-telefoons staand (vergrendeld bij starten), tablets draaien mee. De tabletindeling werkt nu ook in de app (was alleen web), met dezelfde gecentreerde kolom als de webapp (`MobielKader`). Werkt pas na een nieuwe build — niet zelf gebouwd of gepubliceerd
- [x] Weergave "Zoals het apparaat" volgde in de app nooit donker: `userInterfaceStyle` stond op `light`; nu `automatic`

## Testomgeving (tijdelijk)

- [ ] TEST Stamvol Bouw BV staat sinds 15-10 tijdelijk op **Team** (was Groei) om planning, meerdaagse klussen en voertuigen te testen — akkoord gebruiker 15-10. **Terugzetten naar Groei** als het testen klaar is (`subscriptions.plan`, notitie op de rij).

## Database en edge functions

Niets veranderd. Wat een wijziging zou vragen staat hier, met reden, en wacht op
akkoord.

## Rapport homepage (widget naast dashboard)

Getest op 15-10-2026 in TEST Stamvol Bouw BV, als Niels Grevink (admin) en Pieter
Jansen (medewerker), app en dashboard naast elkaar.

| Widget | Dashboard | App vóór | App na |
|---|---|---|---|
| Open pipeline (Niels) | € 119,1k · 23 deals | € 119.097 · 23 | gelijk |
| Geaccepteerd (Niels) | € 2,6 mln · 86 deals | € 2.596.230 · 86 | gelijk |
| Klanten (Niels) | 158 | 158 | gelijk |
| Nieuwe aanvragen (Niels) | 12 · € 36,1k | 12 · € 36.098 | gelijk |
| Open offertes (Niels) | 66 · € 876.293 | 66 · € 876.293 | gelijk |
| Omzet deze maand (Niels) | € 0 | € 0 | gelijk |
| Openstaande facturen (Niels) | niet op zijn dashboard; zelfde regel in SQL: 19 · € 138.310,98 · 19 te laat | € 138.311 · 19 · 19 te laat | gelijk |
| Activiteiten vandaag (Niels) | 0 vandaag · 22 te laat | 22 te laat | gelijk |
| Activiteiten vandaag (Pieter) | 1 vandaag · 17 te laat | 17 te laat, activiteit van vandaag **niet zichtbaar** (8 te late erboven) | vandaag bovenaan |
| Afspraken vandaag (Niels, admin) | 1 eigen | 3 (hele bedrijf) | 1 |
| Werkbonnen vandaag (admin) | alleen eigen, per geplande dag | hele bedrijf, alleen op `gepland_op` (dag 1) | eigen, per geplande dag |
| Uren deze week (Pieter) | 0 u | 0 u | gelijk (zelfde bron) |

"1 te laat" vs 4 (BossBase Admin, Rayvon): 1 activiteit aan Rayvon, 3 oude aan
niemand. De dashboardtegel telt ook 1; de 4 is de zijbalkteller die alles telt.
Keuze gebruiker (15-10): de app telt eigen + aan niemand toegewezen.

Niet live getest: een werkbon die vandaag op dag 2+ van een meerdaagse klus staat.
Meerdaagse klussen vragen de planningsmodule, die TEST Stamvol (Groei) niet heeft;
testdata in productie aanmaken is niet gedaan. Afgedekt met een unit-test
(`tests/urenPlanning.test.mjs`).

## Voortgangslog

- 15-10 — Planning: bewerken (tijd, inplannen), agenda-look, meldingen per dag, mail bij toewijzen.
- 15-10 — Branch aangemaakt. Homepage: thema naar Instellingen, Boss-hoofd,
  widgets vergeleken en gefixt (commit 8a87a4d). Onderzoek per onderdeel gestart.
