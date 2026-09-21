# BossBase Mobile — Navigation Map (Phase 1 audit)

> **Status:** Planning document. No code changed in Phase 1.
> **Date:** 2026-06-18
> **Repo:** `/Users/macbook/bossbase-mobile` (Expo Router + React Native + TypeScript + Supabase)
> **Source of truth for desktop features:** `/Users/macbook/BossBase website/SPEC.md` (§4.3/§4.4 pages, §6 schema, §5.2 roles) and `MOBILE_SPEC.md` (§3 permission matrix, §4 mobile scope).

This document classifies every desktop dashboard page/feature for mobile access, defines the new navigation structure, and is the gate before any implementation (Phase 2+).

---

## ⚠️ Revision 2026-06-19 — "Analyse & rapportage" removed from mobile

The **Analyse & rapportage** menu group (Dashboard, Omzet, Urenrapportage, Werkbonrapportage) is **removed from the mobile app**. These analytics/reporting views are **desktop-only by product decision** — mobile focuses on operational field workflows. They were stub `notAvailableAlert` items with no routes, so no routes/services/backend were removed and no dead links remain. (The Vandaag "Omzet vandaag" KPI is a separate field-tile, unaffected.)

---

## ⚠️ Revision 2026-06-18 — Menu is now a bottom tab (supersedes §0/§2 below)

The original plan made the **profile avatar** open the menu/account hub. That was corrected:

- **Bottom tabs are now SIX:** Vandaag · Planning · Werkbonnen · Klanten · Uren · **Menu** (hamburger icon, after Uren). Route: `app/(tabs)/menu.tsx`.
- **Menu tab** = pure navigation hub for all dashboard functions (no profile/account content). Role-aware sections; items without a route call `notAvailableAlert`.
- **Top-right avatar** (`ProfileSettingsButton`, baked into `AppHeader` + detail-stack `headerRight`) now opens **`/profile`** (account settings) — **not** the menu.
- **Profile/account settings** moved to its own non-tab stack `app/profile/` (hero, role badge, company, preferences, account, logout). The old `app/menu/` stack was deleted.

Everything below in §2/§3 still describes the menu's *content/role model*, which is unchanged; only the entry point moved (icon → tab) and profile split out.

---

## ⚠️ Revision 2026-06-18 — Labels & menu cleanup

- **"Planning" → "Agenda"** as the visible label everywhere (bottom tab, page header, menu item, onboarding feature chip, subtitles/empty/loading copy). The route stays `app/(tabs)/planning.tsx` and all internal code (`PlanningItem`, `PlanningScreen`, `listPlanningItemsForRange`, `formatPlanningDate`, `activityService`, etc.) is unchanged for compatibility.
- **Integraties moved out of the Menu tab → Profile settings** (`app/profile/index.tsx`, new admin-only "Koppelingen" section → `/integrations`). The Menu no longer has an Integraties group.
- **Activiteiten** menu subtitle translated: "Calls, meetings en notities" → **"Bellen, meetings en notities"**.

---

## 0. Product decision (fixed)

**Bottom tabs stay exactly these 5** — main mobile navigation, unchanged:

| # | Tab | Route | Status |
|---|-----|-------|--------|
| 1 | Vandaag | `app/(tabs)/today.tsx` | keep |
| 2 | Planning | `app/(tabs)/planning.tsx` | keep |
| 3 | Werkbonnen | `app/(tabs)/work-orders.tsx` | keep |
| 4 | Klanten | `app/(tabs)/customers.tsx` | keep |
| 5 | Uren | `app/(tabs)/hours.tsx` | keep |

**Profiel is removed as a bottom tab** and becomes a **menu/account hub** reachable from a **profile-avatar icon in the top-right of every page**. Everything else from the desktop dashboard becomes reachable from that hub (if relevant for mobile).

---

## 1. Classification of every desktop dashboard page/feature

Classification buckets:
1. **Main bottom tab** — one of the 5 fixed tabs.
2. **Menu page** — reachable from the new profile/menu hub; gets a mobile route now.
3. **Detail/subpage** — a child of a tab or menu page (e.g. `[id]` detail), not a top-level entry.
4. **Mobile later** — visible in the menu but shell/placeholder for now; real build deferred.
5. **Desktop-only** — not exposed on mobile at all (no menu entry).

Desktop page IDs/labels are from SPEC §4.3/§4.4. Backend support column summarizes whether a real table + RLS-safe read path exists.

