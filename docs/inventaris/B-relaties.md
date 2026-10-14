# Inventaris B — Pipeline, Klanten, Leveranciers, Activiteiten, Agenda

Bron: `/Users/macbook/BossBase-billing` (branch main), alleen gelezen. Paden zijn relatief aan die repo. Regelnummers gelden voor de huidige stand.

Het kernschema van `deals`, `activities`, `customers`, `calendar_events` en `pipeline_stages` staat **niet** in `supabase/migrations/` (die tabellen bestonden al vóór de migraties). De kolommen hieronder komen uit de mappers in de services en uit latere `ALTER TABLE`s. Waar een kolom alleen in code voorkomt, staat dat erbij.

---

## 0. Algemeen (geldt voor alle onderdelen)

### Routering en zichtbaarheid
- NAV-config `src/App.jsx:99-128`. Routebewaking wordt afgeleid uit NAV: `PROTECTED_PAGES = uitNav('permission')` en `PLAN_GATED_PAGES = uitNav('feature')` (`src/App.jsx:138-156`). De bewaking zelf staat in `src/App.jsx:1566-1602`.
  | page-id | Label | permission | feature |
  |---|---|---|---|
  | `pipeline` | Pipeline | `verkoop` | – |
  | `customers` | Klanten (groep "Relaties") | – | – |
  | `leveranciers` | Leveranciers (groep "Relaties") | – | – |
  | `activities` | Activiteiten | – | – |
  | `calendar` | Agenda | – | – |
- Een route is toegestaan als: geen recht vereist, OF admin, OF `userPermissions.includes(recht)`, OF (`plan.features` bevat `gedeelde_werkruimte` EN het recht staat in `INZAGE_RECHTEN`). Bron: `src/App.jsx:1588-1591` en `src/hooks/usePermissions.js:28-40`.
- `usePermissions()` (`src/hooks/usePermissions.js:42-72`):
  - `can(p)` is voor **zien**. In een gedeelde werkruimte geven inzagerechten (`verkoop`, `offertes`, `facturen`, `kosten`, `bedrijfsfinancien`, `projectbedragen`, `alles_inzien`, `agenda_inzien`, `projecten`, `database`, `team`) altijd true.
  - `magBewerken(p)` is voor **schrijven** en kijkt strikt naar de rechten: admin altijd; rol `planner` telt als recht `planning`.
- Rechtencodes en hun uitleg: `src/config/permissions.js`. Server-side (RLS via `bb_has_permission`) worden afgedwongen: `klanten_bewerken`, `klanten_verwijderen`, `verkoop`, `offertes`, `facturen`, `kosten`, `planning`, `projecten_bewerken`, `werkbonnen_bewerken`, `alles_inzien`, `agenda_inzien`.
- **Readonly (abonnement verlopen / betaling mislukt / opgezegd)**: `usePlanGuard()` (`src/components/PlanUpgradeModal.jsx:38-53`).
  - `guardSchrijven(actie, fn)` blokkeert bij `plan.readonly`.
  - `guardLimiet(key, fn)` blokkeert bij readonly of als `plan.within(key)` false is (bijvoorbeeld de limiet `klanten`, `offertes`, `facturen`).
  - Server-side: RESTRICTIVE INSERT-policies met `bb_mag_schrijven()`, onder andere `readonly_activities`, `readonly_leveranciers` (`supabase/migrations/20260803120000_readonly.sql:201`). De klantlimiet zit in `plan_limiet_klanten` → `bb_within_limit('klanten')` (`20260728120000_plan_matrix.sql:466`).
  - Teksten: `src/lib/readonly.js`.
- **Mobiel**: het dashboard toont onder 768px een download-scherm (`src/App.jsx:940-955`, `useIsMobile`). De mobiele pipeline-variant (≤767px) in `BbDashboard.jsx` bestaat nog wel.

### Gedeelde helpers
- `alleRijen(maakQuery)` (`src/lib/alleRijen.js`) pagineert in blokken van 1000 (`.range(n, n+999)`) tot `count: 'exact'` bereikt is. Lijsten worden dus **volledig** ingeladen en er is geen UI-paginering. Het vereist een vaste sortering met een unieke laatste sleutel (`id`).
- `safeInsert(client, table, payload, select)` (`src/lib/safeInsert.js`) probeert tot 8 keer opnieuw en laat daarbij kolommen weg die PostgREST niet kent ("could not find the 'x' column").
- `withCompanyId(payload)` (`src/lib/currentCompany.js`) zet `company_id`.
- Statuskleuren centraal in `src/utils/statusColors.js` (`STATUS_TONES`):
  | tone | bg | tekst/dot |
  |---|---|---|
  | gray | `#f3f4f6` | `#6b7280` (dot `#9ca3af`) |
  | blue | `#eff6ff` | `#2563eb` |
  | orange | `#fff4ec` | `#e8784a` |
  | green | `#ecfdf5` | `#15A34A` |
  | red | `#fef2f2` | `#dc2626` |
  | purple | `#f5f3ff` | `#7c3aed` |
- CSS-variabelen (`src/bb-dashboard.css:10-29`): `--p #1DDB62`, `--pd #15A34A`, `--pll #f0fdf4`, `--bgs #fafaf8`, `--dk #0D0D0D`, `--dmu #6b7280`, `--dl #9ca3af`, `--border #f0ede9`, `--br #e5e7eb`.
- Bedragen via `fmt(n)` → `'€' + nl-NL` met 2 decimalen, en `fmt0` → hele euro's (`src/bb-shared.jsx`).
- Notities met @-tags: `NoteEditor` / `NotitieLog`. Na het opslaan volgt `createMentionNotifications({ text, relatedType, relatedId, link, creatorId, creatorName, contextName })` (`src/services/notificatieService.js`).
- Teamleden: `getTeamMembers()` (sluit de huidige gebruiker uit) en `getActiveTeamMembers({ includeSelf })`.
- Navigatie via URL/geschiedenis: `openCustomer(id, tab)` → `?klant=`, `openDeal(id)` → `?deal=`, `openCalendarEvent(id)` → `?agenda=`, `openLeverancier(id)` → `?lev=` (`src/App.jsx:1409-1423`). Detailpaden `/activities/<id>`, `/werkbonnen/<id>` enzovoort.

---

## 1. Pipeline (`page: 'pipeline'`)

**Component**: `Pipeline` in `src/pages/BbDashboard.jsx:251-994`, gerouteerd in `src/App.jsx:1610`. Mobiele variant `MobilePipeline` staat op `BbDashboard.jsx:31-179`.

### Zichtbaarheid en rechten
- Route/menu: recht `verkoop`, of gedeelde werkruimte (inzage).
- `magDealsBeheren = magBewerken('verkoop')` (`BbDashboard.jsx:263-264`) bepaalt: "Nieuwe aanvraag", "Lead toevoegen", slepen, ⋮-menu (prioriteit, voltooien, verloren).
- RLS (`supabase/migrations/20260714150000_rechten_herziening.sql:341-355`, herhaald in `20260728120000_plan_matrix.sql:1121`):
  - `deals_insert` en `deals_update` eisen `bb_has_permission('verkoop')`.
  - `deals_delete` is alleen voor admins.
  - `deals_select` vereist `bb_gedeelde_werkruimte() OR bb_has_permission('verkoop')` (`20260920131715_policies_permissiecheck_hijsen.sql:154`).
- Readonly: aanmaken loopt via `guardSchrijven('Een aanvraag toevoegen' | 'Een lead toevoegen')`.

### Data
- `listDeals()` (`src/services/dealService.js:58-77`) doet `from('deals').select('*, customers!deals_customer_id_fkey(*)', {count:'exact'}).order('created_at', desc).order('id')` via `alleRijen`. De FK-naam moet expliciet: er bestaan twee FK's naar customers.
- `listPipelineStages()`: `from('pipeline_stages').select('*').order('position')`. Mapper `toStage`: `{ id, label: name, col: color_class, order: position }`.
- Verder parallel geladen: `listCustomers()`, `getLostReasons()`, `getTeamMembers()`, `listActivities()` (`BbDashboard.jsx:361-382`). Opnieuw geladen bij `refreshKey`.
- **Deal-mapper `toDeal`** (`dealService.js:20-53`):
  - `id`
  - `custId` = `customer_id`
  - `customerName` = `customers.name`
  - `stage` = `stage_id`
  - `title`
  - `city` (`customers.city`)
  - `value` = `expected_revenue` (fallback `final_revenue`, …)
  - `priority` = `high|med|low`, standaard `med`
  - `status` = `open|won|lost`
  - `lostReason` = `lost_reason`
  - `assignedTo` = `assigned_to`
  - `assignedToIds` = `assigned_to_ids[]` (fallback `[assigned_to]`)
  - `createdAt`
  - `afgerondOp` = `afgerond_op`
  - `raw`
