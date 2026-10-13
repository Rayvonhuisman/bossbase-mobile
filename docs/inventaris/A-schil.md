# Inventaris A — Schil en gedeelde regels (BossBase-dashboard)

Bron: `/Users/macbook/BossBase-billing` (branch `main`), alleen gelezen. Alle paden relatief aan die repo. Regelnummers zijn `pad:regel`.

Belangrijke voorafopmerking: twee bestanden uit de opdracht zijn **niet** wat de naam doet vermoeden.

- `src/components/Sidebar.jsx` en `src/components/Header.jsx` zijn **oude/demo-componenten die nergens geïmporteerd worden** (geen import in `src/`). De echte zijbalk en topbalk staan inline in `src/App.jsx` (`function Sidebar` op `src/App.jsx:166`, `function Topbar` op `src/App.jsx:406`).
- `src/components/Meldingen.jsx` is **niet** de belmeldingen van de gebruiker, maar het **super-admin-overzicht van het meldpunt (bugs/ideeën)**, alleen gebruikt in `src/pages/SuperAdminPage.jsx:3`. De belmeldingen staan inline in de Topbar (`src/App.jsx:663-800`).

---

## 1. Navigatie (schil)

### 1.1 App-shell en routes

- Basispad: `/dashboard` (in demo `/demo`) — `src/App.jsx:81`.
- URL-vorm: `/<basis>/<pagina>[/<itemId>][?klant=&tab=&deal=&lev=&agenda=]` — `src/lib/route.js:6-7`.
  - Detail in pad (vervangt lijst) voor: `werkbonnen, projecten, offertes, facturen, activities` — `src/lib/route.js` (`ITEM_IN_PAD`), `src/App.jsx:1429`.
  - Drawers in query: `klant` (+`tab`), `deal`, `lev`, `agenda` — `src/lib/route.js` (`DRAWERS`).
  - Oude deep-link `/<basis>/<pagina>?open=<id>` (uit collega-mails) wordt omgezet — `src/App.jsx:1401-1406`.
- Pagina-sleutels (`PAGINAS`): `pipeline, customers, leveranciers, materialen, activities, calendar, planning, projecten, werkbonnen, uren, costs, revenue, facturen, offertes, database, team, instellingen, abonnement` (+ `dashboard` als standaard) — `src/lib/route.js`.
- Render per pagina: `src/App.jsx:1605-1655`.
- Publieke (niet-dashboard) routes in de SPA: `/login`, `/register`, `/reset-password?token=`, `/uitnodiging/<token>`, `/offerte/<token>` (ondertekenen), `/werkbon/<token>` (ondertekenen), `/betaal/<token>`, `/betaald`, `/betaling-geannuleerd`, `/cookieverklaring`, `/superadmin` — `src/App.jsx:1661-1750`, lijst in `src/lib/appRoutes.js`.
- `/superadmin`: alleen als `profile.isSuperAdmin === true` én e-mail in `['info@bossbase.nl','nielsgrevink@gmail.com']` — `src/App.jsx:1744-1745`.

### 1.2 Zijbalk-menu (NAV) — exacte volgorde

Bron: `src/App.jsx:100-128`; secties `src/App.jsx:158-163`.

| # | Sectie (label) | id | Label | Icoon-key | `permission` | `feature` (pakket) |
|---|---|---|---|---|---|---|
| 1 | Hoofdmenu (`main`) | `dashboard` | Dashboard | dash | – | – |
| 2 | Hoofdmenu | `pipeline` | Pipeline | pipe | `verkoop` | – |
| 3 | Hoofdmenu | `relaties` (groep) | Relaties | cust | – | – |
| 3a | ↳ kind | `customers` | Klanten | – | – | – |
| 3b | ↳ kind | `leveranciers` | Leveranciers | – | – | – |
| 4 | Hoofdmenu | `activities` | Activiteiten | act | – | – |
| 5 | Uitvoering (`work`) | `calendar` | Agenda | cal | – | – |
| 6 | Uitvoering | `planning` | Planning | planning | `planning` | `planning` |
| 7 | Uitvoering | `projecten` | Projecten | projects | `projecten` | – |
| 8 | Uitvoering | `werkbonnen` | Werkbonnen | wo | – | – |
| 9 | Uitvoering | `materialen` | Materialen | box | – | – |
| 10 | Uitvoering | `uren` | Uren | hours | – | – |
| 11 | Financieel (`finance`) | `offertes` | Offertes | quotes | `offertes` | – |
| 12 | Financieel | `facturen` | Facturen | brief | `facturen` | – |
| 13 | Financieel | `costs` | Kosten | euro | `kosten` | `kosten_nacalculatie` |
| 14 | Financieel | `revenue` | Financiën | chart | `bedrijfsfinancien` | – |
| 15 | Bedrijf (`bedrijf`) | `database` | Database | db | `database` | – |
| 16 | Bedrijf | `team` | Team | team | `team` | – |
| 17 | Bedrijf | `instellingen` | Instellingen | settings | – (pagina beveiligt zichzelf: zonder `instellingen` alleen "Mijn profiel") | – |

Zichtbaarheidsregel per item (`src/App.jsx:279-285`): verborgen als `permission` gezet is en `can(permission)` false is, of als `feature` gezet is en `plan.has(feature)` false is. Een sectie zonder zichtbare items verdwijnt geheel (`src/App.jsx:286`).

`abonnement` staat niet in het menu; bereikbaar via read-only-banner / upgrade-flows (`src/lib/abonnementNav.js`).

Groep "Relaties" (`kinderen`): standaard dicht, open zodra een kind actief is of handmatig opengeklapt (`src/App.jsx:321`). Ingeklapte zijbalk: klik opent flyout-menu naast de knop (`src/App.jsx:260-272, 298-317`).

Zijbalk-badges (`src/App.jsx:1772-1779`):
- `pipeline`: `globalDeals.filter(d => d.stage === 'new_lead').length` — let op: met echte (uuid) fasen is dit in de praktijk altijd 0 (bekende inconsistentie; de bel gebruikt wél `firstStageId`).
- `activities`: aantal activiteiten met `status === 'today' || 'overdue'` (status berekend in `activityService.js:137-140`, lokale kalenderdag).
- Badge-stijl: `.sbi-badge` achtergrond `#1DDB62`, tekst `#0D0D0D` (`src/bb-dashboard.css:161`).

Onderaan zijbalk (`src/App.jsx:368-385`): avatar (of initialen), naam, regel "`<Rol> · <Bedrijfsnaam>`" (rol met hoofdletter, bv. "Admin · Dakdekker Niels"); klik → `instellingen`; uitlogknop.

Zijbalk inklappen: voorkeur in `localStorage['bb.sidebarCollapsed']` (`src/App.jsx:983-986, 1830-1834`).

### 1.3 Routebewaking (directe URL)

`src/App.jsx:1567-1603`. Wacht tot `profile`, `permissionsLoaded` én `planStatus` er zijn.
- `PROTECTED_PAGES` = afgeleid van NAV `permission` (`src/App.jsx:156`); `PLAN_GATED_PAGES` = afgeleid van NAV `feature` (`src/App.jsx:145`).
- Toegang als: geen recht vereist, of admin, of `userPermissions.includes(recht)`, of (`gedeelde_werkruimte` in features én recht ∈ `INZAGE_RECHTEN`).
- Geen toegang → toast "Je hebt geen toegang tot deze pagina" + naar dashboard. Feature ontbreekt → toast "`<featureLabel>` zit niet in je abonnement" + naar dashboard.
- Let op: de route-check gebruikt NIET de planner-uitzondering uit `usePermissions` (zie §7.6). Een `planner` zonder expliciet `planning`-recht ziet het menu-item Planning wél (via `can`), maar zodra de pagina `planning` actief wordt (via menu of URL) kaatst deze check hem terug naar het dashboard. Inconsistentie, zie §7.6.

### 1.4 Topbalk (Topbar) — `src/App.jsx:406-847`

Links: hamburger (mobiel), paginatitel + subtitel uit `PAGE_META` (`src/App.jsx:1055-1078`; dashboard-subtitel = "Goedemorgen, <naam>").

Rechts, in volgorde:
1. **Zoeken** (inklapbaar, `src/App.jsx:548-656`): client-side over gedeelde data; zoekt in klanten (`name, company, email, city`), leveranciers (`naam, city, email`), deals (`title, customerName, city`), activiteiten (`title, customerName`); max 6 per groep. Klik: klant → klantdrawer; leverancier → pagina leveranciers + drawer; deal → projectdrawer (DealDrawer); activiteit → pagina activities. Lege staat: "Typ om te zoeken in klanten, leveranciers, deals en activiteiten." / "Geen resultaten gevonden". Escape/klik ernaast klapt in.
2. **MeldKnop** "Bug of idee?" (§5).
3. **BossKnop** (avatar `/boss-avatar.png`, fallback groene "B") → opent Boss-chat (§4).
4. **Bel / meldingen** (§3).
5. **Avatar-menu**: naam, e-mail, "Mijn profiel" (ProfileModal), "Financiën" (→ `revenue`; let op: ongeacht recht, routebewaking vangt af), "Uitloggen".

