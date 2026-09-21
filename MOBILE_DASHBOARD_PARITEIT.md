# Dashboardpariteit — mobiel vs. `origin/main`

Opgesteld op **2026-09-15**, vóór de wijzigingsronde. Bron voor de dashboardkant
is uitsluitend `origin/main` van `/Users/macbook/BossBase website` (read-only
ingezien; de lokale checkout liep 2 commits achter). Bron voor het live schema
zijn read-only PostgREST-probes met de anon-key: een select op een niet-bestaande
kolom geeft 42703, op een niet-bestaande tabel PGRST205 — zonder ook maar één rij
te lezen of te schrijven.

| Functie | Dashboardbron | Mobiele bron | Tabel/RPC | Rechten | Feature | Verschil (vóór) | Oplossing |
|---|---|---|---|---|---|---|---|
| Uren via werkbon | `WerkbonDetail` → `werkbonUrenService` | `app/hours/new.tsx` → `werkbonUrenService.createWerkbonUur` | `werkbon_uren` | `canBookHours()`: uitvoerder, verantwoordelijke, admin of planner; niet op een ondertekende bon | — | Werkbonlijst stond inline en volledig uitgeklapt bovenaan | Compacte `SelectField` met zoekblad (nummer, titel, klant) |
| Overige uren | Urenstaat → `urenregistratie` | `app/hours/new.tsx` → `timeEntryService.createWerkdagUur` | `urenregistratie` | policy `urenregistratie_insert`: eigen rij binnen het bedrijf (admin/planner breder) | — | Keuze stond ónder de werkbonlijst | Keuze `Werkbon`/`Overig` staat bovenaan, vóór alle velden |
| Offerte aanmaken | `OffertesPage.NewOfferteModal` → `offerteService.createOfferte` + `createOfferteItem` | `app/(more)/offers.tsx` → `offerteService` | `offertes` + `offerte_items` | recht `offertes`; regels: rol admin/planner | pakketlimiet `offertes` | Mobiel maakte alleen de kop; regels moesten daarna één voor één, zonder type/btw-regime, en de totalen kwamen uit de vervallen velden | `RegelEditor` in het aanmaakformulier; kop + regels in één handeling met dezelfde berekening |
| Factuur aanmaken | `FacturenPage.NewFactuurModal` → `factuurService.createFactuur` + `createFactuurRegel` | `app/(more)/invoices.tsx` → `factuurService` | `facturen` + `factuur_regels` | recht `facturen`; regels: rol admin/planner | pakketlimiet `facturen` | Idem: kop zonder regels, totalen 0 | Idem, met `createFactuurMetRegels` |
| Projecten | `ProjectsPage` → `projectsService` | `app/(more)/projects.tsx` → `projectService` | `projects` (+ `werkbon_uren` voor uren) | SELECT breed; INSERT/UPDATE `projecten_bewerken`; DELETE rol admin | — | Mobiel vroeg `projects.used_hours` — kolom bestaat niet → 42703 op élke aanroep | Kolom uit de select; dashboard rekent uren live uit `werkbon_uren` |
| Algemene notities | `klantTijdlijnService.getKlantNotities` / `addKlantNotitie` | `app/(more)/notes.tsx` → `noteService` | `klant_tijdlijn` (type `notitie_toegevoegd`) | policy: leden van hetzelfde bedrijf (FOR ALL) | — | Mobiel vroeg tabel `notes` — die is verwijderd (migratie `20260915120500`) → PGRST205 | Omgezet naar `klant_tijdlijn`, met auteur uit `profiles` |
| Werkbonnotities | `NotitieLog` → `werkbon_notities` | `app/work-orders/[id].tsx` → `workOrderService` | `werkbon_notities` | auteur, admin of planner; bon niet ondertekend | — | Geen verschil | Ongewijzigd gelaten |

## Details die de bedragen bepalen

Overgenomen uit `OffertesPage.jsx` / `FacturenPage.jsx` (`useRegelTotals`) en
`regelTypes.js` / `btwRegime.js`, nu gedeeld in `src/lib/regels.ts`:

```
regelprijs  = round(aantal × prijs, 2)          ← eerst per regel afronden
totaal excl = round(Σ regelprijs, 2)
btw         = per tarief: round(Σ regelprijs × pct/100, 2)
totaal incl = round(excl + Σ btw, 2)
```

* Regeltypes: `uren`, `km`, `vast` ("Overig") en `eigen:<id>` uit
  `eigen_eenheden`. Verwijderde types (`m2`, `stuks`) blijven leesbaar.
* Btw-regimes: `normaal` 21%, `verlaagd` 9%, `vrijgesteld` 0%, `verlegd` 0%.
  `verlegd` naast belaste regels geeft een waarschuwing (SnelStart BOE-0062).
* Standaardwaarden uit `bedrijfsinstellingen`: `uurtarief`, `reiskosten_per_km`,
  `btw_pct`, `offerte_geldig_dagen`.
* Kolomnamen verschillen per tabel: `offerte_items` heeft `prijs_per` +
  `subtotaal`, `factuur_regels` heeft `eenheidsprijs` + `regelprijs`.

## Nummering

Beide documenten worden **client-side** genummerd; er is geen trigger of RPC.

* Dashboard: `BB-###` / `BB-F###` op basis van `count(*)`.
* Mobiel: hoogste bestaande nummer + 1, plus een terugleescontrole die
  hernummert als er ondertussen hetzelfde nummer is uitgedeeld. Er is geen
  unique index op `nummer`, dus zonder die controle kunnen er twee documenten
  met hetzelfde nummer ontstaan. Dit is strenger dan het dashboard en levert
  dezelfde reeks op.

## Wat het dashboard heeft en mobiel bewust niet

* **PDF en versturen.** `generatePdf.js`, `emailService` en de mailtemplates
  zitten in de webapp; er is geen server-side PDF- of mailfunctie die de app kan
  aanroepen. Niet nagebouwd — zie het eindrapport.
* **Offerteversies** (`BB-005-v2`) en **crediteren** van een factuur.
* **Ondertekenen** (`OfferteSigneren`) en de branding-snapshot bij versturen.