- `deals`-kolommen die de code gebruikt: `id, company_id, customer_id, stage_id (uuid), title, description, expected_revenue, final_revenue, priority (text not null default 'med', migr. 20260708120000), status (open/won/lost), lost_reason (text, migr. 20260708130000), assigned_to, assigned_to_ids (uuid[], migr. 20260919170000), afgerond_op (timestamptz, migr. 20260920100000), created_at`.

### Fases en kleuren
- Fases zijn per bedrijf instelbaar in `pipeline_stages` (`name`, `position`, `color_class`). De seed `seed_default_pipeline_stages` staat in `supabase/migrations/20260918100000_verloren_fase_nooit_gewonnen.sql`:
  | pos | naam | color_class | hex (via `stageColToHex`) |
  |---|---|---|---|
  | 1 | Nieuwe aanvragen | `b-new` | `#1DDB62` |
  | 2 | Contact nodig | `b-orange` | `#f97316` |
  | 3 | Info compleet | `b-blue` | `#3b82f6` |
  | 4 | Offerte maken | `b-blue` | `#3b82f6` |
  | 5 | Offerte verstuurd | `b-orange` | `#f97316` |
  | 6 | Wacht op akkoord | `b-orange` | `#f97316` |
  | 7 | Akkoord | `b-green` | `#1DDB62` |
  | 8 | Gepland | `b-planned` | `#3b82f6` |
  | 9 | In uitvoering | `b-progress` | `#f97316` |
  | 10 | Afgerond | `b-done` | `#1DDB62` |
  | 11 | Gefactureerd | `b-blue` | `#3b82f6` |
  | 12 | Betaald | `b-accepted` | `#1DDB62` |
  | 13 | Verloren | `b-lost` | `#6b7280` |
- **Weergave van een fasebadge**: `stageBadgeStyle(col)` geeft `{ background: hex + '1A', color: hex }`, dus 10% tint (`src/bb-shared.jsx:217-220`). `color_class` is óf een hex uit `STAGE_COLOR_OPTIONS`, óf een legacy klasse. De mapping legacy → hex staat in `src/bb-shared.jsx:196-209`.
- `STAGE_COLOR_OPTIONS` (Instellingen): Blauw `#3b82f6`, Groen `#1DDB62`, Oranje `#f97316`, Rood `#ef4444`, Paars `#a855f7`, Geel `#eab308`, Roze `#ec4899`, Grijs `#6b7280` (`src/bb-shared.jsx:179-188`). Een onbekende waarde valt terug op `#6b7280`.
- Bij een `color_class` die leeg is: `STAGE_COLORS[position-1]` uit `dealService.js:10`, anders `b-gray`.
- Valt de DB-lijst leeg terug, dan volgt `PIPELINE_STAGES` (slug-ids) uit `src/bb-shared.jsx:83-96`. Dat is alleen een fallback.

### Status-logica (database is de bron)
- `deals.status` wordt gezet door trigger `bb_deal_status_uit_fase` (`20260918100000_verloren_fase_nooit_gewonnen.sql`, sectie 2):
  - fase = koppeling `verloren` → `lost`
  - status al `lost` → blijft `lost`
  - positie ≥ positie van koppeling `akkoord` → `won`, anders `open`
- De koppelingen per bedrijf staan in tabel `pipeline_koppelingen(company_id, moment, stage_id)`. Momenten: `akkoord, gepland, in_uitvoering, afgerond, gefactureerd, betaald, verloren` (`20260917150000_status_en_pipelinekoppeling.sql`).
- Werkbon, project en factuur duwen de deal **vooruit** via `bb_deal_naar_fase`, nooit terug. Het project duwt alleen bij een UPDATE van de status, en nooit naar 'gepland' (`20260923114555_...sql`).
- **Elke nieuwe deal krijgt automatisch een project**: trigger `bb_deal_project_aanmaken`. `name` = titel, `description`, `project_value` = `expected_revenue`, `status` 'gepland', `assigned_to` (`20260923114555_...sql`, sectie 2).
- Wijzigingen op het project spiegelen naar de deal via `bb_project_naar_deal`: `title`, `expected_revenue`, `customer_id`, `description`.
- "Behandeld door" op de deal gaat naar `projects.assigned_to` via `bb_deal_behandelaar_naar_project`.
- Frontend: `dealStatus(deal)` leest `deal.status`, met als fallback een gok uit de fasenaam (`src/utils/pipeline.js:37-43`). `isAfgerond(deal)` = `!!afgerond_op`.

### Bord
- Elke fase is een kolom en scrollt horizontaal. Kolombreedte 300px (`.pipe-col`, `bb-dashboard.css:550`).
- **Uitzondering**: de fase met de naam `/afgerond/i` krijgt geen kolom, tenzij filter status=`done` of filter fase = die fase (`BbDashboard.jsx:436-447`).
- Een deal met een `stage_id` die leeg of onbekend is, of die geen getoonde kolom heeft, valt in de **eerste getoonde kolom** (`BbDashboard.jsx:465-471`).
- Verloren-kolom = eerste fase met `/verlor/i` (of `/\blost\b/`) (`:448`). Die kan ingeklapt worden tot een 36px-strook "Verloren" met een oog-icoon. Dat wordt onthouden in `localStorage.pipeline_hide_lost` (`:287`, `:449-453`, `:782-791`).
- **Kolomkop**:
  - fasebadge
  - som van `value` in die kolom (`fmt`)
  - telbadge (`.pipe-col-cnt`)
  - bij de Verloren-kolom een oog-knop om te verbergen
- **Paginakop**: "Pipeline", met `{n} traject(en) · {fmt(totaal)} totaal`. Het totaal sluit verloren deals uit, behalve bij filter `lost` (`:495-497`).
- **Kaart** (`.pc`, `:818-875`):
  - oranje stip `#e8784a` (7×7px) als er **geen vervolgactiviteit** is. Dat is het geval als er geen activiteit met status `open`/`today` bestaat met `deal_id` = deal of `customer_id` = klant van de deal (`:476-486`).
  - klantnaam (vet, of "Klant")
  - deal-titel
  - klant-e-mail
  - klant-telefoon
  - waarde (`fmt`, kleur `#0F7A3F`) als die > 0
  - `PriorityBadge`: alleen bij `high` (rood "Hoog") of `low` (grijs "Laag"); `med` toont niets
  - ⋮-knop (als `magDealsBeheren` en niet in de verloren-fase)
  - klik → `openDeal(deal.id)`
  - lege kolom: "Geen items"
  - knop onderaan de kolom: "Lead toevoegen" (vooraf ingevuld met die fase)
- **⋮-kaartmenu** (`:892-938`):
  - Prioriteit Hoog / Normaal / Laag, met een vinkje bij de huidige → `updateDeal(id, {priority})`
  - "Project voltooien" → `zetDealAfgerond(id, true)`
  - "Markeer als verloren" → verloren-modal
- **Slepen** (native HTML5, `:570-627`):
  - drop op een andere kolom → optimistisch bijwerken, dan `updateDealStage(id, stageId)`, bij een fout terugdraaien
  - drop op de Verloren-kolom → opent de verloren-modal (geen stille verplaatsing)
  - drop op dezelfde kolom doet niets
  - slepen start niet vanaf knoppen of inputs
  - **Alternatieven zonder slepen**: de fase-keuzelijst in de deal-drawer (zie hieronder), en op mobiel swipe tussen fasetabs (geen verplaatsing op mobiel; `moveDeal` wordt wel doorgegeven maar niet gebruikt).
- **Mobiel bord** (`MobilePipeline`):
  - fase-tabpillen met aantallen
  - swipe-paneel (drempel 40px)
  - pijlen ‹ › met "i / n"
  - stippen
  - kop met "{n} lead(s) · bedrag"
  - kaarten zoals desktop, maar met een vlag-knop "Markeer als verloren"
  - "Lead toevoegen aan {fase}"