| Desktop page (label) | Backend table(s) | Classification | Mobile route (planned) | Role visibility | Backend support |
|---|---|---|---|---|---|
| **Dashboard** (widget grid, drag&drop) | `dashboard_widgets` | **Desktop-only** | — | — | Per-user widget layout; not meaningful on a 5-tab mobile UI. MOBILE_SPEC §4 = desktop-only. |
| **Pipeline** (deals kanban) | `deals`, `pipeline_stages` | **Menu page — Mobile later** | `app/pipeline/index.tsx` | admin, planner | YES (read). Mobile = list view, not kanban. |
| **Klanten** (CRM) | `customers` | **Main bottom tab** | `app/(tabs)/customers.tsx` ✅ | all (read); create/edit admin+planner | YES — already live |
| **Activiteiten** (todo/agenda tasks) | `activities` | **Menu page (MVP)** | `app/activities/index.tsx` | all (own); admin/planner all | YES — `activityService` already exists |
| **Agenda** (week calendar) | `calendar_events` | **Folded into Planning tab** | `app/(tabs)/planning.tsx` | all | YES — `activityService.listCalendarEventsForRange` exists |
| **Kosten** (job costs) | `job_costs` | **Menu page (MVP)** | `app/expenses/index.tsx` | admin, planner (medewerker: upload receipts later) | YES (table); no mobile service yet → build |
| **Financiën** (revenue charts) | derived/widgets | **Desktop-only** | — | — | Charts only; MOBILE_SPEC §4 = desktop-only |
| **Facturen** (invoices) | `facturen`, `factuur_regels` | **Menu page — Mobile later** | `app/invoices/index.tsx` | admin, planner (read-only) | YES (read) |
| **Offertes** (quotes) | `offertes`, `offerte_items` | **Menu page — Mobile later** | `app/offers/index.tsx` | admin, planner (read-only) | YES (read) |
| **Projecten** (projects) | `projects`, `time_entries`, `project_notes` | **Menu page — Mobile later** | `app/projects/index.tsx` | admin, planner (read-only) | YES (read) |
| **Werkbonnen** (work orders) | `werkbonnen`, `werkbon_taken`, `werkbon_materialen` | **Main bottom tab** | `app/(tabs)/work-orders.tsx` ✅ + `app/work-orders/[id].tsx` ✅ | all (medewerker: assigned only) | YES — already live |
| **Uren** (time tracking) | `urenregistratie` | **Main bottom tab** | `app/(tabs)/hours.tsx` ✅ | all (own); admin/planner all | YES — already live |
| **Team** (members) | `company_members`, `profiles` | **Menu page** | `app/team/index.tsx` | admin only (planner read later) | YES (read); writes admin-only via RLS |
| **Instellingen** (company config) | `bedrijfsinstellingen`, `email_templates` | **Menu page** | `app/settings/index.tsx` | admin only | YES (read/update admin) |
| **Integraties** (Moneybird/SnelStart/AFAS) | `accounting_connections` | **Menu page — status read-only; management Desktop-only** | `app/integrations/index.tsx` | admin only | TOKENS BLOCKED on client (RLS = service-role only). Mobile shows status only; no token entry. |
| **Integraties — Google Calendar** | `google_calendar_connections` | **Menu page — status via RPC** | within `app/integrations/index.tsx` | admin (own connection) | Status via SECURITY DEFINER RPC `google_calendar_status()`; connect/disconnect = desktop |
| **Rapportages** (reporting) | derived | **Desktop-only** | — | — | MOBILE_SPEC §20 "Rapportages blijft web" |
| **Notities** (notes) | `notes`, `project_notes` | **Menu page (MVP)** | `app/notes/index.tsx` | all (own) | YES (table); no mobile service yet → build |
| **Foto's / bestanden** | Storage `werkbon-photos`*, `job_costs.bijlage_url` | **Menu page — Mobile later** | `app/files/index.tsx` | all | PARTIAL — `werkbon-photos` bucket NOT yet created (backend gap). Placeholder until bucket exists. |
| **Profiel / Account** | `profiles`, `companies` | **Menu hub itself** | `app/menu/index.tsx` (new home of current profile page) | all (own) | YES — `profileService` live via `AuthProvider` |
| **Help / Support** | — | **Menu page (static)** | `app/support/index.tsx` | all | No backend; static contact + version info |
| **Login / Onboarding** | `auth.users` | unchanged | `app/(auth)/`, `app/(onboarding)/` | — | Live |

\* `werkbon-photos` private bucket is listed in MOBILE_SPEC §8 as **new** — does not exist yet. Photos = placeholder until migration/bucket lands.

---

## 2. New navigation structure

### 2.1 Bottom tabs (after Phase 2)
```
[ Vandaag ] [ Planning ] [ Werkbonnen ] [ Klanten ] [ Uren ]
```
`profile` tab removed from `app/(tabs)/_layout.tsx`.

### 2.2 Top-right profile icon (every page)
- A **profile-avatar circle** showing initials (from `profile.full_name`, fallback to `user.email`), matching the avatar already on the Vandaag header (`today.tsx` rightSlot, `ds.green` circle).
- Component: **`src/components/ProfileMenuButton.tsx`** — renders the avatar circle, navigates to `/menu`.
- Placed via `AppHeader`'s existing `rightSlot` prop on the 5 tabs, and added to the work-order/customer detail stack headers.

