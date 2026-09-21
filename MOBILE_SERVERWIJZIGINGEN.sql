-- ===========================================================================
-- Voorstel: serverwijzigingen voor de mobiele app
-- ===========================================================================
--
-- NIET UITGEVOERD. Dit bestand is een voorstel ter controle; er is niets aan de
-- productieomgeving gewijzigd. Draai het pas na review, en volg daarbij de
-- uitrolvolgorde uit CLAUDE.md van het dashboard:
--
--   1. supabase db push --dry-run   (en lezen wat er staat)
--   2. supabase db push
--   3. npm run migratie:check -- <tabellen>
--
-- Elk blok hieronder staat op zichzelf en kan los worden uitgerold.
--
-- Achtergrond: bij het volledig werkend maken van de mobiele app zijn drie
-- dingen tegengekomen die niet met de bestaande infrastructuur op te lossen
-- zijn. Alle andere functies draaien op wat er al staat — bestaande tabellen,
-- policies, RPC's en edge functions.


-- ===========================================================================
-- 1. Dubbele offerte- en factuurnummers onmogelijk maken
-- ===========================================================================
--
-- WAAROM DE BESTAANDE INFRASTRUCTUUR NIET VOLDOET
--
-- `offertes.nummer` en `facturen.nummer` hebben geen unique constraint. De
-- nummergenerator van het dashboard telt de rijen (`count + 1`), en dat botst
-- zodra er ooit één is verwijderd: na het weggooien van BB-003 uit vier
-- offertes geeft de telling opnieuw BB-004 — een nummer dat al bestaat. De
-- database vangt dat niet af, dus er staan dan twee documenten met hetzelfde
-- nummer, en dat merk je pas als de klant belt.
--
-- De mobiele app kijkt daarom naar het HOOGSTE bestaande nummer in plaats van
-- naar het aantal, en controleert na het opslaan of het nummer intussen niet
-- door iemand anders is gebruikt (zie volgendOfferteNummer /
-- volgendFactuurNummer). Dat maakt een botsing onwaarschijnlijk, maar niet
-- onmogelijk: twee gebruikers die op hetzelfde moment op "Nieuwe factuur"
-- tikken kunnen elkaar nog steeds kruisen. Alleen de database kan dat sluiten.
--
-- LET OP bij het uitrollen: als er nu al dubbele nummers in staan, faalt de
-- index. Draai daarom eerst de controle hieronder en ruim eventuele duplicaten
-- op voordat je de index aanmaakt.

-- Controle vooraf — verwacht: 0 rijen.
select 'offertes' as tabel, company_id, nummer, count(*) as aantal
from public.offertes
where nummer is not null
group by company_id, nummer having count(*) > 1
union all
select 'facturen', company_id, nummer, count(*)
from public.facturen
group by company_id, nummer having count(*) > 1;

-- De index zelf. Per bedrijf uniek — niet globaal, want twee bedrijven mogen
-- allebei een BB-001 hebben.
create unique index if not exists offertes_nummer_per_company_uniek
  on public.offertes (company_id, nummer)
  where nummer is not null;

create unique index if not exists facturen_nummer_per_company_uniek
  on public.facturen (company_id, nummer);

notify pgrst, 'reload schema';