### Filters / zoeken (`:282`, `:391-426`, `:661-704`)
- Het filterpaneel klapt uit via de knop "Filter" (met "(actief)" als het afwijkt van de standaard).
- `stage`: `all` of een stage-id.
- `status`:
  - `open` (standaard) = "Open trajecten" = alles behalve `lost` en niet afgerond
  - `done` = "Project voltooid" = `afgerond_op` gezet
  - `lost` = "Verloren"
  - `any` = "Alles tonen" (afgeronde deals blijven verborgen, tenzij `done`)
  - Regel: `isAfgerond(d) !== (status === 'done')` → uitsluiten.
- `persoon` ("Behandeld door"): `assignedToIds` bevat de id. Opties uit `getTeamMembers()`.
- `priority`: `all|high|med|low`.
- `text`: substring in `title + customerName + city`, hoofdletterongevoelig.
- "Reset filters" zet terug naar `{stage:'all', status:'open', priority:'all', text:'', persoon:'all'}`.
- Geen sortering-UI. Volgorde = `created_at desc`.

### Laad-, fout- en lege staat
- "Pipeline laden..." (card).
- Fout in rood `#dc2626`: `err.message` of "Pipeline laden is mislukt."
- Leeg: "Geen trajecten gevonden", met als sub "Pas je filter aan of voeg een nieuwe aanvraag toe." / "Begin met je eerste aanvraag.", plus knoppen Reset en Nieuwe aanvraag.

### Nieuwe aanvraag — `NewLeadModal` (`src/components/SharedModals.jsx:268-445`)
- Velden:
  - Titel* — "Titel is verplicht"
  - Klant* met tabs "Bestaande klant" (select, "Kies een klant of maak een nieuwe aan") / "Nieuwe klant" (alleen naam, "Naam klant is verplicht"; maakt `createCustomer({name})`)
  - Pipeline fase* (standaard de eerste DB-fase of de kolom; "Kies een fase")
  - Verwachte omzet (€, number step 50)
  - Prioriteit (Hoog / Normaal / Laag, standaard med)
  - "Wie behandelt deze aanvraag?" (`MemberMultiSelect`, standaard de aanmaker)
  - Omschrijving (`NoteEditor` met @)
- `createDeal(input)` (`dealService.js:154-196`) mapt naar `{title, customer_id, stage_id (alleen uuid), expected_revenue, description, priority, assigned_to_ids, assigned_to: ids[0]}` via `safeInsert`, en schrijft een tijdlijnregel `deal_aangemaakt`.
- Heeft de klant een e-mailadres, dan volgt `triggerAutoEmail('aanvraag_ontvangen', {klant_naam, bedrijfsnaam}, email, companyId, 'deal', deal.id, customerId)`.
- Toast "Nieuwe aanvraag toegevoegd".
- Ook globaal te openen via `requestNewLead` (`src/App.jsx:1475`, `:1973`).

### Verloren markeren — modal (`BbDashboard.jsx:940-971`; gedeelde `VerlorenModal` in `SharedModals.jsx:202-265`)
- Reden (verplicht, select). De opties komen uit `lost_reasons`, gesorteerd op `position` (`src/services/lostReasonService.js`). Fallback: `['Te duur','Gekozen voor concurrent','Geen reactie','Timing niet goed','Anders']`.
- Toelichting (optioneel).
- Zonder Verloren-fase: "Geen \"Verloren\"-fase gevonden in de pipeline".
- `markDealLost(id, lostStageId, reason, note)` voert `update {stage_id, lost_reason, status:'lost'}` uit (`dealService.js:122-144`). De toelichting gaat alleen naar de klant-tijdlijn (`deal_verloren`).
- Beheer van `lost_reasons` (create, update, delete; label + position) gebeurt in Instellingen.

### Deal-/aanvraagdetail = **projectdetail-drawer**
- `openDeal(id)` → `DealDrawer` (`src/App.jsx:884-926`) → `getProjectByDeal(dealId)` (`src/services/projectsService.js:220-233`). Dat haalt het **oudste** project met `deal_id` = deal. Daarna wordt `ProjectDetailDrawer` geopend (`src/pages/projects/ProjectDetailDrawer.jsx`).
- Zonder project: "Bij deze aanvraag hoort nog geen project." Tijdens het laden: "Project laden…".
- Kop (`ProjectDetailDrawer.jsx:75-164`):
  - fullscreen-toggle
  - projectnaam, inline te wijzigen met `canManage` (leeg niet toegestaan: "Een project moet een naam houden")
  - klantnaam als link → `openCustomer`
  - sluitknop
- `canManage = role in (admin, planner) || can('projecten_bewerken')` (`:1750`).
- Tabs (`zichtbareTabs`, `:170-181`):
  - Overzicht
  - Offertes (`can('offertes')`)
  - Facturen (`can('facturen')`)
  - Uren
  - Kosten (`can('kosten')` + plan `kosten_nacalculatie`)
  - Werkbonnen (plan `werkbonnen`)
  - Notities
- **Overzicht — aanvraagblok** (alleen als er een deal is, `:483-555`):
  - "Status":
    - Verloren → badge `b-lost` "Verloren"
    - afgerond → badge `b-done` "Project voltooid"
    - anders met `magBewerken('verkoop')` een **fase-select**, die "Afgerond" verbergt tenzij dat de huidige fase is → `updateDealStage`
    - zonder recht: grijze badge met de fasenaam
  - Knoppen (`verkoop`):
    - "Project voltooien" (`zetDealAfgerond(true)`; groene knop `wb2-complete-btn`) / "Heropenen" (`zetDealAfgerond(false)`)
    - tekstlink "Verloren" → `VerlorenModal`
    - bij verloren: "Heropenen" → `heropenVerlorenDeal(id, eersteFase)`, met `update {stage_id, status:'open', lost_reason:null}`. De eerste fase is de eerste die niet `/verlor|afgerond/` is (`:297-313`).
  - "Behandeld door" (`verkoop`): knop met de namen of "Niemand toegewezen". Die opent `MemberMultiSelect` → `updateDeal(id, {assigned_to_ids, assigned_to: ids[0]})`. Uitgeschakeld als de deal afgerond is.
- **"De aanvraag"** (`:561-672`):
  - tekst = `projects.description` (fallback `deals.description`), bewerkbaar met `canManage` (textarea)
  - Waar: klantadres, postcode en plaats
  - Wanneer: uit de werkbonplanning — "Ingepland dd-mm-jjjj (+n dagen)", of een bereik, of "Gestart …", of "Nog niet ingepland", plus "deadline …"
  - Via: `inquiries.source` (`getAanvraagBron`), dus 'Websiteformulier', de bron, "Handmatig aangemaakt" (met verkooprecht) of "—", plus "binnen op"
  - Contact: telefoon of e-mail
  - Foto's (`project_fotos` + bucket `project-fotos`, signed URL 3600s), toevoegen en verwijderen met `canManage`
- **Projectinformatie** (`:679-779`), inline te bewerken met `canManage`:
  - Startdatum (`start_date`)
  - Einddatum (`deadline`; rood `#dc2626` met "verlopen" als die in het verleden ligt en status ≠ afgerond)
  - Begrote uren (`quoted_hours`)
  - Gewerkte uren (alleen-lezen; % in rood bij >100%, `#f59e0b` bij ≥80%)
  - Projectwaarde (alleen `can('projectbedragen')`; handmatig zetten schrijft `waarde_bron:'handmatig'`)
  - Bron-uitleg: 'offertes' / 'aanvraag' / 'handmatig', met de link "automatisch berekenen" → `waarde_bron:'aanvraag'`
- **Planning**: `PlanningRegels` met de eerstvolgende 4 werkbondagen. Klik → werkbon.
- **Werkbonnen**: de lijst (titel, nummer, locatie, statusbadge werkbon), klik → `/werkbonnen/<id>`.
- **Offertes** (`can('offertes')`):
  - de offertes met hetzelfde `deal_id`, of `project.offerte_id`
  - statusbadge offerte
  - bedrag (met `projectbedragen`)
  - "+" → `NewOfferteModal` (prefill deal/klant)
