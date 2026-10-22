# App verbeteren — checklist en voortgang

Branch: `app-verbeteren` (vanaf `main`). Alleen deze branch wordt gepusht; niets
naar `main`, geen nieuwe app- of PWA-versie. Het dashboard (`~/BossBase`) is alleen
voorbeeld. Testen alleen met testbedrijven (TEST Stamvol Bouw BV).

Legenda: `[x]` klaar · `[ ]` open · `[~]` bewust open (met reden)

## Formaten (elke pagina)

Minimaal: iPhone SE (375×667), iPhone 12/13/14 (390×844), iPhone 17 Pro Max
(440×956), iPad mini (744×1133), iPad Air (820×1180), iPad Pro 12,9" (1024×1366),
iPad staand en liggend. Screenshots in `docs/screenshots/`.

- [x] Screenshots van de belangrijkste schermen per formaat: 16 schermen × 9 formaten (iPhone SE, 13, 17 Pro Max; iPad mini/Air/Pro 12.9 staand en liggend) in `docs/screenshots/formaten/`, gemaakt met `scripts/screenshots-formaten.mjs`. Plus per onderdeel in `docs/screenshots/{projectkaart,werkbon,documenten,financien,registratie,klantkaart}/`
- [x] Spacing zijkanten, uitlijning, niets afgesneden — per pagina nagelopen op alle formaten: geen horizontale scroll, juiste schermen. Gevonden en opgelost: KPI-tegels Projecten vielen op een tablet buiten beeld (ee05310), ⋮-menu pipeline zonder zijmarge (02459dc)

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
- [x] Notitielog met @vermeldingen bij een afspraak (`calendar_events.comments`, zelfde vorm als het dashboard; melding met link naar de agenda). Getest met één notitie zonder tag op "Sollicitatiegesprek" (blijft staan: een notitie verwijderen kan ook in het dashboard niet) (e2554e5)
- [x] Werkbon maken vanuit een afspraak ("Werkbon aanmaken": titel, klant, project, datum, tijden, locatie; daarna gekoppeld, met de deelnemer van de afspraak of anders de maker als uitvoerder en verantwoordelijke) of "Werkbon openen". Getest: WB-221 uit "Sollicitatiegesprek" — blijft staan, want werkbonnen verwijderen kan in app en dashboard niet. Eigen afspraken zonder klant waren in de weekweergave niet aan te tikken; opgelost (e2554e5)

