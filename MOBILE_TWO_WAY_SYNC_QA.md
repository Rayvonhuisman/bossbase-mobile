# BossBase Mobile — Two-way Sync QA

> Manual tests for desktop ↔ mobile data sync. Both clients use the same Supabase tables + RLS, so reads sync after refresh/focus. Writes sync only where a mobile write is implemented (see MOBILE_SUPABASE_FEATURE_MATRIX.md).
> Accounts: an **admin** (or planner) account is needed for create flows; a **medewerker** to verify read scoping.

## Implemented writes (test both directions)

### Customers  — write implemented (NEW)
- **Mobile → Desktop:** Klanten → "+" FAB → fill name (+optional) → "Klant opslaan" → success alert → returns to list (new customer visible). Open desktop dashboard → refresh Klanten → the customer is there (same `company_id`). ✅ expected.
- **Desktop → Mobile:** create a customer on desktop → in app, switch away from Klanten and back (focus refetch) or pull-to-refresh → appears. ✅ expected.
- **Failure honesty:** if RLS blocks the insert, the form shows a real Dutch error (no fake success).

### Work orders — status + notes write implemented
- **Mobile → Desktop:** open a werkbon → change status / add note → refresh desktop → reflected (same status values). ✅
- **Desktop → Mobile:** create/change a werkbon on desktop → pull-to-refresh Werkbonnen → appears/updates. ✅

### Hours — insert implemented (via werkbon detail AND the Uren tab)
- **Mobile → Desktop (werkbon detail):** werkbon detail → "Uren toevoegen" → save → refresh desktop `urenregistratie` → entry present. ✅
- **Mobile → Desktop (Uren tab — NEW):** Uren tab → "Uren toevoegen" FAB → `/hours/new` → pick a werkbon, datum, uren, (notitie) → save → returns to Uren (entry visible via focus refetch). Refresh desktop `urenregistratie` → entry present (correct `werkbon_id` + `company_id` + `profile_id`). Role: any. ✅ expected.
- **Desktop → Mobile:** add/edit hours on desktop → Uren tab pull-to-refresh or return-to-tab → appears. ✅
- **Failure honesty:** RLS failure shows "Je hebt geen rechten om dit op te slaan…" — no fake success. (urenregistratie INSERT is proven, so this path should succeed.)

## Read-only on mobile (D→M only; create/update is desktop or backend-gap)
Test that desktop-created data appears in mobile after refresh; mobile does not create these yet:
- Agenda/activiteiten, Taken, Notities, Projecten, Offertes, Facturen, Pipeline, Kosten, Team, Instellingen — **Desktop → Mobile** ✅ (refresh/focus). **Mobile → Desktop** ✖ not implemented (see feature matrix + backend gaps #8 for the RLS-insert verification needed before adding their create forms).

## Blocked / desktop-only
- **Files/foto's:** no storage bucket + metadata table → blocked.
- **Integraties:** token tables are RLS service-role-only → desktop-only by design.
- **Standalone uren (zonder werkbon):** needs `werkbon_id` nullable or a werkbon-picker (gap #13).

## Safety checks
- [ ] No `customers.updated_at` query error in logs
- [ ] Created customer carries the correct `company_id` (RLS) and is NOT visible to another company
- [ ] No service-role key; anon client only
- [ ] No fake "opgeslagen" — failures show a real error
