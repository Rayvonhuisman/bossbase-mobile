# Inventaris E — Database, Team, Instellingen, Integraties, Abonnement, overige pagina's, exports

Bron: `/Users/macbook/BossBase-billing` (branch `main`), alleen `src/` + ter controle `supabase/functions/*` en enkele migraties gelezen. Alle paden hieronder zijn relatief aan die repo. Niets gewijzigd.

---

## 0. Gedeelde basis (geldt voor alle onderdelen hieronder)

### 0.1 Routing en toegang (`src/App.jsx`)
- Menu = `NAV` (`src/App.jsx:99-128`). Relevant voor dit deel:
  - `database` — `permission: 'database'`, sectie "Bedrijf"
  - `team` — `permission: 'team'`
  - `instellingen` — **geen** permission (pagina beveiligt zichzelf; iedereen moet bij "Mijn profiel")
  - `abonnement` — staat níet in NAV, wel in `PAGINAS` (`src/lib/route.js`) en `renderPage()` (`src/App.jsx:1609`). Bereikbaar via `gaNaarAbonnement()` (`src/lib/abonnementNav.js`) vanuit read-only-banner, limiet-/featureblokkades en Instellingen → Abonnement.
- Routebewaking (`src/App.jsx:1576-1603`): `PROTECTED_PAGES` en `PLAN_GATED_PAGES` worden afgeleid uit NAV. Toegang als `role==='admin'` OF `userPermissions.includes(recht)` OF (feature `gedeelde_werkruimte` én recht ∈ `INZAGE_RECHTEN`). Anders toast "Je hebt geen toegang tot deze pagina" + terug naar dashboard.
- URL-vorm: `/dashboard/<pagina>[/<itemId>]?tab=…` (`src/lib/route.js`). Tabs via `useUrlTab` (`src/hooks/useUrlTab.js`, `?tab=`, sub-tab `?sub=`).
- Op mobiel (`useIsMobile`) toont de webapp `MobileBlock` i.p.v. het dashboard (`src/App.jsx:1803-1810`) — publieke pagina's (ondertekenen, betalen, uitnodiging, reset) blijven mobiel werken.

### 0.2 Rechten-hook (`src/hooks/usePermissions.js`)
- `magBewerken(p)`: admin → true; `role==='planner'` + `planning` → true; anders `userPermissions.includes(p)`.
- `can(p)`: als feature `gedeelde_werkruimte` aan en `p ∈ INZAGE_RECHTEN` → true; anders `magBewerken(p)`.
- `INZAGE_RECHTEN` = `verkoop, offertes, facturen, kosten, bedrijfsfinancien, projectbedragen, alles_inzien, agenda_inzien, projecten, database, team` (`usePermissions.js:28-40`). Dus in Groei (gedeelde werkruimte) ziet iedereen Database en Team.
- Rechten worden geladen uit tabel `user_permissions` (`permission`, `granted=true`, filter `user_id`) — `src/services/permissionsService.js:4-13`.

### 0.3 Pakket/feature/limiet-hook (`src/hooks/usePlan.js`, `src/services/planService.js`, `src/lib/features.js`, `src/lib/tiers.js`)
- Bron: RPC **`get_plan_status`** → `{tier, plan, status, trial, trialEndsAt, periodeStart, periodeEind, readonly, readonlyReden, magBeheren, modules[], features[], limits{key:{max,gebruikt}}}` (`planService.js:10-32`). Fallback op lokale matrix (`fallbackPlanStatus`), nooit readonly.
- `plan.has(feature)`, `plan.limit/used/within/stand/resterend(limiet)`, `plan.readonly`, `plan.readonlyReden`, `plan.magBeheren`, `plan.needsFor(feature)`.
- Tiers (`tiers.js:19-23`): starter €29, groei €39, team €59 (excl. btw). `EXTRA_USER_PRICE` €10. `INBEGREPEN_GEBRUIKERS = {starter:1, groei:1, team:0}`. Jaarabonnement = 12× maandprijs + één welkomstactie (`gratis_maanden` = 2 mnd 100% coupon `bb_welkom_2_maanden_gratis`; `gratis_website` alleen groei/team).
- Features (`features.js:21-57`):
  - Starter: `crm_pipeline, klanten, leads, offertes, facturen, werkbonnen, uren, agenda, adres_autocomplete, afspraakherinnering, email_templates_bewerken`
  - Groei = Starter + `digitale_handtekening, betaalherinneringen, boekhoudkoppeling, btw_overzicht, kosten_nacalculatie, eigen_email_templates` + intern `gedeelde_werkruimte`
  - Team = Starter + Groei-extra + `rollen_rechten, planning, stripe_betaallink, voertuigen` (géén `gedeelde_werkruimte`)
- Modules (`features.js:105-114`): `stripe_betaallink` €10 (groei), `planning` €10 (groei), `voertuigen` €5 (groei, vereist planning), `hosting` €5 (groei+team).
- Limieten (`features.js:135-151`): `gebruikers` (voorraad), `klanten` (voorraad), `offertes`/`facturen` (periode, ledger `plan_usage_events`). starter 1/100/20/20, groei 2/∞/∞/∞, team ∞. Trial → geen limieten; onbekend tier → `groei`.
- `usePlanGuard()` (`src/components/PlanUpgradeModal.jsx:26-77`): `guardSchrijven(actie,fn)`, `guardLimiet(key,fn)`, `guardFeature(key,fn)`. Readonly gaat vóór limiet/feature. Blokkade = navigeren naar `/dashboard/abonnement?reden=readonly|gebruikers|limiet|feature&key=…&actie=…`. `PlanStand` toont "x / max label" (rood vol, oranje bijna).

### 0.4 Read-only (`src/lib/readonly.js`, `src/components/ReadOnly.jsx`)
- Alleen server bepaalt readonly (`planStatus.readonly === true`). Redenen: `proefperiode_verlopen`, `betaling_mislukt`, `opgezegd` (+ algemene fallback), elk met titel/uitleg/knoptekst.
- `ReadOnlyBanner` boven elke pagina (`src/App.jsx:1897`); knop naar abonnement alleen bij `plan.magBeheren`, anders "Vraag de beheerder…".
- Blijft werken: bekijken/zoeken/filteren, exporteren CSV/Excel, facturen op betaald zetten, binnenkomende websiteaanvragen (`READONLY_BLIJFT_WERKEN`).
- DB-fout herkennen: `isReadonlyFout(error)` (code `42501`/"row-level security"/hint `readonly`).

### 0.5 Mail en storage
- Alle mails via Edge Function **`send-email`** (`src/services/emailService.js:~83`), body `{to, subject, html, from_name, reply_to?, attachments?}`; reply-to = `companies.reply_to_email` → `companies.email`. Log in tabel **`sent_emails`** (`logSentEmail`).
- Storage-buckets in de hele app: `avatars` (publiek, 5 MB, jpg/png/webp), `bedrijf-logos` (publiek), `werkbon-fotos`, `project-fotos`, `kosten-bijlagen`, `factuur-pdfs` (signed URLs 1 u), `meldingen` (signed 10 min). Handtekeningen/getekende PDF's via Edge Function **`document-url`** (`src/services/documentService.js`; soorten `offerte_handtekening`, `werkbon_handtekening`, `werkbon_pdf`; body `{soort,id}` of `{soort,token}`).

---

## 1. Database (`page: 'database'`) — `src/pages/DatabasePage.jsx`