### 7. Planning
- [x] Kalender in de stijl van de agenda: weekstrip met dag, datum en stip (tik = die dag), dag/week, per medewerker en per voertuig; periodelabel past op de telefoon
- [x] Niet-ingeplande werkbonnen: tik = inplannen (dag, tijd, ploeg met verantwoordelijke, ook per e-mail) zoals QuickPlanModal. Getest: WB-166 ingepland op 20-10 09:00–12:00 (dag, agenda-item en melding gecontroleerd; blijft ingepland in het testbedrijf)
- [x] Blok aantikken: details, tijd aanpassen per persoon (medewerkersweergave) of per dag (`verzetTijd` van het dashboard), en "Dagen, ploeg en voertuig aanpassen" via het werkbonformulier (zoals de DetailModal). Getest: Daan op WB-161 12-10 naar 08:00 (eigen tijd, melding, planning_wijzigingen, agenda-item) en terug
- [x] iPad-indeling zoals het dashboard: rooster met medewerkers/voertuigen als rijen en dagen als kolommen (bestond al; tijd in smalle kolommen past nu). Slepen en rekken zoals in het dashboard zit er niet in: op een touchscherm via tikken + tijd kiezen
- [x] Totaal zoals het dashboard (standaardweergave): iedereen tegelijk per dag op tijd, één blok per persoon in de dagploeg in diens kleur, "niet toegewezen" grijs, plus activiteiten met een toewijzing (zzp: alle); ook in Medewerkers staan nu de activiteiten (Voertuigen niet, zoals het dashboard). Dubbel-driehoek ook bij een botsing met een activiteit (`dubbeleBoekingen`). Telefoon: per dag een lijst; iPad: dagen als kolommen. Activiteit aantikken = het activiteitenvenster, met het agenda-item erna bijgewerkt. Getest op 390×844, 820×1180 en 1180×820 (`shots-planning/`)
- [x] Los iets inplannen zonder werkbon: "+" rechtsboven = Activiteit inplannen (PlanActivityModal): titel, type (Bellen/Bezoek/Vergadering / Klus/Overig), klant, datum, begin (eind +15 min tot zelf gekozen), medewerkers, ook per mail, locatie (adres van de klant voorgesteld), notities met @, werkbon van de klant koppelen. Zelfde tabellen als het dashboard: `activities`, agenda-item in `calendar_events` (herkomst planning), melding `toewijzing_activiteit` met link planning, `werkbonnen.activity_id`. Geen afspraakbevestiging aan de klant (het dashboard stuurt die hier ook niet). Getest: aangemaakt, agenda-item, melding (mail onderschept) en koppeling gecontroleerd, daarna opgeruimd
- [x] Meerdere dagen, dagploeg en voertuigen direct in de planning (de tekst "Dat doe je in de werkbon zelf" is weg): inplannen en "Dagen, ploeg en voertuig aanpassen" op een blok openen hetzelfde paneel als de DetailModal: kalender met dagen en tijden per dag, wie werkt welke dag, ploeg met verantwoordelijke, en met de module voertuigen per voertuig de dagen, een eigen tijd en wie er meerijdt, met de toetsen van de database (vol, buiten de voertuigtijd, al op een andere werkbon). Opslaan zoals het werkbonformulier (`bb_werkbon_dagen_zetten` met de voertuigsleutels, meldingen per dag, agenda). De kalender en dagkaarten van het werkbonformulier zijn één onderdeel geworden (`WerkbonDagenVelden`). Getest: WB-004 op di 20 + wo 21 (wo alleen de monteur, Bus 2 alleen di met de monteur erin), daarna do 22 erbij vanuit een blok; database, agenda-items en meldingen gecontroleerd, daarna teruggezet naar niet ingepland
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
- [x] Alle functies van de projectkaart in het dashboard: tabs Offertes/Facturen/Uren/Kosten/Werkbonnen/Notities met dezelfde rechten en pakketfeatures, offerte koppelen of nieuw maken, factuur/werkbon vanuit het project (vooringevuld, terug naar het project), inkopen toevoegen/bewerken/verwijderen, kostprijs en "brutowinst vóór arbeid", foto's bij de aanvraag, klantgegevens bewerken, behandelaars met melding, @-vermeldingen in notities. Getest als admin en als monteur (alleen Overzicht/Uren/Werkbonnen/Notities, niets bewerkbaar); testdata opgeruimd (`docs/screenshots/projectkaart/`)
  - Bewust anders: klantgegevens in één venster i.p.v. per veld; geen "nieuwe leverancier" binnen een inkoop; "Opslaan en versturen" (offerte/factuur mailen) blijft in het dashboard; @-tag alleen aan het eind van de tekst herkend

### 10. Projecten
- [x] Projectkaart (zie 9)
- [x] Filter onthouden (zie 1)
- [x] Bedragwidgets iets meer kleur: totale projectwaarde groen, te factureren amber (als er iets openstaat), zoals "nog te factureren" in het dashboard

### 11. Relaties en klantkaart
- [x] Adres zoeken (zie 4)
- [x] Route naar kaartenapp (zie 3)

### 12. Uren
- [x] Werking gecontroleerd tegen dashboard: twee soorten gescheiden en nooit opgeteld, alleen werkdaguren bewerkbaar, collega's alleen met admin/planning (zelfde regel als de database), pauze en km. Nieuw: Week/Maand (onthouden); getest: team september 749,5 u werkdag en 254 u werkbon, gelijk aan de database
- [x] Melding werkbonuren vs werkdaguren alleen als het bedrijf uren bijhoudt + uitleg. Voorstel en gebouwd: de oranje meldingen ("Werkdaguren ontbreken", "Uren kloppen niet", "!" in de weekbalk) zijn weg; daarvoor in de plaats de herinnering van het dashboard als kaart "Vul je werkdag in" (homepage en Uren): alleen als de urenherinnering aan staat (Instellingen › Standaardwaarden), niet voor de eigenaar/admin, niet zonder personeel, niet voor uitgesloten medewerkers, alleen op herinneringsdagen; dagen waarop je ingepland stond (werkbondag in je ploeg of activiteit) zonder werkdaguren, laatste 14 dagen; met uitleg werkdag- vs werkbonuren, "Invullen" opent Uren schrijven op die dag, "Later" verbergt hem voor het ingestelde interval. Getest: Pieter (medewerker) 12 open dagen, gelijk aan het dashboard; Niels (admin) geen kaart
- [x] Wat ontbreekt t.o.v. dashboard: maandweergave (toegevoegd), de herinnering "Vul je werkdag in" (toegevoegd, zie hierboven). Bewust anders: geen "Alles"/"Dag" (dag zit in de week, "alles" is op een telefoon geen werkbare lijst); de app houdt de norm van 8 u per dag en de chip "Open"