- **Facturen** (`projectbedragen`): nummer, datum, vervaldatum, badge, bedrag; "+" → `NewFactuurModal`.
- **Klantgegevens**:
  - Naam, Contactpersoon, Telefoon, E-mail, Adres zijn inline te bewerken met `magBewerken('klanten_bewerken')` → `updateCustomer` (schrijft naar `customers`)
  - "Andere klant"/"Klant kiezen" (`canManage`) → `updateProject({customer_id})`
- Voet (tab Overzicht, `canManage`): "Verwijder project" → `deleteProject`.
- Andere tabs zijn deel van het projectdetail: Offerte koppelen of nieuw, Uren (alleen-lezen, uit werkbonuren), Kosten, Facturen, Werkbonnen (via `WerkbonModal`), Notities (`project_notes`, met mention-meldingen).

### Bijzonderheden / dode code
- `deal_notities` + `dealNotitieService.js` (getDealNotities / addDealNotitie / deleteDealNotitie; RLS: alleen schrijver, admin of planner verwijdert) worden **nergens in de UI gebruikt**. Projectnotities gaan naar `project_notes`.
- `MaakProjectModal` (`BbDashboard.jsx:182-248`) wordt nooit geopend: `setMaakProjectDeal` wordt nergens aangeroepen.
- Tijdlijnregels die deals schrijven (`klant_tijdlijn`): `deal_aangemaakt`, `deal_fase_gewijzigd` (ook bij heropenen), `deal_verloren`.
- **Websiteaanvragen** (`aanvraagService.js`, tabel `inquiries`): komen binnen via Edge Function `public-website-inquiry`.
  - Statussen: `nieuw` (`b-new`), `in_behandeling` (`b-blue`), `gekwalificeerd` (`b-green`), `afgewezen` (`b-lost`), `spam` (`b-orange`).
  - `zetOmNaarKlant` maakt een klant (zoekt eerst dubbelen op e-mail of op de laatste 9 cijfers van het telefoonnummer), eventueel een deal, en zet de aanvraag op `gekwalificeerd`.
  - UI (`WebsiteAanvragen.jsx`) zit momenteel alleen in `SuperAdminPage`.

---

## 2. Klanten / relaties (`page: 'customers'`)

**Componenten**: `CustomersPage` (`src/pages/BbPages1.jsx:1472-1609`) en `CustomerPage` (klantkaart, `BbPages1.jsx:210-1469`).
- Is er een klant open en is de pagina 'customers', dan volgt een **split-view**: lijst links, `KlantkaartPaneel` rechts (`src/App.jsx:1611-1627`).
- Op andere pagina's opent de klantkaart als `CustomerDrawer` (`src/App.jsx:858-875`). Escape sluit.

### Zichtbaarheid
- Route: geen recht vereist. RLS select = eigen bedrijf.
- Bewerken: `can('klanten_bewerken')` (UI, `BbPages1.jsx:1390`). RLS-update eist `bb_has_permission('klanten_bewerken')` (`20260620030000_security_audit2_fixes.sql:116`).
- Verwijderen: `can('klanten_verwijderen')` (UI). RLS `bb_is_admin_or_permission('klanten_verwijderen')`.
- **Aanmaken**: de knop "Nieuwe klant" toetst alleen `guardLimiet('klanten')` en geen recht. RLS-insert kijkt naar bedrijf, limiet en readonly. Of een insert-policy `klanten_bewerken` eist is niet gevonden in de migraties.

### Data
- `listCustomersWithTotals()` (`src/services/customerTotalsService.js:81-84`) = `listCustomers()` + `getFacturen()` → `withCustomerTotals`.
- `listCustomers()`: `from('customers').select('*',{count:'exact'}).order('created_at',desc).order('id')` via `alleRijen`.
- Kolommen `customers`: `id, company_id, name, email, phone, address, postcode, city, kvk_number, btw_number, iban, logo_url, notes, notities, contactpersoon, moneybird_id, snelstart_id, created_at, updated_at`. `type`/`source` worden gelezen als ze bestaan, maar `mapCustomerFormToPayload` schrijft ze **niet** (`src/services/customerService.js:51-75`).
- Mapper `toCustomer` (`customerService.js:16-51`):
  - `name` en `company` zijn **beide** `name` (er is geen aparte bedrijfskolom)
  - lege naam → "Naamloos"
  - `type` standaard "Klant"
  - `av` = index (avatar-kleur)
- **Totalen** (`customerTotalsService.js`):
  - `total` (Gefactureerd) = som van `totaalIncl` van facturen met status ≠ `concept` (credit telt negatief mee)
  - `paid` (Betaald) = som van `totaalIncl` met status `betaald`, niet `isCredit`, niet `gecrediteerd`
  - `openstaand` = total − paid
  - `sumOmzetExclBtw` = som van `totaalExcl` van niet-concept facturen
  - Offertes tellen niet mee.

### Lijst
- Kop:
  - "Klanten"
  - "{n} klanten in je CRM" + `PlanStand limiet="klanten"`
  - schakelaar Kaarten/Tabel (`localStorage.customers_view`, standaard `grid`)
  - knop "Nieuwe klant"
- Zoeken: "Zoek op naam of bedrijf…", substring op `name` of `company`, hoofdletterongevoelig. **Geen filters, geen sortering-UI, geen paginering.** Alle rijen worden geladen (`alleRijen`) en de volgorde is `created_at desc`.
- Kaart (3 kolommen):
  - avatar, naam, bedrijf
  - e-mail, telefoon, plaats
  - Gefactureerd / Betaald (groen `#15A34A` als > 0)
  - prullenbak (`klanten_verwijderen`)
- Tabel: Klant (avatar + naam), Telefoonnummer, Stad, Gefactureerd, Betaald (groen), verwijderen.
- Klik → `openCustomer(id)`.
- Staten:
  - "Klanten laden..."
  - fout in rood
  - leeg: "Geen klanten gevonden" / "Maak je eerste klant aan of pas je zoekopdracht aan."
- Verwijderen:
  - eerst `confirm('Weet je zeker dat je deze klant wilt verwijderen?')`
  - dan `deleteCustomer(id)`: leest eerst `snelstart_id`, voert de delete uit en roept bij een SnelStart-relatie `negeerBijImport('klant', snelstart_id, 'verwijderd in BossBase')` aan
  - een retourwaarde is een waarschuwingstoast (10s)

### Klant aanmaken — `NewCustomerModal` (`SharedModals.jsx:73-195`)
- Velden:
  - Naam*
  - Bedrijfsnaam
  - E-mail
  - Telefoon
  - AdresZoeker (PDOK; vult adres, postcode en plaats)
  - Adres, Postcode, Plaats
  - KvK-nummer, BTW-nummer, IBAN
  - Type (Zakelijk / Particulier; **niet opgeslagen**)
  - Bron (**niet opgeslagen**)
  - Notities (NoteEditor → `customers.notes`)
- Validatie:
  - naam verplicht: "Naam is verplicht"
  - e-mail regex `^\S+@\S+\.\S+$`: "Ongeldig e-mailadres"
  - de service eist "Naam of bedrijfsnaam is verplicht"; name valt terug op company
  - **geen** KvK/BTW/IBAN-controle bij klanten (wel bij leveranciers)
- `createCustomer` (`customerService.js:95-105`):
  - `safeInsert` op `customers`
  - Edge Function `moneybird-update-contact` `{customer_id}` (fire and forget)
  - tijdlijnregel `klant_aangemaakt`
- Na het opslaan opent de nieuwe klantkaart.

### Klantkaart (`CustomerPage`)
- Laadt parallel (`BbPages1.jsx:320-349`):
  - `getCustomer`
  - `listActivities()`, gefilterd op `custId`
  - `getOffertesByCustomer`
  - `getFacturenByCustomer`
  - `getProjectsByCustomer`
  - `getKlantNotities`
  - `getTijdlijnByCustomer`
  - `getWerkbonnen()`, gefilterd op `customerId`
  - `getKlantKostenOverzicht`
  - Opnieuw bij `refreshKey`.
- Kop:
  - fullscreen-toggle (`localStorage.customer_fullscreen`)
  - avatar en naam
  - typebadge (`b-blue` als `type==='Zakelijk'`, anders `b-gray`)
  - telefoonknop `tel:`
  - "{company} · {city}"
  - `SyncIndicator` (boekhoudkoppeling)