**Belangrijk: dit is GEEN bestanden-/foto-/documentenbibliotheek.** Er zijn geen categorieën, geen foto-overzicht, geen uploads en geen storage-buckets op deze pagina. Het is een **klanten-segmentatie- en exportscherm** ("Database & Export"): een gefilterde klantenlijst met bulk-mail, Excel/CSV-export en bulk-PDF/ZIP-download van offertes/facturen per klant. `src/services/documentService.js` hoort er niet bij (dat is alleen de `document-url`-helper voor handtekeningen/getekende PDF's, gebruikt in werkbon/offerte-PDF's).

### 1.1 Zichtbaarheid
- Recht `database` (UI-gate, géén RLS — zie `src/config/permissions.js:14-15`). Admin altijd; in Groei (gedeelde werkruimte) iedereen.
- Geen feature-gate, geen pakketgate. Geen readonly-guard in de UI (bulk-mail en verwijderen hebben geen `guardSchrijven`; server blokkeert).
- Binnen de pagina **geen** extra rechtencheck: rij-actie "Klant verwijderen" staat er ook zonder `klanten_verwijderen` (RLS dwingt dat recht wél af via `bb_has_permission`). "Klantgegevens bewerken" opent de klantkaart (daar geldt `klanten_bewerken`).

### 1.2 Gegevens (load, `DatabasePage.jsx:526-583`)
- Uit gedeelde dataset `useData()`: `customers, offertes, deals, activities, stages` (+ `refresh`).
- Extra, parallel:
  - `getProjects()` (projectsService), `getFacturen()` (factuurService), `getEmailTemplates()` (tabel `email_templates`), `getLostReasons()` (tabel `lost_reasons`)
  - `sent_emails` select `id,customer_id,to_email,subject,sent_at,related_type` `.eq('company_id')`
  - `werkbon_uren` select `id,profile_id,uren,datum,werkbonnen(customer_id,project_id)` `.eq('company_id')` (factureerbare uren = werkbonuren, niet `urenregistratie`)
  - `profiles` select `id,full_name` `.eq('company_id')` (medewerkerfilter)
  - RPC **`get_accounting_status`** → set van providers met `connected` (moneybird/snelstart/afas) om sync-filters te tonen.
- Per klant geïndexeerd (`byCustomer`): projects, facturen, offertes, deals, activities, emails.

### 1.3 Lijst
- Kolommen (`COLS`): checkbox · Klant (avatar, naam [klik → klantkaart], stad) · Laatste project (naam + statusbadge via `statusInfo(status,'project')`) · Laatste mail (datum dd-mm-jj + onderwerp) · Projecten (aantal) · Betaald (`sumBetaald(facturen)`) · Acties.
- Rij-acties: potlood → `openCustomer(id,'klantgegevens')`; mail → enkel-mail-modal; ⋯ → "Klant verwijderen" (bevestigmodal "Weet je zeker dat je X wilt verwijderen? Dit kan niet ongedaan worden gemaakt.") → `deleteCustomer(id)` (customerService; kan een waarschuwingstekst teruggeven, o.a. prullenbak `import_genegeerd`), daarna `verversGedeeld()`.
- Paginering: client-side, `PER_PAGE = 50` (`:490`), pager met ±2 pagina's, eerste/laatste + "…". Filterwijziging → pagina 1.
- Sortering: geen (volgorde = `customers` uit gedeelde dataset).
- Kop: "Database" + "N klanten" of "X van N klanten" als filters actief.
- Laadstaat: "Database laden…"; leeg: "Geen klanten gevonden met deze filters." / "Geen klanten."; fout: toast `err.message || 'Laden mislukt'`.

### 1.4 Zoeken en filters
- Zoek "Zoek klant…" — alleen op `c.name` (case-insensitive substring).
- Snel-tab (in URL `?tab=`): `alle` | `lopend_project` (project met status `in_uitvoering`/`gepland`).
- Snelfilters-balk: Stad, Project status (uit `PROJECT_STATUS_OPTIONS`: gepland / in_uitvoering / afgerond), Laatste contact (7/30/90/180 dagen), en per gekoppelde boekhouding "Moneybird sync" / "SnelStart sync" / "AFAS sync" (alle drie schrijven naar hetzelfde filterveld `heeftMoneybird` en testen op `c.moneybirdId` — bekende eigenaardigheid).
- Zijbalk-filters (`EMPTY_FILTERS`, `:35-56`; UI `:1209-1405`), secties:
  - **Klant**: stad/regio, aangemaakt van/tot, KvK (alles/heeft/geen), boekhoudsync, "Nog nooit een project", laatste contact ouder dan (dagen)
  - **Projecten**: status (multi), startdatum van/tot, deadline van/tot, overschrijding uren (`usedHours > quotedHours`), heeft lopend project, medewerker (`ownerId`)
  - **Offertes**: status (multi, `OFFERTE_STATUS_OPTIONS`), verlopen (`status==='verzonden' && geldigTot < vandaag`), digitaal ondertekend (`signedAt`), bedrag min/max (`totaalIncl`)
  - **Facturen**: status (multi, `FACTUUR_STATUS_OPTIONS`), vervallen, herinnering 1/2 verstuurd (`herinnering1VerstuurdAt`/`herinnering2VerstuurdAt`), creditnota (`isCredit`), betaald van/tot (`betaaldOp`)
  - **CRM Pipeline**: fase (multi, `stages`), verloren-reden (multi; `lost_reasons` + historische `deal.lostReason`), dealwaarde min/max, open activiteiten, activiteitstype (`call, email, visit, task, follow`)
  - **Communicatie**: heeft mail (ja/nee), laatste mail ouder dan (dagen), mailtype (`sent_emails.related_type` uit template-types)
  - **Uren**: heeft factureerbare uren (werkbonuren via werkbon → klant/project)
  - **Documenten**: heeft offertes / facturen / getekende offerte / onbetaalde facturen / verlopen offertes, periode van/tot (offerte `createdAt` of factuur `factuurdatum`)
- "Wis filters" reset filters + tab + zoekterm.
- **Segmenten**: opgeslagen in `localStorage['bb_db_segments']` als `[{name, filters}]` (`:482, 725-739`) — alleen lokaal per browser, niet in de database. Klik = filters toepassen; ✕ = verwijderen.

### 1.5 Selectie en bulkacties (balk onderaan bij ≥1 selectie, `:1580-1640`)
- Selecteer-alles werkt per pagina (indeterminate-checkbox).
- Menu-items: E-mail versturen · Exporteren als Excel · Exporteren als CSV · Segment opslaan · Download offertes (PDF) · Download facturen (PDF) · Download creditfacturen (PDF) · Download getekende offertes · Download alles (ZIP).
- **Bulk-mail** (`handleSendMail`, `:786-814`): template-keuze uit `email_templates` (vult onderwerp + body), variabelen `{{klant_naam}}`/`{{bedrijfsnaam}}` (beide = klantnaam). Per klant met e-mail: `send-email` → `logSentEmail({relatedType: tpl.type||'algemeen', customerId})` → klanttijdlijn `logTijdlijnSafe(id,'email_verstuurd',…)`. Klanten zonder e-mail overgeslagen; toast "Mail verstuurd naar X klanten, Y overgeslagen". Validatie: onderwerp en bericht verplicht.
- Exports en ZIP's: zie §7.

---

## 2. Team (`page: 'team'`) — `src/pages/TeamPage.jsx`, `src/services/teamService.js`, `src/services/permissionsService.js`, `src/config/permissions.js`

