# BossBase Mobile — Backend gaps

Tracks where mobile UI needs backend behavior that does not exist yet (or where the existing schema doesn't support the UI cleanly). Each gap lists current workaround, recommended migration, MVP/later, and risk.

---

## 1. `customers.updated_at` ontbreekt

| | |
|---|---|
| **Status** | Backend gap |
| **Affected feature** | Customer list sort + "Bijgewerkt" labels |
| **Current workaround** | `customerService.listCustomers` sorteert op `created_at` met fallback naar `name`. UI gebruikt `updated_at ?? created_at` voor activity-label. |
| **Recommended migration** | Optioneel — `ALTER TABLE customers ADD COLUMN updated_at timestamptz DEFAULT now() NOT NULL;` + trigger `trigger_set_updated_at`. |
| **MVP/later** | Later (mobile werkt zonder) |
| **Risk** | Low — alleen verlies van "laatst bewerkt" UX. |

---

## 2. Geen `werkbon_notes` tabel

| | |
|---|---|
| **Affected feature** | Notities op werkbonnen |
| **Current workaround** | `werkbonnen.notes` TEXT-kolom; mobile parsed/append timestamped blocks `[ISO] — Auteur\nbody`. |
| **Limitations** | Geen auteur-id, geen edit/delete per losse notitie, race-condities bij concurrent writes. |
| **Recommended migration** | Nieuwe tabel `werkbon_notes(id uuid pk, werkbon_id uuid fk, company_id uuid fk, author_id uuid fk profiles, body text, created_at timestamptz)` + RLS policies analoog aan `notes`. |
| **MVP/later** | Later — huidige flow werkt |
| **Risk** | Medium — concurrent writes kunnen blocks overschrijven |

---

## 3. `urenregistratie.status` ontbreekt

| | |
|---|---|
| **Affected feature** | Uren filter "Open / Ingediend / Goedgekeurd / Afgewezen" |
| **Current workaround** | Alle entries renderen als "Concept". Filter chips voor ingediend/goedgekeurd geven dezelfde lijst. |
| **Recommended migration** | `ALTER TABLE urenregistratie ADD COLUMN status text NOT NULL DEFAULT 'concept' CHECK (status IN ('concept','ingediend','goedgekeurd','afgewezen'));` + workflow-policies in RLS. |
| **MVP/later** | Later (UI is honest: "Concept"-label) |
| **Risk** | Low — geen data-mutaties |

---

## 4. Photo-weergave/upload op werkbon (metadata-tabel bestaat al)

| | |
|---|---|
| **Affected feature** | "Foto toevoegen" op werkbon, "Foto bij werk" quick action op vandaag |
| **Current workaround** | UI buttons tonen "Nog niet beschikbaar" — geen upload-flow; werkbon-detail toont (nog) geen foto's |
| **Backend status** | De **metadata-tabel `werkbon_fotos` bestaat al** (`001_add_operations_modules.sql`) met RLS (admin/planner + toegewezen medewerker), net als `werkbon_materialen`/`werkbon_taken`. Wat ontbreekt is de **Storage-bucket** voor de bestanden zelf + een bevestigde URL/path-kolom-conventie. Daarom blijft foto's weergeven/uploaden buiten scope tot de bucket bevestigd is. |
| **Recommended approach** | Supabase Storage bucket `werkbon-fotos` (private) + signed URLs voor weergave; lezen via bestaande `werkbon_fotos`-rijen |
| **Native deps** | `expo-image-picker`, `expo-file-system` |
| **MVP/later** | Later (zie MOBILE_SPEC §8) |
| **Risk** | Medium — vereist Apple/Android camera permissions + bucket-config |

---

## 5. Aggregaten voor Vandaag KPIs / Profiel stats / Team uren

| | |
|---|---|
| **Affected features** | Vandaag KPI strip (omzet), Profiel hero (deze maand / werkbonnen / klanten) |
| **Current state (na deze pass)** | **Vandaag KPIs deels echt:** "Uren vandaag" (uit `urenregistratie`) en "Open werkbonnen" (uit `werkbonnen`) zijn nu echt afgeleid. **"Omzet vandaag" toont `—`** (geen revenue-aggregaat). Profiel hero-stats tonen nog `—`. |
| **Recommended approach** | Database views per aggregaat: `v_today_revenue`, `v_profile_stats` — RLS via `company_id = current company` |
| **Alternative** | Edge function `mobile-dashboard` die JSON teruggeeft |
| **MVP/later** | Later |
| **Risk** | Low — pure read-only |

### 5b. Vaste/contract-uren per medewerker
| | |
|---|---|
| **Affected feature** | Uren-doel ("/ 8 u", "nog X uur verwacht") |
| **Current workaround** | Vlakke aanname van 8u/dag (TODO(backend) in `hours.tsx`) |
| **Recommended** | `company_members.hours_per_week` → dagdoel afleiden |
| **MVP/later** | Later |

---

## 14. ⭐ Werkbon-materialen + werkzaamheden op detail (**FIXED THIS PASS**)

| | |
|---|---|
| **Affected feature** | Werkbon-detail: materialen (benodigdheden) + werkzaamheden/checklist |
| **Solution** | `workOrderService.listWorkOrderMaterials` (tabel `werkbon_materialen`) en `listWorkOrderTasks` (tabel `werkbon_taken`) gekoppeld in `app/work-orders/[id].tsx`. **Materialen** tonen aantal + eenheid + naam zodat de medewerker weet wat mee te nemen naar de klant; lege staat = "Geen materialen gekoppeld aan deze werkbon." (geen fake data). **Werkzaamheden** tonen read-only met afgerond-vinkje (sectie verborgen als er geen taken zijn). |
| **RLS** | Beide tabellen (`001_add_operations_modules.sql`) staan SELECT toe voor admin/planner én de **toegewezen medewerker** (`werkbonnen.assigned_to = auth.uid()`) → de veldwerker leest z'n eigen materialen/taken zonder backend-wijziging. |
| **Niet gedaan (bewust)** | Checklist **togglen** (`werkbon_taken` UPDATE is RLS-veilig voor de toegewezen medewerker) is read-only gehouden om deze pass te beperken tot tonen; toggle is een veilige follow-up. Materialen bewerken blijft desktop-only. |
| **Status** | Done — echte data |

---

## 6. ⭐ "Next appointment" service (**FIXED THIS PASS**)

| | |
|---|---|
| **Affected feature** | Vandaag hero "Volgende afspraak" |
| **Solution** | `activityService.getNextPlanningItem` (combineert calendar_events + activities + werkbonnen, eerstvolgende vanaf nu) is nu in `today.tsx` gekoppeld. Mock verwijderd. |
| **Status** | Done — echte data |

---

## 7. ⭐ Planning — unified data model (**EXTENDED**)

| | |
|---|---|
| **Affected feature** | Planning page (Dag/Week/Maand) en Vandaag timeline |
| **Solution** | `activityService.listPlanningItemsForRange` combineert **3 echte bronnen** tot één genormaliseerde `PlanningItem[]`: `calendar_events` + `activities` + `werkbonnen` (via `workOrderService.listWorkOrdersForPlanningRange`). Per-bron error-tolerant: faalt één bron, dan tonen de andere alsnog en wordt de fout alleen in dev-logs gezet. `getNextPlanningItem` voor "volgende afspraak". |
| **Date model** | `calendar_events.start_at` / `activities.due_at` = timestamptz → UTC-instant bounds; `werkbonnen.gepland_op` = `date` → lokale `YYYY-MM-DD` bounds (zie `src/lib/dateRange.ts`). Week/Maand worden client-side afgeleid uit één range-fetch. |
| **RLS** | Vertrouwt op bestaande policies (`company_id = profile.company_id`). Medewerker → werkbonnen gefilterd op `assigned_to`; events/activities zijn company-wide (geen per-user kolom). |

---

## 12. Assignee-namen niet client-side op te halen (Planning/werkbonnen)

| | |
|---|---|
| **Affected feature** | Toegewezen-aan tonen op planning-items / werkbonnen |
| **Current workaround** | `werkbonnen.assigned_to` (profile-id) is beschikbaar, maar `profiles` RLS toont alleen de eigen rij — andermans namen zijn niet op te halen. UI toont daarom alleen **"Jij"** voor eigen toegewezen werk; anders niets. |
| **Recommended approach** | RPC/`SECURITY DEFINER` view `v_company_members_public(profile_id, full_name)` of join op `company_members` (RLS company-scoped) om id→naam te mappen voor admin/planner. |
| **MVP/later** | Later — "Jij"-label volstaat voor de medewerker; admin/planner missen alleen naam-labels. |
| **Risk** | Low — geen data-mutatie |

---

## 8. Create-flows in mobile (deels geïmplementeerd)

| | |
|---|---|
| **Affected features** | "Nieuwe X" knoppen |
| **Done** | **Nieuwe klant** (`app/customers/new.tsx` → `customers` insert) werkt en synct twee kanten op. Werkbon-status/notitie/uren-insert werkten al. |
| **Nog open** | Nieuwe afspraak/activiteit, nieuwe taak, nieuwe notitie, standalone uren. |
| **RLS-audit (zie MOBILE_RLS_POLICY_AUDIT.md)** | Migraties gelezen. **Werkbon create** = al toegestaan (`werkbonnen_insert`: admin/planner + company) → bouwbaar zonder backend-wijziging. **Deal/pipeline stage update** = al toegestaan (`deals_update`: company-lid) → bouwbaar. **activities/calendar_events/notes** = baseline-tabellen; hun policies staan NIET in de repo (pre-001 baseline in Studio) → kunnen niet uit files geverifieerd worden. Bijna zeker aanwezig (desktop maakt ze aan; `customers`-insert uit dezelfde baseline werkt vanuit mobile). |
| **Actie** | Eénmalige check in Supabase Studio: `select tablename,cmd,roles,with_check from pg_policies where tablename in ('activities','calendar_events','notes');`. Als INSERT/UPDATE-policy bestaat → direct form bouwen. Zo niet → pas `MOBILE_RLS_MIGRATION_PROPOSAL.sql` toe (guarded additive; overschrijft niets). |
| **MVP/later** | Werkbon-create + deal-stage = ready; afspraak/taak/notitie = na Studio-check |

---

## 13. Standalone uren-registratie (zonder werkbon)

| | |
|---|---|
| **Affected feature** | "Uren toevoegen" vanaf de Uren-tab |
| **Current** | `urenregistratie` vereist `werkbon_id` (huidige `createTimeEntry`); uren schrijf je daarom via een werkbon. De Uren-tab verwijst naar Werkbonnen. |
| **Recommended** | Of `werkbon_id` nullable maken + een standalone-form met klant/datum/uren, of een werkbon-picker in een uren-form. |
| **MVP/later** | Later |

---

## 9. `company_members` aggregations (team summary)

| | |
|---|---|
| **Affected feature** | Team-sectie op Uren + Planning |
| **Current workaround** | **Planning én Uren:** de mock "Team vandaag"-secties zijn nu **beide verwijderd**. Planning toont een eerlijk scope-label; Uren heeft een echt **Team-filter** (toont echte bedrijfsregistraties uit `urenregistratie` via `listCompanyTimeEntries`), maar geen per-persoon-aggregaat (namen zijn niet client-side op te halen — zie #12). |
| **Recommended approach** | `teamService.listTeamMembers()` + join met `listCompanyTimeEntries`/planning-counts voor echte per-medewerker-aggregaten |
| **MVP/later** | Later |

---

## 11. `bootstrap-company` edge function ontbreekt (onboarding signup)

| | |
|---|---|
| **Affected feature** | Onboarding "Account aanmaken"-stap |
| **Current workaround** | Mobile `signUp` maakt alleen een rij in `auth.users`. De `companies` + `profiles` rows (+ pipeline_stages seed) worden niet aangemaakt; de gebruiker ziet bij eerste login "Profiel niet gevonden". Success-scherm legt uit dat de werkruimte na e-mailbevestiging klaarstaat. |
| **Recommended approach** | Edge function `bootstrap-company` (service-role) die bij `SIGNED_UP` event of expliciete POST: insert company → insert profile met `role=admin` → seed pipeline_stages → upsert bedrijfsinstellingen. Triggerable via Supabase Auth Hook (server-side, geen mobile-call nodig). |
| **MVP/later** | MVP (onboarding voelt nu incompleet) |
| **Risk** | Medium — vereist service-role op de server-side, niet in mobile |

---

## 10. Geen "owner_id" op customers

| | |
|---|---|
| **Affected feature** | "Mijn klanten" filter |
| **Current workaround** | Filter is verborgen op Klanten (was er, is nu verwijderd) |
| **Recommended approach** | Optionele `customers.owner_id` kolom, of een `customer_assignees` koppeltabel voor multi-owner |
| **MVP/later** | Later |

---

## Niet-destructieve principes

- Geen DROP COLUMN / DROP TABLE voorstellen
- Alle migraties zijn additive (ADD COLUMN / CREATE TABLE)
- Alle nieuwe RLS policies verlengen, niet vervangen
- Geen wijzigingen aan desktop-dashboard tabellen die desktop functionaliteit breken