-- Optioneel, en de nettere oplossing: een SECURITY DEFINER-functie die het
-- volgende nummer atomair uitgeeft, zodat de frontend niet meer zelf hoeft te
-- tellen. Met de unique index erbij is een botsing dan uitgesloten in plaats
-- van onwaarschijnlijk. Deze functie is bewust NIET aangemaakt: hij verandert
-- ook het gedrag van het dashboard en dat hoort een eigen beslissing te zijn.
--
-- create or replace function public.bb_volgend_documentnummer(p_soort text)
--   returns text
--   language plpgsql
--   security definer
--   set search_path to 'public'
-- as $$
-- declare
--   v_company uuid := public.bb_current_company();
--   v_prefix  text := case when p_soort = 'factuur' then 'BB-F' else 'BB-' end;
--   v_hoogste int;
-- begin
--   if v_company is null then
--     raise exception 'geen bedrijf voor deze gebruiker';
--   end if;
--
--   -- Rijvergrendeling op het bedrijf, zodat twee gelijktijdige aanvragen
--   -- netjes achter elkaar gaan in plaats van hetzelfde nummer te krijgen.
--   perform 1 from public.companies where id = v_company for update;
--
--   if p_soort = 'factuur' then
--     select coalesce(max((regexp_match(nummer, '^BB-F(\d+)$'))[1]::int), 0)
--       into v_hoogste from public.facturen where company_id = v_company;
--   else
--     select coalesce(max((regexp_match(nummer, '^BB-(\d+)$'))[1]::int), 0)
--       into v_hoogste from public.offertes where company_id = v_company;
--   end if;
--
--   return v_prefix || lpad((v_hoogste + 1)::text, 3, '0');
-- end $$;
--
-- revoke all on function public.bb_volgend_documentnummer(text) from public, anon, authenticated;
-- grant execute on function public.bb_volgend_documentnummer(text) to authenticated;
-- notify pgrst, 'reload schema';


-- ===========================================================================
-- 2. Een beheerder de rol van een teamlid laten wijzigen
-- ===========================================================================
--
-- WAAROM DE BESTAANDE INFRASTRUCTUUR NIET VOLDOET
--
-- De UPDATE-policy op `profiles` is `id = auth.uid()`: je kunt uitsluitend je
-- eigen rij aanpassen. Een beheerder kan de rol van een collega dus niet
-- wijzigen — niet vanuit de app en niet vanuit het dashboard. `company_members`
-- helpt niet: die tabel bevat bij de meeste bedrijven alleen nog openstaande
-- uitnodigingen, en een geaccepteerd teamlid heeft er geen rij meer.
--
-- Het teamscherm in de app toont daarom géén rolknop bij een bestaand teamlid,
-- met een verwijzing naar het dashboard. Zolang deze migratie niet draait is
-- die verwijzing strikt genomen ook niet waar; het is nu simpelweg nergens
-- mogelijk. Deze functie is de kleinste ingreep die het wél mogelijk maakt,
-- met drie waarborgen erin:
--
--   - alleen een admin van hetzelfde bedrijf mag het,
--   - je kunt je eigen rol niet wijzigen (jezelf niet buitensluiten),
--   - de laatste actieve admin blijft admin.

-- create or replace function public.bb_zet_teamlid_rol(p_profile_id uuid, p_rol text)
--   returns table (id uuid, role text)
--   language plpgsql
--   security definer
--   set search_path to 'public'
-- as $$
-- declare
--   v_company uuid := public.bb_current_company();
--   v_ik      uuid := auth.uid();
--   v_admins  int;
-- begin
--   if p_rol not in ('admin', 'planner', 'medewerker') then
--     raise exception 'onbekende rol %', p_rol;
--   end if;
--   if v_company is null then
--     raise exception 'geen bedrijf voor deze gebruiker';
--   end if;
--   if (select p.role from profiles p where p.id = v_ik) <> 'admin' then
--     raise exception 'alleen een beheerder kan rollen wijzigen' using errcode = '42501';
--   end if;
--   if not exists (select 1 from profiles p where p.id = p_profile_id and p.company_id = v_company) then
--     raise exception 'dit teamlid hoort niet bij je bedrijf' using errcode = '42501';
--   end if;
--   if p_profile_id = v_ik then
--     raise exception 'je kunt je eigen rol niet wijzigen';
--   end if;
--
--   -- De laatste actieve beheerder moet beheerder blijven, anders staat het
--   -- bedrijf zonder iemand die het nog kan terugdraaien.
--   if p_rol <> 'admin' then
--     select count(*) into v_admins
--     from profiles p
--     where p.company_id = v_company and p.role = 'admin' and coalesce(p.actief, true);
--     if v_admins <= 1 and (select p.role from profiles p where p.id = p_profile_id) = 'admin' then
--       raise exception 'dit is de laatste actieve beheerder';
--     end if;
--   end if;
--
--   return query
--     update profiles p set role = p_rol
--     where p.id = p_profile_id and p.company_id = v_company
--     returning p.id, p.role;
-- end $$;
--
-- revoke all on function public.bb_zet_teamlid_rol(uuid, text) from public, anon, authenticated;
-- grant execute on function public.bb_zet_teamlid_rol(uuid, text) to authenticated;
-- notify pgrst, 'reload schema';
--
-- Controleer daarna expliciet de rechten (zie CLAUDE.md — een create geeft
-- anon/authenticated automatisch EXECUTE, en `revoke ... from public` haalt dat
-- er niet af):
--
-- select r.rolname
-- from pg_roles r, pg_proc p
-- where p.proname = 'bb_zet_teamlid_rol' and p.pronamespace = 'public'::regnamespace
--   and r.rolname in ('anon','authenticated','service_role')
--   and has_function_privilege(r.rolname, p.oid, 'EXECUTE');


