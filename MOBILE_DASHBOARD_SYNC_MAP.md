# BossBase Mobile — Dashboard ↔ Backend Sync Map

> **Date:** 2026-06-18 · **Repo:** `bossbase-mobile`
> Mobile uses the **same Supabase records as the desktop dashboard** via the anon client. RLS (filter `company_id = (select company_id from profiles where id = auth.uid())`) is the source of truth; the UI only hides what a role may not use. **No service-role keys. No parallel/mock tables.**

Legend — Read/Create/Update/Delete: ✅ implemented · ➖ not implemented (by design for now) · 🚫 blocked (RLS/desktop-only).

| Desktop page | Mobile route | Backend table(s) | Service file | R | C | U | D | Role access (mobile) | Status | Backend gaps |
|---|---|---|---|:--:|:--:|:--:|:--:|---|---|---|
| Klanten | `/(tabs)/customers` + `/customers/[id]` | `customers` | `customerService.ts` | ✅ | ➖ | ➖ | ➖ | all read; create/edit admin+planner (UI hides "+") | Live (existing) | `customers.updated_at` absent in prod → service sorts with fallback |
| Werkbonnen | `/(tabs)/work-orders` + `/work-orders/[id]` | `werkbonnen` (+ `werkbon_taken`, `werkbon_materialen`) | `workOrderService.ts` | ✅ | ➖ | ✅ (status) | ➖ | all (medewerker: assigned); status transitions role-gated | Live (existing) | notes stored in `werkbonnen.notes` blob; no `werkbon_notes` table |
| Uren | `/(tabs)/hours` | `urenregistratie` | `timeEntryService.ts` | ✅ | ✅ | ➖ | ➖ | own (all roles); company-wide admin/planner | Live (existing) | — |
| Agenda / Planning | `/(tabs)/planning` | `calendar_events`, `activities`, `werkbonnen` | `activityService.listPlanningItemsForRange` (+ `workOrderService.listWorkOrdersForPlanningRange`) | ✅ | ➖ | ➖ | ➖ | all (medewerker: own werkbonnen via `assigned_to`; events/activities company-wide via RLS) | **Live — Dag/Week/Maand, 3 real sources, no mock** | assignee names not client-resolvable (profiles RLS = own row); only "Jij" shown for self. `werkbonnen.gepland_op` is a `date` (local YYYY-MM-DD compare); events/activities are timestamptz (UTC-instant compare) |
| Activiteiten | `/activities` | `activities` | `activityService.listRecentActivities` | ✅ | ➖ | ➖ | ➖ | all | **New — real data** | create/complete from mobile = TODO(backend) |
| Taken | `/tasks` | `activities` (type=task, completed=false) | `activityService.listOpenTasks` | ✅ | ➖ | ➖ | ➖ | all | **New — real data** | toggling completion = TODO(backend) |
| Notities | `/notes` | `notes` | `noteService.ts` | ✅ | ➖ | ➖ | ➖ | all | **New — real data** | create/edit = TODO(backend) |
| Kosten | `/expenses` | `job_costs` | `jobCostService.ts` | ✅ | ➖ | ➖ | ➖ | admin + planner | **New — real data** | receipt upload needs `expense-receipts` bucket (not created) |
| Projecten | `/projects` | `projects` | `projectService.ts` | ✅ | ➖ | ➖ | ➖ | admin + planner (read-only) | **New — real data** | edit = desktop |
| Pipeline | `/pipeline` | `deals`, `pipeline_stages` | `dealService.ts` | ✅ | ➖ | ➖ | ➖ | admin + planner (read-only, grouped by stage) | **New — real data** | drag/stage-move = desktop |
| Offertes | `/offers` | `offertes` | `offerteService.ts` | ✅ | ➖ | ➖ | ➖ | admin + planner (read-only) | **New — real data** | PDF/send = desktop |
| Facturen | `/invoices` | `facturen` | `factuurService.ts` | ✅ | ➖ | ➖ | ➖ | admin + planner (read-only) | **New — real data** | PDF/send/Moneybird = desktop |
| Team | `/team` | `company_members` | `teamService.ts` | ✅ | ➖ | ➖ | ➖ | admin only | **New — real data** | invite/edit = desktop (RLS admin-only writes) |
| Instellingen | `/settings` | `bedrijfsinstellingen` | `settingsService.ts` | ✅ | — | ➖ | — | admin only (read-only) | **New — real data** | editing = TODO(backend)/desktop |
| Integraties | `/integrations` | `accounting_connections`, `google_calendar_connections` | — | 🚫 | 🚫 | 🚫 | 🚫 | admin only | **New — info only** | Token tables RLS = service-role only; mobile shows honest "beheren op desktop", no fake status |
| Foto's/bestanden | `/files` | (storage) `werkbon-photos` | — | 🚫 | 🚫 | — | — | all | **New — placeholder** | Bucket `werkbon-photos` not created (MOBILE_SPEC §8) |
| Help/support | `/support` | — (Linking) | — | — | — | — | — | all | **New — static** | none (email/phone via OS Linking) |
| Profiel/Account | `/menu` | `profiles`, `companies` | `profileService.ts` (via AuthProvider) | ✅ | — | ➖ | — | own | **New hub** (was tab) | editing profile = TODO(backend) |
| Dashboard widgets | — | `dashboard_widgets` | — | — | — | — | — | — | Desktop-only | n/a |
| Financiën / Rapportages | — | derived | — | — | — | — | — | — | Desktop-only | n/a |

## Notes on RLS & multi-tenancy
- Every new service queries through the shared anon `supabase` client and **adds no `company_id` filter** — RLS scopes rows to the caller's company, exactly like the pre-existing services. Adding a client filter would be redundant and could mask RLS gaps.
- Role gating in mobile is **UI-only** (hide menu entries + per-page "Geen toegang" guards). The server RLS remains authoritative; a medewerker hitting `/pipeline` directly sees a "Geen toegang" state and the service is not even called.
- Read-only by design for the new pages: no create/update/delete paths were added except where they already existed (work-order status, time entries). This avoids untested write paths against RLS insert/update policies.

## Empirical schema deltas (code-verified; override SPEC §6)
- `customers.updated_at` — **does not exist** in production (Postgres 42703). Handled by `customerService` sort fallback; `Customer.updated_at` typed optional.
- `profiles.email` — **does not exist**; email comes from `auth.users` via the session (`user.email`).
- New services avoid selecting `updated_at` unless needed and order by `created_at` / domain date columns that SPEC lists, to stay resilient.