### 13. Materialen
- [x] Gecontroleerd tegen dashboard: zoeken, eenheden, marge, inkoopprijs alleen met recht, leverancier verplicht, btw, actief/inactief, verwijderen met uitleg — gelijk. Niets aangepast

### 14. Offertes
- [x] Widget "Geaccepteerd" groen (aantal en bedrag)
- [x] Openen: zijmarges in het detailpaneel (inhoud scrolt nu ook), geen printscherm meer, dezelfde PDF als het dashboard (A4; byte-gelijk getest op BB-149 en BB-F140, pdfOpbouw.js uit het dashboard overgenomen met een test die afwijkingen meldt), terug met het kruisje
- [x] PDF-weergave schermvullend met tik-laag (`PdfWeergave`): kruisje, Delen (iPhone/iPad: deelmenu met Druk af), Printen als aparte knop waar delen niet kan printen (Android, computer). Pagina's als A4 onder elkaar, knijpen om te zoomen. Op web rechtstreeks in de pagina met pdf.js van het eigen domein (`public/pdfjs/`), in de app via WebView (pdf.js)
- [x] "PDF bekijken" werkte niet op de PWA (bleef op "PDF laden…"): de iframe erfde de CSP van vercel.json (`script-src 'self'`), waardoor het ingebouwde script en pdf.js van cdnjs werden geblokkeerd; op de devserver (zonder CSP) leek het te werken. Nu tekent web zelf in de pagina met pdf.js (legacy-build 4.10.38) uit `public/pdfjs/`, binnen de bestaande CSP (geen wijziging). Getest op een lokale productiebuild met de headers van vercel.json: Chromium en WebKit, 390×844, 820×1180, 1180×820 — BB-001, BB-002, BB-F001, BB-F003, 0 CSP-meldingen. Native: zie Voortgangslog (nieuwe build nodig)
- [x] Eén knop "Bekijken" i.p.v. "PDF bekijken" + "Getekende offerte": getekend → het bewaarde ondertekende exemplaar met handtekening (`offerte-pdf-url`, bucket `signed-offertes`), anders de opgebouwde PDF. Facturen ook "Bekijken" (geïmporteerd blijft "Origineel document"); projectkaart › Offerte toont nu ook het getekende exemplaar. Getest: BB-002 haalt `signed-offertes/…` op en toont 2 pagina's met handtekening
- [x] Alle functies gecontroleerd en toegevoegd: versturen per mail (sjabloon, PDF als bijlage, ondertekenlink alleen met `digitale_handtekening`, archief + tijdlijn, concept → verzonden met bevroren bedrijfsgegevens), bewerken/herzien (-v2, oude vervalt)/status, kopiëren (nieuwe versie of andere klant, met limiet), "Maak factuur" met de regels van de offerte, verwijderen alleen vóór akkoord, vangnet getekende PDF. Mail-HTML byte-gelijk aan het dashboard (`docs/screenshots/documenten/`)
  - Bewust anders: mailtekst als platte tekst (een sjabloon met opmaak wordt leesbare tekst); geen Stripe-upsell-venster na versturen (nieuw ontwerp); losse "Regels"-sheet opgegaan in Bewerken

