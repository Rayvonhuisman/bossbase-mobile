# BossBase Mobile — RLS / Schema Readiness Audit

> **Date:** 2026-06-20 · For deciding which mobile create/update flows are safe to ship.
> **Hard constraint:** RLS insert/update policies cannot be verified from inside the app. The only solid evidence is **what already works in production**. So a write is "Safe to implement now" ONLY if an equivalent write on the same table already succeeds; otherwise it's "Probably safe — needs manual Supabase confirmation" and is NOT shipped (the brief forbids shipping a form whose insert would fail under RLS).

## Proven-working writes (the evidence base)
| Table | Operation | Proof |
|---|---|---|
| `urenregistratie` | INSERT | `createTimeEntry` from work-order detail works in production |
| `werkbonnen` | UPDATE (status, notes) | `updateWorkOrderStatus` / `appendNote` work in production |
| `customers` | INSERT | `createCustomer` shipped + confirmed last pass |

These prove the RLS pattern *for those tables*: an authenticated company member may write company-scoped rows. **This does not transfer to other tables** — each table can have its own (possibly stricter, e.g. admin-only or no-insert) policy.

## Per-action verdicts

| Action | Table | Verdict | Reason |
|---|---|---|---|
| **A. Add hours (Uren tab)** | `urenregistratie` | ✅ **Safe — IMPLEMENTED this pass** | INSERT is proven. `werkbon_id` is required, so the form makes work-order selection mandatory (no fake standalone). Same insert path as work-order detail. |
| **B. Create work order** | `werkbonnen` | 🟡 **Probably safe — needs confirmation** | Only UPDATE is proven; INSERT policy is unverified and is often restricted to admin/planner. Not shipped. Confirm an `authenticated` (or admin/planner) INSERT policy on `werkbonnen`, then it's a quick add. |
| **C. Create activity/appointment** | `activities` (and/or `calendar_events`) | 🟡 **Probably safe — needs confirmation** | Reads work; no write proven. Also need to decide table: planning combines `calendar_events` (timed) + `activities`. Confirm INSERT policy + which table desktop "Nieuwe afspraak" writes to. |
| **D. Create / complete task** | `activities` (type=`task`, `completed`) | 🟡 **Probably safe — needs confirmation** | Tasks are `activities` rows; no separate `tasks` table. INSERT + UPDATE(`completed`) policies unverified. |
| **E. Create note** | `notes` | 🟡 **Probably safe — needs confirmation** | `notes` table exists and reads; INSERT policy unverified. (Work-order notes already work via the `werkbonnen.notes` text column — that's separate and shipped.) |
| **F. Project create/update** | `projects` | 🟡 **Probably safe — needs confirmation** + complex | INSERT/UPDATE unverified; also has more required fields (status, owner) and is a desktop workflow. Keep read-only for now. |
| **G. Pipeline stage update** | `deals.stage_id` | 🟡 **Probably safe — needs confirmation** | UPDATE policy on `deals` unverified; `deals` DELETE is admin-only per SPEC, hinting writes may be role-restricted. Stage values come from `pipeline_stages` (already read). Confirm UPDATE policy before enabling drag/stage-move. |
| Offers/Facturen create | `offertes`/`facturen` | ⛔ **Desktop-only** | Numbering (BB-…), PDF, Moneybird — out of scope. |
| Files/foto's | storage `werkbon-photos` | ⛔ **Blocked** | Bucket + metadata table don't exist. |
| Integraties setup | `accounting_connections`… | ⛔ **Desktop-only** | Token tables are RLS service-role-only. |

## To unblock B–G (one-time check in Supabase Studio)
For each target table, confirm an RLS policy exists for role `authenticated` of the form:
```
-- INSERT (and/or UPDATE) with check that the row's company_id matches the caller's company
company_id = (select company_id from profiles where id = auth.uid())
```
(plus any role gate, e.g. role in ('admin','planner') for werkbonnen/deals). Once confirmed per table, each create/update is a quick add using the `createCustomer`/`createTimeEntry` pattern (typed service method → form screen → honest RLS error handling). **No migration is requested**; this is verification only. If a policy is missing, that's the backend change to add (additive, non-destructive).
