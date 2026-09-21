-- =============================================================================
-- PROPOSAL — Mobile create/update RLS policies (NOT YET APPLIED)
-- =============================================================================
-- Purpose: unblock mobile create/update for activities, calendar_events, notes.
--
-- Place when approved: copy into
--   /Users/macbook/BossBase website/supabase/migrations/0NN_mobile_create_update_rls_policies.sql
-- and apply via the normal Supabase migration flow. Do NOT apply automatically.
--
-- SAFETY:
--   * Additive only. NO DROP, NO disabling RLS, NO data changes.
--   * Each policy is created ONLY IF an equivalent permissive policy is absent
--     (guarded against pg_policies), so it can never override or weaken the
--     existing (baseline) desktop policies.
--   * Company-scoped via the project's canonical check:
--       company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
--   * NOT needed for werkbonnen (INSERT policy exists: admin/planner) or
--     deals (UPDATE policy exists: company member). Those are already RLS-ready.
--
-- BEFORE applying, run the verification query in MOBILE_RLS_POLICY_AUDIT /
-- final report. If the INSERT/UPDATE policies already exist (most likely),
-- this migration is a no-op and you don't need it at all.
-- =============================================================================

-- activities: company members may create + update their company's activities
-- (covers "nieuwe taak" = activities row type='task', and "complete taak" =
-- update completed). Matches the company-member pattern used by deals/customers.
DO $$
BEGIN
  IF to_regclass('public.activities') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'activities'
         AND cmd IN ('INSERT', 'ALL')
     ) THEN
    CREATE POLICY "activities_insert_mobile" ON public.activities
      FOR INSERT WITH CHECK (
        company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
      );
  END IF;

  IF to_regclass('public.activities') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'activities'
         AND cmd IN ('UPDATE', 'ALL')
     ) THEN
    CREATE POLICY "activities_update_mobile" ON public.activities
      FOR UPDATE
      USING      (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()))
      WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));
  END IF;
END $$;

-- calendar_events: company members may create + update their company's events
-- (covers "nieuwe afspraak").
DO $$
BEGIN
  IF to_regclass('public.calendar_events') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'calendar_events'
         AND cmd IN ('INSERT', 'ALL')
     ) THEN
    CREATE POLICY "calendar_events_insert_mobile" ON public.calendar_events
      FOR INSERT WITH CHECK (
        company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
      );
  END IF;

  IF to_regclass('public.calendar_events') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'calendar_events'
         AND cmd IN ('UPDATE', 'ALL')
     ) THEN
    CREATE POLICY "calendar_events_update_mobile" ON public.calendar_events
      FOR UPDATE
      USING      (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()))
      WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));
  END IF;
END $$;

-- notes: company members may create their company's notes ("nieuwe notitie").
DO $$
BEGIN
  IF to_regclass('public.notes') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'notes'
         AND cmd IN ('INSERT', 'ALL')
     ) THEN
    CREATE POLICY "notes_insert_mobile" ON public.notes
      FOR INSERT WITH CHECK (
        company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
      );
  END IF;
END $$;

-- =============================================================================
-- NOTE on role gating: the proposed policies are company-scoped without a role
-- gate (matching deals/customers), because activities/notes/calendar_events are
-- general CRM captures used by all roles on desktop. If product rules require
-- admin/planner-only creation, add to each WITH CHECK:
--   AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin','planner')
-- Werkbon creation already enforces admin/planner via the existing werkbonnen
-- policy — no change here.
-- =============================================================================
