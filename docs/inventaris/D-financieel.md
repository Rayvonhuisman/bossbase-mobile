# Inventaris D — Projecten, Offertes, Facturen, Kosten, Omzet (Financiën), Uren

Bron: `/Users/macbook/BossBase-billing` (branch `main`), alleen `src/` gelezen. Alle paden hieronder relatief aan die repo. Read-only inventarisatie, niets gewijzigd.

## 0. Gemeenschappelijk: zichtbaarheid en rechtenmodel

### Menu + routebewaking (`src/App.jsx:100-145`, `:1570-1603`)
| page-id | Label | `permission` | `feature` (pakket) | sectie |
|---|---|---|---|---|
| `projecten` | Projecten | `projecten` | — | work |
| `uren` | Uren | — (iedereen) | — | work |
| `offertes` | Offertes | `offertes` | — | finance |
| `facturen` | Facturen | `facturen` | — | finance |
| `costs` | Kosten | `kosten` | `kosten_nacalculatie` | finance |
| `revenue` | **Financiën** (label!) | `bedrijfsfinancien` | — | finance |

- `PROTECTED_PAGES`/`PLAN_GATED_PAGES` worden afgeleid uit `NAV` (`uitNav('permission')`, `uitNav('feature')`).
- Route-check (`App.jsx:1586-1602`): `magPagina = !requiredPerm || role==='admin' || userPermissions.includes(perm) || (gedeeldeWerkruimte && INZAGE_RECHTEN.has(perm))`. Fout → toast `"Je hebt geen toegang tot deze pagina"` + terug naar dashboard. Feature ontbreekt → toast `"<feature> zit niet in je abonnement"`.
- Wacht tot `profile`, `permissionsLoaded` én `planStatus` geladen zijn.

### `usePermissions()` (`src/hooks/usePermissions.js`)
- `INZAGE_RECHTEN` (vervallen in een **gedeelde werkruimte**, feature `gedeelde_werkruimte`): `verkoop, offertes, facturen, kosten, bedrijfsfinancien, projectbedragen, alles_inzien, agenda_inzien, projecten, database, team`.
- `magBewerken(perm)`: admin → true; `role==='planner' && perm==='planning'` → true; anders `userPermissions.includes(perm)`. Gebruik voor schrijven.
- `can(perm)`: als gedeelde werkruimte én perm ∈ INZAGE_RECHTEN → true (mits profiel); anders `magBewerken(perm)`. Gebruik voor zien.
- Niet in INZAGE_RECHTEN (dus altijd echt recht nodig): `klanten_bewerken`, `klanten_verwijderen`, `projecten_bewerken`, `werkbonnen_bewerken`, `planning`, `inkoopprijzen`, `instellingen`.
- Schrijfacties zitten verder vaak achter `usePlanGuard().guardSchrijven(label, fn)` (`components/PlanUpgradeModal.jsx`) = pakket/readonly-blokkade (abonnement verlopen e.d.).

### Statuskleuren (centrale bron `src/utils/statusColors.js`)
Tonen (`STATUS_TONES`, badge-klassen in `bb-dashboard.css:355-364`):
| tone | klasse | bg | tekst/dot |
|---|---|---|---|
| gray | `b-gray` | `#f3f4f6` | `#6b7280` (dot `#9ca3af`) |
| blue | `b-blue` | `#eff6ff` | `#2563eb` |
| orange | `b-orange` | `#fff4ec` | `#e8784a` |
| green | `b-green` | `#ecfdf5` | `#15A34A` |
| red | `b-red` | `#fef2f2` | `#dc2626` |
| purple | `b-purple` | `#f5f3ff` | `#7c3aed` |