### 1.5 Shell-gedrag, laad/fout-staten

- Gedeelde data-fetch voor de hele shell (DataContext), één keer per login + bij `bumpRefresh` (`src/App.jsx:1480-1508`): `listCustomers`, `listDeals`, `listPipelineStages`, `listActivities`, `getOffertes`, `getWerkbonnen`, `listLeveranciers` (elk met `.catch(() => [])`). Agenda-items, facturen en kosten zitten er bewust niet in.
- Profiel/rechten/plan laden: `getCurrentUserContext()` (profiles + companies + rpc `get_company_tier`), `getUserPermissions()` (tabel `user_permissions`, alleen voor niet-admin), `getPlanStatus()` (rpc `get_plan_status`, fallback lokale matrix) — `src/App.jsx:1130-1206`.
- Na elke `bumpRefresh` wordt `get_plan_status` opnieuw gehaald (limietstanden) — `src/App.jsx:1512-1523`.
- Shell blijft leeg (`var(--bg)`) tot `permissionsLoaded` — `src/App.jsx:1781-1784`.
- E-mailverificatie-gate (profiel zonder bedrijf en zonder `emailVerifiedAt`) → `EmailVerificationScreen` — `src/App.jsx:1789-1798`.
- Foutschermen: "Geen profiel gevonden voor dit account." (knoppen Opnieuw proberen / Profiel aanmaken / Uitloggen) en "Profiel kon niet worden geladen" — `src/App.jsx:1854-1899`.
- Geblokkeerd bedrijf (`company.status === 'geblokkeerd'`) → direct `signOut` — `src/App.jsx:1233-1239`.
- Actieve-sessiecontrole elke 45 s + bij focus/zichtbaar: `supabase.auth.getUser()` en `profiles.actief/verwijderd_op`; inactief → toast + uitloggen. Teksten: "Je account is niet meer actief. Je bent uitgelogd." / "Je account is gedeactiveerd. Terugkeren of je gegevens laten verwijderen? Mail info@bossbase.nl." — `src/App.jsx:1246-1297`.
- Boven elke pagina: `<CheckoutTerugkeer />` en `<ReadOnlyBanner />` (§7.5) — `src/App.jsx:1906-1907`. Pagina's in `PageErrorBoundary` + `Suspense` ("Laden…").
- Shell-brede modals: `ProfileModal`, `NewLeadModal` (globaal, na opslaan → pipeline), `NewActivityModal`, `UrenHerinneringModal` (pop-up voor medewerkers die gepland stonden maar geen werkdaguren boekten; interval = bedrijfsinstelling `uren_herinnering_interval_min`, 0 = uit) — `src/App.jsx:1960-1995`, `src/components/UrenHerinneringModal.jsx:1-20`.

### 1.6 MobileBlock — `src/components/MobileBlock.jsx`

- Breakpoint: `< 768px` = mobiel (`src/App.jsx:945-957`). Op mobiel (en niet demo) wordt i.p.v. de shell `MobileBlock` getoond (`src/App.jsx:1803-1809`), ná de login/verificatie-gates.
- Inhoud: logo, telefoon-icoon, titel "Download de BossBase app", tekst "BossBase werkt het beste in onze app. Download de app om verder te gaan op je telefoon.", knop "Download de app" (**`href="#"` — nog geen echte link**), "Of gebruik BossBase op je computer.", link "Uitloggen".
- Mobiel blijven werken: login/registratie/verificatie, `/offerte/<token>`, `/werkbon/<token>`, betaalpagina's, marketingsite.

---

## 2. Homepage / dashboard

Route: `dashboard` (`/dashboard`). Component `DashboardHome` — `src/pages/dashboard/DashboardHome.jsx:261`.

### 2.1 Kop en knoppen

- Titel: "Goedemorgen/Goedemiddag/Goedenavond, <naam>" (grenzen <12 / <18 uur) of "Profiel laden…"/"Welkom bij BossBase"; subregel: volledige datum `nl-NL` (weekday long) + " · <bedrijfsnaam>" — `DashboardHome.jsx:565-572`.
- Knoppen (niet in bewerkmodus): "Nieuwe activiteit" (altijd; opent globale `NewActivityModal`), "Nieuwe aanvraag" (alleen `magBewerken('verkoop')`; opent `NewLeadModal`), "Dashboard aanpassen" — `DashboardHome.jsx:607-621`.
- Alleen in DEV: demo-toggle (`localStorage['bb_demo_mode']`).
- Rendert niets tot `permissionsLoaded` (`DashboardHome.jsx:582`). Skeleton: 4 grijze kaarten tot widgets geladen (`DashboardHome.jsx:659-667`).

### 2.2 Widgetlayout en opslag