- **Snelle cijfers** (`can('projectbedragen')`, `:694-708`):
  - Gefactureerd
  - Betaald (groen > 0)
  - Totale kosten (`kostenOverzicht.totaal`)
  - "Brutowinst vóór arbeid" = `sumOmzetExclBtw(facturen) − totale kosten` (groen > 0, rood < 0)
  - marge % = winst / omzetExcl
- **Tabs** (`:480-492`), met overloop naar een ⋯-menu (`KlantTabbalk`):
  - overview "Overzicht"
  - planning "Planning"
  - projecten "Projecten"
  - werkbonnen "Werkbonnen"
  - notities "Notities"
  - quotes "Offertes" (`can('offertes')`)
  - facturen "Facturen" (`can('facturen')`)
  - costs "Kosten" (`can('kosten')`)
  - emails "E-mails"
  - timeline "Tijdlijn"
  - klantgegevens "Gegevens"
  - De tab staat in de URL (`?tab=`).
- **Overzicht-blokken**:
  1. Planning: werkbondagen + losse activiteiten op datum (`planRegels` + `losseRegels`, `src/components/PlanningBlok.jsx`). Eerst de komende, maximaal 4. "+" toont `PlanKeuze`: "Werkbon inplannen" (`can('planning') || can('werkbonnen_bewerken')`) / "Los item inplannen" (iedereen → `NewActivityModal`). Leeg: "Nog niets ingepland voor deze klant."
  2. Notities: NoteEditor + "Toevoegen", de laatste 2, "Alle notities → (n)".
  3. Activiteiten: lijst met type-icoon, titel, datum, tijd en `StatusBadge` (domein activiteit); "+" → `NewActivityModal`; klik → `ActivityEditModal`. Leeg: "Geen activiteiten".
  4. Offertes: nummer, omschrijving, bedrag, `OfferteBadge`; "+" via `guardLimiet('offertes')`.
  5. Facturen: nummer, notities, bedrag, `FactuurBadge`; "+" via `guardLimiet('facturen')`.
  6. Projecten: naam, projectwaarde, `KlusBadge`; "+" via `guardSchrijven`.
  - **Let op**: in het Overzicht worden de blokken Offertes en Facturen getoond zonder `can('offertes')`/`can('facturen')`-check. Zonder recht levert RLS een lege lijst.
- **Notities-tab**: `NotitieLog` met `klant_tijdlijn`, rijen `type='notitie_toegevoegd'`.
- **Tijdlijn-tab**: alle rijen uit `klant_tijdlijn` (desc). Iconen en kleur per typeprefix (`:613-647`):
  | prefix | kleur |
  |---|---|
  | klant | `#3b82f6` |
  | offerte | `#f97316` |
  | factuur | `#10b981` |
  | credit | `#ef4444` |
  | project | `#6366f1` |
  | notitie | `#10b981` |
  | email | `#0ea5e9` |
  | herinnering | `#f59e0b` |
  | afspraak | `#14b8a6` |
  | deal | `#8b5cf6` |
  | export | `#64748b` |
  - Bekende typen: `klant_aangemaakt, offerte_aangemaakt/verzonden/geaccepteerd/afgewezen, factuur_aangemaakt/verzonden/betaald, creditfactuur_aangemaakt, project_aangemaakt, project_status_gewijzigd, notitie_toegevoegd, email_verstuurd, herinnering_verstuurd, afspraak_ingepland, deal_aangemaakt, deal_fase_gewijzigd, deal_verloren, export_uitgevoerd`.
  - Leeg: "Nog geen activiteit gelogd".
- **Offertes/Facturen/Projecten/Werkbonnen-tabs**: lijsten die openen in de eigen module met de back-context `{from:'klant', klantId, klantNaam}`. Werkbonnen zijn gesorteerd op `geplandOp` desc. "Nieuwe werkbon" alleen met `magWerkbonInplannen`.
- **Planning-tab**: "Ingepland (n)", alle regels, met vandaag gemarkeerd.
- **Kosten-tab**:
  - 3 tegels: Totale kosten, Betaald, Brutowinst/marge
  - regels: materiaal (alleen `can('inkoopprijzen')`), inkopen per project, boekingen ("telt niet mee")
  - invoerregel `KostenInvoerRegel` (admin/planner of `projecten_bewerken`) → `createProjectKost`
- **E-mails-tab**:
  - schrijfvak met sjabloon (`getEmailTemplates`, actief), variabelen `klant_naam`, `bedrijfsnaam`
  - Onderwerp*, Bericht (NoteEditor), Aan* (standaard het klant-e-mailadres)
  - versturen: `sendEmail` + `logSentEmail` + tijdlijnregel `email_verstuurd`
  - lijst `getSentEmailsByCustomer`; uitklappen toont een sandboxed iframe
- **Gegevens-tab** (`:1330-1401`), inline per veld, alleen met `can('klanten_bewerken')`:
  - Naam, E-mail, Telefoon
  - Adres (AdresZoeker; een keuze zet adres, postcode en plaats in één update)
  - Postcode, Stad, KvK-nummer, BTW-nummer, IBAN
  - Type (select Particulier/Bedrijf/VvE/Aannemer, **maar wordt niet opgeslagen** door de mapper)
  - Bron (idem, niet opgeslagen)
  - `updateCustomer(id, {...c, [key]: draft})`. **Let op**: de mapper laat null of lege waarden weg, dus een veld leegmaken slaat niets op. Met een `moneybirdId` volgt Edge Function `moneybird-update-contact`.
- Er is geen "klant verwijderen" op de kaart zelf, alleen in de lijst.
- Snelle activiteit `addActivity` (titel → `createActivity({type:'task', due_at: vandaag 09:00})`) is gedefinieerd, maar er is geen UI-input voor.

---

## 3. Leveranciers (`page: 'leveranciers'`)

**Componenten**: `LeveranciersPage` (`src/pages/LeveranciersPage.jsx`) en `LeverancierPage` (kaart, `src/pages/LeverancierPage.jsx`). Split-view zoals bij klanten (`src/App.jsx:1628-1638`), URL-param `?lev=`.

### Zichtbaarheid
- Route: geen recht.
- Bewerken (UI): `can('klanten_bewerken')`. RLS-update: `bb_has_permission('klanten_bewerken')`.
- Verwijderen (UI): `can('klanten_verwijderen')`. RLS: `bb_is_admin_or_permission('klanten_verwijderen')`.
- Insert: eigen bedrijf, plus restrictive `bb_mag_schrijven()` (`supabase/migrations/20260824140000_leveranciers.sql:88-111`, `20260903120000_...:132`).
- "Nieuwe leverancier" heeft in de UI geen rechten- of readonly-guard.

### Data — tabel `leveranciers` (`20260824140000_leveranciers.sql`)
- Kolommen: `id, company_id, naam (NOT NULL), contactpersoon, email, telefoon, mobiel, website, address, postcode, city, kvk_number, btw_number, iban, betaaltermijn_dagen int, notities, actief bool default true, snelstart_id, moneybird_id, created_at, updated_at`.
- Mapper `toLeverancier` (`src/services/leverancierService.js:11-33`).
- `listLeveranciers({inclusiefInactief=true})` sorteert op `naam`. Er is geen `alleRijen`, dus maximaal 1000 rijen.
- De lijst op de pagina komt uit de gedeelde `useData().leveranciers`.
- `getLeverancierKostenTotalen()`: `job_costs (leverancier_id, amount)` via `alleRijen` → `{[id]: {aantal, bedrag}}`.
- Validatie (`keurZakelijkeVelden` → `valideerRelatieVelden`, `src/lib/validatie.js`):
  - naam verplicht
  - BTW: alleen NL `^NL\d{9}B\d{2}$` + elfproef. Meldingen: "Een Nederlands btw-nummer ziet eruit als NL123456789B01." / "Dit btw-nummer klopt niet — controleer de cijfers."
  - KvK: 8 cijfers. "Een KvK-nummer bestaat uit 8 cijfers."
  - IBAN: mod-97, NL = 18 tekens. Meldingen: "Dit lijkt geen geldige IBAN — controleer het rekeningnummer." / "Een Nederlandse IBAN bestaat uit 18 tekens." / "Dit rekeningnummer klopt niet — controleer de IBAN."
  - Lege strings worden `null`.