Domeinen:
- **project**: `gepland`→blue "Gepland", `in_uitvoering`→orange "In uitvoering", `afgerond`→green "Afgerond".
- **factuur**: `concept`/`aangemaakt`→gray "Concept"; `verzonden`/`verstuurd`→blue "Verzonden"; `open`→blue "Open"; `betaald`→green "Betaald"; `verlopen`/`te_laat`/`vervallen`→red "Te laat"; `geboekt`→purple "Uit SnelStart".
- **offerte**: `concept`→gray; `verzonden`/`verstuurd`→blue "Verzonden"; `bekeken`→blue "Bekeken"; `geaccepteerd`→green; `afgewezen`→red; `verlopen`→red "Verlopen".
- **werkbon**: `gepland|planned`→blue, `in_uitvoering|in_progress`→orange, `afgerond|done`→green.
- Normalisatie: `lower().trim()`, spaties/`-` → `_`. Onbekend → gray + "Prettified".
- Extra badgeklassen: `.b-planned` (#eff6ff/#2563eb), `.b-progress` (#fff4ec/#e8784a), `.b-done` (#ecfdf5/#15A34A), `.b-lost` (#f3f4f6/#6b7280).

### Gedeelde factuurtotalen (`src/services/customerTotalsService.js:16-44`)
- `isRealFactuur(f) = !f.isCredit && !f.gecrediteerd`
- `isGefactureerdeFactuur(f) = f.status !== 'concept'`
- `isBetaaldeFactuur(f) = isRealFactuur(f) && f.status === 'betaald'`
- `sumGefactureerd = Σ totaalIncl` over niet-concept (creditnota's hebben negatief bedrag en trekken zichzelf af)
- `sumBetaald = Σ totaalIncl` over betaalde echte facturen
- `sumOmzetExclBtw = Σ totaalExcl` over niet-concept
- `sumOpenstaand = sumGefactureerd − sumBetaald`

---

## 1. Projecten

Bestanden: `src/pages/ProjectsPage.jsx` (604 r.), `src/pages/projects/ProjectDetailDrawer.jsx` (1905 r.), `src/services/projectsService.js`, `src/services/projectKostenService.js`, `src/services/kostenOverzichtService.js`, `src/services/jobCostService.js`.

### 1.1 Zichtbaarheid
- Route: recht `projecten` (INZAGE). RLS (`projects_select`) bepaalt welke projecten zichtbaar zijn.
- `canManage = ['admin','planner'].includes(profile.role) || can('projecten_bewerken')` (`ProjectsPage.jsx:308`, `ProjectDetailDrawer.jsx:1750`): nieuw project, naam/velden bewerken, foto's, werkbon/offerte/factuur aanmaken, project verwijderen.
- `magBedragen = can('projectbedragen')`: projectwaarde, gefactureerd, te factureren, offertebedragen, factuurblok op overzicht, KPI's.
- Aanmaken via `guardSchrijven('Een project aanmaken', …)`.

### 1.2 Data
- Tabel `projects` — kolommen: `id, company_id, customer_id, deal_id, offerte_id, name (NOT NULL), description, status (check: gepland|in_uitvoering|afgerond), project_value (excl. btw), waarde_bron ('offertes'|'aanvraag'|'handmatig'), geschatte_waarde, quoted_hours, start_date, deadline, owner_id, assigned_to, created_by, created_at, updated_at`. (`projects.used_hours` is verwijderd.)
- Select: `'*, customers(name), deals(title), offertes(nummer, totaal_incl, arbeidsuren)'`, sort `created_at desc, id asc`, via `alleRijen()` (pagineert door de 1000-rijengrens) — `getProjects()` (`projectsService.js:115`).
- Status wordt **afgeleid** uit werkbonnen door DB-trigger `bb_project_status_bijwerken` (in uitvoering zodra één werkbon gestart, afgerond als alle afgerond). Niet handmatig te kiezen.
- Elke deal krijgt automatisch een project (trigger `bb_deal_project_aanmaken`). `createProject` met `deal_id` **updatet** het bestaande project i.p.v. insert (`projectsService.js:182-194`), retourneert `{...project, bestond:true}` → toast "Bijgewerkt: deze aanvraag had al een project".
- Projectwaarde: als ingevuld bij aanmaken/bewerken → `waarde_bron='handmatig'`; anders rekent DB hem uit (som geaccepteerde offertes excl. btw, of schatting aanvraag). "automatisch berekenen" zet `waarde_bron='aanvraag'`.
- Uren: RPC `bb_uren_per_project` → `{projectId: uren}`; fallback `werkbon_uren.select('uren, werkbonnen!inner(project_id)')` (`getProjectHoursMap`, :416). Alleen `werkbon_uren` telt, **niet** `urenregistratie`.
- Facturen: alle `facturen` via `alleRijen`, gegroepeerd op `project_id` (`getEnrichedProjects`, :576).
- Overige tabellen: `project_notes` (`id, company_id, project_id, created_by, note, created_at` + `profiles(full_name)`), `project_fotos` (`id, project_id, company_id, url=opslagpad, categorie, created_at`), storage-bucket **`project-fotos`** (privé, signed URL 3600 s, pad `${companyId}/${projectId}/${uuid}.${ext}`, gecomprimeerd met `comprimeerAfbeelding(file,{maxZijde: FOTO_MAX_ZIJDE, kwaliteit: 0.82})`), `inquiries` (`source, created_at` per `deal_id`; alleen met recht `verkoop`), `project_kosten`, `job_costs`, `werkbonnen`, `werkbon_uren`.
- Klant-tijdlijn: `logTijdlijnSafe(customerId,'project_aangemaakt'|'project_status_gewijzigd', …)`.

### 1.3 Berekeningen — `enrichProject()` (`projectsService.js:535-566`)
```
usedHours          = Σ werkbon_uren.uren (of RPC-waarde)          → afgerond op 2 dec.
remainingHours     = max(0, quotedHours − usedHours)
hoursPercentage    = quotedHours > 0 ? usedHours / quotedHours : 0
invoicedAmount     = sumGefactureerd(invoices)   (incl. btw, zonder concepten, credits negatief)
omzetExclBtw       = sumOmzetExclBtw(invoices)   (excl. btw)
remainingToInvoice = max(0, projectValue − omzetExclBtw)
```
Alles `Math.round(x*100)/100`.

### 1.4 Lijst (`ProjectsPage.jsx`)
- **KPI-tegels** (:379-394, 4 kolommen):
  - "Actieve projecten" = aantal met `status !== 'afgerond'`.
  - "Totale projectwaarde" (alleen `magBedragen`) = Σ projectValue van actieve projecten, `fmt0`.
  - "Te factureren" (alleen `magBedragen`) = Σ remainingToInvoice over **alle** projecten.
  - "Gewerkte uren" = Σ usedHours over alle projecten (totaal tot nu, niet per maand).
- **Filters**: statustabs `Alle | Gepland | In uitvoering | Afgerond` (op `p.status`); select facturatie `all | unbilled (remainingToInvoice>0) | billed (invoicedAmount>0)`; zoeken (placeholder "Zoek project, klant…") case-insensitive op `name, customerName, dealTitle, offerteNummer, description`.
- **Sortering**: alleen server-side `created_at desc`. Geen paginering in UI (alles geladen).
- **Tabel (desktop)** kolommen: Project (+ offertenummer mono), Klant (klikbaar → klantkaart), Status (`ProjectBadge`), Waarde*, Gefactureerd* (omzetExclBtw + "nog €x" in `#f59e0b` als remainingToInvoice>0), Uren (`used / quoted` "12,5u / 40u"), Deadline (rood `#dc2626` als `deadline < vandaag && status !== 'afgerond'`), Acties (oog). *=magBedragen.
- **Projectkaart (mobiel, `ProjectCard` :237)**: naam, klant ("Geen klant"), `ProjectBadge`; Waarde* · Uren `used/quoted` · Deadline; regel* "€x gefactureerd" of "Nog niet gefactureerd".
- `KlusBadge` (:44, geëxporteerd, gebruikt elders): als deal `lost` → `b-lost` "Verloren"; deal `afgerond_op` gezet → `b-done` "Project voltooid"; anders pipelinefase-label (`b-gray`); zonder deal → werkbonstatus.
- **Laadstaat**: alleen eerste keer "Projecten laden…" (kaart). Refresh houdt UI staan.
- **Fout**: rode tekst `#dc2626` onder de kop.
- **Leeg**: "Nog geen projecten" / "Elke nieuwe aanvraag wordt hier vanzelf een project." (+ knop "Eerste project" als canManage) of "Geen projecten gevonden" / "Pas de filters of zoekterm aan…".
- Formattering: datum `dd-mm-jjjj`; uren `nl-NL` max 2 dec + "u".

### 1.5 Nieuw project (`NewProjectModal`, :56)
Velden: Projectnaam (verplicht, "Projectnaam is verplicht"), Klant, Project(=deal, gefilterd op klant), Offerte (gefilterd op klant), Projectwaarde excl. btw, Begrote uren (step 0.5), Startdatum, Deadline, Toegewezen aan (teamlid) + `NotifyMailToggle` (mail ja/nee), Omschrijving (`NoteEditor` met @-mentions). Geen statuskeuze.
- Offerte kiezen vult voor: klant, deal, `project_value = offerte.totaalExcl`, `quoted_hours = offerte.arbeidsuren`, naam = omschrijving.
- Na opslaan: `notifyNewAssignees({type:'toewijzing_project', link:'projecten', relatedType:'project', …})`.

### 1.6 Detail (`ProjectDetailDrawer`)
Laden (`loadAll`, :1721): `getProjectById`, `getTimeEntries` (werkbon_uren join `werkbonnen!inner(project_id)`), `getProjectInvoices`, `getProjectNotes`, `getWerkbonnenByProject`; ook `listPipelineStages`. Herlaadt op `refreshKey`. Laad: "Project laden…". Fullscreen-toggle.

**Tabs** (`zichtbareTabs`, :170): Overzicht (altijd), Offertes (`can('offertes')`), Facturen (`can('facturen')`), Uren (altijd), Kosten (`can('kosten') && plan.has('kosten_nacalculatie')`), Werkbonnen (`plan.has('werkbonnen')`), Notities (altijd). Valt een open tab weg → eerste tab.

**Header**: naam (inline bewerkbaar met canManage; leeg → "Een project moet een naam houden"), klantnaam als link → klantkaart. Geen statusbadge (bewust).

**Overzicht-tab**:
1. *Aanvraagblok* (alleen als deal bestaat):
   - Status: deal `lost` → badge "Verloren"; `afgerond_op` → "Project voltooid"; anders met `magBewerken('verkoop')` een select van pipelinefasen (gesorteerd op `order`, fase met label /afgerond/ verborgen tenzij huidig) → `updateDealStage(dealId, stageId)` (`deals.stage_id`); zonder recht badge met fase-label of "Loopt".
   - **Voltooien/heropenen** (`magBewerken('verkoop')`): `zetDealAfgerond(dealId, aan)` → `deals.afgerond_op = now()` of `null` (`dealService.js:88`). Toast "Project voltooid"/"Project heropend".
   - **Verloren** (tekstlink) → `VerlorenModal` (reden) → `markDealLost`: `deals.stage_id=<Verloren-fase>, lost_reason, status='lost'`.
   - **Heropenen verloren** → `heropenVerlorenDeal(dealId, eersteFase)`: `stage_id, status='open', lost_reason=null`; eerste fase = laagste `order` zonder /verlor|afgerond/.
   - "Behandeld door" (verantwoordelijken/team): `MemberMultiSelect` → `updateDeal(id,{assigned_to_ids: ids, assigned_to: ids[0]||null})`; uitgeschakeld als afgerond.
2. *De aanvraag*: tekst = `project.description` (terugval `deal.raw.description`), bewerkbaar met canManage. Raster: Waar (klant `address`, `postcode city`), Wanneer (eerstvolgende geplande werkbondag: "Ingepland dd-mm-jjjj (+n dagen)", anders bereik van planning, anders "Gestart <start_date>", anders "Nog niet ingepland"; + "deadline …"), Via (`inquiries.source`: `bossbase_website`→"Websiteformulier", andere bron letterlijk, zonder bron met verkooprecht "Handmatig aangemaakt", anders "—"; + "binnen op"), Contact (telefoon of e-mail). Foto's (thumbnails 92×70, + Foto, verwijderen met confirm).
3. *Projectinformatie* (inline per veld, canManage): Startdatum, Einddatum (=`deadline`, rood + "verlopen" als overdue), Begrote uren, Gewerkte uren (read-only, % in kleur: >100% `#dc2626`, ≥80% `#f59e0b`, anders grijs), Projectwaarde* (fmt0, met bronregel "Som van de geaccepteerde offertes, excl. btw" / "Geschat in de aanvraag" / "Met de hand ingesteld · automatisch berekenen").
4. *Planning*: `planRegels(werkbonnen)` (`components/PlanningBlok.jsx`), komende max 4; leeg "Nog niets ingepland voor dit project."; klik → werkbon.
5. *Werkbonnen*: gesorteerd op `geplandOp` desc; titel, nummer · locatie, werkbonstatusbadge. Leeg "Geen werkbonnen".
6. *Offertes* (alleen `can('offertes')`): offertes met `dealId === project.dealId` of `id === project.offerteId`; omschrijving/nummer, statusbadge, bedrag incl.* ; "+" (canManage) → `NewOfferteModal` met prefill deal+klant.
7. *Facturen* (alleen magBedragen): nummer, factuurdatum · "vervalt …", statusbadge, totaal incl.; "+" → `NewFactuurModal` prefill klant+project.
8. *Klantgegevens*: Naam, Contactpersoon, Telefoon, E-mail, Adres — inline bewerken met `magBewerken('klanten_bewerken')` → `updateCustomer` (schrijft naar `customers`); "Andere klant/Klant kiezen" (canManage) → `projects.customer_id`.
- Footer (canManage, alleen Overzicht): "Verwijder project" → confirm → `projects.delete()`.

**Offertes-tab**: zonder gekoppelde offerte (`project.offerte_id`): "Nog geen offerte gekoppeld" + "Nieuwe offerte" / "Bestaande koppelen" (select offertes van dezelfde klant) → `updateProject({offerte_id})`. Met offerte: nummer, omschrijving, statusbadge, Offertebedrag (incl.), Begrote uren (`arbeidsuren`), Geldig tot, Geaccepteerd (datum). Knoppen: Open offerte, Factuur maken (→ facturenpagina), Nieuwe offerte. Na "Opslaan en versturen" → `SendOfferteMailModal`.

**Uren-tab** (read-only): Begroot / Geregistreerd / Resterend; waarschuwing ≥80% ("Boven 80% van het urenbudget…", `#b45309`) en >100% ("Urenbudget overschreden (x%)", `#dc2626`). Lijst werkbon_uren: datum, `notitie`, medewerker, `start–eind`, pauze min, km, uren. Info: "Uren boek je op de werkbon van deze klus."

**Kosten-tab** (zie ook §3): `getProjectCosts`, `listProjectKosten`, `getTimeEntries` → `bouwKostenOverzicht()`.
- Tegels: "Gefactureerd (excl. btw)"* = `project.omzetExclBtw`; "Kostprijs" (met `can('inkoopprijzen')`) = `overzicht.totaal` + "materiaal x · inkopen y", anders "Inkopen" = `overzicht.inkopen.bedrag`; "Brutowinst vóór arbeid" (alleen `projectbedragen && inkoopprijzen`) = `omzetExclBtw − kostprijs` (groen `#15A34A`, negatief `#dc2626`), info-uitleg.
- Zonder inkooprecht: "Geen brutowinst zichtbaar" + uitleg.
- Waarschuwing (geel `#FFFBEB`/`#FDE68A`/`#92400E`) als materiaalregels zonder inkoopprijs: verkoopprijs gebruikt → winst is ondergrens.
- `InkopenKaart` (projectkosten toevoegen/wijzigen/verwijderen, canManage) — `components/KostenInvoerRegel.jsx`.
- Materiaal (alleen inkoopprijzen): regels datum, omschrijving (prefix "Materiaal:" gestript), bedrag, "op verkoopprijs"/"inkoop, excl. btw".
- Melding als er boekingen (job_costs zonder `werkbon_materiaal_id`) aan het project hangen: telt níet mee in marge.

**Facturen-tab**: tegels* Projectwaarde / Gefactureerd (= omzetExclBtw) / Te factureren (oranje `#f59e0b` als >0); lijst facturen; "Nieuwe factuur" (géén canManage-check in deze tab!) → `NewFactuurModal`, daarna optioneel `SendFactuurMailModal`.

**Werkbonnen-tab**: lijst met `planningLabel(w)`, taken `done/total` + voortgangsbalkje `#1DDB62`, `PlanningRegels`, statuspill. "Nieuwe werkbon" (canManage) → `WerkbonModal mode="new"` met project/klant vast.

**Notities-tab**: `NotitieLog`; toevoegen → `project_notes` insert (leeg → "Notitie mag niet leeg zijn") + `createMentionNotifications({relatedType:'project', link:'projecten'})`; verwijderen met confirm.

**Documenten**: er is géén aparte documenten-tab in de projectdrawer; alleen foto's (`project_fotos`).

### 1.7 Projectkosten (`project_kosten`, `projectKostenService.js`)
Kolommen: `id, company_id, project_id, werkbon_id, datum (NOT NULL default current_date), naam, eenheid, aantal, prijs_per (kostprijs excl. btw), bedrag (GENERATED = aantal × prijs_per), leverancier_id, created_at, updated_at`. Met `werkbon_id` zet een trigger het `project_id` (insert stuurt dan `project_id: null`). Validatie: naam verplicht ("Omschrijving is verplicht"); `aantal = Number||1`, `prijs_per = Number||0`.

---

## 2. Offertes

Bestanden: `src/pages/OffertesPage.jsx` (1469 r.), `src/services/offerteService.js`, `src/pages/OfferteSigneren.jsx` (publiek), `src/lib/regelTypes.js`, `src/lib/btwRegime.js`, `src/components/BtwRegimeSelect.jsx`, `src/utils/generatePdf.js`, `src/utils/documentSnapshot.js`, `src/services/emailService.js`, `src/services/getekendePdfService.js`.

### 2.1 Zichtbaarheid
- Route/menu: recht `offertes` (INZAGE; vervalt in gedeelde werkruimte). RLS `offertes_select` kent `bb_gedeelde_werkruimte()`.
- **Beheren** (`canManageOffertes`, `OffertesPage.jsx:1085`): **alleen rol `admin` of `planner`** (géén rechtencode!). Bepaalt: knop "Nieuwe offerte", rij-acties versturen/wijzigen/herzien/kopiëren/maak factuur, verwijder-icoon.
- Let op: de `ViewOfferteModal` krijgt `onSendMail/onCopy/onEdit/onDelete/onMaakFactuur` altijd mee (:1422-1426) → in het detailvenster zien ook niet-admins die acties (server/RLS moet weigeren).
- Pakket: `guardLimiet('offertes', …)` op "Nieuwe offerte" (offertelimiet per facturatieperiode); `<PlanStand limiet="offertes" />` in de kop toont teller. Kopie naar andere klant telt mee (`plan.within('offertes')`), nieuwe versie niet (server: `bb_offerte_telt_mee`).
- Digitale handtekening: feature `digitale_handtekening` (Groei+). Zonder: geen ondertekenlink in mail, `sign-offerte` weigert.

### 2.2 Data
- Tabel **`offertes`**: `id, company_id, customer_id, deal_id, nummer, omschrijving, status, arbeidsuren, uurtarief (default 55), materiaalkosten, reiskosten, marge_pct (VERVALLEN; altijd 0 vanuit UI), btw_pct (default 21), totaal_excl, totaal_incl, geldig_tot, verzonden_op, geaccepteerd_op, notes, sign_token, signed_at, signed_by_name, signed_by_email, signed_pdf_url (dood voor oude offertes), signature_url, sent_to_email, vervangen_op, vervangen_door_nummer, snapshot_logo_url, snapshot_branding_color, snapshot_bedrijfsnaam, snapshot_adres, snapshot_postcode, snapshot_plaats, snapshot_email, snapshot_kvk, snapshot_btw, created_at, updated_at`. Select `'*, customers(name)'`, sort `created_at desc, id asc`, `alleRijen`.
- Tabel **`offerte_items`**: `id, offerte_id, company_id, omschrijving (verplicht), eenheid, type, btw_pct, btw_regime, aantal, prijs_per, subtotaal, volgorde`. Sort `volgorde asc`.
- DB-trigger **`bb_offertetotalen`** herberekent totalen (genoemd in `generatePdf.js:24`).
- Instellingen: `getBedrijfsinstellingen()` → `offerteGeldigDagen` (default 14), `btwPct`, `uurtarief`, `reiskostenPerKm`. Eigen eenheden: `getEigenEenheden()` (`eigenEenheidService`).
- Tijdlijn: `offerte_aangemaakt`, `offerte_verzonden`, `offerte_geaccepteerd`, `offerte_afgewezen`, `email_verstuurd`.

### 2.3 Statussen
`OFFERTE_STATUS` (`offerteService.js:10`): `concept` (Concept, gray), `verzonden` (Verzonden, blue), `geaccepteerd` (Geaccepteerd, green), `afgewezen` (Afgewezen, red). Weergave ook `bekeken` (blue), `verlopen` (red) via statusColors, maar worden niet geschreven. Er is **geen automatische "verlopen"** op basis van `geldig_tot` in de lijst.

Vergrendeling (`documentSnapshot.js:56-70`):
- `isOfferteLocked = status !== 'concept' || signedAt`
- `isOfferteFullyLocked = signedAt || status === 'geaccepteerd'` (ook status niet meer wijzigbaar)
- `isOfferteRevisable = !signedAt && !vervangenOp && status === 'verzonden'` → bewerken maakt een **nieuwe versie**.
- Server-side guard in `updateOfferte` (:302): inhoudsvelden (`customer_id, omschrijving, geldig_tot, notes, arbeidsuren, uurtarief, materiaalkosten, reiskosten, marge_pct, btw_pct, totaal_excl, totaal_incl`) weigeren als `status !== 'concept' || signed_at` → "Een verstuurde of ondertekende offerte kan niet meer gewijzigd worden".

### 2.4 Regels, btw en totalen (EXACT)
UI-regel: `{ id, omschrijving, type, aantal, eenheidsprijs, btw: '21'|'9'|'0'|'anders', btwAnders, btwRegime }`.
- Regeltypes (`regelTypes.js`): vast `uren` (Uren, step 0.5, unit "u", prijs = `uurtarief`), `km` (Km, prijs = `reiskostenPerKm`), `vast` (label "Overig", prijs 0), eigen eenheden `eigen:<id>` (prijs = `standaardPrijs`, btw = eenheid.btwPct), legacy `m2`, `stuks`. Lege omschrijving → placeholder van type ("Arbeidsuren", "Reisvergoeding", "Overige kosten").
- Btw-regimes (`btwRegime.js`): `normaal` 21%, `verlaagd` 9%, `vrijgesteld` 0% ("Geen btw van toepassing"), `verlegd` 0% ("Je klant draagt de btw af"), UI-only `anders` (oud afwijkend %, opgeslagen als `normaal`). `regimeVanPct`: 9→verlaagd, 0→vrijgesteld, anders normaal. Waarschuwing `VerlegdUitleg` bij 0%-regels; conflict `heeftVerlegdConflict` (verlegd + normaal/verlaagd/anders op één document) → tekst "Verlegde btw kan niet samen met belaste regels op één factuur…" (alleen waarschuwing, blokkeert niet).
- **Formules** (identiek in `NewOfferteModal` :85-96, `EditOfferteModal` :335-345, `useRegelTotals` in FacturenPage :80-92):
```
regelprijs(r)  = round2(aantal × eenheidsprijs)
effBtw(r)      = r.btw === 'anders' ? Number(btwAnders) : Number(r.btw)   // verlegd/vrijgesteld → 0
totaalExcl     = round2( Σ regelprijs )
btwPerTarief[p]= round2( Σ_{regels met pct p} regelprijs × p / 100 )     // per tarief afgerond (cumulatief per regel)
totaalIncl     = round2( totaalExcl + Σ btwPerTarief )
```
  Totalenblok toont "Subtotaal excl. BTW", per tarief "BTW p%" (alleen >0), "Totaal incl. BTW".
- Opslaan item: `subtotaal = round2(aantal × prijs_per)` (`createOfferteItem` :373; `updateOfferteItem` herberekent met huidige waarden).
- PDF-totalen (`documentTotalen()` in `generatePdf.js:31`): zelfde, maar btw = 0 als `btwRegime ∈ {vrijgesteld, verlegd}`; offerteregel zonder eigen % valt terug op `offerte.btw_pct`.
- Legacy-formule `calculateOfferteTotals()` (`offerteService.js:96`): `arbeid = uren × uurtarief; subtotaal = arbeid + materiaal + reis; excl = subtotaal × (1 + marge/100); incl = excl × (1 + btw/100)` — wordt overgeslagen zodra `totaal_excl` én `totaal_incl` worden meegegeven (altijd vanuit de UI).
- **Korting**: bestaat niet (geen veld, geen berekening) in offertes of facturen.

### 2.5 Nummering
- `generateOfferteNumber()` (:115): `BB-` + `(count(offertes)+1)` 3 cijfers → `BB-001`. Gebaseerd op count (RLS-scope), niet op max. Fout → "Offertenummer kon niet worden gegenereerd…".
- Versie: `nextOfferteVersionNumber(nummer)` (:132): basis = nummer zonder `-vN`, hoogste versie +1 → `BB-005-v2`, `-v3`.

### 2.6 Lijst
- KPI (4): "Totaal offertes" (aantal), "Concept" (aantal), "Verzonden" (aantal), "Geaccepteerd" = `aantal · fmt(Σ totaalIncl geaccepteerd)`.
- Filtertabs: Alle / Concept / Verzonden / Geaccepteerd / Afgewezen (exact op `status`).
- Zoeken ("Zoek offerte..."): `nummer`, `omschrijving`, klantnaam (lowercase includes).
- Sortering: `created_at desc` (server). Geen paginering.
- Kolommen: Nummer (mono), Klant (link), Excl. BTW, Incl. BTW, Status-badge, Geldig tot, Acties (paperclip = voorbeeld/getekende PDF, `ActieMenu`, verwijder).
- Rij-acties: Bekijken; (beheer) Verstuur per mail; "Herzien (nieuwe versie)" (niet-concept) of "Offerte wijzigen" (concept); Kopiëren; "Maak factuur" (alleen geaccepteerd).
- Laad: "Laden…" (kaart). Fout: rood `#dc2626`. Leeg: "Geen offertes gevonden".
- Deep-link `/offertes/<id>`; `preFillDealId` opent "Nieuwe offerte" met deal.

### 2.7 Detail (`ViewOfferteModal`, :659)
Klant (link), Status, Geldig tot, Aangemaakt; regels-tabel (Omschrijving · eenheid, Aantal, Prijs, Subtotaal; "Regels laden…" / "Deze offerte heeft geen regels."); Totaal excl./incl.; Notities; blok **Ondertekend** (`#f0fdf4`/`#bbf7d0`/`#15803d`) met naam + datum/tijd, of "Getekend, PDF ontbreekt" (`#fffbeb`/`#fde68a`/`#b45309`) + automatisch herstel (`getOffertePdfBase64` → Edge Function **`getekende-pdf-nazenden`** `{soort:'offerte', id, pdf_base64}`).
- Primaire knop: geaccepteerd → "Maak factuur"; anders "Verstuur per mail"; anders (getekend) "Download getekende offerte".
- Menu: Verstuur per mail, Herzien (nieuwe versie) / Offerte wijzigen, Kopiëren, Maak factuur, Offerte verwijderen (confirm).

### 2.8 Acties
- **Nieuw** (`NewOfferteModal`): Klant* ("Selecteer een klant"), Project (=deal, gefilterd op klant), Omschrijving, Regelitems (min. 1), Geldig tot (default vandaag + `offerteGeldigDagen`), Notities (intern). Knoppen Opslaan / "Opslaan en versturen". `createOfferte({..., marge_pct:0, totaal_excl, totaal_incl})` + per regel `createOfferteItem` (volgorde = index).
- **Bewerken concept**: update + **wipe-and-recreate** regels (`deleteOfferteItemsByOfferteId` + insert). Status-select (concept/verzonden/geaccepteerd/afgewezen) = handmatig accepteren/afwijzen.
- **Herzien** (verzonden, niet getekend): nieuwe offerte `nextOfferteVersionNumber`, status concept, regels kopiëren, oude `markOfferteVervangen(id, nieuwNummer)` → `vervangen_op=now, vervangen_door_nummer` (oude tekenlink toont "Deze offerte is niet meer geldig"). Toast "Nieuwe versie aangemaakt".
- **Vergrendeld**: alleen status (niet bij fullyLocked).
- **Kopiëren / dupliceren** (`CopyOfferteModal` → `copyOfferte(id,{customerId, asVersion})`): "Zelfde klant — nieuwe versie" (`-vN`, deal mee) of "Andere klant — nieuwe offerte" (nieuw nummer, geen deal). Kopieert regels, niet verzend/teken/snapshot-velden. Daarna opent bewerkvenster.
- **Verwijderen**: confirm → `offertes.delete()`.
- **Maak factuur**: offerte-items → `reconstructRegel` → `NewFactuurModal` prefill `{customer_id, regels}` (project niet meegegeven).
- **Versturen** (`SendOfferteMailModal`, :939): template `getMailTemplate('offerte')` (tabel `email_templates`, vars `klant_naam, bedrijfsnaam, offerte_nummer, omschrijving, totaal_bedrag, vervaldatum`; `{{link}}`/`{{knop}}` placeholder). Ondertekenlink `${origin}/offerte/${sign_token}`; knop "Offerte bekijken & ondertekenen" in bedrijfskleur. PDF-bijlage `Offerte-<nummer>.pdf` (`getOffertePdfBase64`). Verzenden via Edge Function **`send-email`** (`{to, subject, html, from_name, reply_to, attachments}` — `sendEmail()` in `emailService.js:68`), log in tabel **`sent_emails`** (`logSentEmail`, relatedType 'offerte'). Bij concept: `status='verzonden', verzonden_op=now` + branding-snapshot (`buildCompanySnapshot`); altijd `sent_to_email`. Validatie: "E-mailadres is verplicht".
- **PDF**: jsPDF (dynamische import `jspdf`), `buildPdf(doc,'offerte',…)` in `generatePdf.js:202`. Export-functies: `generateOffertePdf` (download), `previewOffertePdf` (blob in nieuw tabblad), `getOffertePdfUrl`, `getOffertePdfBase64`. Branding via `companyForDocument(doc, company)` (snapshot wint). Inhoud: logo/bedrijfsgegevens (KvK, BTW), Offertenummer, Datum, Geldig tot, Ondertekend, klantblok (KvK/BTW klant), kolommen OMSCHRIJVING/AANTAL/EENHEIDSPRIJS/BTW/BEDRAG, totalen, notitie (default "Deze offerte is geldig tot …"), handtekeningblok, footer "Gegenereerd door BossBase · Pagina 1 van 1". Beperking: regels stoppen bij y>238 (één pagina).
- Getekende PDF ophalen: Edge Function **`offerte-pdf-url`** `{offerte_id}` (bucket `signed-offertes` is privé) — `getOndertekendePdfUrl()`.

### 2.9 Ondertekenen (publiek, `OfferteSigneren.jsx`, route `/offerte/<token>`)
- RPC's (anon): `get_offerte_by_sign_token`, `get_offerte_items_by_token`, `get_company_by_sign_token`, `get_customer_by_sign_token` (param `p_token`).
- Staten: laden "Offerte laden…"; fout "Offerte niet gevonden of link is ongeldig." / "Geen geldig token"; al getekend → klaarscherm; `vervangen_op` → "Deze offerte is niet meer geldig … vervangen door nieuwere versie (<nummer>)".
- Formulier: naam (prefill klantnaam), e-mail (prefill `sent_to_email` of klant-email; regex-validatie), handtekening-canvas (160px hoog, touch). Knop "Akkoord en ondertekenen".
- Bij akkoord: klant-browser maakt getekende PDF (`getOffertePdfBase64`) en roept Edge Function **`sign-offerte`** `{sign_token, name, email, signature_data_url, signed_pdf_base64?, pdf_fout?}` aan; server zet signed_*/status, tijdlijn en bevestigingsmails; `warnings` met "mail" worden getoond.
- **Afwijzen door klant bestaat niet** op de tekenpagina; afwijzen = handmatige status door bedrijf. Geen automatische blokkade na `geldig_tot`.

---

## 3. Facturen

Bestanden: `src/pages/FacturenPage.jsx` (1456 r.), `src/services/factuurService.js`, `src/services/stripeService.js`, `src/pages/BetaalPage.jsx`, `src/pages/BetaalStatusPage.jsx`, `src/utils/bewaarFactuurPdf.js`, `src/services/btwService.js`, `src/services/btwIndicatieService.js` (deze twee worden alleen op Financiën gebruikt, zie §5).

### 3.1 Zichtbaarheid
- Route: recht `facturen` (INZAGE). RLS `facturen_select` kent gedeelde werkruimte.
- **Beheren** (`canManage`, :1082 en :658): **alleen rol `admin`/`planner`**. Nieuwe factuur, versturen, herinneren, wijzigen, kopiëren, crediteren, verwijderen, status-select.
- Pakket: `guardLimiet('facturen', …)` (factuurlimiet per periode; creditfacturen tellen niet), `<PlanStand limiet="facturen" />`. Herinneringen: feature `betaalherinneringen` (herinnering 2 alleen met feature; herinnering 1 via `guardFeature`; DB-trigger blokkeert `herinnering_*_verstuurd_at` zonder feature). Betaallink: feature `stripe_betaallink`.
- **Geïmporteerde facturen** (`isGeimporteerdeFactuur`: `externe_referentie` gezet of status `geboekt`): read-only, geen mail/crediteren/wijzigen/kopiëren, alleen "Origineel document". Verwijderen kan wel (→ `negeerBijImport('factuur', ref, 'verwijderd in BossBase')`).

### 3.2 Data
- Tabel **`facturen`**: `id, company_id, customer_id, project_id, nummer, factuurdatum, vervaldatum, betaaltermijn_dagen (default 14), betalingskenmerk, status, notities, totaal_excl, totaal_incl, betaald_op, herinnering_1_verstuurd_at, herinnering_2_verstuurd_at, is_credit, credit_van_factuur_id (FK, 23503 bij delete), gecrediteerd, externe_referentie, snelstart_bijlage_gesynct, snapshot_* (9 velden als offerte), created_at, updated_at`. Select `'*, customers(name)'`, `alleRijen`, sort `created_at desc, id asc`.
- Tabel **`factuur_regels`**: `id, factuur_id, company_id, type (default 'stuks'), omschrijving (verplicht), aantal, eenheidsprijs, btw_pct, btw_regime, regelprijs, volgorde`.
- DB-trigger **`bb_factuurtotalen`**; RPC **`mark_factuur_betaald(p_factuur_id, p_betaald_op)`** → `{changed}` (idempotent; zelfde route als Stripe-webhook).
- Storage-bucket **`factuur-pdfs`** (privé) pad `{company_id}/{factuur_id}.pdf` (upsert); na upload `snelstart_bijlage_gesynct=false`. `getFacturenMetDocument(companyId)` lijst bucket (limit 1000).
- Boekhouding: `syncFactuurNaarBoekhouding(id)` (accountingService) na betaald.
- Tijdlijn: `factuur_aangemaakt`, `factuur_verzonden`, `factuur_betaald`, `creditfactuur_aangemaakt`, `herinnering_verstuurd`, `email_verstuurd`.

### 3.3 Statussen + kleuren
- Opslag: `concept` (beginstatus; `createFactuur` forceert dit), `verzonden`, `betaald`, `geboekt` (import). `FACTUUR_STATUS_OPTIONS` = concept/verzonden/betaald.
- Weergave `displayStatus(f) = isVerlopen(f) ? 'verlopen' : f.status`, met `isVerlopen = status !== 'betaald' && vervaldatum && vervaldatum < vandaag` (:37). Kleuren: concept gray, verzonden blue, betaald green, verlopen red "Te laat", geboekt purple "Uit SnelStart". Extra badges: "CF" (`#fee2e2`/`#dc2626`) voor creditfactuur, "Gecrediteerd" (`b-gray`).
- Inconsistentie: filtertab "Aangemaakt" filtert op `'aangemaakt'` terwijl DB `concept` schrijft → toont vrijwel niets; `EditFactuurModal` status-select heeft opties aangemaakt/verzonden/betaald.
- Locked: `isFactuurLocked = status ∉ {concept, aangemaakt}`; server-guard in `updateFactuur` voor `vervaldatum, betalingskenmerk, notities, totaal_excl, totaal_incl` → "Een verstuurde factuur kan niet meer gewijzigd worden".

### 3.4 Berekeningen
- Regels/btw/totalen: **identiek aan offertes** (`useRegelTotals`, :80). Opslaan regel: `regelprijs = round2(aantal × eenheidsprijs)` voor élk type (`createFactuurRegel` :404; geen 'vast'-uitzondering meer).
- **Credit** (`createCreditFactuur`, `factuurService.js:326`):
```
totaalExcl  = −| round2( Σ |regelprijs| ) |
btwPerTarief[p] = round2( Σ |regelprijs| × p/100 )   alleen regels met regime ∉ {vrijgesteld, verlegd} en p ≠ 0
totaalIncl  = −round2( |totaalExcl| + Σ btwPerTarief )
regels: aantal ongewijzigd, eenheidsprijs = −|eenheidsprijs|
```
  Creditfactuur: nummer `generateCreditFactuurNummer()` = `BB-CF` + (count is_credit +1, 3 cijfers); status direct `verzonden`; `notities = "Creditering van factuur <nummer>"`; `is_credit=true, credit_van_factuur_id`; snapshot van origineel; origineel krijgt `gecrediteerd=true`.
  Gedeeltelijk: per regel selecteren + aantal/prijs aanpassen, `regelprijs = aantalCredit × |prijsCredit|`; "Selecteer minimaal één regel".
- KPI's lijst (:1139-1141): "Totaal facturen" (aantal); "Openstaand" = Σ totaalIncl van status ∈ {verzonden, geboekt} en **niet** verlopen; "Betaald deze maand" = Σ totaalIncl met status betaald en `betaald_op` begint met `YYYY-MM`; "Verlopen" = aantal `isVerlopen`. (Creditnota's tellen mee met hun negatieve bedrag.)

### 3.5 Nummering
- `generateFactuurNummer()` = `BB-F` + (count(facturen)+1) 3 cijfers → `BB-F001` (fout → `BB-F000`). `betalingskenmerk` = nummer (default).

### 3.6 Lijst
- Filtertabs: Alle / Aangemaakt / Verzonden / Betaald / Verlopen / Gecrediteerd (`gecrediteerd || isCredit`). Zoeken ("Zoek factuur...") op nummer + klantnaam.
- Kolommen: Nummer (+CF), Klant (link), Excl. BTW, Incl. BTW, Status (+Gecrediteerd), Betaaltermijn (=vervaldatum, rood als verlopen), Acties (paperclip, menu, verwijderen).
- Paperclip (`paperclipCfg`): geïmporteerd+document → origineel; bewaard document → "Bewaarde factuur openen" (signed URL); anders voorbeeld (`previewFactuurPdf`).
- Rij-acties: Bekijken; Verstuur per mail; Herinnering 1 (verlopen, nog geen h1); Herinnering 2 (verlopen, h1 gezet, geen h2); Wijzigen (niet locked); "Kopiëren naar nieuwe factuur"; "Crediteer factuur" (status verzonden/betaald, niet gecrediteerd, geen credit).
- Laad "Laden…", fout rood, leeg "Geen facturen gevonden".

### 3.7 Detail (`ViewFactuurModal`, :641)
Klant, Status, Factuurdatum, Betaaltermijn (rood + "Te laat"), Betalingskenmerk, Betaald op, Herinnering 1/2 verstuurd (datum), regelitems (`type-label omschrijving aantal × prijs` → regelprijs), Totaal excl./incl., Notities.
- Footer: status-select (concept/verzonden/betaald; beheer, niet bij import) → `updateFactuur({status})`.
- Primaire knop volgorde: import→"Origineel document"; herinnering 1 mogelijk→"Herinnering sturen"; h2→"Tweede herinnering"; concept→"Verstuur per mail"; verzonden→"Markeer als betaald" (`mark_factuur_betaald`); anders "Verstuur per mail".
- Menu: Verstuur per mail, Herinnering 1/2, Factuur wijzigen, Kopiëren, Crediteer (rood), Verwijderen (rood).

### 3.8 Acties
- **Nieuw** (`NewFactuurModal`, :206; ook gebruikt vanuit project en offerte): nummer vooraf getoond, Klant*, Project (alleen als klant projecten heeft), Factuurdatum (default vandaag), Vervaldatum (default vandaag + **`offerteGeldigDagen`** uit instellingen, níet betaaltermijn), regels, Betalingskenmerk (= nummer, read-only), totalen, "Notities / betalingsinstructies". **Validatie klant compleet**: `address`, `city`, `email` verplicht anders geel blok (`#fef3c7`/`#f59e0b`/`#92400e`) "Klantgegevens onvolledig — ontbrekend: …" + knoppen disabled + "Ga naar klant".
- **Wijzigen** (`EditFactuurModal`): alleen concept: vervaldatum ("Betaaltermijn"), betalingskenmerk, notities, status. Regels zijn in de bewerkmodal **niet** te wijzigen. Bij overgang naar verzonden/betaald → `bewaarFactuurPdf()` (PDF in bucket).
- **Kopiëren** (`kopieerFactuur`, :452): nieuwe concept met nieuw nummer, datum vandaag, zelfde klant/project/notities/regels; géén status/betaald/snapshot/herinneringen/credit-ref. Opent daarna bewerkvenster.
- **Verwijderen**: confirm; gecrediteerde factuur → "Deze factuur is gecrediteerd en kan niet verwijderd worden. Verwijder eerst de bijbehorende creditfactuur."
- **Versturen / herinneringen** (`SendFactuurMailModal`, :916; templateType `factuur|herinnering_1|herinnering_2`): template uit `email_templates` (vars `klant_naam, bedrijfsnaam, factuur_nummer, totaal_bedrag, vervaldatum, betaalinstructie`). `betaalinstructie` hangt af van Stripe actief (`stripe_connections.charges_enabled`). Bij verzenden: PDF `Factuur-<nummer>.pdf` (`getFactuurPdfBase64`, credit krijgt `creditNote=notities`) + `uploadFactuurPdf`; betaallink via Edge Function **`stripe-create-payment-link`** `{factuur_id}` → knop "Factuur betalen" vóór "Met vriendelijke groet"; `send-email`; `sent_emails`-log (relatedType 'factuur'); concept → `status='verzonden'` + snapshot; herinnering → `herinnering_1/2_verstuurd_at = now`.
- **Markeer betaald**: `updateFactuur(id,{status:'betaald'})` → RPC `mark_factuur_betaald` → bij `changed` boekhoudsync + tijdlijn.
- **PDF factuur**: `generateFactuurPdf` / `previewFactuurPdf` / `getFactuurPdfUrl` / `getFactuurPdfBase64` (zelfde `buildPdf`, type 'factuur': Factuurnummer, Datum=factuurdatum, Vervaldatum, Kenmerk=betalingskenmerk; credit toont creditNote). Geen IBAN of "btw verlegd"-tekst in de PDF-code gevonden (alleen btw 0 in totalen).

### 3.9 Betaallink en betaalstatus (publiek)
- Permanente link `/betaal/<token>` → `BetaalPage`: RPC `get_payment_branding(p_token)` (logo/kleur/naam) + Edge Function **`stripe-pay-link`** `{token}` → `state`: `redirect` (naar verse Stripe Checkout, iDEAL), `paid` ("Deze factuur is al betaald"), `no_stripe` ("Online betalen niet beschikbaar"), `invalid` ("Betaallink ongeldig"), `error` (+ "Opnieuw proberen").
- Terugkeer: `BetaalStatusPage` `/betaald` ("Betaling gelukt") en `/betaling-geannuleerd` ("Betaling geannuleerd"), branding via `get_payment_branding`.
- Betaald zetten na Stripe gebeurt server-side (webhook → `mark_factuur_betaald`).
- Stripe-koppeling: tabel `stripe_connections` (`stripe_account_id, charges_enabled, payouts_enabled, details_submitted, onboarding_status`), Edge Functions `stripe-connect-start`, `stripe-connection-status`.

---

## 4. Kosten (`costs` → `CostsPage`)

Bestanden: `src/pages/BbPages2.jsx:1096-1433` (`CostsPage`, `KostenDetailModal` :839), `src/components/SharedModals.jsx:756` (`NewJobCostModal`), `src/services/jobCostService.js`, `src/services/projectKostenService.js` (`listWerkbonInkopen`), `src/services/kostenOverzichtService.js`, `src/services/kostenCategorieService.js`, `src/hooks/useKostenCategorieen.js`, `src/lib/kostenCategorieen.js`, `src/lib/periode.js`, `src/utils/btw.js`, `src/components/KostenInvoerRegel.jsx`, `src/components/BijlageDropzone.jsx`.

### 4.1 Zichtbaarheid
- Route: recht `kosten` (INZAGE) **én** pakketfeature `kosten_nacalculatie`.
- Binnen de pagina géén verdere rechtencheck: iedereen met toegang kan toevoegen, wijzigen en verwijderen (RLS op `job_costs` beslist). "Kosten toevoegen" via `guardSchrijven('Kosten toevoegen', …)` (readonly/pakket).
- Projectkaart-tab Kosten: `can('kosten') && plan.has('kosten_nacalculatie')`; bedragen/winst daar achter `projectbedragen` + `inkoopprijzen` (zie §1.6).

### 4.2 Data
- Tabel **`job_costs`** (boekingen + spiegelregels werkbonmateriaal): `id, company_id, deal_id, project_id, werkbon_id, werkbon_materiaal_id (FK, CASCADE), customer_id, klant_type ('klant'|'algemeen'), description, amount (EXCL. btw), category, cost_date, btw_percentage (default 21), btw_inclusief, leverancier_id, leverancier (legacy tekst), bijlage_url (JSON-array opslagpaden), externe_referentie ('snelstart_…' of Moneybird 'purchase_/receipt_/mutation_…'), moneybird_document_id, created_at, updated_at`. Ophalen `listJobCosts({vanDatum, totDatum})` op `cost_date`, select `'*, deals(customer_id)'` met fallback `'*'`, `alleRijen`, sort `created_at desc, id asc`.
- Tabel **`project_kosten`** (inkopen; zie §1.7). Kostenpagina haalt via `listWerkbonInkopen({vanDatum,totDatum})` alleen rijen **met `werkbon_id`** op (+ `werkbonnen(customer_id)`).
- Spiegelregels: `job_costs` met `werkbon_materiaal_id` = materiaal op werkbon, bedrag = `aantal × inkoopprijs` (DB, migratie 20260915130500); inkoopprijs via `werkbon_materialen!werkbon_materiaal_id(aantal, werkbon_materiaal_inkoop(inkoopprijs_per))` — alleen zichtbaar met recht `inkoopprijzen` (RLS).
- Categorieën: tabel **`kosten_categorieen`** (`id, company_id, naam, standaard, actief, bon_verplicht, volgorde`), sort volgorde, naam; hook `useKostenCategorieen()`. Standaard: Materiaal (default), Reiskosten, Gereedschap, Inkoopfactuur, Algemene kosten, Overig; vervallen maar leesbaar: Arbeid, Brandstof. Bon verplicht tenzij `bon_verplicht=false` (fallback: niet bij Reiskosten/Arbeid).
- Bijlagen: bucket **`kosten-bijlagen`** (privé), pad `${companyId}/${Date.now()}-${random}.${ext}`, signed URL 3600 s (`getKostenBijlageUrl`, eerste element van JSON-array; legacy http-URL ongewijzigd).
- Boekhoudkoppeling: `getConnection()` (accountingService) → `administrationId` voor Moneybird-link `https://moneybird.com/<adminId>/documents/<moneybird_document_id>`.

### 4.3 Twee weergaven (nooit opgeteld)
Schakelaar "Geboekte kosten" | "Kosten op werkbonnen" (onthouden in `localStorage['kosten_weergave']`):
- **Geboekte kosten** = `alleenGeboekt(filtered)` = job_costs **zonder** `werkbon_materiaal_id` (gaat naar boekhouding).
- **Kosten op werkbonnen** = job_costs **met** `werkbon_materiaal_id` + `project_kosten` met `werkbon_id` (als rij: `cat:'Inkopen'`, geen btw, `werkbonInkoop:true`, niet aanklikbaar). Gesorteerd op datum desc. Info-blok (`#F0F9FF`/`#BAE6FD`/`#075985`) "Dit zijn geen boekingen…".

### 4.4 Widgets / tegels (:1234)
```
actiefTotaal = round2( Σ amt van actieveRegels )
groepTotalen = kostenPerGroep(actieveRegels)   // jobCostService.js:142
```
- Tegel 1: "Geboekte kosten" (info "Wat naar de boekhouding gaat") of "Kosten op werkbonnen" (info "Geen boeking · telt in de marge van een project").
- "Materiaalkosten" = groep materiaal (categorie lowercase ∈ `['materiaal']`).
- "Arbeidskosten" (alleen als >0) = `['arbeid','arbeidskosten','uren']`.
- "Reiskosten" = `['reiskosten','reis','brandstof','km']`.
- "Overige kosten" = vangnet (alles anders, incl. 'Inkopen', 'Gereedschap', 'Inkoopfactuur').
- Groepen tellen altijd op tot tegel 1.
- Signaal (alleen geboekte weergave): "N kostenposten hebben nog geen leverancier" = `costs` zonder `leverancier_id` en zonder `werkbon_materiaal_id`.

### 4.5 Filters / sortering
- **Periode** (`PERIODE_TYPES` in `lib/periode.js`): Week (ma–zo, label "Week N · d–d mmm jjjj"), Maand (default), Kwartaal ("Q3 2026"), Jaar; vorige/volgende + "Nu". Type in `localStorage['kosten_periode_type']`. Server-side filter op `cost_date` resp. `project_kosten.datum` (lokale datums, geen UTC).
- **Klant** (select "Alle klanten", op `custId` = `customer_id ?? deals.customer_id`) en **Categorie** ("Alle categorieën", unieke `cat` uit geladen kosten). 
- **Geen** filter op leverancier, project of werkbon; geen zoekveld; geen paginering. Sortering server `created_at desc` (materiaalweergave client op datum desc).

### 4.6 Tabel
Kolommen: Klant (naam / "Algemeen"), Categorie (`CostCategoryBadge`; kleuren `COST_CATEGORIES`: materiaal `#eff6ff/#2563eb`, arbeid `#f0fdf4/#15a34a`, reiskosten `#fff7ed/#ea580c`, inkoopfactuur `#faf5ff/#9333ea`, algemene kosten/overig `#f3f4f6/#6b7280`, onbekend grijs), Omschrijving, Leverancier (naam / "via werkbon" / badge "Ontbreekt" `#b45309` op `rgba(224,176,80,.14)` rand `#e0b050`), Bedrag (excl. + pill "excl. · 21% btw" + regel "€x incl." via `calcBtw(amt, pct, 'excl').incl`; niet bij werkbon-inkoop), Datum, Bron (`SS` `#0A5BC4`, `MB` `#2563EB`, "handmatig"), paperclip bijlage.
- Laad: "Kosten laden...". Fout: kaart rood "Kosten laden is mislukt.". Leeg: "Geen kosten in <periode>[ bij dit filter]." / "Geen kosten op werkbonnen in …".

### 4.7 Toevoegen (`NewJobCostModal`)
- Kopvelden: Klant ("Algemeen" = geen), Project (optioneel, info "telt niet mee in de projectmarge"), Werkbon (optioneel), Categorie (default `standaardCategorieUit`), Leverancier* (`LeverancierSelect`, kan nieuwe aanmaken), Datum* (default vandaag).
- Afhankelijkheden: werkbon → project + klant; project → klant; klant wisselen ontkoppelt niet-passend project/werkbon. `createJobCost` leidt bij werkbon ook project/klant af.
- Kostenregels (meerdere): Omschrijving, Bedrag, toggle "Excl. BTW"/"Incl. BTW", btw 21% / 9% / "Geen btw (0%)". Per regel **één** `job_costs`-rij met gedeelde kop.
- **Btw-formule** `calcBtw(bedrag, pct, mode)` (`utils/btw.js`):
```
mode 'excl': excl = b; btw = round2(b × p/100); incl = round2(excl + btw)
mode 'incl': incl = b; excl = round2(b / (1 + p/100)); btw = round2(incl − excl)
opgeslagen: amount = excl, btw_percentage = p, btw_inclusief = false
```
  Totalen: "Totaal excl. BTW", "BTW 21%", "BTW 9%", "Overige BTW" (>0,005), "Totaal incl. BTW".
- Validatie: datum ("Kies een datum"), leverancier ("Kies een leverancier"), bon verplicht per categorie (`BON_VERPLICHT_MELDING`), per regel omschrijving niet leeg en bedrag > 0; `createJobCost` eist omschrijving en amount > 0.
- Bijlagen (`BijlageDropzone`): JPG/PNG/PDF, max 10 MB per bestand, meerdere. Upload **na** opslaan op de achtergrond (`useUploads().startUpload`), afbeeldingen gecomprimeerd (`compressImage`: max 1600 px, JPEG q0.8, alleen bij winst), daarna `bijlage_url = JSON.stringify(paths)` op alle aangemaakte rijen.

### 4.8 Detail/bewerken (`KostenDetailModal`)
- Per veld direct opslaan (`updateJobCost`, "✓ Opgeslagen"): Bedrag excl. (blur; uit bij werkbonmateriaal), Datum, BTW (21/9/0; uit bij werkbonmateriaal), Leverancier* (verplicht behalve werkbonmateriaal; sluiten geblokkeerd met "Kies een leverancier — zonder leverancier kan deze kostenpost niet naar de boekhouding."), Omschrijving, Categorie, Klant/Project/Werkbon (zelfde afleiding).
- Btw-samenvatting `calcBtw(amt, btwPct, 'excl')`.
- Badge bron: SnelStart (`#0A5BC4`) / Moneybird (`#2563EB`) / Handmatig. Knoppen "Bijlage bekijken", "Bekijk in Moneybird".
- **Verwijderen** (`deleteJobCost`): spiegelregel → verwijdert `werkbon_materialen`-rij (cascade); anders `job_costs.delete()` + bij `externe_referentie` `negeerBijImport('kost', ref, 'verwijderd in BossBase')` (prullenbak per inkoopfactuur). Confirm noemt bron.

### 4.9 Geboekt vs. materiaal — kernregels
- `isWerkbonMateriaal(k) = !!werkbon_materiaal_id`. `alleenGeboekt` = zonder. Dashboard/Financiën/btw rekenen alleen met geboekte kosten.
- Projectmarge (`bouwKostenOverzicht`, `kostenOverzichtService.js:54`): `totaal = materiaalInkoop + Σ project_kosten.bedrag`; boekingen apart en **niet** meegeteld; uren alleen als aantal (geen bedrag).
- `inkoopwaardeVanKosten` (`jobCostService.js:202`): per materiaalregel `inkoopPer × aantal` als beide bekend, anders val terug op verkoopbedrag (`amount`) en tel `zonderInkoopprijs++`, `geschatBedrag += amount`.
- `kostenSplitsing` (`:172`): `{kostprijs: Σ alles, boekhouding: kostprijs − werkbonMateriaal, werkbonMateriaal}`.

---

## 5. Omzet / Financiën (`revenue` → `RevenuePage`)

Bestand: `src/pages/BbPages2.jsx:1478-2017`. Menu-label **"Financiën"**, recht **`bedrijfsfinancien`** (INZAGE). Geen extra rechtenchecks binnen de pagina; btw-kaart achter pakketfeature **`btw_overzicht`** (Groei+). Alles read-only (behalve "Ophalen uit boekhouding").

### 5.1 Data
- KPI-tegels: RPC **`bb_financien_kpi(p_van date, p_tot date)`** (security invoker, `financienService.getFinancienKpi`). SQL (migratie `20260919160000_financien_kpi.sql`):
  - `gefactureerd = Σ facturen.totaal_incl WHERE status <> 'concept' AND factuurdatum ∈ [van,tot]` (credits negatief)
  - `ontvangen = Σ totaal_incl WHERE status='betaald' AND NOT is_credit AND NOT gecrediteerd AND betaald_op ∈ [van,tot]`
  - `openstaand = Σ totaal_incl (status<>'concept', alle periodes) − Σ totaal_incl (betaald, niet credit/gecrediteerd, alle periodes)`
  - `te_verwachten = Σ offertes.totaal_incl WHERE status='geaccepteerd'` (geen periode)
  - `kosten = Σ job_costs.amount WHERE werkbon_materiaal_id IS NULL AND cost_date ∈ [van,tot]` (excl. btw)
- Afgeleid client: `netto = ontvangen − kosten`; `marge% = ontvangen > 0 ? round(netto/ontvangen×100) : 0` (let op: incl.-btw ontvangen vs excl.-btw kosten).
- Grafiek/tabel: `getFacturen()`, `listJobCosts().then(alleenGeboekt)`, `getAllFactuurRegels()`, `getConnection()`; klanten/offertes uit DataContext; kosten per klant `getKostenOverzichtPerKlant(customerIds)`.
- Btw: `berekenBtwIndicatie({start, eind, stelsel})` (`btwIndicatieService.js`), stelsel uit `getBedrijfsinstellingen().btwStelsel` ('factuur'|'kas'); Moneybird: `getBtwPeriodes(type)` (tabel `btw_periodes`, `periode_type`, max 8) en Edge Function **`moneybird-sync-btw`** `{periode_type}`.

### 5.2 Wat toont het
- Kop: periodeselect "Deze maand" (default) / "Vorige maand" / "Dit jaar" / "Vorig jaar" / "Aangepast…" (+ van/tot datums); knop **Exporteren** (CSV).
- 6 tegels (3 kolommen): "Gefactureerd <periode>" (sub "Min creditfacturen, incl. btw"), "Ontvangen", "Openstaand" (`#e8784a`, "Nog niet betaald, alle periodes"), "Te verwachten" ("Geaccepteerde offertes"), "Kosten <periode>", "Nettoresultaat" (groen `#15A34A` / rood `#dc2626`, sub "x% marge").
- **Omzetgrafiek** (recharts BarChart, hoogte 240): periode Week (7 dagen), Maand (30 dagen, default), Kwartaal (13 weken), Jaar (12 maanden); modus Gefactureerd (`sumGefactureerd` op factuurdatum) / Ontvangen (`sumBetaald` op betaaldOp) / Kosten (Σ geboekte amt op datum). Kleur `#1DDB62`, kosten `#dc2626`.
- **BTW-kaart** (feature `btw_overzicht`): tabs Kwartaal/Maand, periodeselect (laatste 4). Regels "BTW ontvangen" (`btwOntvangen` = Σ per factuur |round2(incl−excl)| × teken credit), "BTW betaald" (`btwBetaald` = Σ per kost round2(btw); incl: `b − b/(1+p/100)`, excl: `b × p/100`; werkbonmateriaal overgeslagen; kost zonder % geteld als waarschuwing), saldo = `btwOntvangen − btwBetaald` → "Je moet betalen" / "Je krijgt terug" / "Niets te betalen…". Factuurstelsel: status ∈ {verzonden, betaald, geboekt} op `factuurdatum`; kasstelsel: status betaald op `betaald_op`. Rubrieken 1a/1b/1e/5b worden berekend maar niet getoond. Waarschuwingen: conceptfacturen in periode, kosten zonder btw-%. Moneybird-vergelijking: `bhSaldo = btw_ontvangen_21 + btw_ontvangen_9 − btw_betaald_21 − btw_betaald_9` + knop "Ophalen uit boekhouding".
- **Per klant / opdracht** (tabel, min-width 860): Klant (avatar, stad), Gefactureerd (`total` = sumGefactureerd incl.), Materiaal (rood), Inkopen (rood), Uren ("x uur"), Betaald (groen), Openstaand (`#e8784a` als >0), **Brutowinst vóór arbeid** = `sumOmzetExclBtw(klantfacturen) − kostenOverzicht.totaal`, Marge = `round(profit/omzetExcl×100)` (balk: ≥30 `#15A34A`, ≥15 `#e8784a`, anders `#dc2626`), Status (`StatusBadge` op `stage` completed/paid → Afgerond, anders In uitvoering). Totaalrij (tfoot). Tijdens laden kosten "…". Leeg: "Nog geen klantdata beschikbaar.".
- Laad: "Financiën laden..." zolang geen KPI.
- **Export CSV** `bossbase-financien-export-<YYYY-MM-DD>.csv`, kolommen Klant, Stad, Gefactureerd, Kosten, Betaald, Openstaand, Nettoresultaat, Marge, Status. Let op: gebruikt `r.costs.toFixed(2)` terwijl rijen geen `costs`-veld hebben → vermoedelijk TypeError bij export (bug in dashboard; niet overnemen).

---

## 6. Uren (`uren` → `UrenPageV2`)

Bestanden: `src/pages/UrenPageV2.jsx` (1072 r., geïmporteerd als `UrenPage` in `App.jsx:30`), `src/services/urenService.js`, `src/services/werkbonUrenService.js`, `src/components/UrenVelden.jsx`, `src/components/UrenHerinneringModal.jsx` (altijd gemount, `App.jsx:1995`).

### 6.1 Zichtbaarheid / rechten
- Menu en route: **geen** `permission`, **geen** `feature` → iedereen.
- Welke rijen je ziet bepaalt RLS op `urenregistratie`/`werkbon_uren` (UI filtert niet op eigen vs team; policies staan niet in deze repo-migraties terug te vinden voor `urenregistratie`).
- `canBookForOthers = role ∈ {admin, planner}` (:689): medewerkerkeuze in de modal (default jezelf, "(ikzelf)"), eigenaar corrigeren bij bewerken. Anders altijd `profile_id = eigen id`.
- Bewerken/verwijderen-iconen staan bij **elke** werkdagregel; RLS weigert andermans regels.
- Readonly/pakket: "Uren registreren" + FAB via `guardSchrijven('Uren boeken', …)`; DB: restrictive INSERT-policy `bb_mag_schrijven()` op `urenregistratie` en (`readonly_werkbon_uren`, migratie 20260930183000) op `werkbon_uren`.
- Werkbonuren boeken: alleen uitvoerders (`werkbon.assignedToIds`) of verantwoordelijken (`werkbon.verantwoordelijkeIds`) + admin/planner — `magWerkbonUrenBeheren()` (`werkbonUrenService.js:41`) spiegelt RLS `bb_mag_werkbon_uren_beheren`; RLS-fout 42501 → "Alleen de uitvoerder of de verantwoordelijke van deze werkbon kan hier uren boeken."

### 6.2 Twee soorten uren (CLAUDE.md "Uren")
| | **Werkdaguren** | **Werkbonuren** |
|---|---|---|
| Tabel | `urenregistratie` | `werkbon_uren` |
| Kolommen | `id, company_id, profile_id, datum, start_tijd, eind_tijd, pauze_minuten (NOT NULL), uren, reis_km (null = niet ingevuld), notitie, type (vervallen), created_at, updated_at` | `id, company_id, werkbon_id, profile_id, datum, start_tijd, eind_tijd, pauze_minuten, uren, reis_km, notitie, created_at, updated_at` (géén project/klant; volgt uit werkbon) |
| Doel | loon/verlof, werkdag | nacalculatie, facturatie, werkbon-PDF |
| Op urenpagina | CRUD | alleen-lezen (link naar werkbon) |
| Select | `'*, profiles(full_name)'`, sort `datum desc, created_at desc, id asc`, `alleRijen` | `'*, profiles(full_name), werkbonnen(id, titel, customer_id, project_id)'`, idem sort |

- **Uursoorten**: tabel `uursoorten` en kolom `urenregistratie.uursoort_id` zijn **verwijderd** (migratie `20260831130000_uursoorten_terug.sql`). Er zijn geen uursoorten, geen toeslagen, geen verlof/ziekte-registratie (bevestigd in `content/kennisbank/uren-en-materialen-per-klus.md:123`).
- Projecturen = alleen werkbonuren (RPC `bb_uren_per_project`, zie §1.2).

### 6.3 Berekening — `berekenUren(start, eind, pauze)` (`urenService.js:45`)
```
null als start of eind ontbreekt of niet parsebaar
pauze  = max(0, Number(pauze) || 0)
minuten = (eh*60 + em) − (sh*60 + sm) − pauze
null als minuten <= 0          // geen nachtdienst over middernacht
uren   = round2(minuten / 60)
```
- `create*`: als `uren` leeg/0 en tijden aanwezig → berekenen; daarna `uren <= 0` → "uren moet groter zijn dan 0"; datum verplicht; profile_id verplicht.
- `update*`: herberekent bij wijziging van start/eind/pauze (alleen als resultaat niet null).
- **Afronding tijden**: `rondAfOpVijf(tijd)` (`UrenVelden.jsx:86`) op blur: `round((h*60+m)/5)*5`; time-inputs `step=300`.
- **Pauze**: knoppen `PAUZE_KEUZES = [0 ("geen"), 15, 30, 60]` + "anders" (vrij getal, step 5, min 0).
- `reis_km`: leeg → `null` (≠ 0), anders getal ≥ 0.
- `calculateHours` = deprecated alias.

### 6.4 Pagina-opbouw
- Kop "Urenregistratie" / "Bekijk, filter en beheer urenregistraties van je team" + knop "Uren registreren" (mobiel FAB ≤767px).
- **Soort-tabs** (`SOORTEN`): "Werkdaguren" (default), "Werkbonuren", "Werkdag naast klus".
- **Periode-tabs** (in URL `?tab=`, `useUrlTab`): Alles (default) / Dag / Week (ma–zo, label "Week N · d mmm – d mmm") / Maand ("September 2026"); vorige/volgende (niet bij Alles). Filtering client-side (alles wordt in één keer geladen, zonder datumfilter).
- **Medewerkerfilter** (Dropdown): "Alle medewerkers" + unieke `profileId → medewerkerNaam` uit béide soorten, alfabetisch. Teller "N registratie(s)".
- **KPI's** (over periode, **niet** over medewerkerfilter; bron = werkbonuren in werkbon-tab, anders werkdaguren):
  - "Totaal uren"/"Totaal werkbonuren" = round2(Σ uren), hint "Som over de week/…"
  - "Medewerkers" = aantal unieke `profileId`
  - "Gem. per dag" = round2(totaal / aantal unieke datums), hint "Over N dagen"
  - Vergelijk-tab: "Werkdaguren", "Op klussen", "Verschil" (= werkdag − klus).
- **Werkdag-tabel** (desktop): Datum (dd-mm-jjjj), Medewerker (avatar met initialen, tint uit naamhash over `#fde68a, #bfdbfe, #fecaca, #c7d2fe, #bbf7d0, #fbcfe8, #fef08a, #a7f3d0`), Start–Eind, Pauze ("x min"/"geen"), Uren (2 dec), Notitie (ellipsis), Acties (bewerken, verwijderen). Sortering datum desc, dan created_at desc.
- **Mobiel**: gegroepeerd per datum ("Vandaag"/"Gisteren"/weekdag + datum, groepstotaal "x.xx uur"), kaart met naam, uren, tijden, pauze, notitie, acties.
- **Werkbonuren-tabel**: Datum, Medewerker, Werkbon (link → `navigatePage('werkbonnen',{id})`), Start–Eind, Pauze, Uren, Opmerking. Uitlegregel "Hier alleen ter inzage; wijzigen doe je op de werkbon."
- **Vergelijking** (`DagVergelijking`): per `datum|profileId`: Werkdag, Op klussen, Verschil (`round2(dag − klus)`, "gelijk" bij 0). Geen waarschuwing/blokkade.
- Staten: "Laden…"; fout-strip "Kon urenregistraties niet laden — <fout>"; leeg "Geen urenregistraties gevonden" / "Geen werkbonuren in deze periode" / "Niets te vergelijken in deze periode".
- **Export**: geen export op de urenpagina.

### 6.5 Registreren / bewerken (`UrenModal`, :471)
Velden: Datum* ("Datum is verplicht"), Medewerker (alleen admin/planner), Starttijd, Eindtijd (hint "≈ x.xx uur (n min pauze eraf)"; fout "Eindtijd moet later zijn dan starttijd" of "Er blijft geen tijd over na aftrek van de pauze"), Pauze (knoppen), Gereden kilometers (optioneel), Notitie. Enter = opslaan. Opslaan disabled zolang datum leeg of tijden ongeldig. Tijden zijn **niet** verplicht op het formulier, maar zonder tijden en zonder `uren` faalt de service ("uren moet groter zijn dan 0") — er is geen los urenveld.
- Toasts: "Uren geregistreerd" / "Uren opgeslagen" / "Uren verwijderd". Verwijderen: bevestigingsmodal "Deze urenregistratie verwijderen?" + optimistic delete met rollback. Na opslaan `bumpRefresh()`.

### 6.6 Uren-herinnering (`UrenHerinneringModal`)
- Alleen voor rol ≠ admin én als het team > 1 actief lid heeft.
- Instellingen (`getBedrijfsinstellingen()`): `urenHerinneringIntervalMin` (0 = uit; snooze-interval), `urenHerinneringMoment` (`volgende_ochtend` | `einde_dag` (17:00) | `na_werkdag` (laatste geplande eindtijd, terugval 17:00)), `urenHerinneringUitgesloten` (profiel-ids), `urenHerinneringDagen` (1=ma … 7=zo).
- Logica: geplande dagen (werkbonnen waarop je in de dagploeg staat + activiteiten met `assigned_to_ids`) in de laatste **14 dagen** (`LOOKBACK_DAYS`) zonder werkdaguren (`urenregistratie` op profile_id+datum) → per dag invulregel (start/eind/pauze) en direct boeken via `createUrenregel`. Snooze in `localStorage['bb_uren_herinnering_snooze_<uid>']`. Mail via cron/Edge Function `uren-herinnering` met DB-functie `bb_uren_herinnering_kandidaten` (zelfde regels).

---

## 7. Snelle referentie: Edge Functions, RPC's, buckets

| Soort | Naam | Waar gebruikt |
|---|---|---|
| Edge Function | `send-email` | offerte/factuur/herinnering mail (`emailService.sendEmail`) |
| Edge Function | `sign-offerte` | ondertekenen (`emailService.signOfferte`) |
| Edge Function | `offerte-pdf-url` | signed URL getekende offerte-PDF |
| Edge Function | `getekende-pdf-nazenden` | ontbrekende getekende PDF nasturen |
| Edge Function | `stripe-create-payment-link` | betaallink in factuurmail |
| Edge Function | `stripe-pay-link` | publieke `/betaal/<token>` |
| Edge Function | `stripe-connect-start`, `stripe-connection-status` | Stripe-koppeling |
| Edge Function | `moneybird-sync-btw` | btw-periodes ophalen (Financiën) |
| Edge Function | `uren-herinnering` (cron) | urenherinneringsmail |
| RPC | `bb_uren_per_project` | uren per project |
| RPC | `mark_factuur_betaald(p_factuur_id, p_betaald_op)` | factuur betaald |
| RPC | `bb_financien_kpi(p_van, p_tot)` | Financiën-tegels |
| RPC (anon) | `get_offerte_by_sign_token`, `get_offerte_items_by_token`, `get_company_by_sign_token`, `get_customer_by_sign_token` | tekenpagina |
| RPC (anon) | `get_payment_branding(p_token)` | betaalpagina's |
| DB-trigger/functie | `bb_project_status_bijwerken`, `bb_deal_project_aanmaken`, `bb_factuurtotalen`, `bb_offertetotalen`, `bb_mag_werkbon_uren_beheren`, `bb_mag_schrijven`, `bb_offerte_telt_mee`, `bb_gedeelde_werkruimte`, `bb_uren_herinnering_kandidaten` | server-side regels |
| Bucket | `project-fotos` (privé), `factuur-pdfs` (privé, `{company}/{factuur}.pdf`), `kosten-bijlagen` (privé), `signed-offertes` (privé, alleen service-role) | |
| Tabellen | `projects, project_notes, project_fotos, project_kosten, offertes, offerte_items, facturen, factuur_regels, job_costs, kosten_categorieen, urenregistratie, werkbon_uren, email_templates, sent_emails, stripe_connections, btw_periodes, inquiries, deals` | |

## 8. Opvallende punten / valkuilen voor de mobiele app
1. Offertes en facturen "beheren" hangt aan **rol admin/planner**, niet aan een rechtencode; projecten aan `projecten_bewerken` (of admin/planner); kosten aan niets (alleen route).
2. Projectstatus wordt door DB-trigger afgeleid uit werkbonnen; "voltooien/heropenen/verloren" zit op de **deal** (`afgerond_op`, `status='lost'`).
3. Alle bedragen-totalen: per tarief afronden, `round2`. Verlegd/vrijgesteld = 0% btw; credit = negatieve bedragen.
4. Verstuurde factuur = boekstuk (alleen status wijzigbaar; kopiëren of crediteren). Verstuurde offerte = herzien via nieuwe versie `-vN`.
5. Nummering via `count+1` (`BB-001`, `BB-F001`, `BB-CF001`) — race-gevoelig; mobiel zou idealiter server-side nummeren.
6. Vervaldatum nieuwe factuur gebruikt `offerteGeldigDagen` (niet `betaaltermijn_dagen`).
7. Factuur-filtertab "Aangemaakt" matcht DB-status `concept` niet.
8. Financiën CSV-export verwijst naar niet-bestaand `r.costs`.
9. PDF's worden **client-side** met jsPDF gemaakt (ook de getekende versie, in de browser van de klant); facturen worden bij versturen/definitief in `factuur-pdfs` bewaard voor webhook en boekhouding — de mobiele app moet hetzelfde doen of een server-route gebruiken.
10. Kosten: leverancier en (per categorie) bon verplicht; `amount` altijd excl. btw opgeslagen; werkbonmateriaal is geen boeking en telt nergens mee behalve in de projectmarge.
