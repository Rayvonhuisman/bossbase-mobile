-- =============================================================================
-- VOORSTEL — urenregistratie ↔ werkbonnen koppeling (NOG NIET TOEGEPAST)
-- =============================================================================
-- Doel: mobiel (en desktop) laten filteren/schrijven op urenregistratie.werkbon_id.
--
-- Live schema geverifieerd (read-only PostgREST-probe, 2026):
--   urenregistratie heeft: id, company_id, profile_id, datum, start_tijd,
--   eind_tijd, uren, type, notitie, created_at, updated_at.
--   ONTBREEKT: werkbon_id, customer_id, deal_id (+ geen FK naar
--   werkbonnen/customers/deals). werkbonnen(id), customers(id), deals(id)
--   bestaan en zijn uuid-PK's → type-compatibel voor de FK's.
--
-- Toepassen na akkoord: kopieer naar
--   /Users/macbook/BossBase website/supabase/migrations/<timestamp>_urenregistratie_werkbon_koppeling.sql
-- en draai via de normale Supabase-migratieflow. NIET automatisch toepassen.
--
-- VEILIGHEID:
--   * Uitsluitend additief: geen DROP, geen data-wijziging, geen RLS-verzwakking.
--   * Alle kolommen nullable → bestaande rijen krijgen NULL en blijven geldig.
--   * FK's met ON DELETE SET NULL → een werkbon/klant/deal verwijderen laat de
--     uren-rij bestaan; alleen de koppeling wordt leeggemaakt (geen dataverlies).
--   * Idempotent: IF NOT EXISTS / guarded pg_constraint-checks.
-- =============================================================================

BEGIN;

-- 1) Koppelkolommen (nullable). Bestaande uren zonder werkbon houden werkbon_id
--    = NULL en blijven ongewijzigd geldig; de mobiele per-werkbon-query
--    (.eq('werkbon_id', id)) sluit NULL-rijen vanzelf uit (correct gedrag).
ALTER TABLE public.urenregistratie
  ADD COLUMN IF NOT EXISTS werkbon_id  uuid,
  ADD COLUMN IF NOT EXISTS customer_id uuid,   -- optioneel, zie NB hieronder
  ADD COLUMN IF NOT EXISTS deal_id     uuid;   -- optioneel, zie NB hieronder

-- 2) Foreign keys (ON DELETE SET NULL), guarded zodat herhaald draaien veilig is.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'urenregistratie_werkbon_id_fkey') THEN
    ALTER TABLE public.urenregistratie
      ADD CONSTRAINT urenregistratie_werkbon_id_fkey
      FOREIGN KEY (werkbon_id) REFERENCES public.werkbonnen(id) ON DELETE SET NULL;
  END IF;

  -- NB: customer_id/deal_id zijn NIET nodig voor de mobiele werkbon-koppeling
  -- (klant/deal zijn af te leiden via de werkbon). Ze zijn opgenomen voor
  -- pariteit met de desktop (urenService filtert/insert customer_id + deal_id
  -- en ondersteunt standalone uren zonder werkbon) en matchen de oorspronkelijke
  -- bedoeling van migratie 001. Laat deze twee blokken weg als je alleen de
  -- werkbon-koppeling wilt.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'urenregistratie_customer_id_fkey') THEN
    ALTER TABLE public.urenregistratie
      ADD CONSTRAINT urenregistratie_customer_id_fkey
      FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'urenregistratie_deal_id_fkey') THEN
    ALTER TABLE public.urenregistratie
      ADD CONSTRAINT urenregistratie_deal_id_fkey
      FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3) Indexen voor snelle lookups (matcht de intentie van migratie 001).
CREATE INDEX IF NOT EXISTS idx_urenregistratie_werkbon  ON public.urenregistratie (werkbon_id);
CREATE INDEX IF NOT EXISTS idx_urenregistratie_customer ON public.urenregistratie (customer_id);
CREATE INDEX IF NOT EXISTS idx_urenregistratie_deal     ON public.urenregistratie (deal_id);

COMMIT;

-- =============================================================================
-- RLS — GEEN WIJZIGING NODIG
-- =============================================================================
-- De bestaande policies urenregistratie_{select,insert,update,delete} scopen op
--   company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
--   AND ( role IN ('admin','planner') OR profile_id = auth.uid() )
-- en verwijzen NIET naar koppelkolommen. Nieuwe nullable kolommen vallen
-- automatisch onder diezelfde policies. Niet aanpassen (strikt niet nodig).
--
-- OPTIONELE hardening (NIET nodig, alleen als je cross-company-koppeling wilt
-- blokkeren): voeg aan de INSERT/UPDATE WITH CHECK toe dat de gekoppelde werkbon
-- tot hetzelfde bedrijf hoort. Dit WIJZIGT bestaande policies en valt daarom
-- buiten "additief" — daarom hier alleen ter overweging, uitgeschakeld gelaten:
--
--   -- werkbon_id IS NULL OR EXISTS (
--   --   SELECT 1 FROM public.werkbonnen w
--   --   WHERE w.id = werkbon_id
--   --     AND w.company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
--   -- )
-- =============================================================================

-- =============================================================================
-- ROLLBACK (indien nodig) — verwijdert alleen wat deze migratie toevoegde.
-- LET OP: DROP COLUMN verwijdert ook eventueel ná de migratie ingevulde
-- koppelingen (werkbon_id-waarden). Bestaande uren-rijen zelf blijven bestaan.
-- =============================================================================
-- BEGIN;
--   ALTER TABLE public.urenregistratie DROP CONSTRAINT IF EXISTS urenregistratie_werkbon_id_fkey;
--   ALTER TABLE public.urenregistratie DROP CONSTRAINT IF EXISTS urenregistratie_customer_id_fkey;
--   ALTER TABLE public.urenregistratie DROP CONSTRAINT IF EXISTS urenregistratie_deal_id_fkey;
--   DROP INDEX IF EXISTS idx_urenregistratie_werkbon;
--   DROP INDEX IF EXISTS idx_urenregistratie_customer;
--   DROP INDEX IF EXISTS idx_urenregistratie_deal;
--   ALTER TABLE public.urenregistratie
--     DROP COLUMN IF EXISTS werkbon_id,
--     DROP COLUMN IF EXISTS customer_id,
--     DROP COLUMN IF EXISTS deal_id;
-- COMMIT;