-- ===========================================================================
-- 3. Offertes en facturen versturen vanaf mobiel
-- ===========================================================================
--
-- WAAROM DE BESTAANDE INFRASTRUCTUUR NIET VOLDOET
--
-- Dit is geen migratie maar een edge function, en daarom staat hier alleen de
-- beschrijving.
--
-- Het dashboard bouwt de PDF in de BROWSER (jsPDF), uploadt hem naar de
-- privébucket `factuur-pdfs` en roept daarna `send-email` aan met de PDF als
-- bijlage. React Native heeft geen DOM en geen jsPDF-equivalent, dus de app kan
-- die PDF niet maken. `send-email` verwacht een kant-en-klare bijlage en kan er
-- zelf geen genereren.
--
-- Wat er nodig is: een edge function `render-document` die een offerte- of
-- factuur-id aanneemt, server-side de PDF opbouwt uit dezelfde gegevens en
-- branding-snapshot als het dashboard, hem in `factuur-pdfs` respectievelijk
-- `signed-offertes` zet, en `send-email` aanroept. De app kan die function dan
-- met de JWT van de gebruiker aanroepen; de rechtencontrole (`facturen` /
-- `offertes`) hoort in de function zelf te zitten.
--
-- Tot die function er is:
--   - offertes en facturen kunnen mobiel worden aangemaakt, gewijzigd, van
--     status veranderd en op betaald gezet;
--   - het daadwerkelijk VERSTUREN naar de klant blijft desktopwerk.
--
-- De app claimt dat ook niet: er staat geen verzendknop, en het factuurscherm
-- meldt wat er wél kan.


-- ===========================================================================
-- Niet nodig gebleken
-- ===========================================================================
--
-- Bij de inventarisatie leken deze drie een serverwijziging te vragen. Dat was
-- niet zo — ze draaien op wat er al staat, en de app gebruikt dat nu:
--
--   * Foto's & bestanden. De bucket heet `werkbon-fotos` (niet
--     `werkbon-photos`) en bestaat mét storage-policies. De app las en schreef
--     er via het werkbondetail al naartoe; alleen het overzichtsscherm stond
--     nog op een placeholder.
--
--   * Integratiestatus. `accounting_connections` is inderdaad niet leesbaar
--     voor `authenticated` (geen SELECT-grant, want daar staan de tokens in),
--     maar `get_accounting_status()` en `google_calendar_status()` zijn
--     SECURITY DEFINER-RPC's die alleen een connected-vlag teruggeven en wél
--     uitvoerbaar zijn. Ontkoppelen kan via `google_calendar_disconnect()` en,
--     voor Stripe, via de bestaande DELETE-policy.
--
--   * Geïmporteerde facturen en kosten verwijderen. De prullenbak
--     (`import_genegeerd`) heeft een INSERT-policy die alleen het eigen bedrijf
--     vraagt, dus de app kan zelf voorkomen dat de volgende synchronisatie een
--     verwijderd record terughaalt.
