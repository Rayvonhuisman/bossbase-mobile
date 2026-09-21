# BossBase Mobile — Supabase Feature Matrix

> **Date:** 2026-06-20 · Source of truth for mobile↔backend sync.
> Anon client only, RLS-enforced, company-scoped. No service-role, no mobile-only tables. Supabase = single source of truth.
> Sync legend — **D→M** = desktop change appears in mobile (after refresh/focus); **M→D** = mobile change appears on desktop (after refresh).

## Shared rules
- `company_id` comes from `AuthProvider`; reads rely on RLS (no client filter); writes include `company_id` (+ `profile_id`/`werkbon_id` where required).
- All list/detail screens refetch on pull-to-refresh; tab lists also refetch on focus (stale-while-refresh — data stays visible).
- "Read" is implemented for every connected feature. "Create/Update" is implemented **only where schema + RLS are proven safe** (see note ‡).

‡ **RLS-insert note:** mobile authenticated **writes are proven to pass RLS** for `werkbonnen` (status/notes) and `urenregistratie` (insert) — those work today. Customer insert follows the same company-scoped pattern and is implemented. For other tables, an insert/update **RLS policy must be confirmed** before shipping a create form (can't be verified from the app); until then they stay read-only and are listed as gaps, not faked.

| # | Feature | Mobile route | Table(s) | Service | Read | Create | Update | D→M | M→D | Status | Gap / Priority |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Auth/profile/company | — | auth.users, profiles, companies | profileService | ✅ | — | — | ✅ | — | done | — |
| 2 | Vandaag | `/(tabs)/today` | calendar_events, activities, werkbonnen, urenregistratie | activity/workOrder/timeEntry | ✅(derived) | — | — | ✅ | — | done | omzet KPI = desktop (later) |
| 3 | Agenda | `/(tabs)/planning` | calendar_events, activities, werkbonnen | activityService | ✅ | ➖ | ➖ | ✅ | ➖ | read-done | create event needs RLS-insert verify (important) |
| 4 | Werkbonnen | `/(tabs)/work-orders` + `[id]` | werkbonnen (+ urenregistratie) | workOrderService, timeEntryService | ✅ | ➖ | ✅ **status + note** | ✅ | ✅ (status/note/uren) | **partial two-way** | create werkbon needs form+RLS verify (important) |
| 5 | Klanten | `/(tabs)/customers` + `/customers/new` + `[id]` | customers | customerService | ✅ | ✅ **NEW** | ➖ | ✅ | ✅ (create) | **partial two-way** | edit customer = later |
| 6 | Uren | `/(tabs)/hours` + `/hours/new` | urenregistratie | timeEntryService | ✅ | ✅ **werkbon detail + Uren tab** | ➖ | ✅ | ✅ | **two-way (create)** | standalone (no werkbon) still needs nullable werkbon_id |
| 7 | Activiteiten | `/activities` | activities | activityService | ✅ | ➖ | ➖ | ✅ | ➖ | read-done | create needs RLS-insert verify |
| 8 | Taken | `/tasks` | activities (type=task) | activityService | ✅ | ➖ | ➖ (complete) | ✅ | ➖ | read-done | create/complete need RLS verify |
| 9 | Notities | `/notes` | notes | noteService | ✅ | ➖ | ➖ | ✅ | ➖ | read-done | create note needs RLS-insert verify |
| 10 | Projecten | `/projects` | projects | projectService | ✅ | ➖ | ➖ | ✅ | ➖ | read-only | create = desktop workflow |
| 11 | Offertes | `/offers` | offertes | offerteService | ✅ | ➖ | ➖ | ✅ | ➖ | read-only | create/status = desktop (PDF/numbering) |
| 12 | Facturen | `/invoices` | facturen | factuurService | ✅ | ➖ | ➖ | ✅ | ➖ | read-only | create/status = desktop (Moneybird) |
| 13 | Pipeline | `/pipeline` | deals, pipeline_stages | dealService | ✅ | ➖ | ➖ | ✅ | ➖ | read-only | stage-move needs RLS verify |
| 14 | Kosten | `/expenses` | job_costs | jobCostService | ✅ | ➖ | ➖ | ✅ | ➖ | read-only | create + receipt bucket missing |
| 15 | Foto's/bestanden | `/files` | (storage werkbon-photos) | — | 🚫 | 🚫 | — | — | — | blocked | bucket+metadata table missing |
| 16 | Team | `/team` | company_members | teamService | ✅ | ➖ | ➖ | ✅ | ➖ | read-only | management = desktop (admin RLS) |
| 17 | Instellingen | `/settings` | bedrijfsinstellingen | settingsService | ✅ | — | ➖ | ✅ | ➖ | read-only | edit = later |
| 18 | Integraties | `/integrations` | accounting_connections, google_calendar_connections | — | 🚫 | 🚫 | 🚫 | — | — | desktop-only | tokens RLS service-role-only (by design) |
| 19 | Support | `/support` | — (OS Linking) | — | — | — | — | — | — | done (static) | optional support_requests table |
| 20 | Profiel | `/profile` | profiles, companies | profileService | ✅ | — | ➖ | ✅ | ➖ | read-done | edit profile = later |

## Implemented mobile→desktop writes (verified-safe, working)
- **Werkbon status update** (`werkbonnen.status`), **werkbon note** (`werkbonnen.notes`), **time entry insert** (`urenregistratie`) — from work-order detail.
- **Create customer** (`customers` insert) — `/customers/new` form. Appears on desktop after refresh; appears in the mobile list on return (focus refetch).
- **Add hours from the Uren tab** (`urenregistratie` insert) — `/hours/new` form with a mandatory werkbon picker (this pass). Uses the proven insert; appears on desktop + in the Uren list on return.

## What's intentionally NOT a mobile write
- Offers/invoices/projects/pipeline creation → desktop workflows (numbering, PDF, Moneybird, kanban). Mobile is read-only by product decision.
- Integrations → desktop-only (token tables are service-role-only).
- Reporting/analytics (Dashboard/Omzet/Rapportages) → desktop-only (removed from mobile).