### 2.3 Menu/profile hub
- **Route:** `app/menu/index.tsx` (top-level stack, mirrors `app/customers/_layout.tsx` auth-guard pattern). Built from the current `app/(tabs)/profile.tsx` content.
- The current `app/(tabs)/profile.tsx` is **moved** (logic preserved), not deleted.

> **Route choice rationale:** `app/menu/` over `app/profile/` because the screen is becoming a navigation hub (menu) first, account second. A new `app/menu/_layout.tsx` reuses the existing auth-guard stack pattern.

---

## 3. Menu hub layout (role-aware) — design target for Phase 3

**Hero:** avatar/initials · full name · email · role badge (Beheerder/Planner/Medewerker) · company name · plan/status pill.

**Grouped sections** (only items the role may use are rendered; nothing dead — every item either routes to a real page or calls `notAvailableAlert`):

| Group | Items | admin | planner | medewerker |
|---|---|:--:|:--:|:--:|
| **A. Werk & uitvoering** | Vandaag, Planning, Werkbonnen, Uren, Klanten, Activiteiten, Notities, Foto's | ✓ | ✓ | ✓ |
| **B. Sales & administratie** | Pipeline, Offertes, Facturen, Projecten, Kosten | ✓ | ✓ | ✗ |
| **C. Team & bedrijf** | Team, Bedrijfsinstellingen, Profielinstellingen | Team+Instellingen+Profiel | Profiel (+Team read later) | Profiel only |
| **D. Integraties** | Moneybird, SnelStart, AFAS, Google Calendar (status) | ✓ | ✗ | ✗ |
| ~~**E. Analyse & rapportage**~~ | **Verwijderd uit de mobiele app** — Dashboard, Omzet, Uren-/Werkbonrapportage zijn **desktop-only** (productbeslissing) | — | — | — |
| **F. Support** | Helpcentrum, Contact, Feedback, Versie-info | ✓ | ✓ | ✓ |
| **Account** | Account & beveiliging, Uitloggen | ✓ | ✓ | ✓ |

Role mapping derives directly from MOBILE_SPEC §3 permission matrix + SPEC §5.2:
- **admin:** all groups.
- **planner:** A + B + own profile + support; hide Team admin, Instellingen, Integraties.
- **medewerker:** A (field work) + own profile + support; hide B, Team, Instellingen, Integraties, Rapportages.

---

## 4. Routes to create (Phase 4)

Each new route is a top-level stack folder with a `_layout.tsx` auth guard (copy of `app/customers/_layout.tsx`) + `index.tsx`. Real data where a service path exists; otherwise a polished placeholder + `notAvailableAlert`, never a dead button.

| Route | Real data now? | Service status |
|---|---|---|
| `app/menu/index.tsx` | YES | uses `useAuth` (live) |
| `app/activities/index.tsx` | YES | `activityService` exists |
| `app/notes/index.tsx` | build service | `notes` table exists; new `noteService` |
| `app/expenses/index.tsx` | build service | `job_costs` table exists; new `jobCostService` |
| `app/projects/index.tsx` | build service (read) | `projects` table exists; new `projectService` |
| `app/pipeline/index.tsx` | build service (read) | `deals`+`pipeline_stages`; new `dealService` |
| `app/offers/index.tsx` | build service (read) | `offertes`; new `offerteService` |
| `app/invoices/index.tsx` | build service (read) | `facturen`; new `factuurService` |
| `app/team/index.tsx` | build service (read) | `company_members`; new `teamService` |
| `app/settings/index.tsx` | build service (read) | `bedrijfsinstellingen`; new `settingsService` |
| `app/integrations/index.tsx` | status only | tokens RLS-blocked; status via Google RPC |
| `app/files/index.tsx` | placeholder | `werkbon-photos` bucket NOT created (gap) |
| `app/support/index.tsx` | static | no backend needed |

Priority order for *real* functionality (per brief): Activities → Notes → Projects → Pipeline → Offers/Invoices → Files/photos → Team → Settings/Integrations/Reports. Do not overbuild where backend mapping is unclear.

---

## 5. Constraints honored

- No service-role keys, no RLS bypass — all reads go through `supabase` anon client; RLS filters by `company_id`.
- `accounting_connections` / `google_calendar_connections` tokens are **not** readable client-side (RLS service-role-only) → mobile never attempts to read/write tokens; integrations are status-display only.
- No destructive migrations; no new tables required for Phase 1–4 reads (all target existing tables).
- Empirical schema deltas to respect (verified in current mobile code, override SPEC §6):
  - `customers.updated_at` does **not** exist (Postgres 42703) — `customerService` already sorts with fallback.
  - `profiles.email` does **not** exist — email comes from `auth.users` via session.
- Photos/files depend on a not-yet-created bucket → placeholder, documented as backend gap.

---

## 6. Open question for the user (before Phase 2)

None blocking. Default decisions taken: route hub at `app/menu/`, avatar-circle icon style (matches Vandaag), tracking docs live in the mobile repo. Will proceed to Phase 2 (navigation restructure) on confirmation.