### 2.1 Zichtbaarheid
- Pagina: recht `team` (UI-gate). In Groei voor iedereen zichtbaar.
- **Alle beheeracties alleen voor `role==='admin'`** (`isAdmin`, `TeamPage.jsx:444`): uitnodigen, bewerken, rechten, (de)activeren, verwijderen. Niet-admin met `team`-recht ziet alleen de lijst.
- Uitnodigen: `guardLimiet('gebruikers', …)` (`:546`) → readonly of limiet bereikt → naar abonnementspagina (`?reden=gebruikers`). Kop toont `<PlanStand limiet="gebruikers"/>` (bijv. "1 / 2 gebruikers").
- Rechten-knop alleen bij leden met `role !== 'admin'`, via `guardFeature('rollen_rechten', …)` (`:638`) — feature alleen in Team (of niet als module te koop). Knop half-transparant zonder feature.

### 2.2 Gegevens (`teamService.getTeamMembers`, `:57-107`)
- `profiles` select `id, company_id, full_name, role, actief, avatar_url, created_at` `.eq('company_id')` order `created_at` → echte leden (status `actief` of `inactief` uit `profiles.actief`).
- `company_members` select `*` `.eq('company_id').is('profile_id', null)` → openstaande uitnodigingen. Kolommen: `id, company_id, profile_id, email, full_name, phone, role, status, hours_per_week, avatar_url, invited_at, accepted_at, created_at, updated_at, invite_token, invite_expires_at, invite_company_name, invite_email_failed_at, invite_email_error`.
- `company_members` select `profile_id, email` (not null profile_id) → e-mailadressen van geaccepteerde leden (RLS: admin alles, medewerker alleen zichzelf). Eigen e-mail uit `supabase.auth.getUser()`.
- Eigenaar: `companies.eigenaar_id` (`getEigenaarId`, `:288-295`).
- Let op: voor echte leden komen telefoon en uren/week niet mee (`phone:''`, `hoursPerWeek:0` in `profileToMember`).

### 2.3 Lijst en UI
- Statkaarten: Totaal · Actief · Uitgenodigd.
- Tabel: Naam (avatar of initialen; "Geen naam") · Rol (badge Admin / Planner / Medewerker + "Eigenaar") · Status (Actief / Uitgenodigd / **Mail mislukt** als `invite_email_failed_at` gezet, tooltip met fout / Inactief) · E-mail · Uren/week · acties.
- Geen zoeken, filters, sortering of paginering.
- Laden "Laden…"; leeg "Nog geen teamleden — Nodig je eerste teamlid uit via de knop rechtsboven."; fout toast.

### 2.4 Uitnodigen (`InviteModal`, `TeamPage.jsx:37-136`; `inviteTeamMember`, `teamService.js:124-234`)
- Velden: E-mailadres* · Volledige naam · Telefoonnummer · Rol (`medewerker` | `admin`) · Uren per week (0-60).
- Insert in **`company_members`** met `status:'uitgenodigd'`, `invite_token = crypto.randomUUID()`, `invite_expires_at = nu + 48 uur`, `invite_company_name`.
- Mail: **geen eigen Edge Function** — de client bouwt HTML (`mailTemplate`) en verstuurt via **`send-email`** met `fromName:'BossBase'`, onderwerp "Je bent uitgenodigd voor {bedrijf} op BossBase", knop "Accepteer uitnodiging" naar `https://www.bossbase.nl/uitnodiging/{token}` (hardcoded productie-URL), "48 uur geldig". Mislukt de mail → `company_members.update({invite_email_failed_at, invite_email_error})` en toast "Teamlid toegevoegd maar e-mail niet verstuurd: …".
- **Opnieuw versturen bestaat niet** in de UI (alleen een opmerking in de service dat het "gewoon kan"). Een mislukte/verlopen uitnodiging kan alleen verwijderd en opnieuw aangemaakt worden.
- Server: gebruikerslimiet afgedwongen met restrictive policy op `company_members`.

### 2.5 Bewerken (`EditModal`, `:138-267`)
- Velden: avatar (`AvatarUpload`), Volledige naam, Telefoonnummer, Rol (medewerker/admin; `planner` alleen als huidige waarde), Uren per week.
- Opslaan `updateTeamMember(id, payload)` (`teamService.js:238-284`):
  - uitnodiging (id in `company_members`) → directe update op `company_members`
  - echt lid → RPC **`bb_teamlid_bijwerken`**(`p_profile_id, p_rol, p_naam, p_telefoon, p_uren`) (rol op profiles is via trigger `protect_profile_privileges` beschermd).
- Rol vergrendeld (`rolInfo`, `:504`): eigenaar (als jij niet de eigenaar bent) — "De eigenaar van het account kan alleen door de eigenaar zelf worden aangepast."; laatste actieve admin — "Dit is de laatste beheerder van het bedrijf. Wijs eerst een andere beheerder aan."
- Avatar teamlid: `uploadTeamMemberAvatar` → bucket `avatars` pad `{companyId}/{memberId}/avatar-{ts}.{ext}` → `company_members.avatar_url` (let op: voor echte leden is `member.id` een profiel-id, dus deze update raakt dan `company_members` niet — bestaande eigenaardigheid). Verwijderen → `avatar_url = null` + bestand weg.

### 2.6 (De)activeren / verwijderen
- Edge Function **`delete-team-member`** body `{memberId, action: 'activate'|'deactivate'|'delete'}` (`teamService.js:303-332`).
  - deactivate: `profiles.actief=false` + auth-ban + status inactief (omkeerbaar); activate: omgekeerd; delete: auth-user + profiel weg, cascade company_members/uren, `assigned_to` → NULL.
  - Server-regels (`supabase/functions/delete-team-member/index.ts`): caller admin van hetzelfde bedrijf of super-admin; niet jezelf; eigenaar niet verwijderbaar en alleen door eigenaar aan te passen; laatste actieve admin beschermd.
- UI: eigen rij toont "Jij", eigenaar "Beschermd"; knoppen Deactiveren/Activeren en prullenbak (bevestiging `window.confirm('Teamlid verwijderen?')`); disabled bij laatste admin.

