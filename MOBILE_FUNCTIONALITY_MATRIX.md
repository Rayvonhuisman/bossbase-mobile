# BossBase Mobile — Functionality matrix

Per-screen overview of every visible action, current state, and intended behavior.
This is the running checklist for the functional-hardening pass.

Legend:
- ✅ working — fully wired to real backend
- 🟡 partial — works visually, derived/limited data, or TODO indicators
- ⚪ placeholder — clearly disabled or "Nog niet beschikbaar"
- ❌ dead — broken or silently no-op (must be removed/fixed)

Statuses are after this pass.

---

## Login — `app/(auth)/login.tsx`

| Action | Component | State | Backend | Notes |
|---|---|---|---|---|
| E-mail input | TextInput | ✅ | auth.signInWithPassword | trim, autocomplete |
| Wachtwoord input | TextInput | ✅ | — | secureTextEntry |
| Inloggen | Button | ✅ | supabase.auth.signInWithPassword | NL inline errors via translateAuthError |
| Sessie restore (boot) | AuthProvider | ✅ | supabase.auth.getSession + onAuthStateChange | secure-store gechunked |

---

## Vandaag — `app/(tabs)/today.tsx`

| Action | Component | State | Backend | Notes |
|---|---|---|---|---|
| Avatar (rechtsboven) | ProfileSettingsButton | ✅ | profile | initialen; opent `/profile` (account) op álle pagina's |
| KPI "Uren vandaag" | AppKpiCard | ✅ | urenregistratie (vandaag) | echt afgeleid |
| KPI "Open werkbonnen" | AppKpiCard | ✅ | werkbonnen (open status) | echt afgeleid |
| KPI "Omzet vandaag" | AppKpiCard | ⚪ | — | toont `—` (geen revenue-aggregaat — gap) |
| Quick action "Uren schrijven" | QuickAction | ✅ | — | navigeert naar `/(tabs)/hours` |
| Quick action "Nieuwe werkbon" | QuickAction | ⚪ | — | `notAvailableAlert('Nieuwe werkbon')` |
| Quick action "Nieuwe klant" | QuickAction | ✅ | — | navigeert naar `/(tabs)/customers` |
| Quick action "Foto bij werk" | QuickAction | ⚪ | — | photo-flow ontbreekt — backend gap |
| Volgende afspraak (hero) | Pressable | ✅ | `getNextPlanningItem` | **echt** — eerstvolgende item; Navigeer/Bel/Bon op echte velden; empty state als niets |
| Vandaag op de agenda (timeline) | Pressable | ✅ | `listPlanningItemsForRange` (vandaag) | **echt**; tap → werkbon/klant; StatusBadge |
| Sectie "Deze week" - bars | AppCard | ✅ | listTimeEntriesForProfile | echte data |
| Pull-to-refresh | RefreshControl | ✅ | herlaadt alle bronnen | |

