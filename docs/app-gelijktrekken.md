# App gelijktrekken met het dashboard

Centraal voortgangs- en overdrachtsdocument. Een nieuwe sessie leest dit eerst.

- **Bron van waarheid (functioneel):** het BossBase-dashboard, repo `/Users/macbook/BossBase website`,
  **`origin/main` = `331250b` (4-10-2026)**. Alleen-lezen.
  > Correctie 2026-10-13: de eerste inventaris (docs/inventaris/) is gemaakt op de lokale checkout `a37a907`,
  > die 162 commits achterliep op `origin/main`. De verschillen (rechten zonder financiële inzage via gedeelde
  > werkruimte, geen plannerrol, bedragen alleen via `bb_projectbedragen`/`bb_werkbonmateriaal_bedragen`,
  > alleen-lezen overal, klanttype, IBAN, CSV met puntkomma) zijn verwerkt in commits `f4a8a10`, `f0145db`, `6963359`.
  > Waar de inventaris en `origin/main` verschillen, geldt `origin/main`.
- **App:** worktree `/Users/macbook/bossbase-gelijk`, branch `app-gelijktrekken`.
- **Visuele basis:** de bestaande app-stijl (`src/theme`, `src/components`).

## Uitgangssituatie (2026-10-13)

| | |
|---|---|
| `origin/main` app | `80bcb40` (Merge PR #1, productie op app.bossbase.nl) |
| Branch | `app-gelijktrekken`, vanaf `origin/main` |
| Eerste commit op de branch | merge van `origin/feature/ipados-compatibility` (`739aa07`, nog niet op main): centrale breekpunten, leesbreedte, focus, iPad-installatie |
| Dashboard | `origin/main` `331250b` (inventaris eerst op verouderde `a37a907`, zie correctie) |
| Vercel | poort `exit 0`, bescherming `all_except_custom_domains`; niets gedeployed vanuit deze branch |
| Bestaande niet-gerelateerde wijzigingen | oude checkout `/Users/macbook/bossbase-mobile`: alleen `design-reference/` (ongemoeid) |

Grenzen: niets in de dashboardrepo, geen database/RLS/functies/Edge Functions, geen Supabase-/DNS-/Vercel-config,
niet mergen, niet uitrollen, geen echte verzendacties, alleen testbedrijven of lokale mocks.

## Inhoud

1. Inventaris dashboard (per pagina)
2. Vergelijking dashboard ↔ app
3. Rechtenmatrix
4. Checklist
5. Database-/Edge-Function-afhankelijkheden (geblokkeerd)
6. Apparaatmatrix en testresultaten
7. Voortgangslog

---

## 3. Rechtenmatrix

Bron: dashboard `src/App.jsx` (NAV), `src/hooks/usePermissions.js`, `src/config/permissions.js`, `src/lib/features.js`.
App: `src/lib/permissions.ts` (`ROUTE_GATES`, `canWithRole`, `canZien`), `src/providers/PermissionsProvider.tsx`.

Toegangsregel (dashboard én app): admin → alles; anders `user_permissions` (de rol `planner` bestaat niet meer)
(`granted = true`). **Inzien** (pagina openen, menu-item tonen) is daarnaast vrij als het bedrijf feature
`gedeelde_werkruimte` (Groei) heeft en het recht in `INZAGE_RECHTEN` staat. **Bewerken** (`mag()`/acties) blijft
strikt. RLS (`bb_has_permission`) blijft de echte grens; de app-gates zijn alleen UI.

| Pagina (app-route) | Dashboard-gate | App-gate | Pakket/feature | Inzage via gedeelde werkruimte |
|---|---|---|---|---|
| Vandaag (`/today`) | — | — | — | — |
| Pipeline (`/pipeline`) | `verkoop` | `verkoop` | `crm_pipeline` (alle pakketten) | nee (financieel) |
| Relaties (`/customers`) | — | — | — | — |
| Activiteiten (`/activities`) | — | — | — | — |
| Agenda (`/planning`) | — | — | — | (collega's: `agenda_inzien`) |
| Planning (`/planningbord`) | `planning` + feature `planning` | `planning` + feature `planning` | Team, of module `planning` | nee |
| Projecten (`/projects`) | `projecten` | `projecten` | — | ja |
| Werkbonnen (`/work-orders`) | — | — | — | — |
| Materialen (`/materialen`) | — | — | — | — |
| Uren (`/hours`) | — | — | — | — |
| Offertes (`/offers`) | `offertes` | `offertes` | — | nee (financieel) |
| Facturen (`/invoices`) | `facturen` | `facturen` | — | nee (financieel) |
| Kosten (`/expenses`) | `kosten` + feature `kosten_nacalculatie` | idem | Groei/Team | nee (financieel) |
| Database (`/database`) | `database` | `database` | — | ja |
| Team (`/team`) | `team` | `team` | — | ja |
| Instellingen (`/settings`) | — (pagina beveiligt zichzelf per tab) | — (idem: tabs volgen `instellingen`/admin/feature) | — | nee |
| Integraties (`/integrations`) | tab in Instellingen | `instellingen` | — | nee |

Overige rechten (geen eigen pagina): `klanten_bewerken`, `klanten_verwijderen`, `projecten_bewerken`,
`werkbonnen_bewerken`, `alles_inzien`, `agenda_inzien`, `projectbedragen`, `bedrijfsfinancien`, `inkoopprijzen`.
Ze sturen knoppen en bedragen binnen pagina's; de app gebruikt dezelfde codes (18 in totaal).

Rechten per lid opslaan vereist feature `rollen_rechten` (Groei én Team, sinds 4-10-2026). Gedeelde werkruimte
(Groei) geeft alleen `alles_inzien`, `agenda_inzien`, `projecten`, `database`, `team`; financieel vraagt altijd een recht.

Tests: `tests/rechten.test.mjs`.

## 1–2. Inventaris en vergelijking per pagina

De volledige dashboard-inventaris staat in `docs/inventaris/A-schil.md` … `F-app.md`. Hieronder per pagina wat de app
nu doet en wat bewust (nog) anders is. ✅ = gelijk, ◐ = gelijk met genoemde beperking, ⛔ = alleen via dashboard.

| Onderdeel | Status | App-bestanden | Bewuste afwijking / beperking |
|---|---|---|---|
| Kleuren (zwart i.p.v. donkergroen, ook donker) | ✅ | `src/theme/index.ts` | Dashboard heeft geen donkere modus; app houdt die als keuze in het menu |
| Menu (volgorde, Database/Team/Instellingen bij naam) | ✅ | `app/(tabs)/menu.tsx` | Vrije notities, Foto's & bestanden en Taken zijn weg (redirects blijven) |
| Boss (helpagent) | ✅ | `BossChat.tsx`, `bossService.ts`, `HulpProvider.tsx` | — |
| Bug of idee incl. prijsactie | ✅ | `Meldpunt.tsx`, `meldpuntService.ts` | — |
| Meldingenbel | ✅ | `Meldingen.tsx`, `meldingService.ts` | — |
| Help (kennisbank, FAQ, telefoon) | ✅ | `support.tsx`, `src/lib/hulp.ts` | Dashboard heeft geen helppagina; links naar bossbase.nl |
| Vandaag | ✅ | `app/(tabs)/today.tsx` | Omzet-tegel zonder sparkline; urenkaart 8 u/dag i.p.v. 40 u/week |
| Pipeline | ◐ | `pipeline.tsx`, `deal/[id].tsx`, `components/pipeline/*` | Geen slepen (wel "Verplaats naar fase"); foto's alleen bekijken |
| Relaties + leveranciers | ✅ | `customers.tsx`, `app/customers/**` | — |
| Klantkaart | ◐ | `app/customers/[id].tsx` | Kostentab, tijdlijntab en PDOK-adreszoeker niet; mailtab ⛔ |
| Activiteiten | ◐ | `activities.tsx`, `ActivityFormSheet.tsx` | Geen datumfilter, eindtijd/locatie/deal, één toegewezene in formulier |
| Agenda | ◐ | `app/(tabs)/planning.tsx` | Type/deal/notitielog bij afspraak niet bewerkbaar; "Werkbon inplannen" ⛔ |
| Planning | ◐ | `planningbord.tsx`, `planningService.ts` | Alleen lezen: slepen/inplannen ⛔ |
| Projecten | ◐ | `projects.tsx`, `project/[id].tsx` | Kostentab en nieuwe offerte/factuur/werkbon vanaf project niet |
| Werkbonnen + aanmaken (meerdaags) | ◐ | `work-orders*`, `WerkbonFormulier.tsx` | Ondertekenen/PDF/mail ⛔; eigen tijd per persoon per dag niet in formulier |
| Materialen | ✅ | `materialen.tsx`, `materiaalService.ts` | — |
| Uren | ✅ | `app/(tabs)/hours.tsx`, `app/hours/new.tsx` | — |
| Offertes | ◐ | `offers.tsx` | Versturen, nieuwe versie, kopiëren ⛔; PDF = opgeslagen getekende PDF of afdrukweergave |
| Facturen | ◐ | `invoices.tsx` | Versturen, herinneringen, betaallink, gedeeltelijk crediteren ⛔; PDF uit `factuur-pdfs` |
| Kosten | ◐ | `expenses.tsx` | Bon uploaden ⛔ |
| Database | ◐ | `database.tsx`, `components/database/*` | Bulkmail en Excel ⛔ (CSV wel) |
| Team | ✅ | `team.tsx` | Profielfoto teamlid niet |
| Instellingen (8 tabs) | ◐ | `settings.tsx`, `components/instellingen/*` | Templates als platte tekst; abonnement wijzigen ⛔ |
| Integraties | ✅ | `integrations.tsx` | Alleen status; koppelen via dashboard |

## 4. Checklist uit de opdracht

- [x] Zwart i.p.v. donkergroen, ook donkere modus en Instellingen
- [x] Menu: dashboardvolgorde; Instellingen/Team (en Database) bij de naam
- [x] Vrije notities weg (dashboard heeft ze niet; geverifieerd)
- [x] Foto's & bestanden geen menu-item; foto's bij werkbon; overzicht onder Database
- [x] Taken + Activiteiten samengevoegd
- [x] Feedback → "Bug of idee" met prijsactie
- [x] Help → Boss; kennisbank, FAQ, `+31 6 42005889`
- [x] Donkere-modusknop uit header, keuze in menu
- [x] Menu op iPad twee kolommen, niet uitgerekt
- [x] Boss altijd bereikbaar (header), telefoon onderpaneel, iPad gecentreerd
- [x] Meldingenbel met ongelezen/gelezen
- [x] Zoeken en filters op lijstpagina's
- [x] Vandaag: "Nieuwe activiteit", activiteiten los van planning
- [x] Pipeline: fasekleuren en kaartfuncties
- [x] Relaties: Klanten/Leveranciers
- [x] Klantkaart-blokken
- [x] Activiteiten-velden/filters, rood bij te laat
- [x] Agenda, Planning, Projecten, Werkbon, werkbon aanmaken (meerdaags), Materialen, Uren
- [x] Offertes/facturen bekijken incl. PDF
- [x] Kosten-widgets
- [x] Database, Team, Instellingen, Integraties (AFAS/SnelStart "Binnenkort", Google Agenda en sleutels weg)
- [x] Rechtenmatrix
- [ ] Test op echt iPad/iPhone-toestel (door gebruiker)
- [ ] End-to-end tegen testbedrijf (vraagt inlog door gebruiker)

## 5. Afhankelijkheden database / Edge Functions

Geen enkele wijziging aan database, RLS, functies of Edge Functions gedaan of nodig voor wat er nu staat. Wat
"⛔ alleen via dashboard" is, is een bewuste keuze (verzendacties mochten niet getest worden, of vraagt jsPDF/
exceljs/jszip). Wel als toekomstige DB-wens genoteerd:
- Unieke index op `(company_id, nummer)` voor offertes/facturen (nu: hoogste nummer + 1 in de client, net als het
  dashboard client-side telt).
- (Vervallen na delta: RLS op werkbontaken/-materiaal volgt nu werkruimte/`werkbonnen_bewerken`/verantwoordelijke; app gelijk.)
- @-vermeldingen in notities: het dashboard stuurt melding + mail via `create-notification`; app toont mentions
  maar stuurt ze nog niet (zou mail kunnen versturen).

## 7. Voortgangslog (2026-10-13)

| Commit | Onderdeel |
|---|---|
| `50f4444` | Kleuren: zwart als merkkleur, donkere modus |
| `da25fc2` | Notities: HTML/mentions als tekst |
| `0529639` | Grote lijsten in stukken van 1000 |
| `bb6105e` | Rechten: `projecten` en inzage gedeelde werkruimte |
| `d1baa68` | Boss, Bug of idee, meldingenbel, help, menu |
| `5791cc5` | Docs: inventaris |
| `65dae5c` | Vandaag en Activiteiten |
| `b3dc02f` | Uren, Agenda, Planning |
| `ac5f808` | Relaties, leveranciers, klantkaart |
| `f9aff79` | Offertes, facturen (PDF), kosten |
| `3380915` | Pipeline en Projecten (projectstatus-fout hersteld) |
| `5c1ac34` | Werkbonnen en Materialen |
| `f54d361` | Team, Instellingen, Integraties, Database |

Kwaliteit na laatste commit: `tsc` 0 fouten, `expo lint` schoon, `npm test` 132/132, `build:web` ok,
`check:bundel` 0 bevindingen, `expo export` iOS en Android ok.

## 6. Apparaatmatrix en testresultaten

Getest in een browser (Playwright, Chromium) tegen de lokale dev-server met een nep-sessie en gemockte
Supabase-antwoorden ("Testbedrijf (nep)"); geen echte gegevens, geen logins, niets verstuurd. Schermafbeeldingen:
`/Users/macbook/bossbase-gelijk-schermen/` (buiten git).

| Formaat | Breedte × hoogte | Pagina's | Paginafouten | Horizontaal scrollen |
|---|---|---|---|---|
| iPhone | 390 × 844 | 20 routes + 8 met screenshot | 0 (na fix) | nee |
| iPad staand | 820 × 1180 | 8 | 0 | nee |
| iPad liggend | 1180 × 820 | 20 + 8 | 0 (na fix) | nee |
| Split View (smal) | 507 × 820 | 8 | 0 | nee |

Gevonden en opgelost: Integraties en Database crashten als `get_accounting_status` geen lijst teruggaf.
Niet getest (vraagt de gebruiker): echt iPad/iPhone-toestel (Safari, geïnstalleerde PWA, Stage Manager,
hardwaretoetsenbord/trackpad) en een end-to-end-ronde in een testbedrijf met echte inlog.