- Tabel **`dashboard_widgets`** (per gebruiker): kolommen `user_id, company_id, widget_type, title, position, size, settings (jsonb), is_visible, updated_at` — `src/services/dashboardWidgetService.js`.
  - `loadUserWidgets()`: select op `user_id`, order `position`.
  - `saveUserWidgets()`: **delete alle rijen van gebruiker + insert opnieuw** (nieuwe id's terug in state) — `dashboardWidgetService.js:26-65`.
  - `updateWidgetSettings(id, settings)`: direct bewaren van tegelinstelling (Alle/Mijn/Team, Vandaag/Week, funnelStages) — alleen voor tegels met echte DB-id (`DashboardHome.jsx:556-562`).
- Geen opgeslagen layout → standaard: admin `standaard`, anders `medewerker` (`DashboardHome.jsx:330`, `widgetRegistry.js:156-159`). Onbekende/verwijderde types worden weggefilterd (`bestaatWidget`).
- Bewerkmodus (`DashboardCustomizeBar`): Widget toevoegen (`AddWidgetModal`, zoeken + categorieën), Layout kiezen (`LayoutPickerModal`), Reset naar standaard, Opslaan, Annuleren; per tegel: omhoog/omlaag, slepen (drag-and-drop), formaat, verwijderen. Toast "Dashboard opgeslagen".
- Formaten: `small`=3, `medium`=4, `large`=6, `full`=12 kolommen van 12 (`widgetRegistry.js:10-11`). Per widget `supportedSizes`.

### 2.3 Vooraf ingestelde layouts — `src/data/widgetRegistry.js:74-154`

| key | Label | Widgets (formaat) |
|---|---|---|
| `medewerker` | Medewerker | werkbonnen_today (L), uren_registratie (L), agenda_week (L), actions_today (L) |
| `standaard` | Standaard | open_pipeline_value (S), accepted_value (S), customers (S), actions_today (S), actions_today (L), new_leads (L), open_offertes (L), active_deals (L), monthly_revenue_chart (F) |
| `sales` | Verkoopgericht | open_pipeline_value, accepted_value, revenue_month, profit_month (S); new_leads, active_deals, open_offertes, conversion_overview (L) |
| `planning` | Planninggericht | actions_today, customers, werkbonnen_today, uren_registratie (S); actions_today, agenda_week, quick_actions, activities_per_day_chart (L) |
| `financial` | Financieel | revenue_month, profit_month, costs_month, billable (S); monthly_revenue_chart, open_facturen, monthly_profit_chart, invoice_status_chart (L); top_customers_chart (F); conversion_overview (F) |

Een layout is alleen kiesbaar als élke widget erin zichtbaar is voor de gebruiker (`layoutZichtbaar`, `widgetRegistry.js:186-190`).

### 2.4 Zichtbaarheid widgets — `magWidgetZien` (`widgetRegistry.js:259-285`)

Volgorde: (1) pakket-feature (`WIDGET_FEATURE`) → (2) `gedeelde_werkruimte` = alles toegestaan → (3) recht (`WIDGET_PERMISSION`; array = één van).
`has` wordt pas doorgegeven als `planStatus` er is (anders pakket-toets overgeslagen) — `DashboardHome.jsx:273-274`.

### 2.5 Alle widgets (27) — `widgetRegistry.js:15-48`, render in `src/pages/dashboard/WidgetCard.jsx:466-1525`

Gedeelde gegevens per widget: `deals, stages, activities, customers, offertes, werkbonnen` (DataContext) + dashboard-eigen: `facturen` (`getFacturen`), `jobCosts` (`listJobCosts().then(alleenGeboekt)`), `calendarEvents` (`listCalendarEvents` → tabel `calendar_events`), `uren` (`getUrenregistratie({vanDatum: maandag-5wk, profileId: eigen})` → tabel `urenregistratie`, **alleen eigen uren**) — `DashboardHome.jsx:361-408`. Mislukte fetch → toast "`<Facturen|Kosten|Agenda-items>` konden niet worden geladen — probeer het opnieuw." en lege array.

"Persoonlijk"-filter (`WidgetCard.jsx:477-483`): `myActivities` = `assignedToIds` bevat mij of `assignee === mij`; `myWerkbonnen` = `assignedToIds` bevat mij of `assignedTo === mij`; `myCalendarEvents` = `assignedTo === mij`. Geldt ook voor admin.

Laadstaat per tegel: titel "Laden…" + spinner + 3 skeletregels (`WidgetCard.jsx:485-500`).

| type | Label | Cat. | Recht | Feature | Berekening / inhoud | Klik / doel | Lege staat |
|---|---|---|---|---|---|---|---|
| `actions_today` | Activiteiten vandaag | popular | – | – | eigen activiteiten, open, `status==='today'`; apart teller `overdue` ("te laat"); max 8 regels (`FEED_LIMIET`). Small = KPI (tone warn als te laat >0). Chip "X te laat"/"Op schema" | rij → `activities/<id>`; voet "Alle activiteiten" | "Geen activiteiten vandaag" / "Tijd om vooruit te plannen of even adem te halen." |
| `quick_actions` | Snelle acties | popular | – | – | 6 knoppen: Nieuwe aanvraag→pipeline (#ecfdf5/#15A34A), Activiteit→activities (#eff6ff/#2563eb), Offerte→offertes (#f5f3ff/#7c3aed), Werkbon→werkbonnen (#fffbeb/#b45309), Klant→customers (#f0fdfa/#0d9488), Uren boeken→uren (#f0fdf4/#15A34A) | navigeert alleen naar pagina | – |
| `agenda_week` | Agenda deze week | planning | – | – | **Ja, toont agenda/activiteiten**: eigen open activiteiten met `dueAt` + eigen `calendar_events` (zonder `activityId`). Instelling `settings.agendaView` = `today` (standaard, lijst gesorteerd op tijd) of `week` (7-koloms ma–zo, max 4 per dag). Werkbonnen zitten hier NIET in. Pill-kleuren: call `ev-info`, email `ev-green`, visit `ev-purple`, task `ev-orange`, follow `ev-warn`, afspraak `ev-teal` | event → agenda-drawer `?agenda=<id>`; activiteit → `activities/<id>`; voet "Naar agenda" | "Geen agenda-items voor vandaag" / "…deze week" + "Plan een afspraak vanuit een klant of activiteit." |
| `werkbonnen_today` | Werkbonnen vandaag | planning | – | – | eigen werkbonnen waarbij vandaag een geplande dag is én ik in de dagploeg sta (`staatOpDagVoor`, `src/utils/werkbonDagen.js:134`); max 6; chip status (werkbon-kleuren) | → `werkbonnen/<id>` | "Geen werkbonnen vandaag" |
| `uren_registratie` | Urenregistratie | planning | – | – | som eigen werkdaguren deze week (ma–zo) vs **vast doel 40u**; %; staafjes per dag (vandaag groen) | → uren | – |
| `open_pipeline_value` | Open pipelinewaarde | financial | bedrijfsfinancien | – | som `value` deals met status `open` | → pipeline | – |
| `accepted_value` | Geaccepteerde waarde | financial | bedrijfsfinancien | – | som deals status `won` | → pipeline | – |
| `revenue_month` | Omzet deze maand | financial | bedrijfsfinancien | – | `sumOmzetExclBtw` facturen met `factuurdatum` deze maand (geen concepten); % t.o.v. vorige maand; sparkline 6 mnd | → revenue | – |
| `profit_month` | Winst deze maand | financial | bedrijfsfinancien | – | omzet excl. btw − som `job_costs.amt` deze maand; marge % (balk 0–100) | → revenue | – |
| `costs_per_job` | Kosten per klus | financial | kosten | kosten_nacalculatie | gemiddelde kosten per klus (groep op `dealId‖projectId‖werkbonId`); kosten zonder klus = "overig" | → costs | "geen kosten op een klus" |
| `costs_month` | Kosten deze maand | financial | kosten | kosten_nacalculatie | som kosten deze maand + aantal posten | → costs | – |
| `billable` | Te factureren | financial | facturen | – | deals in fase-categorie `won` en status ≠ lost | → facturen | "niets in de wacht" |
| `open_offertes` | Open offertes | financial | offertes | – | offertes status `concept`/`verzonden`; som `totaalIncl`; leeftijd in dagen | → `offertes/<id>` | "Geen open offertes" |
| `open_facturen` | Openstaande facturen | financial | facturen | – | status niet in `betaald, concept, aangemaakt`; creditfacturen apart in voet; chip "Te laat" (rood) als `vervaldatum < vandaag` anders "Openstaand" | → `facturen/<id>` | "Niets openstaand" |
| `customers` | Klanten | crm | – | – | aantal klanten | → customers | – |
| `new_leads` | Nieuwe aanvragen | crm | verkoop | – | deals in eerste fase (`firstStageId`); deze week vs vorige week; max 6 | → deal-drawer | "Geen nieuwe aanvragen" |
| `active_deals` | Actieve deals | crm | verkoop | – | deals status open, niet eerste fase; instelling `settings.dealsView` Alle/Mijn/Team (op `assignedToIds`); volgende activiteit ("vandaag/morgen/over Xd/Xd te laat") | → deal-drawer | "Geen actieve deals" |
| `conversion_overview` | Conversie overzicht | crm | verkoop | – | aantal deals per fase (excl. verloren); "Binnengehaald X%" = won/alle | → pipeline | – |
| `monthly_revenue_chart` | Omzet per maand | charts | bedrijfsfinancien | – | 6 maanden omzet excl. btw | → revenue | "Geen grafiekdata" |
| `monthly_profit_chart` | Winst per maand | charts | bedrijfsfinancien | – | 6 mnd omzet − kosten | → revenue | "Geen grafiekdata" |
| `pipeline_stage_chart` | Pipeline per fase | charts | bedrijfsfinancien | – | waarde per fase (excl. verloren) | – | "Geen grafiekdata" |
| `conversion_funnel` | Conversiefunnel | charts | verkoop | – | per fase: aantal niet-verloren deals dat fase bereikte + slotstap "Projecten voltooid" (`deals.afgerond_op`); fase-selectie in `settings.funnelStages` | – | "Geen funnel data" |
| `invoice_status_chart` | Factuurstatus | charts | facturen | – | buckets Betaald #15A34A, Openstaand #2563eb, Te laat #dc2626, Concept #9ca3af | – | "Geen factuurdata" |
| `job_costs_bar_chart` | Kosten per klant | charts | kosten | kosten_nacalculatie | top 6 klanten op kosten | – | "Geen kostendata" |
| `weekly_hours_histogram` | Uren per week | charts | – | – | eigen werkdaguren per week, 6 weken, doellijn 40u | – | "Geen urendata" |
| `activities_per_day_chart` | Activiteiten per dag | charts | `planning` of `agenda_inzien` | – | aantal activiteiten (alle zichtbare, niet alleen eigen) per dag deze week | – | "Geen activiteitsdata" |
| `top_customers_chart` | Top klanten | charts | bedrijfsfinancien | – | top 5 klanten op som dealwaarde | → customers | "Geen klantdata" |

Kleuren fase-grafiek: `['#1DDB62','#d97706','#2563eb','#7c3aed','#15A34A','#0d9488','#db2777','#e8784a','#9ca3af']` (`DashboardHome.jsx:115`); conversie-overzicht palette `['#9ca3af','#60a5fa','#a78bfa','#fb923c','#34d399','#2dd4bf','#f472b6','#fb7185', groen]` (`WidgetCard.jsx:1138`).
Bedragen in widgets: hele euro's NL-notatie `€ 1.250.000`; `kEur` = `€ 12.5k` (`WidgetCard.jsx:31-37`).

Niet gebruikt: `src/services/dashboardStatsService.js` (`getDashboardAggregaten` → rpc `bb_dashboard_aggregaten(p_maanden)`) wordt **nergens aangeroepen** — alle cijfers worden client-side berekend in `deriveCharts()` (`DashboardHome.jsx:88-259`) en `renderContent()`.

### 2.6 Agenda-item-drawer (vanaf home)

`src/pages/dashboard/CalendarEventDetailDrawer.jsx`, tabel `calendar_events`. Bewerken mag als `can('planning')` of (`herkomst !== 'planning'` én `assignedTo === mij`) — `CalendarEventDetailDrawer.jsx:79-80`; notities met @-tag (createMentionNotifications, `:237`).

---

## 3. Meldingen (bel in de topbalk)

Inline in `src/App.jsx:415-800`; service `src/services/notificatieService.js`.

### 3.1 Twee soorten in één paneel

**A. Database-meldingen** (tabel **`notifications`**):
- Kolommen: `id, company_id, user_id, type, title, body, link, related_type, related_id, created_by, read_at, created_at` (+ join `creator:created_by(full_name)`) — `notificatieService.js:13-26, 70-78`.
- Ophalen: pas bij openen van de bel; `select *` order `created_at desc` **limit 50**, geen user-filter in de query (RLS beperkt tot eigen) — `notificatieService.js:70-78`. Fout → lege lijst.
- Realtime: kanaal `notif-<profileId>`, `postgres_changes` INSERT op `public.notifications` met filter `user_id=eq.<id>`; nieuwe melding bovenaan (`src/App.jsx:490-515`).
- Gelezen: klik → `update notifications set read_at=now() where id` (`markNotificationRead`); "Alles gelezen" → update alle eigen `read_at is null` (`markAllNotificationsRead`, `notificatieService.js:80-95`).
- Weergave per regel: icoon `@` (type `mention`, groene achtergrond `var(--p)`, witte tekst), `→` (type begint met `toewijzing`), anders `●`; titel; body (1 regel, ellipsis); relatieve tijd ("zojuist", "X min geleden", "X uur geleden", "X dagen geleden"); ongelezen = achtergrond `var(--pll)` (#f0fdf4) + groene stip 7px (`src/App.jsx:693-738`).
- Kop: "Notificaties · N ongelezen" + knop "Alles gelezen" (alleen als ongelezen > 0).

**B. Automatische (afgeleide, niet opgeslagen) meldingen** uit gedeelde data — `src/App.jsx:466-478, 741-791`; sectiekop "Automatisch":
- Te laat: open activiteiten met `dueAt` < vandaag (max 5) — icoon `!` (warn) — klik opent `ActivityEditModal`.
- Vandaag: open activiteiten met `dueAt` vandaag (max 5) — klik opent `ActivityEditModal`.
- Nieuwe aanvraag: deals in eerste fase en status ≠ lost (max 5) → deal-drawer.
- Offertes `concept`/`verzonden` (max 3) → pagina offertes.
- Werkbonnen die vandaag op een dag staan en status ≠ `afgerond` (max 3) → pagina werkbonnen.
- Voet: "Alle activiteiten →".

Rode/groene stip op bel (`.ndot`, kleur `var(--p)` = #1DDB62) als er automatische meldingen zijn **of** ongelezen DB-meldingen (`src/App.jsx:533-535, 666`). Lege staat: "Geen nieuwe notificaties".

### 3.2 Link-doelen

`link` is `'<pagina>'` of `'<pagina>/<id>'`. Bij klik (`src/App.jsx:703-714`):
- `deal/<id>` → deal/project-drawer.
- `aanvragen` (oud) → pipeline.
- anders `navigatePage(pagina, {id})` (id opent detail voor `werkbonnen, projecten, offertes, facturen, activities`).
`diepeLinkVoor()` bouwt de link uit `related_type` (`werkbon→werkbonnen`, `activiteit→activities`, `project→projecten`, `offerte→offertes`, `factuur→facturen`) — `notificatieService.js:120-137`. In mails: `https://www.bossbase.nl/dashboard/<pagina>?open=<id>` (`notificatieService.js:99-114`).

### 3.3 Meldingsoorten (`type`)

| type | Aangemaakt door | titel / body | link / related | mail |
|---|---|---|---|---|
| `mention` | `createMentionNotifications()` (`notificatieService.js:186-232`) vanuit notities op activiteit (`SharedModals.jsx:505,1152,1225`), klantkaart (`BbPages1.jsx:511,540`), leverancier (`LeverancierPage.jsx:170`), werkbon (`WerkbonPageV2.jsx:2120`), planning (`PlanningPage.jsx:858,1074`), project (`ProjectDetailDrawer.jsx:1777`), agenda-item (`CalendarEventDetailDrawer.jsx:237`) | "`<naam>` heeft je getagd[ bij <context>]" / platte tekst max 120 tekens | diepe link; `related_type` = activiteit/werkbon/project/… | ja, altijd ("Reageer in BossBase"); **geen self-skip**: wie zichzelf tagt krijgt ook melding+mail |
| `toewijzing_activiteit` | `notifyNewAssignees` (`SharedModals.jsx:508,1229`, `PlanningPage.jsx:676`) | "Je bent toegewezen aan <titel>" / "Datum: …" | `activities/<id>` | optioneel (vinkje "Stuur medewerker een e-mail", standaard aan) |
| `toewijzing_werkbon` | `notifyNewAssignees` (`WerkbonPageV2.jsx:246,286`, `PlanningPage.jsx:535,847,1019`, `AgendaWerkbonPlanModal.jsx:91`) | "Je bent toegewezen aan <werkbon>" | `werkbonnen/<id>` | optioneel |
| `toewijzing_project` | `ProjectsPage.jsx:116` | "Je bent toegewezen aan <project>" | `projecten/<id>` | optioneel |
| `verantwoordelijke_werkbon` | `notifyNieuweVerantwoordelijken` (`notificatieService.js:298-339`; aanroep `WerkbonPageV2.jsx:249,287`, `PlanningPage.jsx:540,852,1024`) | "Je bent verantwoordelijk voor <titel>" / "Jij bent het aanspreekpunt voor deze werkbon." | `werkbonnen/<id>` | optioneel |
| `planning_wijziging` | `meldPlanningWijziging` (`notificatieService.js:346-392`; `WerkbonPageV2.jsx:262,267`, `PlanningPage.jsx:548,1031,1039,1063,1068,1472,1506`) | soort `ingepland`: "Ingepland: <titel>"; `verzet`: "Planning gewijzigd: <titel>" + "Was <datum om hh:mm>, wordt …"; `afgehaald`: "Je staat niet meer op <titel>" + "Was: …" | link `planning`, related werkbon | **geen directe mail**; rij in tabel **`planning_wijzigingen`** (company_id, user_id, werkbon_id, werkbon_nummer, titel, klant, soort, oude_/nieuwe_ datum/start/eind) → avondcron Edge Function **`planning-samenvatting`** stuurt één samenvatting per medewerker |
| `website_aanvraag` | Edge Function `public-website-inquiry` (server, `supabase/functions/public-website-inquiry/index.ts:164-173`) naar actieve profielen met admin/planner of recht `verkoop` | titel/tekst uit aanvraag | `deal/<dealId>` (of `pipeline`), related `deal`/`inquiry` | – |

Regels: toewijzen/verantwoordelijk/planning slaan de maker zelf over (`id !== creatorId`), alleen **nieuw** toegevoegde personen (diff met vorige lijst).

### 3.4 Aanmaken (server)

- Client mag alleen self-insert (RLS); collega-meldingen via Edge Function **`create-notification`** (`supabase.functions.invoke('create-notification', { body: { notifications: [...] } })`, `notificatieService.js:32-65`).
- Payload per item: `{ user_id, type, title, body?, link?, related_type?, related_id?, email?: { subject, html } }`; max 50 per call; validatie dat doelgebruiker in hetzelfde bedrijf zit; `created_by` = aanroeper; mail via Edge Function `send-email` met `from_name: 'BossBase'`, reply-to = bedrijfsadres; e-mailadres alleen server-side opgezocht (auth.users → `company_members.email`) — `supabase/functions/create-notification/index.ts`.
- Mislukt de invoke → rpc **`meld_mail_fout`** (`p_soort: notificatie_<type>`, `p_fout`, `p_bron: 'pushNotifications'`, `p_gerelateerd_type`, `p_gerelateerd_id`) → tabel `mail_fouten`.
- Teamleden voor tag/toewijs-lijsten: `getActiveTeamMembers()` → `profiles` (`id, full_name, avatar_url`) met `company_id` en `actief = true`, gesorteerd op naam; `getTeamMembers()` = incl. jezelf (`notificatieService.js:399-434`).

---

## 4. Boss-chat (helpagent)

- UI: `src/components/BossChat.jsx`; state in App (`bossOpen`, `bossBerichten`, `bossGesprekId`, `src/App.jsx:1049-1053`) — **gesprek blijft bestaan tot uitloggen/herladen**, geen local/sessionStorage.
- Openen: Boss-knop in topbalk (`BossKnop`, `src/App.jsx:395-404, 662`). Zichtbaar voor **iedere ingelogde gebruiker**; geen recht/pakket-check in de frontend.
- Drawer rechts (`.drawer.boss-drawer`), kop "Boss" / "Helpt je met BossBase", avatar `/boss-avatar.png`. Begroeting (vast, wordt niet meegestuurd): "Hoi! Ik ben Boss. Waar kan ik je mee helpen?" (`BossChat.jsx:19`).
- Invoer: textarea, Enter = verstuur, Shift+Enter = nieuwe regel; knop "Stuur" (tijdens wachten "…"); hint "Enter verstuurt · Shift+Enter maakt een nieuwe regel". Sluiten via overlay/kruisje alleen als niet bezig.
- Aanroep: **directe `fetch`** (geen `functions.invoke`) naar `${VITE_SUPABASE_URL}/functions/v1/boss-chat`, headers `apikey: VITE_SUPABASE_ANON_KEY`, `Authorization: Bearer <access_token>`; body:
  ```json
  { "messages": [{ "rol": "gebruiker"|"boss", "tekst": "..." }], "conversation_id": "<uuid>" }
  ```
  (`conversation_id` alleen als bekend) — `BossChat.jsx:121-135`.
- Antwoord: **Server-Sent Events** (`event:`/`data:` regels). Events: `gesprek` `{id}` (gesprek-id bewaren), `tekst` `{tekst}` (stukjes plakken), `bezig` `{wat:'doorzetten'}` (toon "Boss zet je vraag door…"), `fout` `{bericht}`, `klaar` `{tekens}` — `BossChat.jsx:153-180`, `supabase/functions/boss-chat/index.ts:333-400`.
- Foutafhandeling: niet-OK → JSON `{error}` tonen (bv. limiet), anders "Boss is even niet bereikbaar. Probeer het zo nog eens."; leeg antwoord → "Boss gaf geen antwoord. Probeer het zo nog eens."; foutblok rood (#fef2f2 / #fecaca / #b91c1c).
- Opmaak antwoord: eigen mini-markdown na HTML-escape: `**vet**` → `<strong>`, `` `code` `` → `<code>`, regel die begint met `-`/`*` → "· " (`BossChat.jsx:31-42`); `white-space: pre-wrap`. Gebruikersbubbel groen `var(--p)` met witte tekst, Boss-bubbel `var(--bgs)`.
- Server (`supabase/functions/boss-chat/index.ts`, verify_jwt=true): model `claude-haiku-4-5-20251001`, max 1024 tokens, max 20 beurten historie; checks: ingelogd → actief account (`inactiefReden`) → bedrijf → rate limit **30 berichten/uur** via rpc `bb_boss_claim_bericht` (tabel `boss_rate_limit`) → Anthropic. Gesprek: rpc `bb_boss_start_gesprek`, opslag via rpc `bb_boss_log_gesprek` (tabel `boss_conversations`). Tool `stuur_naar_team` (samenvatting, reden) → mail naar intern adres (`BOSSBASE_INTERN_EMAIL`, standaard `hallo@bossbase.nl`), max 5 doorzettingen/dag (rpc `bb_boss_claim_doorzet` / `bb_boss_geef_doorzet_vrij`). Kennis: gegenereerd `supabase/functions/_shared/bossKennis.ts` uit map `bob-knowledge` (`scripts/gen-boss-kennis.mjs`). Gedachtestreepjes worden server-side vervangen.

---

## 5. Bug of idee / meldpunt

- UI: `MeldKnop` + `MeldModal` in `src/components/Meldpunt.jsx`; geplaatst in topbalk (`src/App.jsx:661`) met `pagina={pageMeta.title}`. Zichtbaar voor **iedere ingelogde gebruiker**, geen recht/pakket/readonly-check.
- Knop: pil "Bug of idee?" (icoon MessageSquarePlus) + cadeau-icoon als actie loopt; tooltip "Bug gevonden of een idee? Meld het en maak kans op <eerste prijs>" of "…Laat het ons weten". Stijl `.tb-meld`: hoogte 34px, rand `#bbf7d0`, achtergrond `var(--pll)` #f0fdf4, tekst `var(--pd)` #15A34A (`src/bb-dashboard.css:3360-3366`); smal scherm alleen icoon.
- Formulier:
  - Soort (radiogroep, verplicht): `bug` "Bug — Iets werkt niet zoals het hoort" / `idee` "Idee — Iets wat BossBase beter zou maken". Standaard `bug`.
  - Omschrijving (textarea, `maxLength` 5000, minimaal **5 tekens** na trim om te kunnen versturen); placeholder per soort; Ctrl/Cmd+Enter verstuurt.
  - Schermafbeelding (optioneel): PNG/JPG/WebP; kiezen of plakken (Ctrl/⌘+V); >3 MB wordt client-side verkleind naar max 2400px breed JPEG 0.85; >5 MB na verkleinen → fout "Deze afbeelding is te groot (max. 5 MB)."; foute type → "Alleen PNG, JPG of WebP." — `Meldpunt.jsx:86-100`, `meldpuntService.js:77-95`.
  - Tekst: "We sturen automatisch mee: je bedrijf, je naam, deze pagina, je abonnement en je browser."
  - Knoppen: Annuleren / "Melding versturen" ("Versturen…").
- Meegestuurde context: `pagina` (titel), `pagina_url`, `browser` (bv. "Chrome 140 op macOS"), `user_agent`, `scherm` ("WxH venster, WxH scherm") — `meldpuntService.js:46-74`.
- Versturen: `supabase.functions.invoke('meldpunt', { body: { soort, omschrijving, pagina, pagina_url, browser, user_agent, scherm, screenshot?: { type, data: base64 } } })` → `{ ok, nummer, bevestigd, actie }`. Terugvalfout: "Versturen lukte niet. Probeer het zo nog eens, of mail je melding naar info@bossbase.nl." — `meldpuntService.js:106-124`.
- Server (`supabase/functions/meldpunt/index.ts`): auth + actief; validatie soort ∈ {bug, idee}, omschrijving 5–5000, screenshot type/≤5 MB; **rate limit 10 meldingen/uur per gebruiker** (429 "Je hebt het afgelopen uur al veel meldingen gedaan…"); verrijkt met bedrijfsnaam, gebruikersnaam/e-mail/rol, abonnement (via `subscriptions` + rpc `bb_effective_tier`); insert in tabel **`meldingen`** (oplopend `nummer`), screenshot naar privé storage-bucket **`meldingen`** pad `<companyId>/<id>.<ext>`; mail naar `MELDPUNT_EMAIL` (standaard `info@bossbase.nl`) met screenshot als bijlage; bevestigingsmail naar melder; update `screenshot_pad`, `mail_verstuurd_op`.
- Bevestigingsscherm: "Bedankt, je melding is binnen" + "We hebben hem ontvangen onder nummer **N**." (+ "Je krijgt ook een bevestiging per mail." als bevestigd) + "Je doet mee aan de actie. Succes!" als actie; knoppen "Nog iets melden" / "Sluiten".

### "Prijsactie" (meldactie) — wat het is

Een **winactie voor melders**: wie een bug/idee meldt maakt kans op prijzen. Volledig los van de meldfunctie zelf; staat de actie uit, dan verdwijnt alleen de prijzentekst.
- Opslag: tabel **`platform_instellingen`**, rij `sleutel = 'meldactie'`, `waarde` jsonb `{ actief: boolean, prijzen: string[] }` (+ `bijgewerkt_op`, `bijgewerkt_door`). Seed: `actief` aan, prijzen `['Een MacBook Pro', 'Een Apple Watch Ultra', '3× een jaarabonnement BossBase']` — `supabase/migrations/20260915160000_meldpunt.sql:57-60`.
- Client leest het bij laden én bij elk openen (`getMeldactie()`; bij fout of `actief !== true` of lege lijst → `null`, geen prijzen tonen) — `meldpuntService.js:12-21`.
- Toon in modal: blok "Wie een melding doet, maakt kans op:" + lijst prijzen + info-knop met voorwaarden (uitklapbaar): "Deelname staat open voor gebruikers van BossBase. De prijzen worden verdeeld onder de eerste 1500 klanten die iets doorgeven. Je mag zoveel meldingen doen als je wilt: elke melding geeft extra kans om te winnen. Winnaars worden door ons gekozen uit de ingezonden meldingen en krijgen persoonlijk bericht. Over de uitslag kan niet worden gecorrespondeerd." — `Meldpunt.jsx:160-190`.
- Server zet `meldingen.actie_deelname = true` als actie actief is en prijzen niet leeg.
- Beheer: super-admin (`src/components/Meldingen.jsx`) — schakelaar "Actie met prijzen aan/uit", overzicht met filters status (`nieuw` #b45309/#fffbeb, `opgepakt` #1d4ed8/#eff6ff, `afgehandeld` #15803d/#f0fdf4, `afgewezen` #6b7280/#f3f4f6, + Alle) en soort (bug #b91c1c/#fef2f2, idee #6d28d9/#f5f3ff); max 500 rijen; status wijzigen via select (update `meldingen.status`); screenshot via signed URL (10 min). Niet relevant voor de gewone app-gebruiker.

---

## 6. Help / support / kennisbank

- **In het dashboard is er geen help-pagina, FAQ, telefoonnummer of kennisbank-link.** De enige hulpkanalen in de app zijn:
  1. **Boss-chat** (helpagent, §4) — met doorzetten naar het team.
  2. **Meldpunt "Bug of idee?"** (§5).
  3. Losse verwijzingen naar **info@bossbase.nl** in teksten: uitloggen-bij-deactivatie (`src/App.jsx:1277`), laadfouten (`src/lib/laadfout.js:47-48`), account/bedrijf sluiten en gegevensverwijdering (`src/pages/InstellingenPage.jsx:1318, 1883, 1915`), meldpunt-terugval.
- Geen telefoonnummer van BossBase gevonden in `src/` (alleen demo-data/placeholders).
- Op de **marketingsite** (aparte bundle, `src/marketing/routes.jsx`): `/kennisbank` (`src/pages/marketing/KennisbankPage.jsx`, artikelen uit `src/content/kennisbank/*.md` — 12 artikelen, o.a. offerte maken, werkbon, nacalculatie, betalingsherinnering), `/faq` (`FaqPage.jsx`), `/contact` (`ContactPage.jsx`, contactadres `info@bossbase.nl`, `src/marketing/site.js:9`). Let op: de contact-FAQ zegt nog "er is geen app" (`ContactPage.jsx:126`).
- Interne kennis voor Boss: map `bob-knowledge` → `supabase/functions/_shared/bossKennis.ts`.

---

## 7. Rechten, pakketten, modules

### 7.1 Rollen

`profiles.role`: `admin`, `medewerker`, en legacy `planner`.
- Admin: `can()` en `magBewerken()` altijd true; rechten worden niet geladen (`src/App.jsx:1144-1154`, `src/hooks/usePermissions.js:56`).
- In Team-pagina kun je alleen Medewerker/Admin kiezen; "Planner" verschijnt alleen als optie als het lid al planner is (`src/pages/TeamPage.jsx:237-239`; badge groen "Planner" `:516`).

### 7.2 Volledige lijst rechtencodes (`user_permissions.permission`)

Bron: `src/config/permissions.js:16-95`. Opslag tabel **`user_permissions`** (`user_id, company_id, permission, granted`); laden = `granted = true` rijen (`src/services/permissionsService.js:4-13`); opslaan = delete alles van gebruiker + insert (`:17-40`). Standaard voor nieuwe medewerker: `['projecten']` (`permissions.js:111`). Waarschuwing bij aanzetten: `alles_inzien`.

| Groep | Code | Label | Server-side (RLS via `bb_has_permission`) | Waar in UI |
|---|---|---|---|---|
| Klanten & Verkoop | `klanten_bewerken` | Klanten bewerken | ja | klant aanmaken/wijzigen (`BbPages1.jsx`, `LeverancierPage.jsx`, `WerkbonPageV2.jsx`, `magBewerken` in `ProjectDetailDrawer.jsx`) |
| | `klanten_verwijderen` | Klanten verwijderen | ja (`bb_is_admin_or_permission`, geen planner-uitzondering) | verwijderknoppen klant/leverancier |
| | `verkoop` | Verkooppijplijn | ja | menu Pipeline; CRM-widgets; "Nieuwe aanvraag" (`magBewerken`) |
| Uitvoering | `projecten` | Projecten | – (RLS beperkt tot eigen) | menu Projecten |
| | `projecten_bewerken` | Projecten bewerken | ja | projecten wijzigen |
| | `werkbonnen_bewerken` | Werkbonnen bewerken | ja | alle werkbonnen bewerken + materiaalkosten |
| | `planning` | Planning | ja | menu Planning, inplannen, agenda collega's bewerken |
| | `alles_inzien` | Alle projecten & werkbonnen inzien | ja | brede inzage |
| | `agenda_inzien` | Elkaars agenda inzien | ja | agenda collega's lezen; widget activiteiten-per-dag |
| Financieel | `projectbedragen` | Projectbedragen zien | UI-gate | bedragen op project/werkbon/klantkaart |
| | `bedrijfsfinancien` | Bedrijfsfinanciën zien | UI-gate | menu Financiën; omzet/winst-widgets |
| | `offertes` | Offertes | ja | menu Offertes; offerte-tab/-widget |
| | `facturen` | Facturen | ja | menu Facturen; factuur-tab/-widgets |
| | `inkoopprijzen` | Inkoopprijzen zien | ja (`bb_mag_inkoopprijs_zien`) | inkoop/marge materialen |
| | `kosten` | Kosten | ja | menu Kosten; kosten-tab/-widgets |
| Beheer | `team` | Team beheren | UI-gate | menu Team (uitnodigen/rechten blijft admin) |
| | `instellingen` | Instellingen | UI-gate | bedrijfsinstellingen-tabbladen |
| | `database` | Database & Export | UI-gate | menu Database |

### 7.3 Check-functies

| Functie | Bestand | Wat |
|---|---|---|
| `usePermissions().can(recht)` | `src/hooks/usePermissions.js:65-68` | "zien": in gedeelde werkruimte (`plan.has('gedeelde_werkruimte')`) is elk recht in `INZAGE_RECHTEN` automatisch true; anders = `magBewerken` |
| `usePermissions().magBewerken(recht)` | `usePermissions.js:54-61` | "schrijven": admin → true; `planner` + `planning` → true; anders `userPermissions.includes(recht)` |
| `INZAGE_RECHTEN` | `usePermissions.js:28-40` | `verkoop, offertes, facturen, kosten, bedrijfsfinancien, projectbedragen, alles_inzien, agenda_inzien, projecten, database, team` (NIET: klanten_bewerken/verwijderen, projecten_bewerken, werkbonnen_bewerken, planning, inkoopprijzen, instellingen) |
| `usePlan()` | `src/hooks/usePlan.js` | `has(feature)`, `limit/used/within/stand/resterend(limiet)`, `readonly`, `readonlyReden`, `magBeheren`, `tier`, `trial`, `modules`, `needsFor`, `needsForLimit` |
| `usePlanGuard()` | `src/components/PlanUpgradeModal.jsx:26-77` | wikkelt acties: `guardSchrijven(actie, fn)` (readonly), `guardLimiet(key, fn)` (readonly → limiet), `guardFeature(key, fn)` (readonly → feature); blokkade → navigeert naar `/dashboard/abonnement?reden=readonly|limiet|feature|gebruikers&key=&actie=` (`src/lib/abonnementNav.js`) |
| `PlanStand` | `PlanUpgradeModal.jsx:81-102` | pil "gebruikt / max <label>" (vol: #fef2f2/#b91c1c; bijna (≥ max−10%): #fffbeb/#b45309) |
| `magWidgetZien` / `layoutZichtbaar` | `src/data/widgetRegistry.js` | §2.4 |
| Route-guard | `src/App.jsx:1567-1603` | §1.3 |
| `isReadonlyFout`, `nettePlanFout` | `src/lib/readonly.js:69-95` | DB-fout → NL-tekst ("Dit past niet binnen je huidige abonnement. Kijk bij Instellingen → Abonnement." / readonly-tekst) |

Hardcoded rolchecks (`['admin','planner'].includes(role)`) i.p.v. rechten: `UrenPageV2.jsx:689` (uren voor anderen boeken), `WerkbonPageV2.jsx:145,506,1106,1625`, `ProjectsPage.jsx:308`, `OffertesPage.jsx:1085` (offertes beheren: alleen admin/planner), `FacturenPage.jsx:658,1082` (alleen admin/planner), `BbPages1.jsx:1064`, `ProjectDetailDrawer.jsx:1750`, `SharedModals.jsx:1130`, `werkbonUrenService.js:43`.

Gebruik van guards (selectie): `guardLimiet('klanten'|'offertes'|'facturen'|'gebruikers')`, `guardFeature('betaalherinneringen'|'planning'|'rollen_rechten')`, `guardSchrijven('Een activiteit inplannen'|'Een werkbon aanmaken'|'Een project aanmaken'|'Een aanvraag toevoegen'|'Een lead toevoegen'|'Kosten toevoegen'|'Uren boeken'|'Een werkbon inplannen'|'Een afspraak inplannen')`. `plan.has(...)`: `voertuigen, planning, gedeelde_werkruimte, kosten_nacalculatie, betaalherinneringen, stripe_betaallink, digitale_handtekening, boekhoudkoppeling, eigen_email_templates, rollen_rechten, btw_overzicht, werkbonnen`.

### 7.4 Pakketten, features, modules, limieten

Bron: `src/lib/tiers.js`, `src/lib/features.js` (ook seed voor DB-tabellen `plan_features`, `plan_limits`, `plan_modules`).

Pakketten (`TIERS`, prijzen excl. btw/maand): `starter` Starter €29, `groei` Groei €39, `team` Team €59. Extra gebruiker €10; inbegrepen gebruikers starter 1, groei 1, team 0. Standaard bij onbekend: `starter` (`DEFAULT_TIER`). Onbekende/`trial` plan → `groei` (`TRIAL_TIER`, `effectiveTier`). Jaarabonnement: welkomstactie `gratis_maanden` (2 mnd, alle tiers) of `gratis_website` (groei/team).

Features per pakket (`features.js:70-92`):
- **Starter**: `crm_pipeline, klanten, leads, offertes, facturen, werkbonnen, uren, agenda, adres_autocomplete, afspraakherinnering, email_templates_bewerken`.
- **Groei** = Starter + `digitale_handtekening, betaalherinneringen, boekhoudkoppeling, btw_overzicht, kosten_nacalculatie, eigen_email_templates` + **`gedeelde_werkruimte`** (intern).
- **Team** = Groei-extra's (zonder `gedeelde_werkruimte`) + `rollen_rechten, planning, stripe_betaallink, voertuigen`.

Modules (los bij te kopen, `features.js:105-114`; actieve modules in tabel `company_modules` (`module_key, actief`)):
| key | Label | €/mnd | vereist | te koop bij |
|---|---|---|---|---|
| `stripe_betaallink` | Stripe betaallink | 10 | – | groei |
| `planning` | Planningsmodule | 10 | – | groei |
| `voertuigen` | Voertuigen | 5 | planning | groei |
| `hosting` | Website-hosting | 5 | – | groei, team |

Limieten (`features.js:147-151`; `null` = onbeperkt; tijdens trial altijd onbeperkt): starter gebruikers 1, klanten 100, offertes 20/periode, facturen 20/periode; groei gebruikers 2, rest onbeperkt; team alles onbeperkt. Telwijze: gebruikers/klanten = voorraad; offertes/facturen = per factuurperiode via ledger `plan_usage_events`.

Serverwaarheid: rpc **`get_plan_status()`** (`supabase/migrations/20260803120000_readonly.sql:296-326`) → `{ tier, plan, status, trial, trialEndsAt, periodeStart, periodeEind, readonly, readonlyReden, magBeheren, modules[], features[], limits{key:{max,gebruikt,telwijze}} }`; gebaseerd op `bb_effective_tier`, `bb_is_trial`, `bb_is_readonly`, `bb_readonly_reden`, `bb_mag_abonnement_beheren`, **`bb_has_feature(company_id, feature)`**, `bb_limit`, `bb_usage`, tabellen `subscriptions`, `company_modules`, `plan_feature_defs`, `plan_limits`. Mapping client: `src/services/planService.js:10-32`; fallback zonder RPC: `fallbackPlanStatus(tier)` (nooit readonly). Upgrade-wens (oud): tabel `upgrade_requests` (`requestUpgrade`). Andere DB-helpers: `bb_gedeelde_werkruimte()`, `bb_is_admin`, `bb_is_admin_or_permission`, `bb_mag_schrijven`, `bb_mag_inkoopprijs_zien`, `bb_mag_werkbon_uren_beheren`, `bb_mag_wisselen`, `bb_mag_direct_opzeggen`.

### 7.5 Read-only (geen geldig abonnement)

- Alleen van server: `planStatus.readonly === true` (`usePlan.js:30`). Redenen + teksten `src/lib/readonly.js:11-40`:
  - `proefperiode_verlopen`: "Je gratis periode is voorbij" — knop "Abonnement kiezen".
  - `betaling_mislukt`: "Je laatste betaling is niet gelukt" — "Betaalgegevens bijwerken".
  - `opgezegd`: "Je abonnement is gestopt" — "Opnieuw abonneren".
  - onbekend: "Nieuw werk vastleggen staat stil" — "Abonnement regelen".
- Blijft werken: "Alles bekijken, zoeken en filteren", "Exporteren naar CSV of Excel", "Facturen op betaald zetten", "Binnenkomende aanvragen van je website"; plus "Je gegevens blijven bewaard en zijn meteen weer volledig beschikbaar zodra je abonnement loopt."
- Banner `ReadOnlyBanner` (`src/components/ReadOnly.jsx`): rand `#fcd9a4`, achtergrond `#fffbf3`, titel `#8a5a00`; knop alleen als `magBeheren` (eigenaar/admin), anders "Vraag de beheerder van je bedrijf om het abonnement te regelen."

### 7.6 Hoe wordt de rol `planner` behandeld?

- **Concept**: "'planner' is geen aparte rol meer maar een medewerker met planning-recht" (`usePermissions.js:57`). Niet meer te kiezen bij nieuwe teamleden.
- **Frontend `can/magBewerken`**: planner krijgt alleen automatisch `planning`; voor al het andere telt `user_permissions` (`usePermissions.js:59`).
- **Route-guard in App.jsx** kent die planner-uitzondering **niet**: een planner zonder expliciet `planning`-recht ziet het menu-item Planning (via `can`) maar de route-guard (`userPermissions.includes`) kaatst hem terug — inconsistentie (`src/App.jsx:1589-1592`). Bovendien vereist Planning de feature `planning` (Team of module).
- **Database `bb_has_permission`** (`supabase/migrations/20260620030000_security_audit2_fixes.sql:34-47`): `role IN ('admin','planner')` → **true voor élk recht**. De DB is dus ruimer voor planners dan de UI.
- **Hardcoded**: op veel plekken telt planner gelijk aan admin voor beheer (offertes/facturen beheren, uren voor anderen boeken, werkbonnen/projecten beheren — zie lijst §7.3); `bb_mag_werkbon_uren_beheren` (admin en planner als vangnet, CLAUDE.md).
- Dashboard: planner krijgt standaard de `medewerker`-layout (alleen admin krijgt `standaard`) — `DashboardHome.jsx:330`.
- Website-aanvraagmeldingen gaan naar admin/planner + wie `verkoop` heeft (`public-website-inquiry`).

### 7.7 Gedeelde werkruimte (Groei)

Feature `gedeelde_werkruimte` (alleen Groei, intern): alle `INZAGE_RECHTEN` vervallen (iedereen ziet), alle dashboardwidgets zichtbaar (behalve pakket-gates); schrijven blijft rechten vragen (`magBewerken`). DB-policies volgen via `bb_gedeelde_werkruimte()`.

---

## 8. Kleuren / thema

Bronnen: `src/bb-dashboard.css:1-60` (dashboard-tokens), `src/styles.css:10-41`, `src/pages/dashboard/WidgetCard.jsx:16-29`, `src/utils/statusColors.js:17-26`, `index.html:15`.

| Token | Waarde | Betekenis |
|---|---|---|
| `--bb-black` / `--dk` / `--sb` / `--ink` / `--black` | **`#0D0D0D`** | BossBase-zwart (tekst, zijbalk-achtergrond, `theme-color`) |
| `--bb-neon-green` / `--p` / `--color-primary` / `--accent` | **`#1DDB62`** | merkgroen (neon) |
| `--bb-dark-green` / `--pd` / `--color-primary-dark` / `--success` | **`#15A34A`** | donkergroen (tekst op licht, succes) |
| `--pl` / `--color-primary-light` | `#d1fae5` | lichtgroen |
| `--pll` | `#f0fdf4` | zeer lichtgroen (ongelezen melding, meldknop) |
| `--sbb` | `#1f2020` | zijbalk-randen/scheiders |
| `--bg` | `#ffffff` | kaart/hoofdachtergrond |
| `--bgs` | `#fafaf8` | paginaachtergrond (body), Boss-bubbel |
| `--bgx` | `#f5f4f1` | extra vlak |
| `--dm` / `--body-text` | `#374151` | bodytekst |
| `--dmu` / `--muted` | `#6b7280` | gedempte tekst |
| `--dl` | `#9ca3af` | lichte tekst |
| `--border` | `#f0ede9` | rand |
| `--bstrong` / `--br` / `--line` | `#e5e7eb` | sterke rand |
| `--danger` | `#d92d20` | gevaar (styles.css) |
| `--warning` | `#f59e0b` | waarschuwing |
| `--blue` | `#2563eb` | info |

Status-tonen (`statusColors.js`): gray `#f3f4f6`/`#6b7280` (dot `#9ca3af`), blue `#eff6ff`/`#2563eb`, orange `#fff4ec`/`#e8784a`, green `#ecfdf5`/`#15A34A`, red `#fef2f2`/`#dc2626`, purple `#f5f3ff`/`#7c3aed`. Domeinen: factuur concept=grijs, verzonden/open=blauw, betaald=groen, te laat=rood, geboekt (uit SnelStart)=paars; offerte concept=grijs, verzonden/bekeken=blauw, geaccepteerd=groen, afgewezen/verlopen=rood; werkbon/project gepland=blauw, in uitvoering=oranje, afgerond=groen; activiteit open=grijs, vandaag=blauw, te laat=rood, gereed=groen.
Widget-chip-tonen (`bb-dashboard.css:2273-2280`): success `#15A34A`/`#ecfdf5`, info `#2563eb`/`#eff6ff`, warn `#dc2626`/`#fef2f2`, neutral `#6b7280`/`#f3f4f6`, purple `#7c3aed`/`#f5f3ff`, orange `#c2410c`/`#fff4ec`, teal `#0d9488`/`#f0fdfa`, amber `#b45309`/`#fffbeb`.
Pipeline-fasekleuren (keuze, opgeslagen als hex in `pipeline_stages.color_class`): Blauw `#3b82f6`, Groen `#1DDB62`, Oranje `#f97316`, Rood `#ef4444`, Paars `#a855f7`, Geel `#eab308`, Roze `#ec4899`, Grijs `#6b7280` (`src/bb-shared.jsx:180-189`).

Zijbalk (donker): achtergrond `#0D0D0D`; sectiekoppen `rgba(255,255,255,.38)`; item `rgba(255,255,255,.6)`; hover `rgba(29,219,98,.12)` + tekst `#1DDB62`; actief `rgba(29,219,98,.15)` + tekst `#1DDB62` + linkerrand 2.5px `#1DDB62` (`bb-dashboard.css:142-169`). Breedte `--sw: 232px`; topbalkhoogte `--th: 58px`.
Logo: tekst "Boss" + "Base" (Inter 800, 1.3rem, letter-spacing −.03em): op licht "Boss" `#0D0D0D` + "Base" `#1DDB62`; op donker (`logo--dark`) "Boss" `#fff` + "Base" `#1DDB62` (`src/bb-shared.jsx:243-251`, `bb-dashboard.css:145-149`).
Lettertype: **Inter** (variable, self-hosted via `@fontsource-variable/inter`, `src/fonts.css`); body 14px (`bb-dashboard.css:69`).

**Donkere modus: bestaat niet in het dashboard.** Geen `prefers-color-scheme`, `data-theme` of `.dark` in `styles.css`, `bb-dashboard.css`, `mobile.css`, `bb-shared.jsx` of `App.jsx`. Alleen de zijbalk is donker. (`mobile.css` = responsive regels, grotendeels irrelevant nu <768px geblokkeerd is.)

---

## 9. Tekstopmaak / notities / @-vermeldingen

### 9.1 Opslagvorm

- Notities worden als **HTML** opgeslagen. Mention = niet-bewerkbare span:
  `<span class="bb-mention" data-id="<userId>" data-name="<Naam>" contenteditable="false">@Naam</span>` (`src/lib/noteFormat.js:4-6, 33`).
- Legacy-notities: platte tekst met `@[Naam](id)`; worden bij weergeven omgezet (`markupToHtml`, `normalizeToHtml`).
- Opmaak beperkt tot **vet / cursief / onderstreept + regelovergangen** (Chrome contentEditable levert `<div>`/`<br>`).
- Tabellen (logs, per item rijen): `klant_tijdlijn`, `leverancier_tijdlijn`, `activiteit_notities`, `project_notes`, `werkbon_notities` (+ oude kolom `activities.notes`) — services `klantTijdlijnService.js`, `leverancierTijdlijnService.js`, `activityService.js:244-294`, `projectsService.js:448-479`, `werkbonService.js:780-853`.

### 9.2 Sanitize (DOMPurify)

`src/lib/noteFormat.js:12-46`:
```js
NOTE_ALLOWED_TAGS = ['b','i','u','strong','em','br','div','p','span']
NOTE_ALLOWED_ATTR = ['class','data-id','data-name']
DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR })
```
- Bij **weergave** altijd: `renderNote(value)` → `normalizeToHtml` → sanitize → `dangerouslySetInnerHTML` (`src/components/NoteEditor.jsx:38-43`). (`contenteditable` valt bij sanitize weg.)
- Bij **opslaan**: alleen `klantTijdlijnService.js:43` en `leverancierTijdlijnService.js:45` sanitizen vóór insert; de editor zelf (`emit`, `NoteEditor.jsx:123-131`) geeft ruwe `innerHTML` door — andere tabellen kunnen dus ongesanitizede HTML bevatten; lezen is altijd gesanitized.
- Leeg-detectie: `htmlToPlain(html) === ''` en geen mention-span → `''`.
- Afgeleiden: `htmlToPlain` (previews, witruimte samengevouwen), `htmlToPdfText` (PDF/mail: mention → naam, `<br>`/blok-einde → regelovergang, `<li>` → "• "), `stripMentions` (notificatie-body, `notificatieService.js:172-183`).
- Mail-HTML (andere context): `DOMPurify.sanitize(m.body_html)` default-config in mailvoorbeeld (`src/pages/BbPages1.jsx:1314`, `src/utils/mailFrame.js`).

### 9.3 NoteEditor — `src/components/NoteEditor.jsx`

- contentEditable met toolbar B/I/U (`document.execCommand('bold'|'italic'|'underline')`, sneltoetsen Ctrl+B/I/U), actieve-staat via `queryCommandState`.
- `mentions={true}` (interne notities): bij `@` + tekst → dropdown met teamleden (filter `fullName` bevat query, max 8); ↑/↓, Enter kiest, Escape sluit; invoegen = mention-span + spatie. Placeholder "Notitie… Typ @ om iemand te taggen".
- `mentions={false}` (mail/klantgericht): geen tagging, HTML/links behouden (`plainToEditorHtml`), placeholder "Notitie…".
- Mention-chip stijl: achtergrond `rgba(29,219,98,.15)`, tekst `#15803d`, radius 4px, padding 0 3px, vet (`NoteEditor.jsx:22-31`).
- Imperatieve API: `insertAtCursor(text)`, `setHtml(html)` (mail-composers, `{{variabele}}`).

### 9.4 NotitieLog — `src/components/NotitieLog.jsx`

Gedeeld chronologisch log: editor bovenaan (knoppen "Wissen", "Opslaan"/"Opslaan..."), daaronder kaarten met `renderNote(body)` + voetregel "`<auteur> · <d mmm jjjj · hh:mm>`" + optioneel "Verwijderen" en eigen acties; paginering 10 per keer ("Laad N meer"); lege staat "Nog geen notities"; fout → toast "Notitie opslaan mislukt". Teamleden zelf ophalen via `getTeamMembers()` als niet meegegeven. Na opslaan triggert de aanroeper `createMentionNotifications` (§3.3).

### 9.5 Tijdlijn — `src/components/Tijdlijn.jsx`

Items `{ id, type, omschrijving, aangemaaktop }`, `omschrijving` via `renderNote`. Types + iconen: `klant_aangemaakt, leverancier_aangemaakt, offerte_aangemaakt/_verzonden/_geaccepteerd/_afgewezen, factuur_aangemaakt/_verzonden/_betaald, creditfactuur_aangemaakt, project_aangemaakt, project_status_gewijzigd, notitie_toegevoegd, email_verstuurd`. Kleur per prefix: klant/leverancier `#3b82f6`, offerte `#f97316`, factuur `#10b981`, credit `#ef4444`, project `#6366f1`, notitie `#10b981`, email `#0ea5e9`.

### 9.6 Boss-chat-opmaak

Apart: geen DOMPurify, eigen escape + mini-markdown (§4).

---

## 10. Bijzonderheden / aandachtspunten voor de mobiele app

1. `Sidebar.jsx`/`Header.jsx` zijn dode code; het echte menu staat in `App.jsx` (NAV).
2. Zijbalk-badge pipeline (`d.stage === 'new_lead'`) telt in productie nooit; gebruik `firstStageId(stages)` zoals de bel en de `new_leads`-widget.
3. `dashboardStatsService.getDashboardAggregaten` (rpc `bb_dashboard_aggregaten`) bestaat maar wordt niet gebruikt — kan voor mobiel nuttig zijn om niet alle facturen/kosten op te halen.
4. Uren-widget heeft vast weekdoel 40u; uren-widgets tonen alleen eigen uren.
5. Agenda-widget op home toont **eigen open activiteiten + eigen agenda-items (`calendar_events`)**, géén werkbonnen (die staan in "Werkbonnen vandaag").
6. Planner-rol: frontend ≠ route-guard ≠ database (zie §7.6).
7. Geen dark mode in het dashboard; merkkleuren `#0D0D0D` / `#1DDB62` / `#15A34A`.
8. MobileBlock "Download de app"-knop heeft nog `href="#"`.
9. Notities: lezen altijd sanitizen met dezelfde allowlist; opslaan als HTML met mention-spans; na opslaan `create-notification` aanroepen voor tags.