### Lijst
- Kop:
  - "{n} leverancier(s)"
  - Kaarten/Tabel (`localStorage.leveranciers_view`)
  - "Nieuwe leverancier"
- Zoeken: "Zoek op naam, plaats of e-mail…" (naam, city, email).
- Geen filter op actief/inactief. Inactieve leveranciers hebben opacity 0.6 en het label "Inactief".
- Kaart:
  - avatar, naam
  - contactpersoon (of "Leverancier"/"Inactief")
  - e-mail, telefoon, plaats
  - "Kosten" = som van `job_costs.amount`
  - prullenbak
- Tabel: Leverancier, Telefoonnummer, Stad, Kosten.
- Verwijderen:
  - bij gekoppelde kosten: geblokkeerd met de toast "… kan niet verwijderd worden: er hangt/hangen n kostenpost(en) aan. Zet hem op inactief…" (FK `job_costs.leverancier_id` ON DELETE RESTRICT)
  - anders confirm → `deleteLeverancier` (+ `negeerBijImport('leverancier', …)` bij SnelStart)
- Staten:
  - "Leveranciers laden..."
  - leeg: "Geen leveranciers gevonden" / "Maak je eerste leverancier aan — dan landen je kosten in de boekhouding onder de juiste relatie." / "Pas je zoekopdracht aan."

### Nieuw — `NewLeverancierModal` (`LeveranciersPage.jsx:29-134`)
- Velden:
  - Naam* ("Naam is verplicht")
  - Contactpersoon, E-mail, Telefoon, Mobiel
  - AdresZoeker; Adres, Postcode, Stad
  - Website, KvK-nummer, BTW-nummer, IBAN
  - Betaaltermijn (dagen, placeholder 30)
- Na het opslaan opent de kaart.

### Kaart (`LeverancierPage.jsx`)
- Kop:
  - badge `b-blue` "Leverancier" / `b-gray` "Inactief"
  - telefoonknop
  - "contactpersoon · stad"
  - SyncIndicator
- Snelle cijfers (`can('projectbedragen')`): Materialen (aantal), Betaaltermijn.
- Tabs (de tab staat **niet** in de URL):
  - Overzicht: notities-invoer + laatste 2; blok Materialen (aantal, "Alle materialen →")
  - Notities: `NotitieLog` op `leverancier_tijdlijn` met `type='notitie_toegevoegd'`, met mention-melding
  - Materialen: `listMaterialen()`, gefilterd op `leverancierId`. Kolommen: Materiaal, Eenheid, Verkoop excl.; plus Inkoop en Marge (alleen `can('inkoopprijzen')`; marge rood `#dc2626` < 0, anders `#15A34A`)
  - E-mails: Aan (vast, het leveranciers-e-mailadres), Onderwerp*, Bericht (textarea) → `sendEmail` + tijdlijnregel `email_verstuurd`. Zonder e-mail: "Deze leverancier heeft geen e-mailadres. Vul er een in bij Gegevens."
  - Tijdlijn: component `Tijdlijn`
  - Gegevens: inline per veld (`klanten_bewerken`): Naam, Contactpersoon, E-mail, Telefoon, Mobiel, Adres (AdresZoeker), Postcode, Stad, KvK, BTW, IBAN, Website, Betaaltermijn
- **Er is geen UI om `actief` te wijzigen**, terwijl de verwijdermelding daarnaar verwijst.
- Tabel `leverancier_tijdlijn(id, company_id, leverancier_id, type, omschrijving, meta, aangemaakt_op, created_by)` (`src/services/leverancierTijdlijnService.js`).

---

## 4. Activiteiten (`page: 'activities'`)

**Component**: `ActivitiesPageV2` (`src/pages/ActivitiesPageV2.jsx`). Detail `/activities/<id>` → `ActivityEditModal`. De oude `ActivitiesPage` in `BbPages1.jsx:1612` wordt niet meer gerouteerd.

### Zichtbaarheid
- Route en menu: geen recht.
- RLS select (`20260920131715_policies_permissiecheck_hijsen.sql:106-116`): eigen bedrijf EN (gedeelde werkruimte OF `planning` OF `agenda_inzien` OF `assigned_to = uid` OF `uid = any(assigned_to_ids)`). Een gewone medewerker ziet dus alleen zijn eigen activiteiten.
- Insert: restrictive `bb_mag_schrijven()` (readonly). In de UI loopt "Nieuwe activiteit" via `guardSchrijven('Een activiteit inplannen')`.
- **Bewerken en verwijderen (UI)**: alleen `profile.role` admin of planner (`SharedModals.jsx:1129-1130`). Afronden en heropenen mag iedereen die de activiteit ziet. Fouten met RLS-code `42501` geven nette meldingen.

### Datamodel — tabel `activities`
- Kolommen (`src/services/activityService.js:11-14` + migraties):
  - `id, company_id`
  - `customer_id, deal_id`
  - `assigned_to` (FK `activities_assigned_to_fkey` → profiles), `assigned_to_ids uuid[]` (migr. `20260624140001`)
  - `title`
  - `type` ∈ `call|email|visit|task|follow`; andere waarden worden opgeslagen als `task`
  - `due_at` (timestamptz; datum + starttijd, NL-wandkloktijd via `lokaalNaarUtc`; standaardtijd 09:00)
  - `end_time` (tijdtekst)
  - `location`
  - `completed` (boolean)
  - `notes` (legacy tekst)
  - `google_event_id, google_sync_status, google_calendar_synced_at, google_sync_error` (migr. `021_google_calendar.sql`)
  - `created_at, updated_at`
  - `end_time`/`location` staan niet in de migratiemap; `safeInsert` laat ze vallen als ze ontbreken.
- **Niet aanwezig**: prioriteit (het veld in de modal is "alleen weergave" en wordt niet opgeslagen), deadline los van `due_at`, herinnering, herhaling, aparte "verantwoordelijke" (alleen toegewezen), een losse omschrijving naast notes.
- **Status is afgeleid** (`toActivity` / `computeOpenStatus`, `activityService.js:101-151`):
  - `completed` → `completed`
  - anders, vergeleken op de NL-kalenderdag van `due_at`: < vandaag → `overdue`; = vandaag → `today`; > vandaag of geen datum → `open`
- Opslaan: UI-status `completed`/`done` → `completed=true`, anders false. Bij het aanmaken kun je "Vandaag" of "Te laat" kiezen, maar dat heeft geen effect: alleen `completed` wordt opgeslagen.
- Mapper levert ook `customerName` (`customers.name`) en `assigneeName` (`assigned_profile.full_name`).
- Select: `"*, customers(*), assigned_profile:profiles!activities_assigned_to_fkey(full_name)"`. `listActivities()` doet `order('due_at').order('id')` via `alleRijen`.
- **Notities**: tabel `activiteit_notities(id, company_id, activity_id → activities ON DELETE CASCADE, created_by, note, created_at, updated_at)` (`20260725143000_werkbon_activiteit_notities.sql:70`). De service levert get/add/delete; de UI biedt alleen toevoegen (geen verwijderen).
- **"Taken"**: er is geen relatie met activiteiten. "Taken" zijn werkbontaken (`getWerkbonTaken`, kolom `is_meerwerk`, `src/services/werkbonService.js:443-460`).

### Pagina
- Kop:
  - "Activiteiten"
  - "{open+today+overdue} openstaande activiteiten · {n} te laat"
  - dagchip met "Vandaag | {today+open} open | {overdue} te laat"
  - knop "Nieuwe activiteit"
- Samenvattingstegels (klikbaar = filter):
  | tegel | kleur | subtekst |
  |---|---|---|
  | Te laat | `#dc2626` | "Pak deze het eerst aan" |
  | Vandaag | `#2563eb` | – |
  | Open | `#6b7280` | – |
  | Gereed deze week | `#15A34A` | – |
  - **Let op**: "Gereed deze week" telt álle afgeronde activiteiten.
- Filtertabs (in de URL `?tab=`): `all` Alle, `open` Open, `today` Vandaag, `overdue` Te laat, `done` Afgerond, elk met een teller.
- Overige filters:
  - datumfilter (date-input; vergelijkt `dueAt.slice(0,10)`, dus de UTC-datum) met "Datum wissen"
  - medewerkerfilter (unieke `assignee`; let op: alleen de primaire `assigned_to`)
  - zoeken "Zoek activiteit of klant…" op titel + klantnaam
