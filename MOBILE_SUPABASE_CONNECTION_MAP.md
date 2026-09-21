# BossBase Mobile — Supabase Connection Map

> **Date:** 2026-06-19 · **Repo:** `/Users/macbook/bossbase-mobile`
> Per-route mapping of mobile screens → Supabase tables/services. Supabase is the single source of truth; the mobile app uses the **same tables, company_id multi-tenancy, RLS policies and status values** as the desktop dashboard.

## Shared model (applies to every read/write below)

- **Client:** the shared anon-key `supabase` client (`src/lib/supabase.ts`). **No service-role key anywhere in the app.**
- **company_id / RLS:** services do **not** add a client-side `company_id` filter — RLS scopes every row to `company_id = (select company_id from profiles where id = auth.uid())`. RLS is the final authority; frontend role checks are UX only.
- **profile/user id:** `user.id` (= `profiles.id`) and `companyId` come from `AuthProvider`. Mutations that need ownership pass `profile_id` / `company_id` explicitly (time entries) or rely on the row's existing scope (work-order status/notes).
- **Desktop ↔ mobile sync:** because both clients hit the same tables, **desktop changes appear in mobile after refresh**, and **mobile writes appear in desktop after refresh**. No mobile-only tables exist.
- **Role view:** `medewerker` narrows werkbonnen/agenda to `assigned_to = user.id`; `admin`/`planner` see company-wide where RLS allows.

Legend — Source: 🟢 real Supabase · 🟡 hybrid (real + safe placeholder) · ⚪ placeholder/info · 🔵 auth/derived.

---

## Core

| Route | Source | Table(s) | Service | Actions | Notes |
|---|---|---|---|---|---|
| Auth / session | 🔵 | `auth.users` | `supabase.auth` (AuthProvider) | sign in/out, restore | unchanged; works |
| Profile/company/role | 🟢 | `profiles`, `companies` | `profileService.fetchProfileWithCompany` | read | loaded once by AuthProvider |
| **Vandaag** `/(tabs)/today` | 🟡 | `calendar_events`, `activities`, `werkbonnen`, `urenregistratie` | `activityService` (`getNextPlanningItem`, `listPlanningItemsForRange`), `workOrderService.listWorkOrders`, `timeEntryService` | read | **Now real:** next-appointment hero, today timeline, "Uren vandaag" KPI, "Open werkbonnen" KPI, week chart. **Omzet KPI = "—"** (no revenue aggregate — gap). Mock removed. |
| **Agenda** `/(tabs)/planning` | 🟢 | `calendar_events`, `activities`, `werkbonnen` | `activityService.listPlanningItemsForRange` (+ `workOrderService.listWorkOrdersForPlanningRange`) | read | Dag/Week/Maand, role-aware, pull-to-refresh. No mock. |
| **Werkbonnen** `/(tabs)/work-orders` | 🟢 | `werkbonnen` (+ join `customers`) | `workOrderService.listWorkOrders` | read | search, filter chips, status filter, "mijn" via `assigned_to`, pull-to-refresh |
| **Werkbon detail** `/work-orders/[id]` | 🟢 | `werkbonnen`, `urenregistratie` | `getWorkOrder`, `updateWorkOrderStatus`, `appendNote`, `timeEntryService.createTimeEntry` | read, **update** (status), **create** (note via `notes` blob, time entry) | mutations save to Supabase + refetch; status values match desktop. Photo upload = ⚪ (no bucket — gap). |
| **Klanten** `/(tabs)/customers` | 🟢 | `customers` | `customerService.listCustomers` | read | search, call/mail/maps. **Never queries `customers.updated_at`** (sorts `created_at`→`name` fallback). |
| **Klant detail** `/customers/[id]` | 🟢 | `customers`, `werkbonnen` | `getCustomer`, `workOrderService.listWorkOrders` (client-filtered by customer) | read | contact actions, related werkbonnen, notes = ⚪ placeholder |
| **Uren** `/(tabs)/hours` | 🟢 | `urenregistratie` | `listTimeEntriesForProfile`, `listCompanyTimeEntries` | read | real today-summary, week strip, registraties, Team-filter (company entries). Mock team/attention/quick-add **removed**. Standalone create = ⚪ (needs werkbon — navigates to Werkbonnen). |
| **Menu** `/(tabs)/menu` | 🟢 | — | navigation hub | nav | role-aware; routes only |
| **Profiel** `/profile` | 🟢 | `profiles`, `companies` | AuthProvider | read | name/email/role/company real; sub-settings = ⚪ `notAvailableAlert`; Integraties (admin) → `/integrations` |

---

## Dashboard / `(more)` pages

| Route | Source | Table(s) | Service | Actions | Notes |
|---|---|---|---|---|---|
| Activiteiten `/activities` | 🟢 | `activities` | `activityService.listRecentActivities` | read | |
| Taken `/tasks` | 🟢 | `activities` (type=task) | `activityService.listOpenTasks` | read | |
| Notities `/notes` | 🟢 | `notes` | `noteService.listNotes` | read | create = later |
| Kosten `/expenses` | 🟢 | `job_costs` | `jobCostService.listJobCosts` | read | admin+planner |
| Projecten `/projects` | 🟢 | `projects` | `projectService.listProjects` | read | admin+planner |
| Pipeline `/pipeline` | 🟢 | `deals`, `pipeline_stages` | `dealService` | read | admin+planner |
| Offertes `/offers` | 🟢 | `offertes` | `offerteService.listOffertes` | read | admin+planner |
| Facturen `/invoices` | 🟢 | `facturen` | `factuurService.listFacturen` | read | admin+planner |
| Team `/team` | 🟢 | `company_members` | `teamService.listTeamMembers` | read | admin |
| Instellingen `/settings` | 🟢 | `bedrijfsinstellingen` | `settingsService.getCompanySettings` | read | admin, read-only |
| Integraties `/integrations` | ⚪ | `accounting_connections`, `google_calendar_connections` | — | info | tokens are RLS service-role-only → **not** client-readable; honest "beheren op desktop". Reached from Profiel → Koppelingen (admin). |
| Foto's/bestanden `/files` | ⚪ | (storage `werkbon-photos`) | — | placeholder | bucket not created — gap |
| Rapportages | — | derived | — | — | Desktop-only (no mobile route) |
| Support `/support` | 🟢 | — (OS Linking) | — | mail/phone | static |

---

## Mutation → desktop sync (verified by shared-table design)

| Mobile action | Table | Appears on desktop? |
|---|---|---|
| Update werkbon status (detail) | `werkbonnen.status` | ✅ same column/values |
| Add werkbon note (detail) | `werkbonnen.notes` (timestamped blocks) | ✅ visible in the notes field |
| Add time entry (werkbon detail) | `urenregistratie` insert (company_id + profile_id + werkbon_id) | ✅ |
| Desktop → mobile (new customer/werkbon/event, status change) | same tables | ✅ after pull-to-refresh / re-open |

---

## Backend gaps surfaced by this pass (see MOBILE_BACKEND_GAPS.md)

| Gap | Impact | Status |
|---|---|---|
| Revenue aggregate (omzet vandaag) | Vandaag KPI shows "—" | later |
| Per-user "expected/contract hours" | Uren uses a flat 8u/day target | later |
| Team-hours aggregate + `profile_id → name` map | Team summary removed (mock); Team-filter shows raw entries | later |
| Standalone time-entry create (no werkbon) | Uren add navigates to Werkbonnen | later |
| `werkbon-photos` storage bucket | photo upload = placeholder | later |
| Integration token access | integrations = info only (by design / security) | by design |