### 15. Facturen
- [x] Zelfde PDF-weergave en fixes als offertes; "Bekijken" toont het bewaarde bestand (wat de klant kreeg, of het origineel uit de boekhouding) en anders de PDF zoals het dashboard hem maakt — gelijk aan de paperclip in het dashboard
- [x] Groen voor betaald (tegel "Betaald deze maand")
- [x] Alle functies gecontroleerd en toegevoegd: versturen per mail met PDF (eerst bewaard in `factuur-pdfs`) en Stripe-betaallink als het pakket dat heeft, PDF bewaren bij verzonden/betaald (opnieuw naar de boekhouding), herinnering 1 en 2 (zelfde voorwaarden), gedeeltelijk crediteren per regel, kopiëren, verwijderen alleen concept/geïmporteerd. Betaaltermijn nu klant → Instellingen → 14 dagen (gebruikte ten onrechte de geldigheid van offertes); onvolledige klant blokkeert; betalingskenmerk bewerkbaar
  - Bewust anders: gedeeltelijk crediteren met aantal 0 geeft een melding (dashboard crediteert stil 1); statuswissel van een verzonden factuur zit onder Bewerken

### 16. Kosten
- [x] Werking, totalen en filters gecontroleerd: weergave kosten/materiaal, periode, klant- en categoriefilter en tegels rekenen gelijk aan het dashboard; weergave en periode worden nu onthouden (zie 1)
- [x] Bon toevoegen (ontbrak: "kan alleen in het dashboard"): foto maken of kiezen, meerdere mogelijk, zelfde opslag als het dashboard (`kosten-bijlagen/{bedrijf}/…`, paden in `bijlage_url`); "bon verplicht" per categorie nu afgedwongen met de tekst van het dashboard; bon bekijken in de app; bij verwijderen gaat de bon ook uit de opslag (zoals het dashboard). Getest: aangemaakt met bon, database en opslag gecontroleerd, bekeken, verwijderd (bestand ook weg). PDF als bon kan in de app niet (alleen foto's)
- [x] Bedragen met centen zoals het dashboard (`fmt`); de app rondde af op hele euro's (€ 12,50 → € 13)

### 17. Wat ik vergeten ben
- [x] Hele app nogmaals langs, elke pagina en elk venster tegen het dashboard (de punten hieronder kwamen daaruit)
Uit de rondgang (15-10), op volgorde van impact:
- [x] Activiteiten: melding (en optioneel mail) bij toewijzen; meerdere toegewezenen (bewerken in de app overschreef ze); eindtijd en project; status bij aanmaken; 09:00 als begin; bijbehorend agenda-item bijwerken. Getest: alleen de nieuw toegewezene kreeg de melding, testactiviteit en agenda-item verwijderd (357789c)
- [x] Activiteiten: afspraakbevestiging per mail bij een nieuw bezoek (`triggerAutoEmail`: sjabloon van het bedrijf of de standaard, uitgezet = niets, archief, mailfout vastgelegd). Getest met testklant Bram van Dijk (eigen alias), testbezoeken verwijderd (69a4c64)
- [x] Registratie in de app gelijk aan het dashboard: pakketkeuze (Groei/Team) i.p.v. rolkeuze, bedrijf met branche/telefoon/KvK, wachtwoordeisen + herhalen, akkoordtekst met links (geen voorgevinkt vakje), akkoord vastleggen, 6-cijferige code (`verify-code` maakt het bedrijf), en wie onbevestigd inlogt krijgt het codescherm (6a69bc3). Ongetest: een echte aanmelding tegen productie (zou een bedrijf aanmaken en mail sturen), native
- [x] Nieuwe werkbon: maker standaard uitvoerder en verantwoordelijke (zoals het dashboard) (8354544)
- [x] Nieuwe aanvraag: e-mail en telefoon van een nieuwe klant, en de ontvangstbevestiging (`aanvraag_ontvangen`) aan een bestaande klant, zoals het dashboard. Getest met Bram van Dijk (eigen alias); de testaanvraag kon niet weg (aanvragen verwijderen kan nergens) en staat op Verloren met toelichting (014efed)
- [x] Klantkaart: "+" bij offerte/factuur/project opent een nieuw item met de klant ingevuld, met dezelfde rechten (0852a7b)
- [x] Klantkaart: E-mails (schrijven met sjabloon, versturen, bekijken, archief + tijdlijn) en Tijdlijn (iconen/kleuren per type) als blokken op de klantkaart (b028fd0). Bewust anders: platte tekst i.p.v. opmaak-editor
- [x] @-vermeldingen met melding in notities: werkbon, project, afspraak (notitielog), activiteit (nieuw: in het veld; bestaand: notitielog `activiteit_notities`, zoals het dashboard) (67a50cd). Klant: zie klantkaart-branch
- [x] Klantnotities met @-vermeldingen; alle notitievelden gebruiken nu één `MentionInvoer` (1d721b3)
- [x] Instellingen: standaard betaaltermijn facturen en branche toegevoegd (getest: 14 → 30 → 14) (f3927ef); integraties: alleen de status, koppelen op het dashboard (stond er al)
- [ ] Instellingen › Websiteformulier — **bewust open**: een wizard van vijf stappen om insluitcode op je website te plakken (WordPress, Wix, …); dat is werk achter een computer, niet op een telefoon. Aanvragen die binnenkomen staan wél in de app (pipeline, projectkaart)
- [x] Menu: Financiën — nieuwe pagina, gelijk aan het dashboard (periodes, zes tegels uit `bb_financien_kpi`, omzetgrafiek, per klant), recht `bedrijfsfinancien`; getallen gecontroleerd tegen de database (473205b). Bewust weg: Excel-export en het btw-blok (blijven in het dashboard)
- [x] Wachtwoord vergeten in de app: resetlink aanvragen via `request-password-reset`, zoals het dashboard; de link in de mail opent de website om het nieuwe wachtwoord in te stellen (197124f)
- [ ] Database: bulkmail, Excel, ZIP met PDF's — **bewust open**: exports en bulkacties zijn werk achter een computer; de app verwijst daarvoor naar het dashboard
- [x] Relaties: type (Particulier/Zakelijk/VvE/Aannemer), bron en betaaltermijn per klant ontbraken. Nieuwe klant: type + bron (standaard Zakelijk/Handmatig, zoals het dashboard); bewerken: alle drie, ook zichtbaar op de klantkaart. Getest op een testklant en teruggezet

## Zelf gevonden (naast de punten hierboven)

- [x] Facturen: tegel "Openstaand" en "Verlopen"/te-laat rekenden anders dan het dashboard (concepten en creditnota's telden mee). Nu `isVerlopen` en `openstaandPerFactuur` van het dashboard (audit H9/M18); getest: 164 · € 0 · 19 verlopen, gelijk aan het dashboard
- [x] Offerte-/factuurdetail: inhoud scrolde niet (lange offertes vielen weg) en had geen zijmarges
- [x] Projectkaart: geen route-knop → Bel/Mail/Route in het aanvraagblok
- [x] Werkbon: route-knop bouwde een eigen Google-link (iOS opende een webpagina)
- [x] iPad in de app: `supportsTablet` aan, iPad alle standen (staand en liggend), iPhone blijft staand, Android-telefoons staand (vergrendeld bij starten), tablets draaien mee. De tabletindeling werkt nu ook in de app (was alleen web), met dezelfde gecentreerde kolom als de webapp (`MobielKader`). Werkt pas na een nieuwe build — niet zelf gebouwd of gepubliceerd
- [x] Pipeline: het ⋮-menu had geen zijmarge (opties tegen de rand) (02459dc)
- [x] Web/PWA: horizontaal scrollen (filterchips, tabs, weekstrook) sprong na elke veeg terug naar het begin — `zichtbareViewport` zette elk element met `overflow-y: hidden` terug, ook horizontale ScrollViews. Nu per as. De actieve chip schuift ook vanzelf in beeld (ba15ad4)
- [x] Weergave "Zoals het apparaat" volgde in de app nooit donker: `userInterfaceStyle` stond op `light`; nu `automatic`

## Testomgeving (tijdelijk)

- [x] TEST Stamvol Bouw BV stond 15-10 tijdelijk op Team om planning, meerdaagse klussen en voertuigen te testen (akkoord gebruiker). Teruggezet naar **Groei** en de notitie opgeschoond (15-10, na een droogloop)

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

- 22-10 — Groene gloed weg rond knoppen (primaire knop, FAB, + in de kop, onboarding). Weergave: nieuwe opslagsleutel `bb.weergave`; de oude `bb.colorMode` (ook gevuld door de vroegere themaknop in de kop) wordt gewist, dus iedereen start eenmalig op "Zoals het apparaat". Getest op de PWA-build als Claude Eigenaar, telefoon 390×844 en iPad 820×1180 / 1180×820. Native app niet getest (geen simulator); die krijgt het pas met een nieuwe build.
- 17-10 — Donkere modus: de balk achter het Dynamic Island bleef wit. html en body volgen nu het thema van de app, niet alleen `theme-color` (dc04ac8). Commits gaan voortaan met `info@bossbase.nl` (GitHub-account BossBase); de app-repo staat tijdelijk openbaar zodat Vercel op een push uitrolt.
- 16-10 — Eindtest op de preview (productiebuild met de echte Vercel-headers), als Claude Eigenaar in Test Account Claude, telefoon 390×844 en iPad 820×1180 / 1180×820:
  - Totaal-overzicht met dubbelboekingen.
  - WB-004 ingepland op twee dagen, met een dagploeg en Bus 2 alleen op de eerste dag.
  - Zonder ster wordt de eerste uitvoerder verantwoordelijk, zoals de planning van het dashboard; dat is hier gecorrigeerd.
  - "Bekijken" bij BB-001, BB-002 (getekend, met handtekening) en BB-F002.
  - Geen mail verstuurd.
  - Daarna naar `main`.
- 16-10 — PDF bekijken bij offertes en facturen opgelost (branch `app-pdf`). Oorzaak op de PWA: de PDF-iframe erfde de CSP en mocht zijn eigen script en pdf.js van cdnjs niet draaien; nu pdf.js van het eigen domein, zonder iframe, CSP ongewijzigd. Eén knop "Bekijken" (getekend = ondertekend exemplaar). Werkt op de PWA na deploy. Native: de enige iOS-build (20-09) is van vóór `react-native-webview` (15-10), en er is geen Android-build — de PDF-weergave werkt daar pas na een nieuwe native build; geen OTA-update op runtime 0.1.0 publiceren zonder die build.
- 16-10 — Planning: Totaal (iedereen, met activiteiten), Activiteit inplannen zonder werkbon, en meerdere dagen, dagploeg en voertuigen per dag direct in de planning, alles zoals het dashboard (dat kon het al; daar niets veranderd). Getest als Claude Planner in Test Account Claude op telefoon en iPad staand/liggend; testdata opgeruimd. Branch `app-planning`.
- 16-10 — Werkbon uit een afspraak krijgt de deelnemer van de afspraak (anders de maker) als uitvoerder en verantwoordelijke, zodat de klus in de agenda blijft; ook in het dashboard (main, c4047e7) en in de kennisbank van Boss. Getest in de preview: WB-222 uit Pieters afspraak, aangemaakt door Sandra, kreeg Pieter als uitvoerder en verantwoordelijke en bleef in de agenda staan. Het dashboard kon niet meer live getest worden, omdat TEST Stamvol tijdens de test door een andere sessie is verwijderd (zoals gepland). Preview van deze branch: https://bossbase-app-preview.vercel.app, een apart Vercel-project; de live app is niet geraakt.
- 15-10 — Klantkaart en Financiën samengevoegd, screenshots op alle formaten nagelopen (KPI-tegels Projecten op tablet opgelost), testbedrijf terug op Groei. Klaar: alles afgevinkt behalve twee punten die bewust open staan (websiteformulier, database-exports).
- 15-10 — Registratie samengevoegd; agenda (werkbon uit afspraak, notitielog), nieuwe werkbon en nieuwe aanvraag gelijk aan het dashboard.
- 15-10 — Documenten- en werkbon-branches samengevoegd; klantkaart "+", wachtwoord vergeten, afspraakbevestiging. Financiën en registratie uitbesteed aan agents.
- 15-10 — Activiteiten af (meerdere toegewezenen, melding). Projectkaart-branch samengevoegd. Bug horizontaal scrollen op web gevonden en opgelost.
- 15-10 — Planning: bewerken (tijd, inplannen), agenda-look, meldingen per dag, mail bij toewijzen.
- 15-10 — Branch aangemaakt. Homepage: thema naar Instellingen, Boss-hoofd,
  widgets vergeleken en gefixt (commit 8a87a4d). Onderzoek per onderdeel gestart.