**Geen mock meer.** `MOCK` + de "Aandacht nodig"-lijst zijn verwijderd. Omzet-KPI toont eerlijk `—` (gap #5).

---

## Agenda — `app/(tabs)/planning.tsx`  _(UI label "Agenda"; route stays `planning`)_

| Action | Component | State | Backend | Notes |
|---|---|---|---|---|
| Header zoek-knop | AppHeader action | ⚪ | — | `notAvailableAlert('Zoeken in planning')` |
| Header "Nieuwe afspraak" | AppHeader action | ⚪ | — | create-flow ontbreekt |
| Toggle Dag/Week/Maand | local state | ✅ | — | week/maand toont placeholder |
| Datumstrip dag-pick | local state | ✅ | — | andere dagen tonen empty state |
| Timeline cards | Pressable | 🟡 | router.push(`/work-orders/{id}`) | mock-data via activityService stub |
| Card "Bel" | MiniBtn | ✅ | Linking tel | als phone bestaat |
| Card "Route" | MiniBtn | ✅ | Linking maps | als adres bestaat |
| Card "Bon" | MiniBtn | 🟡 | router.push | werkt zodra activity→werkbon link bestaat |
| Team chips | View | 🟡 | mock aggregate | TODO: aggregate echt via company_members |
| FAB "Nieuwe afspraak" | AppFab | ⚪ | — | |

**Backend:** **NEW `activityService`** voor real `activities` + `calendar_events` reads.

---

## Werkbonnen — `app/(tabs)/work-orders.tsx`

| Action | Component | State | Backend | Notes |
|---|---|---|---|---|
| Header zoek (filter) | AppHeader action | ⚪ | — | filter-sheet ontbreekt |
| Header "Nieuwe werkbon" | AppHeader action | ⚪ | — | create-flow ontbreekt |
| Search (input) | AppSearchBar | ✅ | client-side filter | naam/titel/adres/locatie |
| Filter chips (Alles/Open/Lopend/Klaar/Mijn) | AppFilterChips | ✅ | client-side filter | bilingual status mapping |
| Urgent banner tap | Pressable | ✅ | router.push detail | echte werkbon-id |
| Lijst row tap | WorkOrderRow | ✅ | router.push detail | real UUID |
| Pull-to-refresh | RefreshControl | ✅ | listWorkOrders | |
| FAB "Nieuwe werkbon" | AppFab | ⚪ | — | |

---

## Werkbon detail — `app/work-orders/[id].tsx`

| Action | State | Backend | Notes |
|---|---|---|---|
| Laad werkbon | ✅ | workOrderService.getWorkOrder | |
| Laad uren | ✅ | timeEntryService.listTimeEntriesForWorkOrder | |
| Status wijzigen | ✅ | workOrderService.updateWorkOrderStatus | Allowed transitions per role |
| Notitie toevoegen | ✅ | workOrderService.appendNote | append-blocks in `werkbonnen.notes` |
| Uren toevoegen | ✅ | timeEntryService.createTimeEntry | company_id + profile_id + werkbon_id |
| Customer "Bel" | ✅ | Linking tel | |
| Customer "Mail" | ✅ | Linking mailto | |
| Customer "Route" | ✅ | Linking maps | |

---

## Klanten — `app/(tabs)/customers.tsx`

| Action | Component | State | Backend | Notes |
|---|---|---|---|---|
| Header filters | AppHeader action | ⚪ | — | filter-sheet TODO |
| Header "Nieuwe klant" | AppHeader action | ⚪ | — | create-flow TODO |
| Search | AppSearchBar | ✅ | client-side | naam/email/phone/address/postcode/city/kvk |
| Filter chips | AppFilterChips | ✅ | client-side | Alle/Actief/Recent/Zakelijk/Particulier |
| Recent geopend strip (4) | FavoriteCard | ✅ | derived sort by created_at | |
| Letter-grouped lijst | Pressable | ✅ | client-side group | A-Z |
| Row "Bel" | iconAction | ✅ | Linking tel | hidden if no phone |
| Row "Route" | iconAction | ✅ | Linking maps | hidden if no address |
| Row tap → Open | Pressable | ✅ | router.push(`/customers/{id}`) | **NEW** detail route |
| FAB "Nieuwe klant" | AppFab | ⚪ | — | |

---

## Klant detail — `app/customers/[id].tsx` (**NEW**)

| Action | State | Backend | Notes |
|---|---|---|---|
| Laad klant | ✅ | customerService.getCustomer(id) | RLS filtert op company_id |
| Bel | ✅ | Linking tel | |
| Mail | ✅ | Linking mailto | |
| Route | ✅ | Linking maps | |
| Werkbonnen lijst | ✅ | workOrderService.listWorkOrders + client-side filter on customer_id | |
| Notities | ⚪ | — | TODO: noteService voor `notes`-tabel |

---

## Uren — `app/(tabs)/hours.tsx`

| Action | Component | State | Backend | Notes |
|---|---|---|---|---|
| Header zoek | AppHeader action | ⚪ | — | `notAvailableAlert` |
| Header "Uren toevoegen" | AppHeader action | ✅ | — | alert + "Naar werkbonnen" (echte navigatie) |
| Summary ring + stats | View | ✅ | derived from listTimeEntriesForProfile | flat 8u-doel (gap #5b) |
| Week-strip bars | View | ✅ | listTimeEntriesForProfile | |
| Filter chips (incl. Team) | AppFilterChips | ✅ | client + server (`listCompanyTimeEntries`) | |
| Entry cards | EntryCard | ✅ | listTimeEntriesForProfile / listCompanyTimeEntries | |
| Entry "Meer" | MoreHorizontal | ⚪ | — | `notAvailableAlert('Uur bewerken')` |
| FAB "Uren toevoegen" | AppFab | ✅ | urenregistratie insert | opent `/hours/new` (werkbon-picker form) → echte insert |

**Verwijderd (was mock):** quick-add fake-formulier, "Aandacht nodig"-lijst, "Team vandaag"-strip. Team-data nu alleen via het echte Team-filter.

---

## Menu — `app/(tabs)/menu.tsx` (**6e bottom tab — hamburger icoon**)

Pure navigatie-hub. Geopend via de Menu-tab (niet via het profiel-icoon). Rol-aware; ontbrekende routes → `notAvailableAlert`, nooit een dode knop.

| Sectie | Items | Routes | Rol |
|---|---|---|---|
| Werk & uitvoering | Vandaag, Agenda, Werkbonnen, Uren, Klanten, Activiteiten ("Bellen, meetings en notities"), Taken, Notities, Foto's | tabs + /activities /tasks /notes /files | alle |
| Sales & administratie | Pipeline, Projecten, Offertes, Facturen, Documenten | /pipeline /projects /offers /invoices · Documenten→alert | admin+planner |
| Team & bedrijf | Team, Bedrijfsinstellingen, Rollen & rechten | /team /settings · Rollen→alert | admin |
| ~~Analyse & rapportage~~ | **Verwijderd** — Dashboard/Omzet/Uren-/Werkbonrapportage zijn **desktop-only** (productbeslissing) | — | — |
| Support | Help, Feedback, Contact support | → /support | alle |

Top-right profiel-icoon op de Menu-tab opent `/profile` (account), niet zichzelf.

---

## Profiel / account — `app/profile/index.tsx` (**NEW — buiten de tabs**)

Geopend via het profiel-avatar icoon rechtsboven op élke pagina (`ProfileSettingsButton` → `/profile`).

| Action | State | Backend | Notes |
|---|---|---|---|
| Terug | ✅ | router.back() | |
| Hero (naam/email/rol/bedrijf/stats) | ✅ | AuthProvider (profile/company) | stats = `—` (TODO aggregates) |
| Profiel bewerken (pencil) | ⚪ | — | notAvailableAlert |
| Voorkeuren · rijen | ⚪ | — | notAvailableAlert / toggle stub |
| Team & beheer (admin/planner) · rijen | ⚪ | — | notAvailableAlert |
| Koppelingen → Integraties (admin) | ✅ | /integrations | **NEW** — verplaatst vanuit Menu; opent de bestaande Integraties-route |
| Account · rijen | ⚪ | — | notAvailableAlert |
| Uitloggen | ✅ | supabase.auth.signOut | bevestiging-alert |

---

## Dashboard routes — `app/(more)/*` (**NEW**)

All use AppHeader(onBack) + AppScreen + EmptyState/ErrorState/LoadingScreen, RLS-safe reads, role guards.

| Screen | Route | State | Backend service | Role |
|---|---|---|---|---|
| Activiteiten | /activities | ✅ | activityService.listRecentActivities | all |
| Taken | /tasks | ✅ | activityService.listOpenTasks | all |
| Notities | /notes | ✅ | noteService.listNotes | all |
| Kosten | /expenses | ✅ | jobCostService.listJobCosts | admin+planner |
| Projecten | /projects | ✅ | projectService.listProjects | admin+planner |
| Pipeline | /pipeline | ✅ | dealService.listDeals + listPipelineStages | admin+planner |
| Offertes | /offers | ✅ | offerteService.listOffertes | admin+planner |
| Facturen | /invoices | ✅ | factuurService.listFacturen | admin+planner |
| Team | /team | ✅ | teamService.listTeamMembers | admin |
| Bedrijfsinstellingen | /settings | ✅ | settingsService.getCompanySettings (read-only) | admin |
| Integraties | /integrations | ⚪ info | — (tokens RLS-blocked; honest desktop-managed info). Bereikt via **Profiel → Koppelingen** (niet meer in Menu) | admin |
| Foto's & bestanden | /files | ⚪ placeholder | — (bucket `werkbon-photos` ontbreekt) | all |
| Help & support | /support | ✅ | OS Linking (mail/phone) | all |

Disallowed roles see a "Geen toegang" state and the service is not called.

---

## Bottom tabs — `app/(tabs)/_layout.tsx`

| Tab | Route | State |
|---|---|---|
| Vandaag | /(tabs)/today | ✅ |
| Agenda | /(tabs)/planning | ✅ |
| Werkbonnen | /(tabs)/work-orders | ✅ |
| Klanten | /(tabs)/customers | ✅ |
| Uren | /(tabs)/hours | ✅ |
| Menu (hamburger) | /(tabs)/menu | ✅ |

**6 tabs.** Profiel is géén tab — account staat op `/profile`, bereikbaar via het rechtsboven profiel-icoon (`ProfileSettingsButton`, gebakken in `AppHeader` + `headerRight` op detail-stacks). De Menu-tab is de navigatie-hub. `tabBarLabelStyle.fontSize = 10` zodat 6 labels passen op kleine iPhones.

---

## Thema (light/dark) — header-acties

| Onderdeel | State | Notes |
|---|---|---|
| `ThemeProvider` | ✅ | colorMode/toggleColorMode/setColorMode/colors; persistent via AsyncStorage (`bb.colorMode`), default light |
| `ThemeToggleButton` | ✅ | Maan (light→dark) / Zon (dark→light); links van profiel-icoon via `HeaderActions` |
| `ProfileSettingsButton` | ✅ | onveranderd rechts; opent `/profile` |
| Dark-mode dekking | 🟡 | Volledig: Vandaag, chrome (AppHeader/AppSection/KPI/states), tab bar, StatusBar. Overige schermen: donker canvas + lichte kaarten (leesbaar). Volledige kaart-styling per scherm = vervolg. |
| Vandaag polish | ✅ | emoji weg, volledige weekdag, "Uren schrijven" wit |

## Open issues / TODO summary

1. ~~**activityService**~~ — done; ook `listRecentActivities` + `listOpenTasks` toegevoegd.
2. ~~**noteService**~~ — done (read). Create/edit nog TODO(backend).
3. **New read-services done:** jobCost, project, deal, offerte, factuur, team, settings (allen read-only).
4. **Photo upload** — `expo-image-picker` + Supabase Storage bucket `werkbon-photos`/`expense-receipts`; backend gap (zie MOBILE_BACKEND_GAPS.md). `/files` toont placeholder.
5. **Create/update flows** (werkbon / klant / afspraak / notitie / settings) — gemarkeerd als "Nog niet beschikbaar" of read-only tot RLS write-paden bestaan.
6. **Aggregations** (vandaag-KPIs, hero next-appt, attention list, team-uren) — afwachten op view/edge function.
7. **Integraties** — beheer blijft desktop (token-tabellen zijn service-role only).
