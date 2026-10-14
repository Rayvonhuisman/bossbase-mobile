# F — Inventaris BossBase-app (Expo/RN + react-native-web)

Bron: `/Users/macbook/bossbase-gelijk`, branch `app-gelijktrekken` (read-only ingezien, 2026-10-13).
Alle paden relatief aan die root. `pad:regel` verwijst naar de huidige code; MOBILE_*.md alleen als hint gebruikt.

---

## 0. Kernpunten in één oogopslag

- **Tabbalk (6):** Vandaag · Agenda · Werkbonnen · Klanten · Uren · Menu (`app/(tabs)/_layout.tsx:180-222`).
- **Menu** heeft 3 groepen: *Werk & uitvoering* (Activiteiten, Taken, Foto's & bestanden, Notities), *Sales & administratie* (Pipeline, Projecten, Offertes, Kosten, Facturen), *Support* (Help, Feedback, Contact support — alle drie naar `/support`) (`app/(tabs)/menu.tsx:70-92`). Team / Bedrijfsinstellingen / Integraties staan **alleen** in Profiel (`app/profile/index.tsx:156-201`).
- **Geen donkere-modusknop in het menu** zelf; de toggle zit in de header-cluster (`HeaderActions` = ThemeToggleButton + ProfileSettingsButton) via `AppTopBar showProfileButton` (`src/components/AppTopBar.tsx:119-122`, `src/components/HeaderActions.tsx:10-16`). In `menu.tsx:211-234` staan ongebruikte `darkRij`-stijlen (restant van een verwijderde rij).
- **Donkergroen:** `ds.greenInk = ds.barBg = #0A2E1F` (light), `darkTheme.barBg = #1B2822` (dark), dark-bg `#0B1210`, web-buitenkader dark `#060A08`. Gebruikt in tabbalk, Vandaag-herokaart en Profiel-herokaart (zie §4).
- **Paginering:** nergens `.range()`. Vaste `.limit()` (100/120/200) op de meeste lijsten; **géén limit** op klanten, werkbonnen, uren, agenda-items → stil afgekapt op PostgREST max-rows (standaard 1000). Nummergeneratie offertes/facturen leest alle `nummer`-rijen zonder limit (zie §1.x en §9).
- **HTML/markdown:** alleen `noteService` (klant_tijdlijn) zet HTML om (`naarPlatteTekst`/`naarHtml`, `src/services/noteService.ts:70-94`). Werkbonnotities, projectnotities, werkbon-omschrijving/opmerking, offerte-omschrijving worden **ruw** getoond (zie §5).
- **Rechten:** `user_permissions` + RPC `get_plan_status`; `mag(module, actie)` tegen actiematrix `ACTIES` (`src/lib/permissions.ts:209-315`). Routegates alleen voor pipeline/offers/invoices/expenses/team/settings/integrations (`src/lib/permissions.ts:107-118`) — **geen featuregates** voor werkbonnen/uren/agenda/klanten/crm_pipeline/offertes/facturen.

---

## 1. Routes en schermen

Legenda kolommen: *Data* = service → tabel/RPC; *Acties* = C(reate)/U(pdate)/D(elete)/overig; *Zoek/filter/sort*; *Pag.* = limit/range; *Staten* = laad/leeg/fout; *Checks* = rechten/feature/readonly.

### 1.1 Root, auth, onboarding

| Route | Bestand | Wat | Opmerkingen |
|---|---|---|---|
| `/` | `app/index.tsx:5-23` | Redirect: sessie → `/(tabs)/today`, anders → `/(onboarding)` | Laadscherm tijdens restoring |
| root layout | `app/_layout.tsx:23-77` | Providers: Theme → MobielKader → Font → Auth → Permissions → Onboarding → Toast; Stack; DialogHost; NieuweVersieMelding; service worker (web) | |
| `/(auth)/login` | `app/(auth)/login.tsx` | E-mail/wachtwoord via `supabase.auth.signInWithPassword` (`src/providers/AuthProvider.tsx:149`); toont `InstalleerBossBase` | |
| `/(onboarding)` (index, role, company, account, success) | `app/(onboarding)/*.tsx` | Welkom → rol → bedrijf → account (`signUp`, `account.tsx:63`) → success → login | Eigen tokens `app/(onboarding)/_tokens.ts` |
| `/installeren` | `app/installeren.tsx` | Openbare PWA-installatie-uitleg | |
| `+not-found` | `app/+not-found.tsx` | 404 | |

Tabs-layout bewaakt sessie/profiel: `restoring`/`loading-profile` → LoadingScreen, geen sessie → login, `profile-error` → foutscherm met "Opnieuw proberen"/"Uitloggen" (`app/(tabs)/_layout.tsx:137-170`). `(more)`-layout bewaakt alleen sessie (`app/(more)/_layout.tsx:16-27`).

### 1.2 Tab: Vandaag — `app/(tabs)/today.tsx`

- **Toont:** AppTopBar (eyebrow = datum, "Hoi {voornaam}", profielknop+thema) (`:248-252`); donkere herokaart "Werkbonnen x van y klaar" + "Werkdag x/8 u" met weeksegmenten (`:262-300`, stijl `:626-660`); waarschuwing als werkdaguren ontbreken/niet kloppen (`:309-320`); snelle acties *Uren schrijven*, *Foto bij werk*, *Nieuwe werkbon*, *Klant zoeken* (`:322-347`); "Nu bezig / Volgende" kaart met Bel/Route/Uren (`:349-400`); tijdlijn van vandaag (`:574`).
- **Data:** `listPlanningItemsForRange` (calendar_events + activities + werkbonnen) voor vandaag, `listUrenForProfile` voor de week, `getNextPlanningItem` (`:134-150`). Medewerker: werkbonnen gefilterd op `assigned_to`/`assigned_to_ids` (`:113`).
- **Acties:** alleen navigatie.
- **Pag.:** geen limit op agenda-/werkbonquery's (zie §1.4).
- **Staten:** pull-to-refresh via `useLaden`; **geen ErrorState** — fouten worden genegeerd (alleen `if (!weekRes.error)` `:153`).
- **Checks:** **geen** `usePermissions`. Snelle actie "Nieuwe werkbon" wordt altijd getoond (doelscherm blokkeert pas daarna); "Foto bij werk" gaat naar de werkbonnenlijst.

### 1.3 Tab: Agenda (route `planning`) — `app/(tabs)/planning.tsx` (1498 r.)

- **Toont:** weergaves dag/week/maand, ook via `?view=` (`:105-112`), navigatie vorige/volgende (`:168-175`), tijdlijn-/kolomweergave met overlap-kolommen (`:630-680`), dagsecties (`:880`, `:994`).
- **Data:** `listPlanningItemsForRange` → `calendar_events` (`src/services/activityService.ts:86-102`), `activities` met `due_at` (`:105-123`), `werkbonnen` op `gepland_op` (`src/services/workOrderService.ts:138-160`); `listCustomers` voor de klantkeuze (`planning.tsx:150`). Deelfouten worden apart gemeld (`activityService.ts:394-421`).
- **Acties:** afspraak maken/wijzigen/verwijderen via FormSheet → `createAfspraak`/`updateAfspraak`/`deleteAfspraak` op `calendar_events` (`planning.tsx:255`, `:269`; service `activityService.ts:718-770`).
- **Zoek/filter:** geen zoekveld; medewerker ziet alleen eigen werkbonnen (`planning.tsx:99`); calendar_events/activities via RLS bedrijfsbreed. Geen collega-/agenda_inzien-filter.
- **Pag.:** geen limit (bereik-gebonden; maand × veel items kan 1000 raken).
- **Staten:** NoticeBanner bij deelfout (`:470`), "Opnieuw proberen" (`:1161`).
- **Checks:** `mag('agenda','maken')` voor +knop (`:286`), `mag('agenda','verwijderen')` voor verwijderknop (`:423`). Geen feature `agenda`/`planning`-check.

### 1.4 Tab: Werkbonnen — `app/(tabs)/work-orders.tsx`

- **Toont:** zoekveld (`:347`), chips *Alles/Open/Lopend/Klaar/Mijn werkbonnen* met tellers (`:228-233`), buckets *Vandaag / Binnenkort / Eerder / Niet ingepland* met sortering per bucket (`:260-281`), rij met nummer, tijd, klant/adres, StatusBadge.
- **Data:** `listWorkOrders()` → `werkbonnen` + relaties, **zonder limit/range** (`src/services/workOrderService.ts:108-130`), met tijdslimiet (`metTijdslimiet`).
- **Acties:** +knop → `/work-orders/new` als `canCreateWorkOrder` (rol admin/planner, niet readonly) (`:138-146`; `workOrderService.ts:508-511`).
- **Zoeken:** client-side over nummer/titel/omschrijving/klant (`:70-80`).
- **Staten:** LoadingScreen (`:299`), ErrorState (`:303`), NoticeBanner (`:337`), pull-to-refresh.
- **Checks:** `can`, `hasFeature('gedeelde_werkruimte')`, `readonly` (`:131-146`). Geen feature `werkbonnen`-gate.
- **>1000:** risico — alles in één select.

### 1.5 Werkbon detail — `app/work-orders/[id].tsx` (2192 r.)

- **Toont:** status + statuswissel (`:247-320`), ondertekend-banner (`:620-630`), secties *Klant* (`:636`), *Informatie* incl. omschrijving (`:643-720`), *Materialen* (`:726`), *Werkzaamheden* + *Meerwerk* (`:798-880`), *Notities* (`:884-920`), *Opmerking van kantoor* (`:925-930`), *Uren* (`:936-975`), *Foto's* (`:977`).
- **Data:** `getWorkOrder`, `listWerkbonUren`, `listWorkOrderMaterials`, `listWorkOrderTasks`, `listWorkOrderNotes`, `listWorkOrderPhotos`, `listTeamProfiles`, `listVoertuigen` (`:155-185`). Tabellen: `werkbonnen`, `werkbon_uren`, `werkbon_materialen`, `werkbon_taken`, `werkbon_notities`, `werkbon_fotos` + storage-bucket, `profiles`, `voertuigen`.
- **Acties:** status (`updateWorkOrderStatus`), taak afvinken/toevoegen/verwijderen, materiaal toevoegen/aantal/verwijderen, notitie toevoegen, foto uploaden (camera/bibliotheek + fase) en verwijderen, uren bewerken/verwijderen (`updateWerkbonUur`/`deleteWerkbonUur`).
- **Checks:** `canEditWorkOrder`, `canBookHours`, `canAddTask`, `canEditMaterials`, `canDeleteMaterial` (`workOrderService.ts:464-511`, `:656`, `:719-733`); `canNote = rechtenGeladen && !readonly && !isSigned` (`[id].tsx:243`); ondertekende bon = slot.
- **Ontbreekt:** handtekening zetten, PDF, mailen (alleen weergave van `ondertekend_op`).

### 1.6 Werkbon nieuw — `app/work-orders/new.tsx`

- Velden: klant (zoekbare lijst), Titel*, Omschrijving, Gepland op, Locatie, uitvoerders + verantwoordelijken (`:220-300`); `createWorkOrder` (`workOrderService.ts:828-866`), `listCustomers`, `listCompanyProfiles`.
- Checks: `PermissionGate` zonder recht (alleen wachten op laden) (`:48`), daarna `canCreateWorkOrder` + readonly-ErrorState (`:190-200`).

### 1.7 Tab: Klanten — `app/(tabs)/customers.tsx`

- **Toont:** zoekbalk (`:271`), chips *Alle/Actief/Recent/Zakelijk/Particulier* (`:176-183`), A-Z-groepering (`:190-214`), rij met avatar, plaats, "laatst actief"; snelbellen/route (`:216-230`).
- **Data:** `listCustomers()` → `customers` met sorteer-fallbacks, **zonder limit/range** (`src/services/customerService.ts:34-70`).
- **Filters zijn heuristisch:** "actief" = `updated_at` < 30 dagen, "recent" < 7 dagen, "zakelijk" = KvK gevuld (`:76-109`). `openWoCount` is een placeholder (`:247`).
- **Acties:** +knop → `/customers/new` als `canCreate` (`:134`).
- **Staten:** LoadingScreen, ErrorState (`:233-245`), lege tekst (`:315`).
- **Checks:** `can('klanten_bewerken') && !readonly && !limietVol` (limiet uit `planStatus.limits.klanten`) (`:119-134`). **Inconsistent** met `ACTIES.klanten.maken` (geen recht, alleen readonly+limiet; `permissions.ts:213`) en met `customers/new` die `PermissionGate permission="klanten_bewerken"` gebruikt (`app/customers/new.tsx:29`).
- **>1000:** risico.

### 1.8 Klant detail — `app/customers/[id].tsx`

- **Toont:** kop + "Klant bewerken" (`:220-230`), actieknoppen Bellen/Route/Mail (`:266-283`), Contact (`:288`), Adres (`:299`), Werkbonnen (`:318-345`), Notities (klant_tijdlijn) met "Nieuwe notitie" (`:349-395`).
- **Data:** `getCustomer`, `listWorkOrders()` en dan **client-side filter op `customer_id`** (`:107-127`) — haalt alle werkbonnen op; `listNotes({customerId})` (limit 100).
- **Acties:** wijzigen (`updateCustomer`), verwijderen (`deleteCustomer`, in FormSheet destructive, `:435`), notitie toevoegen (`createNote`).
- **Checks:** `mag('klanten','wijzigen')` (`:222`), `mag('klanten','verwijderen')` (`:435`), `mag('notities','maken')` (`:356`, `:370`).
- **Ontbreekt t.o.v. dashboard:** offertes/facturen/projecten/deals van de klant, contactpersonen, tijdlijn-events anders dan notities.

### 1.9 Klant nieuw — `app/customers/new.tsx`

- Velden naam, e-mail, telefoon, adres, postcode, plaats, KvK, btw, notities → `createCustomer` (`customerService.ts:91-127`). `PermissionGate permission="klanten_bewerken"` (`:29`).

### 1.10 Tab: Uren — `app/(tabs)/hours.tsx` (1185 r.)

- **Toont:** weekkaart, dagtotalen, chips *Vandaag/Deze week/Open/Mijn uren/(Team)* (`:216-224`), lijst "Registraties" (`:386`), bewerk-FormSheet (`:458-560`).
- **Data:** `listUrenForProfile` of (team) `listCompanyUren` — combineren `urenregistratie` + `werkbon_uren` voor de huidige week (`:135-150`; `src/services/timeEntryService.ts:153-215`). Geen limit (week-bereik).
- **Acties:** bewerken/verwijderen werkdaguur (`updateTimeEntry`/`deleteTimeEntry`) of werkbonuur (`updateWerkbonUur`/`deleteWerkbonUur`); +knop → `/hours/new`.
- **Filters:** chip **"Open" doet niets** — valt in de default-tak en toont alle weekregels (`:210-214`). Team-chip alleen voor rol admin/planner (`isTeamScope`, `:115`, chip `:222`). Geen weeknavigatie (alleen huidige week, `:118-124`).
- **Staten:** LoadingScreen, ErrorState (`:233-238`), NoticeBanners.
- **Checks:** alleen `readonly` voor +knop (`:257`, `:407`); scope op **rol**, niet op recht.

### 1.11 Uren nieuw — `app/hours/new.tsx`

- Keuze Werkbon/Overig, werkbon (SelectField met zoek), datum, van/tot, pauze, uren, notitie (`:321-390`). → `createWerkbonUur` (`werkbon_uren`) of `createWerkdagUur` (`urenregistratie`).
- Checks: werkbonnenlijst gefilterd op `canBookHours` (`:105-111`); readonly → ErrorState (`:248-260`). `listWorkOrders()` zonder limit.

### 1.12 Tab: Menu — zie §2.

### 1.13 Profiel — `app/profile/index.tsx`

- Herokaart (donker, `t.barBg`, `:432-445`) met naam, e-mail, rol, bedrijf; **hero-stats zijn placeholders "—"** (`:133-143`, TODO).
- Secties: *Bedrijf* (Bedrijfsinstellingen, Integraties) als `allowsRoute('/settings'|'/integrations')` (`:156-184`); *Team* (Teamleden) als `allowsRoute('/team')` (`:186-201`); *Account* (Wachtwoord wijzigen, Hulp & support) (`:203-222`); Uitloggen; versie.
- Acties: naam wijzigen (`updateEigenProfiel` → `profiles`), wachtwoord wijzigen (`wijzigWachtwoord`) (`src/services/profileService.ts:212-246`).

### 1.14 `(more)`-schermen

| Route | Bestand | Data (tabel/RPC) | Acties | Zoek/filter/sort | Pag. | Staten | Checks |
|---|---|---|---|---|---|---|---|
| `/activities` | `app/(more)/activities.tsx` | `listRecentActivities` → `activities` (`activityService.ts:127-143`), `listCustomers`, `listCompanyProfiles` (teamService) | C/U/D via `ActivityFormSheet` (`src/components/ActivityFormSheet.tsx:119-131`); afvinken `setActivityCompleted` (`:137`) | Geen zoek/filter; open vs. afgerond gesplitst (`:157-158`); sort completed→due_at→created_at | limit 100 | Loading/Error/Empty (`:142-226`) | `mag('activiteiten', maken/wijzigen/afronden/verwijderen)` (`:95-97`) |
| `/tasks` | `app/(more)/tasks.tsx` | `listOpenTasks` → `activities` type=task, completed=false (`activityService.ts:146-163`) | afvinken; C/U/D via ActivityFormSheet | geen | limit 100 | Loading/Error/Empty | `mag('activiteiten', …)` (`:66-68`) |
| `/files` | `app/(more)/files.tsx` | `listCompanyPhotos` → `werkbon_fotos` + signed URLs (`workOrderService.ts:893-920`) | alleen bekijken | gegroepeerd per werkbon (`:89-103`) | limit 120 | Loading/Error/Empty | geen (RLS) |
| `/notes` | `app/(more)/notes.tsx` | `listNotes` → `klant_tijdlijn` type `notitie_toegevoegd` (`noteService.ts:107-126`) | alleen maken (geen U/D: tabel is logboek) | geen | limit 100 | Loading/Error/Empty | `mag('notities','maken')` (`:73`) |
| `/pipeline` | `app/(more)/pipeline.tsx` | `listPipelineStages` → `pipeline_stages`; `listDeals` → `deals` (`dealService.ts:70-100`); `listCustomers` | C/U/D deal (`createDeal`/`updateDeal`/`deleteDeal`); fase via formulier (geen drag, `updateDealStage` en `markDealLost`/`lost_reasons` niet gebruikt) | Gegroepeerd per fase + "Overig" (`:129-145`); geen zoek | limit 200 | Loading/Error/Empty | `PermissionGate permission="verkoop"` (`:51`); `mag('pipeline', …)` (`:88-90`) |
| `/projects` | `app/(more)/projects.tsx` | `listProjects` → `projects` (`projectService.ts:78-92`); `listProjectNotes` → `project_notes` | C/U/D project; notitie toevoegen/verwijderen (`:405-445`) | geen; status-chips alleen in formulier | limit 100 | Loading/Error/Empty | `mag('projecten', …)`, `mag('projectNotities','maken')` (`:89-92`); verwijderen notitie: eigen of `mag('team','wijzigen')` als admin-proxy (`:442`) |
| `/offers` | `app/(more)/offers.tsx` | `offertes`, `offerte_items` (`offerteService.ts`), `listCustomers`, `getCompanySettings`, `listEigenEenheden`, `listDeals` | C (kop + regels in één, `createOfferteMetRegels`), U, D; regels toevoegen/verwijderen; totalen herberekenen | geen zoek/filter; één lijst "Alle offertes" | limit 100 | Loading/Error/Empty + NoticeBanner | `PermissionGate permission="offertes"` (`:73`); `mag('offertes', …)`, `mag('offerteRegels','maken')` (`:132-135`); `inhoudLigtVast` |
| `/invoices` | `app/(more)/invoices.tsx` | `facturen`, `factuur_regels`, RPC `mark_factuur_betaald` (`factuurService.ts:406-434`), klanten, projecten, instellingen, eigen eenheden | C (met regels), U, D, **betaald zetten** (`:284-300`), regels C/D | open/te-laat KPI (`:391`); geen zoek | limit 100 | Loading/Error/Empty | `PermissionGate permission="facturen"` (`:82`); `mag('facturen', maken/wijzigen/verwijderen/betaaldZetten)`, `mag('factuurRegels', …)` (`:141-146`); `isGeimporteerd`, `inhoudLigtVast` |
| `/expenses` | `app/(more)/expenses.tsx` | `job_costs` (`jobCostService.ts:76-92`), `leveranciers`, klanten, projecten | C/U/D kostenpost; leverancier inline aanmaken (`createLeverancier`) | geen | limit 100 | Loading/Error/Empty | `PermissionGate permission="kosten" feature="kosten_nacalculatie"` (`:62`); `mag('kosten', …)` (`:108-110`); `isVergrendeld`. **Bijlage (`getBijlageUrl`) niet gebruikt** |
| `/team` | `app/(more)/team.tsx` | `profiles` + `company_members` (`teamService.ts:140-196`), `user_permissions`, edge functions `send-email`, `delete-team-member` | uitnodigen, uitnodiging wijzigen/verwijderen, (de)activeren, verwijderen, rechten zetten (matrix uit `permissionGroups.ts`) | leden vs. openstaande uitnodigingen (`:312-313`) | geen limit (klein) | Loading/Error/Empty | `PermissionGate permission="team"` (`:86`); `mag('team', maken/wijzigen/verwijderen/rechtenWijzigen)` (`:118-121`); laatste-admin-bescherming (`telActieveAdmins`) |
| `/settings` | `app/(more)/settings.tsx` | `bedrijfsinstellingen`, `companies` (`settingsService.ts:81-310`) | tarieven/btw/offertegeldigheid/agenda-uren (FormSheet `:337`), bedrijfsgegevens (FormSheet `:459`) | — | `.limit(1)` | Loading/Error | `PermissionGate permission="instellingen"` (`:55`); wijzigen `mag('bedrijfsinstellingen','wijzigen')` (rol admin) (`:100`) |
| `/integrations` | `app/(more)/integrations.tsx` | RPC `get_accounting_status`, `google_calendar_status`, tabel `stripe_connections`; edge fn `google-calendar-auth-url`; RPC `google_calendar_disconnect` (`integrationService.ts:105-250`) | Google koppelen/ontkoppelen, Stripe ontkoppelen; boekhouding alleen status | secties Boekhouding/Agenda/Betalingen/Beveiliging | — | Loading/Error | `PermissionGate permission="instellingen"` (`:49`); `mag('integraties','wijzigen')` (rol admin) (`:64`) |
| `/support` | `app/(more)/support.tsx` | — | mailto `info@bossbase.nl`, tel `+31858881960`, "Feedback sturen" = mailto met onderwerp (`:10-52`) | — | — | — | geen |

---

## 2. Menu (`app/(tabs)/menu.tsx`)

**Header:** `AppTopBar` eyebrow = bedrijfsnaam, titel "Menu", subtitel "Alle functies van BossBase", `showProfileButton` → rechtsboven **ThemeToggleButton (maan/zon) + avatar-profielknop** (`menu.tsx:111-118`; `AppTopBar.tsx:119-122`; `HeaderActions.tsx:10-16`).

**Volgorde op het scherm:**
1. Profielkaart (avatar-initialen, naam, "Rol · Bedrijf") → `/profile` (`:122-139`). Rol-label: admin=Beheerder, planner=Planner, anders Medewerker (`:97-98`).
2. Readonly-NoticeBanner als `readonly` (`:144-151`).
3. **Werk & uitvoering** (`:70-75`)
   1. Activiteiten — "Bellen, meetings en notities" → `/activities`
   2. Taken — "Je openstaande taken" → `/tasks`
   3. Foto's & bestanden — "Beeld bij werkbonnen" → `/files`
   4. Notities — "Vrije notities bij klanten" → `/notes`
4. **Sales & administratie** (`:77-83`; groep verborgen als leeg)
   1. Pipeline → `/pipeline` (gate verkoop)
   2. Projecten → `/projects` (geen gate)
   3. Offertes → `/offers` (gate offertes)
   4. Kosten → `/expenses` (gate kosten + feature kosten_nacalculatie)
   5. Facturen → `/invoices` (gate facturen)
5. **Support** (`:88-92`)
   1. Help — "Veelgestelde vragen en contact" → `/support`
   2. Feedback — "Deel een idee of probleem" → `/support`
   3. Contact support — "Mail of bel ons" → `/support`

Filtering: `allowsRoute(item.route)` (`:62`); wacht op `loaded` (`:106`). Bewust niet in menu: Vandaag/Agenda/Werkbonnen/Uren/Klanten (tabbalk) (`:64-69`); Dashboard/Omzet/rapportages "desktop-only" (`:85-86`); Team/Instellingen/Integraties alleen via Profiel. **Geen** donkere-modus-rij in het menu (alleen dode stijlen `darkRij/darkIcoon/darkTitel/darkMeta`, `:211-234`).

---

## 3. Tabbalk (`app/(tabs)/_layout.tsx`)

| # | route | label | icoon |
|---|---|---|---|
| 1 | `today` | Vandaag | Home |
| 2 | `planning` | Agenda | CalendarDays |
| 3 | `work-orders` | Werkbonnen | ClipboardList |
| 4 | `customers` | Klanten | Users |
| 5 | `hours` | Uren | Clock |
| 6 | `menu` | Menu | Menu |

(`:180-222`). Zwevende pil `FloatingTabBar` (`:61-119`): achtergrond `t.barBg`, rand `t.barBorder` (`:71`), actieve capsule `ds.green #22C55E` met tekst/icoon `ds.greenInk #0A2E1F` (`:23-24`, `:269-284`), inactief `rgba(255,255,255,0.72)` (`:26`), schaduw `#0A2E1F` 18% (`:248`), hoogte 64, radius 32, max-breedte `TABBALK_MAX`; verborgen bij open toetsenbord (web) (`:66-67`). Alleen actieve tab toont label.

---

## 4. Theme / kleuren

Bestanden: `src/theme/index.ts` (ds-tokens, light/dark), `src/theme/colors.ts` (oud palet, nog gebruikt in fout-/legacy-stijlen), `src/providers/ThemeProvider.tsx` (colorMode in AsyncStorage `bb.colorMode`, default `light`, `:15`, `:33`, toggle `:63`).

### 4.1 Donkergroen / donkere vlakken — exacte waarden

| Token / literal | Waarde | Definitie | Betekenis |
|---|---|---|---|
| `ds.greenInk` | `#0A2E1F` | `src/theme/index.ts:118` | forest ink: tekst/iconen óp groen (beide thema's; `darkTheme.greenInk` idem `:247`) |
| `ds.barBg` (light) | `#0A2E1F` | `src/theme/index.ts:126` | vlak tabbalk + donkere herokaarten |
| `ds.barBorder` (light) | `transparent` | `:127` | |
| `darkTheme.barBg` | `#1B2822` | `:248` | tabbalk/hero in dark (iets lichter dan bg) |
| `darkTheme.barBorder` | `rgba(255,255,255,0.1)` | `:249` | |
| `darkTheme.bg` | `#0B1210` | `:232` | pagina-achtergrond dark |
| `darkTheme.card` | `#151F1A` | `:234` | kaart dark |
| `darkTheme.bgAlt` | `#1E2B25` | `:233` | |
| `dsShadow/dsShadowPop.shadowColor` | `#0A2E1F` | `:187`, `:196` | schaduwkleur |
| web-buitenkader dark | `#060A08` (light `#E5E7EB`) | `src/components/MobielKader.web.tsx:58` | ruimte naast de telefoonkolom op desktop |
| meta theme-color | volgt `t.bg` (`#F3F4F6` / `#0B1210`) | `MobielKader.web.tsx:51-53`; `public/index.html:31` (`#F3F4F6`) | browser-/statusbalk |

Overige merkwaarden: `green #22C55E`, `green600 #16A34A`, `green700 #15803D` (dark `#4ADE80`), `green50 #DCFCE7`, `green100 #BBF7D0`; light `bg #F3F4F6`, `card #FFFFFF`, `ink #0F172A` (`:111-140`). Oud palet `colors.brand #1DDB62` (`src/theme/colors.ts:2`).

### 4.2 Waar het donkere vlak (`barBg`) wordt gebruikt

| Plek | Bestand:regel |
|---|---|
| Tabbalk (onderbalk, alle schermen) | `app/(tabs)/_layout.tsx:71` (+ schaduw `:248`) |
| Vandaag — herokaart "Werkbonnen / Werkdag" (bovenaan homepage) | `app/(tabs)/today.tsx:627` (tekst wit/rgba `:640-660`) |
| Profiel — herokaart | `app/profile/index.tsx:438` |

De **bovenbalk** (`AppTopBar`) is níet donker: hij staat op de pagina-achtergrond zonder eigen vlak (`src/components/AppTopBar.tsx:42-47`). **Instellingen** (`app/(more)/settings.tsx`) gebruikt geen `barBg`; alleen `greenInk` in actieve chip (`:567`).

### 4.3 `greenInk` (tekst op groen) gebruikt in
`app/(tabs)/_layout.tsx:24`, `today.tsx:389,730`, `hours.tsx:412,909,1132`, `customers.tsx:600`, `work-orders.tsx:569`, `customers/[id].tsx:267,566,629`, `work-orders/[id].tsx:109,1916`, `planning.tsx:1161`, `profile/index.tsx:474`, `(more)/settings.tsx:567`, `pipeline.tsx:374`, `offers.tsx:673`, `invoices.tsx:754`, `expenses.tsx:485`, `projects.tsx:486`, `team.tsx:610,635`, `integrations.tsx:290`, `activities.tsx:181`; componenten `AppFab.tsx:32,59`, `Button.tsx:31,76`, `HeaderIconButton.tsx:53`, `ProfileSettingsButton.tsx:56`, `AppHeader.tsx:42`, `WorkOrderCard.tsx:29,172,312`, `NieuweVersieMelding.tsx:32,77`, `DialogHost.web.tsx:303`, `ActivityFormSheet.tsx:273`. Literal `#0A2E1F` als schaduw ook in `hours/new.tsx:427`, `FormSheet.tsx:201`, `NieuweVersieMelding.tsx:62`.

---

## 5. Tekstweergave van notities (HTML/markdown)

| Bron | Omzetting | Weergave | Probleem? |
|---|---|---|---|
| Klantnotities `klant_tijdlijn.omschrijving` | **Ja**: lezen `naarPlatteTekst` (br/p/div/li → newline, tags strippen, 6 entities) `src/services/noteService.ts:70-84`; schrijven `naarHtml` (escape + `\n`→`<br>`) `:87-94`, gebruikt `:161` | `app/(more)/notes.tsx:41`, `app/customers/[id].tsx:349-395` | OK (geen markdown-ondersteuning; lijsten/opmaak gaan verloren) |
| Werkbonnotities `werkbon_notities.note` | **Nee** | `app/work-orders/[id].tsx:916` | HTML/markdown ruw zichtbaar als dashboard opmaak schrijft |
| Werkbon `omschrijving` | Nee | `work-orders/[id].tsx:718`; lijst `work-orders.tsx:470`; `WorkOrderCard.tsx:91` | idem |
| Werkbon `notes` ("Opmerking van kantoor") | Nee | `work-orders/[id].tsx:925-928` | idem |
| Projectnotities `project_notes.note` | Nee | `app/(more)/projects.tsx:437` | idem |
| Offerte `omschrijving` in lijst-subtitel | Nee | `app/(more)/offers.tsx:98` | idem |
| Klant `customers.notes`, deal/project `description`, afspraak `description`, offerte `notes` | Nee — alleen als ruwe waarde in bewerkvelden | `customers/[id].tsx:238,525`; `pipeline.tsx:171,349`; `projects.tsx:144,397`; `planning.tsx:221,492`; `offers.tsx:209-212,515` | bewerken van dashboard-HTML toont tags en schrijft ze terug |
| Uren `notitie` | Nee | `hours.tsx:723`, `work-orders/[id].tsx:959` | meestal platte tekst |

Er is geen gedeelde helper (`stripHtml`/`vanHtml` bestaat niet); `naarPlatteTekst`/`naarHtml` zijn privé in `noteService.ts`.

---

## 6. Herbruikbare componenten (`src/components`, export via `index.ts`)

| Component | Doel / belangrijkste props | Gebruikt? |
|---|---|---|
| `AppScreen` | scroll-container met `header`, `onRefresh/refreshing`, `floatingAction`, `animate`, ErrorBoundary (`AppScreen.tsx:21-68`) | overal |
| `AppTopBar` | paginakop: title/subtitle/eyebrow/meta, `onBack`, `rightAction`, `showProfileButton`, variant default/detail/compact (`AppTopBar.tsx:11-33`) | overal |
| `AppHeader` | oudere kop met actions/kicker | niet in schermen |
| `HeaderActions` / `ThemeToggleButton` / `ProfileSettingsButton` / `HeaderIconButton` | header-cluster en ronde icoonknoppen | ja |
| `AppCard` | kaart `card|flat`, `onPress`, padding (`AppCard.tsx:6-18`) | tabs + klantdetail |
| `AppListItem` + `AppListGroup` | lijstrij met icon/leading/trailing/subtitle (`AppListItem.tsx:7-66`) | menu, support, profiel, more |
| `AppSection` | sectiekop heading/eyebrow, `count`, `action` (`AppSection.tsx:7-30`) | ja |
| `AppSearchBar` | zoekveld of knop (`asButton`) | klanten, werkbonnen |
| `AppFilterChips<T>` | chips met tellers (`AppFilterChips.tsx:6-21`) | klanten, werkbonnen, uren |
| `AppFab` | zwevende +knop | via AppScreen/HeaderIconButton |
| `AppKpiCard` | KPI-tegel label/value/sub/tone | **ongebruikt** |
| `FormSheet` | bottom-sheet formulier: title, error, saving, submit, `destructive` (`FormSheet.tsx:21-51`) | alle CRUD |
| `FormField`, `FormFooter` | invoerveld; vaste voetknop met fout/hint | ja |
| `SelectField` | keuzeveld met zoekblad, `allowEmpty`, opties met `sub` (`SelectField.tsx:9-25`) | ja |
| `DateField` / `TimeField` (+ `.web.tsx`) | datum/tijd, min/max | ja |
| `RegelEditor` | offerte-/factuurregels met totalen | offertes, facturen |
| `ActivityFormSheet` | activiteit maken/wijzigen/verwijderen | activiteiten, taken |
| `StatusBadge` (+ `statusKey/Label/Tone`) | statusmapping NL/EN (`StatusBadge.tsx:24-47`) | ja |
| `EmptyState`, `ErrorState`, `LoadingScreen`, `NoticeBanner` (waarschuwing/fout/info), `PlaceholderState` | staten | PlaceholderState **ongebruikt** |
| `PermissionGate` | route-poort recht+feature, terugsprong na 1,4 s (`PermissionGate.tsx:37-60`) | more-schermen, new-schermen |
| `WorkOrderCard`, `ScreenContainer` | | **ongebruikt** |
| `DialogHost(.web)`, `Dialog` (`src/lib/dialog`) | alert/confirm, web-variant | ja |
| `MobielKader(.web)`, `StatusBarScrim`, `AnimatedScreen`, `NieuweVersieMelding`, `InstalleerBossBase`, `BBMark` | layout/PWA | ja |

Hooks/libs: `useLaden` (loading/verversen/refreshing, `src/lib/useLaden.ts:70`), `useSave`, `writeResult.schrijf` (uniforme schrijffoutafhandeling + readonly-tekst), `queryTijdslimiet`, `format`, `datum`, `nlTijd`, `dateRange`, `urenBerekening/urenTotalen`, `regels`, `linking` (sendMail/callPhone), `navigatie.terugOfNaar`.

---

## 7. Rechtenlaag

### 7.1 Laden — `src/providers/PermissionsProvider.tsx`
- Na auth (`:157-167`) parallel: `user_permissions.select('permission').eq('user_id').eq('granted', true)` en RPC `get_plan_status` (`:114-121`).
- `PlanStatus` = tier, trial, status, modules, features, readonly, readonlyReden, magBeheren, limits (`:38-48`).
- Fout → lege rechtenlijst (veilig) (`:123-140`). Schrijft ook naar `setSessionStand` voor services (`:145-152`).
- `loaded` is per-gebruiker afgeleid (`:173`) zodat oude rechten niet doorlekken.
- API: `can`, `hasFeature` (zonder serverantwoord → true, `:181-187`), `allows`, `allowsRoute`, `readonly`, `readonlyReden`, `mag(module, actie)`, `waaromNiet(module, actie)` (volgorde rol → recht → feature → readonly, `:203-229`), `refresh`.

### 7.2 Rechtencodes en rolregel — `src/lib/permissions.ts`
- 17 codes (`:18-40`): klanten_bewerken, klanten_verwijderen, verkoop, projecten_bewerken, werkbonnen_bewerken, planning, alles_inzien, agenda_inzien, projectbedragen, bedrijfsfinancien, offertes, facturen, inkoopprijzen, kosten, team, instellingen, database. UI-groepen in `src/lib/permissionGroups.ts:28-124`.
- Features (`:45-58`): werkbonnen, uren, agenda, klanten, crm_pipeline, offertes, facturen, planning, voertuigen, kosten_nacalculatie, digitale_handtekening, gedeelde_werkruimte (+ `rollen_rechten` in ACTIES).
- `canWithRole` (`:73-82`): admin → alles; **planner → alleen `planning`** (dashboardregel; server `bb_has_permission` geeft planner álles); anders `granted.includes`. Kopie buiten React: `sessionCan` (`src/lib/sessionContext.ts:76-81`).
- Rol komt uit `profiles.role` (`src/services/profileService.ts:54`; `AuthProvider.tsx:80,92,198`). Rollen in gebruik: admin, planner, medewerker.
- `ROUTE_GATES` (`:107-118`): `/pipeline` verkoop · `/offers` offertes · `/invoices` facturen · `/expenses` kosten + kosten_nacalculatie · `/team` team · `/settings` instellingen · `/integrations` instellingen. Rest ongated.
- `ACTIES` (`:209-315`): modules klanten, werkbonnen, activiteiten, agenda, notities, projecten, projectNotities, pipeline, offertes, offerteRegels, facturen (incl. betaaldZetten), factuurRegels, kosten, werkbonFotos, team (incl. rechtenWijzigen + feature rollen_rechten), bedrijfsinstellingen, integraties. `readonlyBlokkeert` alleen op `maken`; `limiet` (klanten/offertes/facturen/gebruikers) is gedeclareerd maar wordt in `mag()` **niet** getoetst (alleen klantenlijst doet het zelf, `customers.tsx:128-134`).
- Readonly-teksten (`:134-165`): proefperiode_verlopen, betaling_mislukt, opgezegd, algemeen.

### 7.3 sessionContext — `src/lib/sessionContext.ts`
In-memory: userId, companyId, role, granted, features, readonly, readonlyReden, planGeladen (`:21-31`); `withCompanyId` (`:102-110`), `isReadonly`, `sessionHasFeature`, `clearSessionStand` bij uitloggen.

### 7.4 Werkbon-specifieke regels (`src/services/workOrderService.ts:455-545`)
`canEditWorkOrder` (niet ondertekend, niet readonly, gedeelde_werkruimte of werkbonnen_bewerken/planning of verantwoordelijke), `canBookHours` (rol admin/planner of uitvoerder/verantwoordelijke), `canCreateWorkOrder` (rol admin/planner), `getAllowedNextStatuses` (planner/admin mag terugzetten).

### 7.5 Opvallend
- Module-/pakketchecks ontbreken voor de meeste modules (werkbonnen, uren, agenda, klanten, crm_pipeline, offertes, facturen, planning, voertuigen, digitale_handtekening); `planStatus.modules` wordt nergens gebruikt.
- Recht `database`, `projectbedragen`, `bedrijfsfinancien`, `inkoopprijzen`, `alles_inzien`, `agenda_inzien` worden in de UI niet gebruikt (alleen in teamrechtenmatrix) — bedragen worden dus niet verborgen op basis van `projectbedragen`/`inkoopprijzen`.
- Klanten aanmaken: drie verschillende regels (zie §1.7).
- Today-snelactie "Nieuwe werkbon" ongated.

---

## 8. Ontbrekend t.o.v. dashboardpagina's

| Dashboardpagina | In app? | Toelichting |
|---|---|---|
| Pipeline | Deels | `/pipeline`: lijst per fase, CRUD via formulier. Geen kanban/drag, geen verloren-reden (`markDealLost`/`lost_reasons` aanwezig in service maar ongebruikt), geen dealnotities (`deal_notities`), geen zoek/filter, limit 200 |
| Relaties/klanten | Ja | Tab Klanten + detail + nieuw. Geen contactpersonen, geen offertes/facturen/projecten per klant, filters heuristisch, geen paginering |
| Leveranciers | Nee (pagina) | Alleen `listLeveranciers` + inline `createLeverancier` in Kosten (`jobCostService.ts:94-135`) |
| Materialen | Nee (pagina) | Alleen `werkbon_materialen` binnen werkbondetail; geen artikel-/materiaalcatalogus; `eigen_eenheden` alleen als keuzelijst |
| Activiteiten | Ja | `/activities` + `/tasks` (limit 100, geen filter/zoek) |
| Agenda | Ja | Tab Agenda (dag/week/maand), afspraken CRUD; geen collega-filter (`agenda_inzien`), geen Google-sync-weergave |
| Planning (weekplanning/inplannen) | Nee | Route `planning` = Agenda; planningsmodule zelf niet in app (`permissions.ts:102-104`) |
| Kosten | Ja | `/expenses`; geen bijlage-upload/-weergave |
| Omzet | Nee | Bewust desktop-only (`menu.tsx:85-86`) |
| Facturen | Ja | CRUD + regels + betaald; geen PDF/versturen/crediteren/herinneringen, geen zoek/filter |
| Offertes | Ja | CRUD + regels; geen PDF/versturen/versies/ondertekenen |
| Projecten | Ja | CRUD + notities; geen uren/budget/werkbonnen per project, geen filter |
| Werkbonnen | Ja | Lijst + detail + nieuw; geen handtekening, PDF, werkbon bewerken (titel/klant/planning na aanmaak — alleen status/taken/materialen/notities/foto's/uren) |
| Uren | Ja | Alleen huidige week; geen weeknavigatie/periodekeuze, geen goedkeuren/export; chip "Open" werkt niet |
| Database (& export) | Nee | Recht `database` bestaat, geen scherm |
| Team | Ja | `/team` (via Profiel) |
| Instellingen | Deels | Tarieven/btw/offerte/agenda-uren + bedrijfsgegevens; geen huisstijl/logo, nummering, mailtemplates, abonnement/billing |
| Integraties | Deels | Status boekhouding (alleen tonen), Google koppelen/ontkoppelen, Stripe ontkoppelen |
| Meldingen (notificaties) | Nee | Geen notificatiecentrum/push |
| Boss-chat (AI) | Nee | Niets aanwezig |
| Bug-of-idee / meldpunt | Nee (alleen mailto) | `/support` "Feedback sturen" opent mail (`support.tsx:44-52`); geen formulier/tabel |
| Help | Minimaal | `/support`: mail, bellen, versie; geen FAQ/helpartikelen ondanks subtitel "Veelgestelde vragen" |
| (extra) Notities | App-eigen | `/notes` = klant_tijdlijn-notities |
| (extra) Foto's & bestanden | App-eigen | `/files` = werkbonfoto's (limit 120) |

---

## 9. Paginering / >1000-rijen-risico (samenvatting)

Geen enkele `.range()` in `src/` of `app/`. PostgREST kapt standaard op 1000 rijen zonder fout.

| Query | Bestand:regel | Limit | Risico |
|---|---|---|---|
| `listCustomers` (customers) | `customerService.ts:34-70` | geen | **hoog** — ook gebruikt als keuzelijst in planning, notities, pipeline, projecten, offertes, facturen, kosten, werkbon-nieuw |
| `listWorkOrders` (werkbonnen) | `workOrderService.ts:108-130` | geen | **hoog** — ook klantdetail (client-filter `customers/[id].tsx:127`) en uren-nieuw |
| `volgendOfferteNummer` / `volgendFactuurNummer` (alle `nummer`) | `offerteService.ts:141-160`, `factuurService.ts:165-180` | geen | **hoog** — >1000 rijen ⇒ hoogste nummer gemist ⇒ dubbel nummer (geen unique index volgens commentaar `factuurService.ts:160-163`) |
| `listCalendarEventsForRange`, `listActivitiesForRange`, `listWorkOrdersForPlanningRange` | `activityService.ts:86-123`, `workOrderService.ts:138-160` | bereik | laag–middel (maandweergave) |
| `listUrenForProfile`/`listCompanyUren` | `timeEntryService.ts:153-215` | week | laag |
| deals | `dealService.ts:86-93` | 200 | afkap zonder melding |
| offertes, facturen, projecten, job_costs, activities, tasks, klantnotities | services `:limit 100` | 100 | afkap zonder "meer laden" |
| werkbonfoto's | `workOrderService.ts:893-904` | 120 | idem |
| `listLeveranciers`, `listPipelineStages`, `listTeamMembers` | — | geen | klein |
