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

- [ ] 1. Filters (en tabbladen) onthouden per gebruiker op elke lijstpagina
- [ ] 2. "bus/bussen" → "voertuig/voertuigen" in de hele app
- [ ] 3. Route-knop opent de kaartenapp (Apple Kaarten; Google Maps als geïnstalleerd of op Android), overal
- [ ] 4. Adres zoeken zoals het dashboard in elk adresformulier

## Per pagina

### 5. Homepage
- [x] Donkere modus uit de kop, keuze in Instellingen › Mijn profiel › Weergave
- [x] Boss rechtsboven: zijn hoofd (`boss-gids.png` uit de rondleiding)
- [x] Widgets vergeleken met het dashboard en afwijkingen gefixt (zie Rapport homepage)
- [x] Widget "Nieuwe aanvragen": nieuwste 6 uit de eerste fase (zoals de dashboardtegel), rij → projectkaart, kop en voet → pipeline; de KPI-tegel "Nieuwe aanvragen" onder Overzicht is vervallen (dubbel)

### 6. Agenda
- [ ] Inhoud (afspraken, werkbonnen, ingeplande activiteiten) gelijk aan dashboard
- [ ] Weergaven gelijk
- [ ] Afspraak aanmaken/wijzigen met alle velden van het dashboard

### 7. Planning
- [ ] Kalender in de stijl van de agenda (dag/week, per medewerker en per voertuig)
- [ ] Niet-ingeplande werkbonnen
- [ ] Werkbon aantikken: dag, tijden, ploeg, verantwoordelijke, voertuig wijzigen
- [ ] iPad-indeling dichter bij het dashboard
- [ ] Zelfde rechten, module en meldingen als het dashboard

### 8. Werkbon
- [ ] Kaartje bovenaan strak en uitgelijnd (knoppen behouden)
- [ ] Planning in de werkbon gecontroleerd tegen dashboard
- [ ] Taken en uren gecontroleerd
- [ ] Foto's: drie knoppen naast elkaar (voor/tijdens/na) + rij voorbeelden per soort
- [ ] Rest van de werkbon gecontroleerd

### 9. Pipeline en projectkaart
- [ ] Aanvraag prominent
- [ ] Redesign eerste blok (fase, toegewezen aan, …) — **eerst laten zien**
- [ ] Alle functies van de projectkaart in het dashboard

### 10. Projecten
- [ ] Projectkaart (zie 9)
- [ ] Filter onthouden (zie 1)
- [ ] Bedragwidgets iets meer kleur

### 11. Relaties en klantkaart
- [ ] Adres zoeken (zie 4)
- [ ] Route naar kaartenapp (zie 3)

### 12. Uren
- [ ] Werking gecontroleerd tegen dashboard
- [ ] Melding werkbonuren vs werkdaguren alleen als het bedrijf uren bijhoudt + uitleg
- [ ] Wat ontbreekt t.o.v. dashboard

### 13. Materialen
- [ ] Gecontroleerd tegen dashboard

### 14. Offertes
- [ ] Widget "Geaccepteerd" groen
- [ ] Openen: spacing, geen printscherm, dezelfde PDF als het dashboard (A4), terug kunnen
- [ ] PDF-weergave schermvullend met tik-laag (sluiten, delen, evt. printen)
- [ ] Alle functies gecontroleerd

### 15. Facturen
- [ ] Zelfde PDF-weergave en fixes als offertes
- [ ] Groen voor betaald
- [ ] Alle functies gecontroleerd

### 16. Kosten
- [ ] Werking, totalen en filters gecontroleerd

### 17. Wat ik vergeten ben
- [ ] Hele app nogmaals langs, elke pagina en elk venster tegen het dashboard

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

- 15-10 — Branch aangemaakt. Homepage: thema naar Instellingen, Boss-hoofd,
  widgets vergeleken en gefixt (commit 8a87a4d). Onderzoek per onderdeel gestart.