- Weergave: "Datumgroepen" (standaard) of "Lijst". Geen sortering-UI; de volgorde is `due_at` oplopend.
- Groepen (`dateGroup`, `:94-114`):
  - Te laat (status overdue)
  - Vandaag (diff ≤ 0)
  - Morgen (1)
  - Deze week (≤ 7 dagen)
  - Later
  - Afgerond
  - De groepstitel "Te laat" is `#dc2626`.
- **Rij** (`Row`, `:455-511`):
  - accentbalk links: overdue `#ef4444` (rij-achtergrond verloop `#fff7f6`), today `#3b82f6`, open transparant, done `#10b981` op 50% (rij opacity .62, titel doorgestreept)
  - type-icoon met kleur:
    | type | label | bg | kleur |
    |---|---|---|---|
    | call | Bellen | `#eff6ff` | `#2563eb` |
    | email | E-mail | `#ecfdf5` | `#15A34A` |
    | visit | Bezoek | `#f0fdf4` | `#15A34A` |
    | task | Taak | `#f5f3ff` | `#7c3aed` |
    | follow | Follow-up/Opvolgen | `#fff4ec` | `#c2410c` |
  - titel
  - klantlink (→ `openCustomer`)
  - datum "di 3 mei", tijd
  - medewerker (initiaal + naam; nooit het ruwe id, anders "Onbekend")
  - statusbadge:
    | status | label | bg | kleur | dot |
    |---|---|---|---|---|
    | overdue | Te laat | `#fef2f2` | `#dc2626` | `#dc2626` |
    | today | Vandaag | `#eff6ff` | `#2563eb` | `#2563eb` |
    | open | Open | `#f3f4f6` | `#6b7280` | `#9ca3af` |
    | completed | Gereed | `#ecfdf5` | `#15A34A` | `#15A34A` |
  - vinkknop "Markeer als gereed" → `updateActivity(id, {status:'completed'})`
- CSS: `src/bb-dashboard.css:1578-1666`.
- Staten:
  - laden: "Activiteiten laden…" + skeleton
  - fout: "Activiteiten konden niet worden geladen" + melding
  - leeg: "Geen activiteiten" / "Geen activiteiten die aan deze filters voldoen." of "Alles bijgewerkt. Plan een nieuwe taak of geniet van de rust." + knoppen Nieuwe activiteit / Filters wissen

### Aanmaken — `NewActivityModal` (`SharedModals.jsx:448-622`)
- Velden:
  - Titel* ("Titel is verplicht")
  - Type (Bellen / E-mail / Bezoek / Taak / Follow-up; standaard task)
  - Status (Open / Vandaag / Te laat / Afgerond)
  - Datum* (standaard vandaag; "Kies een datum")
  - Starttijd (09:00)
  - Eindtijd (automatisch start + 15 min, tot je hem handmatig wijzigt)
  - Klant
  - Project (= deal, gefilterd op de gekozen klant)
  - Toegewezen aan (MemberMultiSelect) + `NotifyMailToggle`
  - Notities (NoteEditor met @)
- `createActivity`: zonder toegewezene wordt de ingelogde gebruiker gekozen. Daarna Google auto-sync (`autoSyncActivitySafe`).
- Bijwerkingen:
  - mention-meldingen uit de notities
  - `notifyNewAssignees({type:'toewijzing_activiteit', title:'Je bent toegewezen aan …', sendMail})`
  - bij type `visit` met klant-e-mail: `triggerAutoEmail('afspraak_bevestiging', {klant_naam, bedrijfsnaam, afspraak_datum, afspraak_tijd})`
- Er wordt **geen** `calendar_event` aangemaakt. Activiteiten verschijnen niet vanzelf in de agenda (zie §5).

### Wijzigen / afronden / verwijderen — `ActivityEditModal` (`SharedModals.jsx:1126-1440`)
- Zelfde velden; Status alleen Open/Afgerond; Prioriteit "(alleen weergave)", niet opgeslagen. Alle velden zijn uitgeschakeld zonder `canEdit` (admin/planner).
- Knoppen:
  - Verwijderen (`canEdit`; confirm "Activiteit verwijderen? Dit kan niet ongedaan worden gemaakt.")
  - Annuleren
  - "Markeer afgerond" / "Heropenen" (iedereen)
  - Opslaan (`canEdit`)
- `updateActivity` → Google-sync + bijwerken van het **bestaande** gekoppelde `calendar_events`-item (`activiteit_id`) via `upsertActivityEvent`. Er wordt geen nieuw item aangemaakt.
- `deleteActivity` leest eerst `google_event_id`, verwijdert, en doet dan een Google delete-sync. Het gekoppelde calendar_event verdwijnt via FK `ON DELETE CASCADE` (`activiteit_id`).
- Notitielog onderaan: `NotitieLog` (admin/planner kan toevoegen; anders alleen-lezen kaarten). Toevoegen geeft een mention-melding.
- Google-syncstatus in de modal is verborgen (`{false && …}`, `:1340`).

---

## 5. Agenda (`page: 'calendar'`)

**Component**: `CalendarPage` (`src/pages/BbPages2.jsx:231-642`, lazy). Detail van een echt agenda-item: `CalendarEventDetailDrawer` (`src/pages/dashboard/CalendarEventDetailDrawer.jsx`), geopend via `?agenda=<id>` (`src/App.jsx:929-938`).

### Zichtbaarheid en rechten
- Route: geen recht.
- RLS select `calendar_events` (`20260920131715_...sql:191-203` + `20260714150000_rechten_herziening.sql:357-370`): eigen bedrijf EN (gedeelde werkruimte OF `planning` OF `agenda_inzien` OF `assigned_to = uid` OF gekoppelde activiteit toegewezen aan uid OF gekoppelde werkbon toegewezen aan uid).
- **Bewerken en verwijderen** (RLS `20260710140000_calendar_event_edit_rls.sql`, gespiegeld in de UI `mayEditEvent` / `canEdit`): `bb_has_permission('planning')` OF (`herkomst <> 'planning'` EN `assigned_to = uid`).
- **Persoonlijke agenda (app-side)**: iedereen, ook admin, ziet alleen eigen items (`assignedTo === uid`; activiteiten waarin uid zit). Uitzondering: plan-feature `gedeelde_werkruimte` (`shareAll`) toont alles (`BbPages2.jsx:293-347`).
- "Werkbon inplannen" alleen als het plan **geen** `planning`-feature heeft (`canPlanFromAgenda`). "Toevoegen" en "Werkbon inplannen" lopen via `guardSchrijven`.

### Wat staat er in de agenda
1. **Handmatige `calendar_events`** zonder `werkbon_id` (gefilterd op eigenaar). Dat kunnen ook items zijn met `activiteit_id`, aangemaakt door de planning (`upsertActivityEvent`).
2. **Synthetische werkbon-items**: uit `getWerkbonnen()` met `geplandOp` en status ≠ afgerond. Per geplande dag (`werkbonDagen`) en per tijdvenster per persoon (eigen agenda: alleen de dagen waarop jij in de ploeg zit, met jouw tijd).
   - id `wb-{werkbonId}-{datum}-{start}`
   - kleur bg `#fff7ed`, tekst `#d97706`
   - type `werkbon`
   - eventueel het voertuig (plan `voertuigen`)
   - Klik → `/werkbonnen/<id>`
   - `calendar_events` met `werkbon_id` worden verborgen (ontdubbeld).
3. **Activiteiten zelf staan er niet in.** Ze worden alleen geladen om de modal te openen bij een item met `activityId`.

### Data — tabel `calendar_events`
- Kolommen (`src/services/calendarService.js` + migraties):
  - `id, company_id`
  - `customer_id, deal_id, activity_id`(legacy)`/activiteit_id` (FK activities ON DELETE CASCADE)
  - `werkbon_id` (FK werkbonnen ON DELETE SET NULL)
  - `werkbon_dag_id` (FK werkbon_dagen ON DELETE CASCADE, unieke index (dag, persoon))
  - `assigned_to`
  - `title`
  - `type` (text: `event|job|visit|activity`)
  - `start_at, end_at` (timestamptz)
  - `location`
  - `notes`
  - `comments` (jsonb `[{id,userId,name,text,at}]`, default `[]`)
  - `herkomst` (`'zelf'|'planning'`, NOT NULL default 'zelf')
  - `created_at, updated_at`