### 2.7 Rechten per lid (`PermissionsModal`, `:269-439`; `src/config/permissions.js`)
- Laden: `getUserPermissions(profileId)`; opslaan: `setUserPermissions(userId, companyId, granted[])` = **delete alle rijen** `user_permissions` voor user + **insert** `{user_id, company_id, permission, granted:true}` (`permissionsService.js:17-40`).
- Niet-geaccepteerd lid (geen `profileId`): melding "Dit teamlid heeft de uitnodiging nog niet geaccepteerd…", opslaan uitgeschakeld.
- Knoppen "Alles aan" / "Alles uit"; hoofdrecht = tri-state master-vinkje (niet opgeslagen); info-icoon per recht toont `uitleg`.
- Waarschuwing (`window.confirm`) bij aanzetten van `WARN_ON_ENABLE = ['alles_inzien']`.
- **Volledige rechtenlijst** (groep → `key` — label — korte regel):
  - **Klanten & Verkoop** (`klanten_verkoop`)
    - `klanten_bewerken` — Klanten bewerken — Klanten aanmaken en gegevens wijzigen
    - `klanten_verwijderen` — Klanten verwijderen — Klanten definitief verwijderen
    - `verkoop` — Verkooppijplijn — Deals en leads bekijken en beheren
  - **Uitvoering (projecten, werkbonnen, planning)** (`uitvoering`)
    - `projecten` — Projecten — De Projecten-pagina openen
    - `projecten_bewerken` — Projecten bewerken — Alle projecten aanmaken en bewerken
    - `werkbonnen_bewerken` — Werkbonnen bewerken — Alle werkbonnen bewerken + materiaalkosten
    - `planning` — Planning — Inplannen, weekplanning, agenda van collega's
    - `alles_inzien` — Alle projecten & werkbonnen inzien — Brede inzage in werk van collega's (waarschuwing)
    - `agenda_inzien` — Elkaars agenda inzien — Agenda's van collega's bekijken
  - **Financieel** (`financieel`)
    - `projectbedragen` — Projectbedragen zien — Bedragen en marges op projecten/werkbonnen
    - `bedrijfsfinancien` — Bedrijfsfinanciën zien — Omzet, winst en marges van het bedrijf
    - `offertes` — Offertes — Offertes maken, versturen en inzien
    - `facturen` — Facturen — Facturen maken, versturen en inzien
    - `inkoopprijzen` — Inkoopprijzen zien — Inkoopprijs en marge op materialen (server-side via `bb_mag_inkoopprijs_zien()`)
    - `kosten` — Kosten — Kosten en inkoop registreren en inzien
  - **Beheer** (`beheer`)
    - `team` — Team beheren — Team-pagina openen (beheer blijft bij admin)
    - `instellingen` — Instellingen — Bedrijfsinstellingen beheren
    - `database` — Database & Export — Gegevens bekijken en exporteren naar Excel
- RLS (`bb_has_permission`) op: `klanten_bewerken, klanten_verwijderen, verkoop, offertes, facturen, kosten, planning, projecten_bewerken, werkbonnen_bewerken, alles_inzien, agenda_inzien`. Alleen UI-gate: `projectbedragen, bedrijfsfinancien, database, instellingen, team` (`permissions.js:11-15`).
- `DEFAULT_MEDEWERKER_PERMISSIONS = ['projecten']` staat in config maar wordt nergens in `src/` gebruikt (niet geverifieerd waar de standaard wordt gezet).

### 2.8 Rollen
- `admin` (alles), `medewerker` (standaard), `planner` (legacy: medewerker met impliciet `planning`-recht). `manager` komt alleen voor als label in de uitnodigingsmail (`roleLabels`), niet selecteerbaar.
- Eigenaar = `companies.eigenaar_id` (beschermd).
- Groei: geen `rollen_rechten` → `user_permissions` blijft leeg, maar `gedeelde_werkruimte` maakt de inzagerechten vrij. Starter: 1 gebruiker, uitnodigen blokkeert op limiet.

