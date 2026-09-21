# BossBase Mobile — RLS Policy Audit

> **Date:** 2026-06-20 · Source: `/Users/macbook/BossBase website/supabase/migrations/*` (read-only).
> Goal: determine which remaining mobile create/update flows are already RLS-allowed vs. need verification/policy.

## How RLS works in this backend
- `profiles.id = auth.uid()`; `profiles.company_id`; `profiles.role ∈ ('admin','planner','medewerker')`; `profiles.is_super_admin` (bypass).
- Canonical company scope used by every policy: **`company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())`** (a helper `current_user_company_id()` also exists but most policies inline the subquery).
- Role gate where used: `(SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin','planner')`.
- `user_permissions` (migration `20260616000000_rechten.sql`) is a **separate** fine-grained table (admin-managed); it does NOT gate werkbonnen/deals/activities/notes/calendar_events. Role-based policies remain authoritative.

## ⚠️ Big caveat: a pre-migration baseline exists
The migrations folder starts at `001_add_operations_modules.sql`. Several core tables — **`activities`, `calendar_events`, `notes`, `customers`, `companies`, `profiles`, `deals` (table), `pipeline_stages`** — have **no `CREATE TABLE` and no policy definitions in the migrations** (they're only `ALTER`-ed later). They were created in a **pre-001 baseline (Supabase Studio), which is not in the repo**. So their RLS policies **cannot be read from files** and must be checked in Studio (`pg_policies`).

Evidence they exist + allow company writes anyway: the desktop app creates `activities`/`notes`/`calendar_events` (SPEC §7 `activityService`/`noteService`/`calendarService`), and mobile `customers` INSERT (same baseline era) is **proven** working — so the baseline RLS allows authenticated company-member writes on these tables.

## Per-table findings

| Table | Created in | RLS enabled | SELECT | INSERT | UPDATE | DELETE | Role gate | Source |
|---|---|---|---|---|---|---|---|---|
| **werkbonnen** | `001` (✅ in repo) | yes | ✅ admin/planner=all, medewerker=own (`assigned_to=auth.uid()`) | ✅ **admin/planner only** + company | ✅ admin/planner OR own (`assigned_to`) + company | admin only | yes | `001_add_operations_modules.sql:318-360` |
| **deals** | baseline; RLS fixed in `002` (✅ in repo) | yes | ✅ company member | ✅ company member | ✅ **company member** (no role gate) | admin only | partial | `002_fix_deals_fk_and_rls.sql:114-145` |
| **activities** | baseline (❌ not in repo) | (yes — ALTERed in 021, notificaties) | likely ✅ (reads work) | **unknown — not in files** | **unknown** | — | unknown | not in migrations |
| **calendar_events** | baseline (❌ not in repo) | (assumed yes) | likely ✅ | **unknown** | **unknown** | — | unknown | not in migrations |
| **notes** | baseline (❌ not in repo) | (assumed yes) | likely ✅ | **unknown** | **unknown** | — | unknown | not in migrations |

Columns (SPEC §6.2): `activities(customer_id, deal_id, title, type[call/email/meeting/task/note], body, notes, author, due_at, completed, completed_at, company_id, …)`; `calendar_events(title, start_at, end_at, location, description, customer_id, deal_id, company_id)`; `notes(body, author, customer_id/deal_id, company_id)`.

## Verdicts per requested flow
| Flow | Table/op | Verdict |
|---|---|---|
| 1. Create werkbon | `werkbonnen` INSERT | ✅ **Already allowed (admin/planner)** — no migration. Build form, gate to admin/planner. |
| 6. Update pipeline/deal stage | `deals` UPDATE (`stage_id`) | ✅ **Already allowed (company member)** — no migration. Build stage update. |
| 2. Create afspraak | `calendar_events` INSERT | 🟡 **Verify in Studio** (baseline policy not in repo; almost certainly exists since desktop creates events). |
| 3. Create taak | `activities` INSERT (type=task) | 🟡 **Verify in Studio.** |
| 4. Complete/update taak | `activities` UPDATE (`completed`) | 🟡 **Verify in Studio.** |
| 5. Create notitie | `notes` INSERT | 🟡 **Verify in Studio.** |

## What this means
- **werkbon create** and **deal-stage update** are confirmed RLS-ready — implementable with no backend change.
- **activities/calendar_events/notes** writes are almost certainly allowed but the policy text isn't in the repo → one `pg_policies` query in Studio confirms it. **No migration should blindly DROP/CREATE policies on these baseline tables** (could break the real, working desktop policies). A guarded, additive safety-net migration is provided (`MOBILE_RLS_MIGRATION_PROPOSAL.sql`) that only adds a policy IF one is missing.