- `listCalendarEvents()`: alles via `alleRijen`, `order('start_at').order('id')`.
- `toCalendarEvent`:
  - `type` = kolom, of afgeleid: `activity_id` → activity, `deal_id` → job, `customer_id` → visit, anders event
  - `date`/`time`/`end` uit lokale tijd (`splitsLokaal`)
- Typekleuren (`calendarService.js:69-74`):
  | type | label | bg | tekst |
  |---|---|---|---|
  | job | Klus | `#fff4ec` | `#e8784a` |
  | visit | Opname | `#fff8f4` | `#e8784a` |
  | activity | Activiteit | `#eff6ff` | `#2563eb` |
  | event | Afspraak | `#f0fdf4` | `#15A34A` |
- Badges in de drawer: job `b-orange`, visit `b-new`, activity `b-blue`, event `b-green`.
- `buildEventTimes(date, time, end)`: start standaard 09:00, einde standaard start + 60 min.

### Weergaven (`?tab=day|week|month`, met geschiedenisstap; standaard week)
- **Week**: tijdlijn ma t/m zo, 64px per uur. Zichtbaar uurvenster uit `bedrijfsinstellingen.agenda_start_uur/agenda_eind_uur` (fallback 7–20; `getBedrijfsinstellingen`). Halfuurlijnen. Overlappende items naast elkaar (lanes). Vandaag gemarkeerd (`--pll`, "VANDAAG"). Items zonder tijd worden in de tijdlijn niet getoond.
- **Dag**: altijd **vandaag**. De vorige/volgende-knoppen verschuiven alleen de week of maand, dus de dagweergave navigeert niet (beperking).
- **Maand**: raster maandag-start. Per cel maximaal 2 items ("tijd titel") + "+n meer". Andere maand gedimd, vandaag gemarkeerd.
- Navigatie: ‹ Vandaag ›. Kop: "Maand jjjj · Week n" (ISO-week) of "Maand jjjj".
- Staten: "Agenda laden...", fout in rood ("Agenda laden is mislukt.").

### Klikken op een item (`handleEventClick`, `:441-457`)
- werkbon → werkbonpagina
- `activityId` → `ActivityEditModal`
- echt calendar_event → `CalendarEventDetailDrawer`
- anders een eenvoudige modal

### Afspraak aanmaken — `NewCalendarEventModal` (`SharedModals.jsx:625-753`)
- Velden:
  - Titel*
  - Type (Afspraak/Klus/Opname/Activiteit)
  - Datum*
  - Start (09:00) en Einde (start + 1 uur, automatisch)
  - Locatie
  - Klant
  - Notities (NoteEditor)
- `createCalendarEvent`: `herkomst='zelf'`, `assigned_to` = maker. Met klant volgt een tijdlijnregel `afspraak_ingepland`.
- **Geen** herinnering, herhaling, deelnemers of deal-keuze bij het aanmaken.

### Detail-drawer — `CalendarEventDetailDrawer`
- Laadt de volledige lijst en zoekt op id. Niet gevonden: "Agenda-item niet gevonden".
- Kop: typebadge, titel, "datum · start–eind".
- Met `canEdit`: formulier Titel, Type, Datum, Starttijd, Eindtijd, Locatie, Klant, **Deal** (select uit `listDeals`) + Opslaan → `updateCalendarEvent`. Anders een alleen-lezen overzicht met een klantlink.
- Snelkoppelingen "Open klant", "Open project" (`openDeal`).
- **Werkbon-sectie**:
  - zonder koppeling: "Werkbon aanmaken" (`canEdit`) → `createWerkbon({titel, customerId, dealId, geplandOp, starttijd, eindtijd, locatie})` + `setCalendarEventWerkbon`
  - met koppeling: titel, locatie, omschrijving, taken (checkbox → `toggleWerkbonTaak`), materialen (aantal × naam, subtotaal), notities
- **Notities**: `NotitieLog` op `comments` jsonb (toevoegen = hele array bijwerken via `updateCalendarEventComments`) + mention-melding (`relatedType:'calendar_event'`).
- Voet: "Verwijderen" (`canEdit`; confirm) → `deleteCalendarEvent`.

### Inline bewerkmodal (`CalendarEventModal`, `BbPages2.jsx:644-681`)
- Titel, Type, Klant, Datum, Start, Einde, Notities → `updateCalendarEvent`.

### Werkbon inplannen — `AgendaWerkbonPlanModal` (`src/components/AgendaWerkbonPlanModal.jsx`)
- Keuze uit niet-ingeplande werkbonnen: `!isIngepland(w)` (datum + starttijd ontbreekt) en status ≠ afgerond.
- Velden:
  - Datum (vandaag)
  - Starttijd 09:00, Eindtijd 11:00
  - bij gedeelde werkruimte `AssigneeResponsibleSelect` ("Voor wie" + verantwoordelijke) + mail-toggle
  - solo: alles op de huidige gebruiker
- `updateWerkbon(id, {gepland_op, starttijd, eindtijd, assigned_to_ids, verantwoordelijke_ids})` → (gedeeld) `notifyNewAssignees(type:'toewijzing_werkbon')` → `syncWerkbonEvents(werkbonId)`.
- `syncWerkbonEvents` maakt één `calendar_events`-rij per werkbondag per ploeglid, met `herkomst='planning'` en `werkbon_dag_id`. Overbodige planning-items worden verwijderd; handmatige items blijven.

### Google Calendar
- Verborgen voor klanten (`{false && …}`, `BbPages2.jsx:495`).
- Service `src/services/googleCalendarService.js`:
  - RPC `google_calendar_status` (`connected`, `google_email`, `google_calendar_id`)
  - RPC `google_calendar_disconnect`
  - Edge Function `google-calendar-auth-url` (OAuth-URL; terugkeer naar `/dashboard/calendar?google=connected|error&google_msg=`)
  - Edge Function `sync-activity-to-google` (`{activity_id, auto}` of `{…, google_event_id, op:'delete'}`)
- Auto-sync na create/update/delete van een **activiteit** alleen bij een koppeling (60s gecachet). calendar_events zelf worden niet gesynchroniseerd.

### Herinneringen / herhaling
- Niet aanwezig in agenda of activiteiten. Gevonden: alleen de uren-herinnering (aparte functie, `UrenHerinneringModal`) en factuurherinneringen. Die horen niet bij dit deel.

---

## 6. Afwijkingen en aandachtspunten voor gelijktrekken (samenvatting)
1. Een deal-detail ís een project-detail. De mobiele app moet `projects.deal_id` opzoeken (oudste) en daar aanvraag, status, behandelaars, voltooien en verloren tonen.
2. Status open/won/lost komt uit de DB-trigger. De app hoort alleen `stage_id` te zetten. Uitzonderingen:
   - verloren: `{stage_id, lost_reason, status:'lost'}`
   - heropenen: `{stage_id, status:'open', lost_reason:null}`
   - afronden: `afgerond_op`
3. De "Afgerond"-fase heeft geen kolom. Afgeronde deals zijn van het bord af (filter "Project voltooid").
4. De kolomkeuze voor Verloren en Afgerond gaat op naam-regex (`/verlor/i`, `/afgerond/i`). De DB gebruikt `pipeline_koppelingen`.
5. Activiteitstatus wordt berekend. Prioriteit, herinnering en herhaling bestaan niet. Bewerken en verwijderen alleen als admin/planner (UI).
6. De agenda is persoonlijk (ook voor admin), behalve bij `gedeelde_werkruimte`. Werkbonnen staan er synthetisch in; activiteiten niet (tenzij er een calendar_event aan hangt).
7. Bij klanten worden Type en Bron getoond en bewerkt, maar niet opgeslagen. Een veld leegmaken via de inline edit werkt niet (null wordt weggelaten). Het overzicht toont Offertes en Facturen zonder rechtencheck.
8. Leveranciers: `actief` is niet te wijzigen in de UI. "Nieuw" heeft geen guard. Lijst maximaal 1000 (geen `alleRijen`).
9. Dode of ongebruikte code: `deal_notities`-service, `MaakProjectModal`, `addActivity` op de klantkaart, de Google-UI.