### 2.9 MemberMultiSelect (`src/components/MemberMultiSelect.jsx`)
- Geen Team-pagina-onderdeel: chip-multiselect van teamleden (`value` = profiel-id's, leeg = "niet toegewezen", "Geen teamleden" als lijst leeg). Gebruikt in `WerkbonVoertuigenBlok`, `AssigneeResponsibleSelect`, `SharedModals`, `PlanningPage`, `ProjectDetailDrawer`.

---

## 3. Instellingen (`page: 'instellingen'`) — `src/pages/InstellingenPage.jsx`

### 3.1 Tabs en zichtbaarheid (`TABS`, `:1213-1226`; tab in `?tab=`, `SETTINGS_TAB_IDS`)
| Tab-id | Label | Zichtbaar als |
|---|---|---|
| `profiel` | Mijn profiel | altijd (iedereen) |
| `bedrijf` | Bedrijfsprofiel | `can('instellingen')` |
| `standaard` | Standaardwaarden | `can('instellingen')` |
| `templates` | E-mailtemplates | `can('instellingen')` |
| `pipeline` | Pipeline | `can('instellingen')` (wijzigen alleen admin) |
| `voertuigen` | Voertuigen | `can('instellingen')` + admin + `plan.has('voertuigen')` |
| `abonnement` | Abonnement | `can('instellingen')` + admin |
| `integraties` | Integraties | `can('instellingen')` |
- `instellingen` zit níet in `INZAGE_RECHTEN`, dus ook in Groei is het recht/admin nodig. Zonder recht wordt niets van bedrijfsdata of integraties geladen (`:417-419`).
- Geen readonly-guards in de UI van Instellingen; server-policies blokkeren.
- **Bestaat niet** in het dashboard (expliciet nagezocht): bedrijfs-IBAN, betaaltermijn-instelling, factuur-/offertenummering (prefix/volgnummer), werkbon-instellingen, uursoorten (tabel `uursoorten` is op 31-08 weer verwijderd, migratie `20260831130000_uursoorten_terug.sql`), websiteformulier-instellingen, standaardmarge-veld (kolom `standaard_marge` bestaat, wordt niet getoond). Betaalherinneringen zijn instelbaar via de e-mailtemplates `herinnering_1/2`.
- Globale laadstaat "Laden…" (één kaart); fouten via toast.

### 3.2 Mijn profiel (`:1724-1945`)
- Persoonsgegevens: Naam (opslaan alleen als gewijzigd en niet leeg → `updateProfile(id,{full_name})` op `profiles`), E-mailadres (read-only, info "kan niet worden gewijzigd"), Rol (read-only).
- Profielfoto: `AvatarUpload` → `uploadProfileAvatar` (bucket `avatars`, `{companyId}/{profileId}/avatar-{ts}.{ext}`, max 5 MB, jpg/png/webp) → `profiles.avatar_url`; verwijderen zet null.
- Wachtwoord wijzigen: Huidig / Nieuw / Herhaal (eisen via `PasswordRequirements`/`passwordValid`) → `changePassword()` = `signInWithPassword` met huidig (fout "Huidig wachtwoord is onjuist") + `auth.updateUser({password})`.
- Gevarenzone (`handleDeleteAccount`, `:1294-1327`), bevestigen door "VERWIJDEREN" te typen:
  - Eigenaar (of admin zonder vastgelegde eigenaar, `zegtBedrijfOp`): eerst Edge Function **`billing-cancel`** (via `zegOp()`; fout `geen_abonnement` wordt genegeerd, andere fout stopt alles) → RPC **`cancel_company_account`** → toast "Je bedrijf is gesloten…" → uitloggen.
  - Anderen: RPC **`delete_own_account`** (deactiveert alleen zichzelf) → uitloggen.

### 3.3 Bedrijfsprofiel (`:1946-2064`; tabel `companies` via `updateCompany`, `src/services/profileService.js:172-193`)
- Logo: upload jpg/png (geen svg/webp), max 10 MB, gecomprimeerd (`comprimeerAfbeelding`, `LOGO_MAX_ZIJDE`, transparantie behouden) → bucket **`bedrijf-logos`** pad `{companyId}/logo.{ext}` (upsert) → oude `logo.*` opgeruimd → `companies.logo_url` (`uploadLogo`, `:533-588`). Achtergrondupload via upload-indicator.
- Merkkleur (`branding_color`, kleurkiezer + hex, standaard `#1DDB62`, gebruikt in offertes/facturen).
- Velden → kolommen: Bedrijfsnaam `name` · E-mailadres `email` · Antwoord e-mailadres `reply_to_email` · Telefoonnummer `phone` · KvK-nummer `kvk` (8 cijfers) · BTW-nummer `btw_number` · Website `website` · Adres `address` · Postcode `postal_code` · Stad `city`.
- Validatie (`saveBedrijf`, `:590-621`): e-mailformaat (email + reply-to), KvK `^\d{8}$`. Toewijsbare kolommen beperkt tot die lijst + `logo_url`, `branding_color`.

### 3.4 Standaardwaarden (`:2065-2373`; tabel **`bedrijfsinstellingen`**, één rij per bedrijf, upsert via `upsertBedrijfsinstellingen`, `src/services/instellingenService.js:89-150`)
- Kaart "Standaardwaarden": Uurtarief €/uur `uurtarief` (55) · Reiskosten €/km `reiskosten_per_km` (0,23) · BTW % `btw_pct` (21) · BTW-stelsel `btw_stelsel` (`factuur` = omzet op factuurdatum | `kas` = op betaaldatum) · Offerte geldig (dagen) `offerte_geldig_dagen` (14).
- Kaart "Herinneringen" (urenherinnering voor medewerkers): Aan/Uit + Herhalen `uren_herinnering_interval_min` (0=uit; 15/30/60/120/240) · Voor wie (alle | per medewerker → opgeslagen als uitsluitlijst `uren_herinnering_uitgesloten` met profiel-id's; lijst = actieve, niet-admin leden met naam) · Wanneer `uren_herinnering_moment` (`na_werkdag` | `einde_dag` | `volgende_ochtend`) · Op welke dagen `uren_herinnering_dagen` (ISO 1-7) · Hoe `uren_herinnering_mail` (app | app + mail).
- Kaart "Agenda": eerste/laatste zichtbare uur `agenda_start_uur` (7) / `agenda_eind_uur` (20).
- Kaart "Eigen prijzen / eenheden" (tabel **`eigen_eenheden`**: `naam*`, `standaard_prijs`, `eenheid_label`, `btw_pct` (null = bedrijfsstandaard)); lijst + Bewerken/verwijderen (confirm "Bestaande offertes/facturen behouden hun bedrag"). Verschijnen als regeltype naast Uren/Km/Overig in offertes/facturen (`src/services/eigenEenheidService.js`).
- Alle drie de kaarten slaan hetzelfde `standaardForm` op ("Standaardwaarden opgeslagen").

### 3.5 E-mailtemplates (`:2374-2701`; tabel **`email_templates`**: `id, company_id, type, name, onderwerp, body, body_html, is_default, actief, auto_versturen, auto_dagen`)
- Sub-tab per type in `?sub=`. Standaardtypes (`ALL_TEMPLATE_CONFIGS`, `:70-84`):
  | type | label | variabelen | auto-toggle | dagen | feature voor auto |
  |---|---|---|---|---|---|
  | `offerte` | Offerte | klant_naam, bedrijfsnaam, offerte_nummer, totaal_bedrag, vervaldatum, link | nee | – | – |
  | `offerte_geaccepteerd` | Offerte geaccepteerd | klant_naam, bedrijfsnaam, offerte_nummer | nee | – | – |
  | `factuur` | Factuur | klant_naam, bedrijfsnaam, factuur_nummer, totaal_bedrag, vervaldatum, betaalinstructie | nee | – | – |
  | `herinnering_1` | Herinnering 1 | klant_naam, bedrijfsnaam, factuur_nummer, totaal_bedrag, vervaldatum | ja | dagen na vervaldatum | `betaalherinneringen` |
  | `herinnering_2` | Herinnering 2 | idem | ja | dagen na vervaldatum | `betaalherinneringen` |
  | `aanvraag_ontvangen` | Aanvraag ontvangen | klant_naam, bedrijfsnaam | ja | – | – |
  | `afspraak_bevestiging` | Afspraak bevestiging | klant_naam, bedrijfsnaam, afspraak_datum, afspraak_tijd | ja | – | – |
  | `afspraak_herinnering` | Afspraak herinnering | idem | ja | dag(en) voor afspraak | – |
- Per template: Actief-vinkje, variabele-chips (klik = invoegen), Onderwerp, Berichttekst (rich `NoteEditor`), Automatisch verzenden + "Verzenden na N dagen" (zonder feature: tekst "Automatisch verzenden zit in Groei en Team" + knop naar abonnement), "Reset" (confirm "Template terugzetten naar standaard?", zet `DEFAULT_BODY` terug), Opslaan → `updateEmailTemplate`. Uitleg `{{betaalinstructie}}` (Stripe vs. overschrijving).
- Eigen templates: knop (tooltip "Nieuw template aanmaken") alleen met feature `eigen_email_templates` (Groei+), anders naar abonnement. Velden Naam*, Type/slug (auto, uniek, niet een standaardtype), Onderwerp, Berichttekst; variabelen `NEW_TEMPLATE_VARS`. Verwijderen alleen eigen templates (confirm).
- Leeg: "Geen e-mailtemplates gevonden — voer de database-migratie uit".
- Automatisch versturen draait server-side (cron Edge Function `check-herinneringen`, slaat bedrijven zonder feature over).

### 3.6 Pipeline (`:2702-2972`)
- "Koppeling met uitvoering" — tabel **`pipeline_koppelingen`** (`company_id, moment, stage_id, updated_at`; upsert on `company_id,moment`). Momenten (`PIPELINE_MOMENTEN`, `instellingenService.js:282-295`): `akkoord`, `gepland`, `in_uitvoering`, `gefactureerd`, `betaald`, `verloren` → keuze fase of "— Niet gekoppeld —". Select disabled voor niet-admin.
- Pipelinefasen — tabel **`pipeline_stages`** (`name, position, color_class`): toevoegen (naam + kleur uit vaste set `STAGE_COLOR_OPTIONS`), inline hernoemen/kleur, verwijderen (confirm, meldt geraakte koppelingen). Alleen admin. `reorderPipelineStages` bestaat in de service maar wordt hier niet gebruikt (geen herordenen in UI).
- Verloren-redenen — tabel **`lost_reasons`** (`label, position`): toevoegen/hernoemen/verwijderen (alleen admin; bestaande deals houden hun tekst).

### 3.7 Voertuigen (`:2973-3085`; tabel **`voertuigen`**: `naam*, kenteken, zitplaatsen (1-99, leeg = geen limiet), kleur, actief`)
- Alleen admin + feature `voertuigen`. Toevoegen, inline bewerken (incl. actief/inactief), verwijderen. Kolommen Naam · Kenteken · Zitplaatsen · Kleur · Status.

### 3.8 Abonnement-tab → `AbonnementSectie` (zie §5.2). Integraties-tab → zie §4.

---

## 4. Integraties (Instellingen-tab `integraties`) — `src/components/Integraties.jsx`, config `INTEGRATIES` in `InstellingenPage.jsx:1397-1700`

### 4.1 Opbouw
- Overzicht van kaarten (logo, omschrijving, statuspill: groen "Actief" of neutraal; bij ontbrekend pakket de gate-pill "Vanaf Groei/Team"). Klik → drawer met tabs **Koppeling** / **Instellingen** (alleen indien gezet) / **Synchroniseren** (alleen indien gezet). Items met `verborgen: true` worden niet getoond.
- Pakket-gate boekhouding: `boekhoudGate` als `!plan.has('boekhoudkoppeling')` → pill "Vanaf Groei", knop "Bekijk opties" → abonnement (`?reden=feature&key=boekhoudkoppeling`).
- Tokens worden nooit teruggelezen of voorgevuld; alleen status via RPC.
- `SyncBanner` (`src/components/SyncBanner.jsx`): vaste balk "Bezig met … · mm:ss · laat dit scherm open" tijdens SnelStart/Moneybird-import of contactsync.
- `SyncIndicator` (`src/components/SyncIndicator.jsx`): groen vinkje "Gesynchroniseerd met {Moneybird|AFAS|SnelStart}" op klant (`BbPages1.jsx:688`) en leverancier (`LeverancierPage.jsx:255`) als provider actief (RPC `get_accounting_status` via `getActieveKoppelingen`) én entiteit `moneybirdId`/`afasId`/`snelstartId` heeft.

### 4.2 Koppelingen
| id | Zichtbaar | Gate | Hoe koppelen | Status | Acties |
|---|---|---|---|---|---|
| `google` | **verborgen** in Instellingen (demo-stub met lokale state) | – | Echte koppeling zit in Agenda (`BbPages2.jsx:366-400`): OAuth via Edge Function **`google-calendar-auth-url`** (redirect naar Google, terug op `/dashboard/calendar?google=connected|error&google_msg=`; callback **`google-calendar-callback`**) | RPC **`google_calendar_status`** → `{connected, google_email, google_calendar_id}` | Ontkoppelen RPC **`google_calendar_disconnect`**; sync per activiteit **`sync-activity-to-google`** (`{activityId, auto}`) |
| `stripe` | altijd | feature `stripe_betaallink` (Team of module bij Groei) | Stripe Connect onboarding: Edge Function **`stripe-connect-start`** → redirect; terug op `?tab=integraties` | tabel **`stripe_connections`** (`stripe_account_id, charges_enabled, payouts_enabled, details_submitted, onboarding_status`); label "Actief" (charges_enabled) / "In verificatie" (account zonder charges) / "Niet gekoppeld"; live verversen **`stripe-connection-status`** | Status vernieuwen, Ontkoppelen (`stripe_connections` delete; confirm "Je account bij Stripe blijft bestaan"); per factuur **`stripe-create-payment-link`** |
| `moneybird` | altijd | `boekhoudkoppeling` | API-token + administratie-ID → test **`moneybird-test`** → opslaan RPC **`save_accounting_connection`** | RPC **`get_accounting_status`** (rijen `provider, administration_id, afas_environment_id, connected, last_synced_at`) | Wijzigen; Sync-tab: "Kosten importeren" (**`moneybird-import-kosten`** + daarna 2× **`moneybird-sync-btw`** kwartaal/maand), "Contacten synchroniseren" (**`moneybird-sync-contacten`**); per factuur **`moneybird-sync-factuur`**, per klant **`moneybird-update-contact`** |
| `snelstart` | altijd | `boekhoudkoppeling` | (a) Eén-klik-activatie: RPC **`snelstart_referentie`** → `https://web.snelstart.nl/couplings/activate/{AppShortName}?referenceKey=&successUrl=` (alleen als `VITE_SNELSTART_APP_SHORTNAME` gezet, `src/config/snelstart.js`); terug op `?tab=integraties&snelstart=gekoppeld`, sleutel komt via webhook **`snelstart-webhook`**, UI pollt 30 s (status wachten/gelukt/uitgebleven). (b) Terugval: koppelsleutel invoeren → test **`snelstart-test`** → **`save_accounting_connection`** → check **`snelstart-administratie-check`** | `get_accounting_status`; laatste nachtelijke run uit tabel **`accounting_sync_runs`** (bron `cron`) | Loskoppelen RPC **`disconnect_accounting_connection`**(`p_provider`); Instellingen-tab = `GrootboekIndeling` (§4.3); Sync-tab: "Kosten/facturen synchroniseren" (**`snelstart-import-kosten`**), "Contacten synchroniseren" (**`snelstart-sync-contacten`**); meldingen voor adres-waarschuwingen, resterende kosten, fouten; per factuur **`snelstart-sync-factuur`** |
| `afas` | altijd | `boekhoudkoppeling` | Omgevings-ID + App token → **`afas-test`** → **`save_accounting_connection`**; `setAfasConnected` schrijft `accounting_connections` | `get_accounting_status`; label Actief / Niet getest / Niet gekoppeld | Kosten importeren **`afas-import-kosten`**, Contacten synchroniseren **`afas-sync-contacten`** |
- Vaste werkwijze sync (tekst `VASTE_WERKWIJZE`): alle facturen behalve concepten, kosten altijd mee, uit boekhouding opgehaalde facturen gaan nooit terug.
- Tokens staan in `accounting_connections` (kolommen niet leesbaar voor `authenticated`).

### 4.3 GrootboekIndeling (`src/components/GrootboekIndeling.jsx`, alleen SnelStart, inline in Instellingen-tab van de drawer)
- Grootboekrekeningen ophalen via Edge Function **`snelstart-grootboek-setup`**; voorkeuren in tabel **`grootboek_voorkeuren`** (sleutel `kosten:{categorienaam}` / `omzet:{btw-regime}` / `omzet:overig`).
- Kostencategorieën beheren — tabel **`kosten_categorieen`** (`naam, standaard, actief, bon_verplicht, volgorde`; uniek per `company_id,naam`): toevoegen, actief/inactief, verwijderen alleen als ongebruikt in `job_costs.category` en niet standaard (`src/services/kostenCategorieService.js`). Zes standaardcategorieën bestaan per bedrijf (niet hernoembaar).
- Zelf toegevoegde categorie zonder rekening = verplicht veld.
- "Alles opnieuw ophalen" (`haalAllesOpnieuwOp`, `accountingService.js:413`): leegt tabel **`import_genegeerd`** voor provider `snelstart` en draait contacten- + kostensync (confirm).

---

## 5. Abonnement

### 5.1 Abonnementspagina (`page: 'abonnement'`) — `src/pages/AbonnementPage.jsx`
- Geen recht/feature-gate op de route. Betaalknoppen alleen als `getBillingStatus().magBeheren` (eigenaar/admin); anders kaart "Het abonnement aanpassen doet de beheerder…" + knop "Laat mijn beheerder weten" → insert in tabel **`upgrade_requests`** (`gewenst_plan, gewenste_modules, aanleiding`) (`planService.requestUpgrade`). Die rijen worden nergens in `src/` getoond.
- Data: RPC **`get_billing_status`** (`billingService.js`) → `tier, status, stripeStatus, heeftStripe, billingInterval, extraGebruikers, trial, trialEindigtOp, periodeStart, verlengtOp, opzeggenPerEindePeriode, welkomstactie, heeftVerplichting, verplichtingTot, stoptNaLooptijd, magDirectOpzeggen, opzegbaarPer, stoptOp, welkomstactieGekozenOp, websiteAanvraag, magBeheren, readonly, readonlyReden, modules[], limieten{}`.
- Aanleiding uit URL (`?reden=readonly|gebruikers|limiet|feature|abonnement&key=&actie=`) → banner met kop/uitleg + voorstel (`bedenkVoorstel`, `src/lib/upgradeVoorstel.js`).
- Keuzes: betaaltermijn maand/jaar (alleen zonder lopend Stripe-abonnement; standaard jaar), welkomstactie (verplicht bij jaar), pakketkaarten Starter/Groei (aanbevolen)/Team met USP's en limieten, modules (alleen kopen wat het pakket toestaat; voertuigen trekt planning mee), aantal gebruikers (plafond = tierlimiet), vergelijkingstabel (uitklapbaar), afrekenbalk met totaal en verschil t.o.v. huidig.
- Bij lopend abonnement: RPC **`bb_mag_wisselen`**(`p_doel_tier`) → `{mag, richting, code, reden, verplichtingTot, blokkades[], looptijdReset}`; looptijd-reset moet expliciet worden bevestigd. RPC **`bb_downgrade_blokkades`**(`p_doel_tier`) bestaat in service.
- Bevestigen: lopend → Edge Function **`billing-wijzig`** (`{tier, extra_gebruikers, modules}`); nieuw → **`billing-checkout`** (`{tier, interval, extra_gebruikers, modules, welkomstactie}`) → redirect Stripe Checkout. Foutcodes: `downgrade_geblokkeerd`, `boven_limiet` (toont blokkades), `gebruik_portal` (valt terug op billing-wijzig).
- Terugkeer: `CheckoutTerugkeer` (`src/components/CheckoutTerugkeer.jsx`) leest `?checkout=gelukt|geannuleerd`, pollt `get_billing_status` elke 1,5 s tot 25 s, herkomst uit `sessionStorage['bb.upgrade.herkomst']`.
- Laadstaat "Even kijken wat je nu hebt…"; fout in kaart.

### 5.2 Instellingen → Abonnement (`src/components/AbonnementSectie.jsx`, alleen admin)
- Toont: tier, statuspill (`trial` Gratis uitproberen / `actief` / `betaalprobleem` Betaling mislukt / `opgezegd`, + "stopt {datum}"), maandbedrag (`tierPrice + extraGebruikers × €10`), proef-einddatum, verlengt/stopt op, limietregels, welkomstactie + status website-aanvraag (`open, gegevens_gevraagd, in_behandeling, opgeleverd, geannuleerd`), modules, jaarverplichting-uitleg, readonly-melding.
- Acties (alleen `magBeheren`): met Stripe → "Abonnement wijzigen" (naar pagina), "Facturen en betaalmethode" (Edge Function **`billing-portal`** → Stripe portal), "Opzeggen" / "Opzeggen per einde looptijd" / "Opzegging intrekken" (Edge Function **`billing-cancel`** `{herstel}`; confirm). Zonder Stripe → "Abonnement afsluiten".

---

## 6. Overige pagina's en routes (niet in de hoofdlijst)

### 6.1 Publieke routes (`src/App.jsx:1661-1760`, paden in `src/lib/appRoutes.js`)
| Route | Component | Data / functies | Opmerkingen |
|---|---|---|---|
| `/cookieverklaring` | `CookieverklaringPage` | statisch | – |
| `/betaal/{token}` | `BetaalPage` (`src/pages/BetaalPage.jsx`) | RPC **`get_payment_branding`**(`p_token`), Edge Function **`stripe-pay-link`** `{token}` → redirect | Permanente betaallink op factuur. Staten: voorbereiden, doorsturen, "Deze factuur is al betaald", "Online betalen niet beschikbaar", "Betaallink ongeldig", "Er ging iets mis" |
| `/betaald`, `/betaling-geannuleerd` | `BetaalStatusPage` | – | Bedankpagina na Stripe-betaling van eindklant |
| `/login` | `LoginPage` (`BbAuth.jsx:18`) | `auth.signInWithPassword`; wachtwoord vergeten → **`request-password-reset`** | – |
| `/register` | `RegisterFlow` (`BbAuth.jsx:292`) | `auth.signUp`, RPC **`provision_account`**, **`get_invite_company_for_current_user`**; stappen Account/Bedrijf/Setup/Team | Daarna e-mailverificatie-gate `EmailVerificationScreen` (**`request-verification-code`**, **`verify-code`**, 6 cijfers) voor profielen zonder `company_id` en zonder `email_verified_at` |
| `/reset-password?token=` | `ResetPasswordPage` | **`apply-password-reset`** (`{token, checkOnly:true}` dan `{token, newPassword}`) | Staten: checking, Link verlopen (`EXPIRED`), Link al gebruikt (`USED`), Ongeldige resetlink (`INVALID`), "Wachtwoord gewijzigd!" |
| `/uitnodiging/{token}` | `UitnodigingPage` | GET Edge Function **`get-invite?token=`** (anon) → `{email, fullName, companyName, expired?, error?}`; accepteren **`accept-invite`** `{token, fullName, password}` → daarna `signInWithPassword` → `/dashboard` | Velden e-mail (vast), naam, wachtwoord ×2. Staten: laden, "Uitnodiging verlopen", "Uitnodiging niet gevonden", "Welkom bij {bedrijf}!". Server: rol uit uitnodiging (standaard medewerker), bestaand account in ander bedrijf wordt nooit verplaatst |
| `/offerte/{token}` | `OfferteSigneren` | RPC's **`get_offerte_by_sign_token`**, **`get_offerte_items_by_token`**, **`get_company_by_sign_token`**, **`get_customer_by_sign_token`** (`p_token`); tekenen via `signOfferte` → Edge Function **`sign-offerte`** (met client-gegenereerde getekende PDF base64); nazenden **`getekende-pdf-nazenden`** | Naam + e-mail (voorgevuld uit `sent_to_email`/klant), handtekening-canvas, knop "Akkoord en ondertekenen", PDF downloaden. Staten: niet gevonden, al getekend (`signed_at`), vervangen door nieuwere versie (`vervangen_op`). Feature `digitale_handtekening` (Groei+) bepaalt of de link verstuurd wordt (niet op deze pagina) |
| `/werkbon/{token}` | `WerkbonOndertekenen` | RPC's **`get_werkbon_by_sign_token`**, **`get_werkbon_taken_by_sign_token`**, **`get_werkbon_uren_by_sign_token`**, **`get_werkbon_materialen_by_sign_token`**, **`get_werkbon_notities_by_sign_token`**, **`get_company_by_werkbon_token`**, **`get_customer_by_werkbon_token`**, **`get_werkbon_uitvoerders_by_sign_token`**; foto's via **`sign-werkbon`**; tekenen `signWerkbon` → **`sign-werkbon`** | Klant tekent werkbon af (vaak op telefoon); PDF bekijken/downloaden; staat "afgetekend" bij `ondertekend_op` |
| `/superadmin` | `SuperAdminPage` | zie 6.2 | – |
| `/api/*` | `null` | – | Vercel-serverfuncties (o.a. SnelStart-webhook) |

### 6.2 SuperAdminPage (`src/pages/SuperAdminPage.jsx`, route `src/App.jsx:1736-1750`)
- Intern platformbeheer van BossBase zelf, niet voor klanten: alleen `profile.isSuperAdmin === true` én e-mail in hardcoded allowlist `['info@bossbase.nl','nielsgrevink@gmail.com']`; rendert niets tot rechten geladen zijn.
- Data via Edge Function **`super-admin-data`** (alle bedrijven, abonnementen, aanvragen via bossbase.nl). Acties: bedrijfsstatus (`companies.status`) en abonnement (`subscriptions` plan/status/notities) aanpassen, status van leads/aanvragen via bossbase.nl (`nieuw, in_behandeling, gekwalificeerd, afgewezen, spam`; `super-admin-data` met `actie:'aanvraag_status'`), gratis-website-aanvragen (`WebsiteAanvragen`).
- Waarom niet in de klantapp: leest en wijzigt gegevens van álle tenants (service-role via Edge Function), beheert abonnementen/betaalstatus van klanten en BossBase-salesleads. Dat is operator-tooling, geen tenantfunctionaliteit; in een klantapp is het puur aanvalsoppervlak.

### 6.3 WebsiteAanvragen (`src/components/WebsiteAanvragen.jsx`)
- **Alleen in SuperAdmin** (`SuperAdminPage.jsx:314`): overzicht van "gratis website"-welkomstacties. RPC **`get_website_aanvragen`**; status bijwerken direct op tabel **`website_aanvragen`** (`status`, `opgeleverd_op`). Filter op status (standaard `open`) of alle. Statussen `open` Nieuw, `gegevens_gevraagd`, `in_behandeling` In aanbouw, `opgeleverd`, `geannuleerd`.
- Niet te verwarren met websiteformulier-aanvragen van eindklanten (tabel **`inquiries`**, Edge Function `public-website-inquiry`). `src/services/aanvraagService.js` (lijst/status/omzetten naar klant of lead op `inquiries`) wordt **nergens geïmporteerd** — er is in het dashboard geen eigen "Aanvragen"-pagina (alleen een commentaar in NAV, `App.jsx:102-104`). `inquiries` wordt alleen gelezen als bron op een project (`projectsService.js:238-250`, vereist `verkoop`).

### 6.4 Overlays in de app-shell (geen eigen route)
- `ProfileModal` (`src/components/SharedModals.jsx:1443`): naam wijzigen, link naar Instellingen, uitloggen.
- `BossChat`: AI-assistent, POST naar Edge Function **`boss-chat`** met gesprekshistorie.
- `MeldKnop` (`src/components/Meldpunt.jsx`): bug/idee melden met screenshot → Edge Function **`meldpunt`**; tabel `meldingen`, bucket `meldingen`, instelling in `platform_instellingen`.
- Meldingen/notificaties (topbar): tabel `notifications` (`listNotifications`, markeer (alles) gelezen); aanmaken via **`create-notification`**.
- `UrenHerinneringModal`: pop-up voor ontbrekende uren volgens §3.4-instellingen.
- `CheckoutTerugkeer`, `ReadOnlyBanner` (zie 0.4/5.1).
- `MobileBlock`: op telefoon i.p.v. dashboard, verwijst naar de app.

---

## 7. Exports, imports en bulkacties (hele dashboard)

| Waar | Wat | Techniek | Bestandsnaam |
|---|---|---|---|
| Database (`DatabasePage.jsx:882-899`) | Geselecteerde klanten → Excel, werkblad "Klanten", 24 kolommen: Naam, Email, Telefoon, Adres, Postcode, Stad, KvK-nummer, BTW-nummer, IBAN (klant), Type, Bron, Aantal projecten/offertes/facturen (excl. credit), Totaal gefactureerd/betaald, Openstaand bedrag (komma-decimaal), Laatste project naam/datum/status, Laatste mail datum/onderwerp, Aanmaakdatum, Moneybird gesynchroniseerd (Ja/Nee) | `exceljs` | `BossBase-export-{YYYY-MM-DD}.xlsx` |
| Database (`:901-913`) | Zelfde kolommen als CSV (komma-gescheiden, alles gequote, UTF-8 BOM) | Blob | `BossBase-export-{datum}.csv` |
| Database (`:925-1072`) | ZIP met PDF's per geselecteerde klant: offertes (`Offerte-{nr}-{klant}.pdf`), facturen, creditfacturen (`Creditfactuur-…`), getekende offertes (alleen het echte getekende exemplaar via `getOndertekendePdfUrl`; mislukte worden gemeld, niet vervangen), alles (mappen `Offertes/` + `Facturen/`). PDF's client-side gegenereerd (`getOffertePdfBase64`/`getFactuurPdfBase64`, jsPDF). Voortgangsbalk "x van y …" | `jszip` | `BossBase-offertes-…zip`, `-facturen-`, `-creditfacturen-`, `-getekende-offertes-`, `BossBase-export-{datum}.zip` |
| Database | Na Excel/CSV-export per klant tijdlijnregel `export_uitgevoerd` (`logTijdlijnSafe`) | – | – |
| Database | Bulk-mail naar selectie (zie §1.5) | `send-email` | – |
| Financiën (`BbPages2.jsx:1745-1758`, knop "Exporteren") | CSV per klant: Klant, Stad, Gefactureerd, Kosten, Betaald, Openstaand, Nettoresultaat, Marge (%), Status (Afgerond/In uitvoering) | Blob | `bossbase-financien-export-{datum}.csv` |
| Facturen/Offertes/Werkbonnen (losse documenten) | PDF downloaden: `generateFactuurPdf`/`generateOffertePdf` (`src/utils/generatePdf.js:705-718`, `doc.save`), `downloadWerkbonPdf` (`src/utils/generateWerkbonPdf.js:582`, gebruikt in `WerkbonPageV2.jsx:2026`); publieke ondertekenpagina's bieden ook PDF-download | jsPDF | `{nummer}.pdf`, `Offerte-{nr}.pdf`, `Werkbon-{nr}.pdf` |
| Facturen | Geïmporteerde brondocumenten uit boekhouding: bucket `factuur-pdfs` `{companyId}/{factuurId}.pdf` (signed URL 1 u) | storage | – |
| Imports | **Er is geen CSV-/Excel-import** in het dashboard (geen bestandsinvoer met csv/xls). Enige "import" = boekhoudsync (Moneybird/SnelStart/AFAS: kosten, inkoop-/verkoopfacturen, contacten, btw) via de Edge Functions in §4.2 | – | – |
| `import_genegeerd` (prullenbak SnelStart) | Bij verwijderen in BossBase van een uit SnelStart geïmporteerde klant (`customerService.js:146`), leverancier (`leverancierService.js:120`), factuur (`factuurService.js:300`) of kost (`jobCostService.js:341`) → upsert `{company_id, provider:'snelstart', soort:'klant'|'leverancier'|'factuur'|'kost', externe_id, reden:'verwijderd in BossBase'}` on conflict `company_id,provider,soort,externe_id`, zodat de sync hem niet terugzet. Mislukt dat, dan krijgt de gebruiker een waarschuwing ("…komt bij de volgende synchronisatie terug"). Leegmaken: "Alles opnieuw ophalen" in GrootboekIndeling | tabel | – |
| Readonly | Exporteren blijft expliciet toegestaan bij read-only | – | – |

Overige bulk: geen multi-select/bulkacties gevonden buiten de Database-pagina (grep op `selected`/`bulk`/`exceljs`/`jszip`/`csv`).

---

## 8. Aandachtspunten voor de mobiele app (samengevat)
1. "Database" is een klantsegmentatie- en exportscherm, geen documentarchief; foto's/bestanden leven per werkbon/project/kosten in eigen buckets.
2. Team-beheer is admin-only; uitnodigen = insert `company_members` + `send-email` (geen eigen invite-functie, geen "opnieuw versturen"); (de)activeren/verwijderen via `delete-team-member`; rol wijzigen via RPC `bb_teamlid_bijwerken`; rechten = delete + insert in `user_permissions` (Team-feature `rollen_rechten`).
3. Instellingen: `profiel` voor iedereen; overige tabs vereisen recht `instellingen`; pipeline-wijzigingen, voertuigen en abonnement admin-only. Geen IBAN/betaaltermijn/nummering/uursoorten-instellingen.
4. Integraties zijn webflows (OAuth-redirects, Stripe-onboarding, SnelStart-activatie) en alleen voor beheer; status lezen via `get_accounting_status`, `google_calendar_status`, `stripe_connections`.
5. Abonnement betalen loopt via Stripe Checkout/Portal (Edge Functions `billing-*`), alleen bij `magBeheren`.
6. SuperAdmin hoort niet in de klantapp.
