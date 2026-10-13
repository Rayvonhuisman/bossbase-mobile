# Inventaris C — Werkbonnen, Planning, Materialen (BossBase-dashboard)

Bron: `/Users/macbook/BossBase-billing` (branch `main`), alleen gelezen. Paden hieronder zijn relatief aan `src/` tenzij anders vermeld.
Doel: functionele pariteit voor de mobiele app.

---

## 0. Gedeelde basis: rechten, modules, pakketten

### 0.1 Navigatie en routes (`App.jsx`)
| Pagina-id | Label | NAV-`permission` | NAV-`feature` (pakket) | Component | Regel |
|---|---|---|---|---|---|
| `werkbonnen` | Werkbonnen | — | — | `WerkbonPage` (= `WerkbonPageV2`) | App.jsx:116, 1648 |
| `planning` | Planning | `planning` | `planning` | `PlanningPage` | App.jsx:114, 1642 |
| `materialen` | Materialen | — | — | `MaterialenPage` | App.jsx:117, 1639 |

- URL-vorm: `/dashboard/<pagina>`; werkbondetail is deelbaar als `/dashboard/werkbonnen/<id>` (App.jsx:1404, 1428-1429). Terug in de browser sluit het detail (WerkbonPageV2.jsx:1611-1725).
- Publieke ondertekenpagina (zonder login): `/werkbon/<sign_token>` → `WerkbonOndertekenen` (App.jsx:1729-1734).
- Paginatitels: Planning "Weekplanning per medewerker en voertuig", Werkbonnen "Uitvoeropdrachten op locatie", Materialen "Standaardmaterialen met prijs en leverancier" (App.jsx:1064-1069).
- Routebeveiliging (App.jsx:1567-1603): pagina met `permission` vereist `isAdmin || userPermissions.includes(perm) || (gedeelde_werkruimte && INZAGE_RECHTEN.has(perm))`; pagina met `feature` vereist `planStatus.features.includes(feature)`. Anders toast + terug naar dashboard. Menu verbergt hetzelfde (App.jsx:279-284).
  - Let op: de routegate kent de rol `planner` NIET als planning-recht (alleen `usePermissions.can` doet dat, hooks/usePermissions.js:59). Een planner zonder expliciet recht `planning` in `user_permissions` wordt dus via de route-gate teruggestuurd. Pagina zelf checkt `can('planning')`.

### 0.2 Rechtencheck (`hooks/usePermissions.js`)
- `magBewerken(perm)`: admin → altijd true; rol `planner` + perm `planning` → true; anders `userPermissions.includes(perm)` (r.54-61).
- `can(perm)`: als pakketfeature `gedeelde_werkruimte` aan staat en perm ∈ `INZAGE_RECHTEN` → true voor elke ingelogde gebruiker; anders `magBewerken` (r.65-68).
- `INZAGE_RECHTEN` = verkoop, offertes, facturen, kosten, bedrijfsfinancien, **projectbedragen**, alles_inzien, agenda_inzien, projecten, database, team (r.28-40). Bewust NIET: `werkbonnen_bewerken`, `planning`, `inkoopprijzen`, `klanten_bewerken`, `projecten_bewerken`.

### 0.3 Rechtcodes die in dit deel voorkomen
| Code | Effect |
|---|---|
| `werkbonnen_bewerken` | Alle werkbonnen beheren (aanmaken, bewerken, status) — naast rollen admin/planner |
| `planning` | Planning-pagina openen; blokken slepen/rekken; "Planning aanpassen" op werkbondetail |
| `inkoopprijzen` | Inkoopprijs zien/zetten (materialen + werkbonmaterialen), kostprijs-kop in Kosten-blok |
| `projectbedragen` | Verkoopprijs, subtotaal en totalen in het Materialen-blok van een werkbon |
| `kosten` (+ feature `kosten_nacalculatie`) | Kosten-blok op werkbon zichtbaar |
| `projecten_bewerken` | Inkopen in Kosten-blok toevoegen/bewerken; "+ Nieuw project…" in werkbonformulier |
| `klanten_bewerken` | "+ Nieuwe klant…" in werkbonformulier |

### 0.4 Pakketten / modules (`lib/features.js`)
- `werkbonnen`: in Starter (dus overal) (features.js:70-74).
- `kosten_nacalculatie`, `digitale_handtekening`: vanaf Groei (r.76-79).
- `planning` en `voertuigen`: in Team (r.81-83); bij Groei los bij te kopen als module (planning € 10, voertuigen € 5; voertuigen `vereist: 'planning'`) (r.108-111).
- Groei krijgt ook `gedeelde_werkruimte` (r.89).
- Readonly-abonnement (`plan.readonly`): `guardSchrijven(actie, fn)` blokkeert schrijfacties met een upgrade-/readonly-modal (components/PlanUpgradeModal.jsx:38-50). Gebruikt op "Nieuwe werkbon" (WerkbonPageV2.jsx:2214, 2632, 2677). De DB dwingt readonly ook af (zie §5).

### 0.5 Statussen werkbon (`utils/statusColors.js`)
Alleen drie statuswaarden: `gepland`, `in_uitvoering`, `afgerond` (aliassen `planned`/`in_progress`/`done`) (statusColors.js:70-77).
| Status | Label | Tone | bg | tekst | dot |
|---|---|---|---|---|---|
| `gepland` | Gepland | blue | `#eff6ff` | `#2563eb` | `#2563eb` |
| `in_uitvoering` | In uitvoering | orange | `#fff4ec` | `#e8784a` | `#e8784a` |
| `afgerond` | Afgerond | green | `#ecfdf5` | `#15A34A` | `#15A34A` |
(tones: statusColors.js:18-26). Badge = pill met dot (WerkbonPageV2.jsx:96-104).

Afgeleide "toestanden" (geen statuswaarde):
- **Op slot / ondertekend**: `ondertekend_op` gevuld → `opSlot` (werkbonService.js:84).
- **Ter ondertekening verstuurd**: `verstuurd_op` gevuld en niet getekend.
- **Ingepland**: minstens één dag met starttijd (`isIngepland`, utils/werkbonDagen.js:145).

---

## 1. Werkbonnen — lijst

**Bestand:** `pages/WerkbonPageV2.jsx` (lijst r.2621-2704).

### Data
- `getWerkbonnen()` (services/werkbonService.js:217-238): `from('werkbonnen').select(<sel>, {count:'exact'}).order('gepland_op', asc).order('id', asc).range(van, van+999)` in een lus tot alles binnen is (géén server-side paginering in de UI; alles wordt geladen).
- Select (stand 4, r.144, 158): `*, customers(name), profiles(full_name), projects(name), werkbon_dagen(id, datum, starttijd, eindtijd, medewerker_ids, medewerker_tijden, voertuig_ids, voertuig_tijden, medewerker_voertuig)`.
  - Terugvalmechanisme `metDagen` (r.156-197): bij fout over onbekende kolom zakt het naar stand 3/2/1/0 (minder dagvelden). Voor de app: uitgaan van stand 4.
- Parallel: `listCustomers()`, `getAllWerkbonTakenCounts()` (r.735-750: `werkbon_taken` select `werkbon_id, afgerond` waar `is_meerwerk=false`, alle rijen via `alleRijen`), `getProjects()` (WerkbonPageV2.jsx:1677-1696).
- Herladen bij `refreshKey` (globaal sein na wijzigingen elders, bv. slepen in planning) (r.1698).

### Mapper `toWerkbon` (werkbonService.js:22-97) — velden die de app nodig heeft
`id, company_id, customer_id, deal_id, offerte_id, project_id, assigned_to (primair), assigned_to_ids[] (valt terug op [assigned_to]), verantwoordelijke_ids[], voertuig_ids[], titel, omschrijving (HTML uit NoteEditor), status (default 'gepland'), gepland_op (= vroegste dag, door DB bijgehouden), dagen[] (gesorteerd op datum), starttijd, eindtijd, locatie, notes (oud intern veld), werkbon_notities (oude tekstkolom), nummer, sign_token, ondertekend_op, handtekening_url, ondertekend_door_naam, ondertekend_door_email, ondertekende_pdf_url, verstuurd_naar_email, verstuurd_op, gestart_op, afgerond_op, created_at, customers.name, profiles.full_name, projects.name`.
Afgeleid: `opSlot = !!ondertekend_op`; `effectiveStartOp = gestart_op || plannedStartIso(gepland_op, starttijd)` (r.85-89, r.15-20).

Dag-object (`werkbon_dagen`): `datum, starttijd|null, eindtijd|null` (null = tijd van werkbon), `medewerker_ids` (null = hele ploeg, [] = niemand), `medewerker_tijden {profielId:{starttijd,eindtijd}}`, `voertuig_ids` (null = alle voertuigen van de werkbon), `voertuig_tijden {voertuigId:{...}}`, `medewerker_voertuig {profielId: voertuigId}` (r.47-64).

### UI en gedrag
- Kop "Werkbonnen", foutregel in rood `#dc2626` onder de titel (r.2627-2628).
- Knop **"+ Nieuwe werkbon"** alleen als `canManage` (r.2631-2635); via `guardSchrijven` (readonly-blok).
  - `canManage = !profile || role ∈ {admin, planner} || can('werkbonnen_bewerken')` (r.1625).
- **Zoeken** (client-side): placeholder "Zoek op titel, klant of locatie…"; match `"${titel} ${customerName} ${locatie}".toLowerCase().includes(q)` (r.1779-1786, 2638-2645).
- **Statusfilter-chips**: Alle / Gepland / In uitvoering / Afgerond, elk met teller en status-dot (r.2647-2665; tellers r.1772-1777).
- **Sortering**: alleen die van de query (`gepland_op` oplopend, dan `id`); niet-geplande (null) volgen de Postgres-default (nulls last bij asc). Geen UI-sortering.
- **Paginering**: geen (alles in één lijst; ophalen per 1000 tot compleet).
- **Kaart** (`WerkbonListCard`, r.467-499): titel + status-badge (sm); klantnaam; locatie met kaart-icoon; datum = `planningLabel(w)` ("ma 3 nov" of "ma 3 nov – vr 7 nov · 5 dagen", utils/werkbonDagen.js:148-153) + ` · <vroegste starttijd>` uit `werkbonVenster(w)` (r.118-127); takenvoortgang `done/total` + balk (alleen als total>0, meerwerk telt niet mee).
- **Zichtbaarheid lijst**: de UI filtert niet op toewijzing; wat je ziet bepaalt RLS (zie §5).
- **Laadstaat**: kaart "Werkbonnen laden…" (r.2184-2186). **Fout**: rode regel onder titel (`err`). **Leeg** (na filter): icoon, "Geen werkbonnen gevonden", "Pas de filters aan of maak een nieuwe werkbon aan.", knoppen "Filters wissen" en (canManage) "Nieuwe werkbon" (r.2667-2682).
- Tik op kaart → detail (via URL `werkbonnen/<id>`).

---

## 2. Werkbonnen — detail

**Bestand:** `pages/WerkbonPageV2.jsx` r.2188-2619.

### Data bij openen (r.1727-1757), parallel, elk met eigen `catch`
| Aanroep | Query |
|---|---|
| `getWerkbonById(id)` | `werkbonnen` select (stand 4) `.eq('id').single()` (werkbonService.js:240-248) |
| `getWerkbonTaken(id)` | `werkbon_taken` `*` `.eq(werkbon_id).eq('is_meerwerk', false).order('volgorde')` (r.451-463) |
| `getWerkbonTaken(id,{soort:'meerwerk'})` | idem met `is_meerwerk = true` |
| `getWerkbonMaterialen(id)` | `werkbon_materialen` select `*, werkbon_materiaal_inkoop(inkoopprijs_per)` `.order('created_at')` (r.512-527) |
| `getWerkbonUren(id)` | `werkbon_uren` select `*, profiles(full_name)` order `datum`, `start_tijd` (nullsFirst) (werkbonUrenService.js:49-61); bij fout → [] |
| `getWerkbonFotos(id)` | `werkbon_fotos` `*` order `created_at`; daarna `storage.from('werkbon-fotos').createSignedUrls(paths, 3600)` (werkbonService.js:650-666) |
| `getWerkbonNotities(id)` | `werkbon_notities` select `*, profiles(full_name)` order `created_at desc` (r.777-786) |
Extra eenmalig: `getTeamMembers()` (voor namen/@-tags) en `getCurrentCompany()` (PDF-huisstijl) (WerkbonPageV2.jsx:1701, 1710).

### Rechten in het detail
- `canEditDetail = canManage || detail.verantwoordelijkeIds.includes(profile.id)` (r.1832).
- `opSlot = !!detail.ondertekendOp`; `canEdit = canEditDetail && !opSlot` (r.2195-2197).
- `viewOnly = !canEditDetail` → badge **"Alleen inzage"** (grijs, tooltip "Je bent gekoppeld aan deze werkbon maar niet verantwoordelijke; je kunt alleen inzien.") (r.2202, 2240-2245).
- Matrix:

| Rol | Bewerken-knop (volledig formulier) | Taken/meerwerk/materiaal/foto's | Notities toevoegen | Uren boeken | Status starten/afronden | Planning aanpassen |
|---|---|---|---|---|---|---|
| admin / planner / `werkbonnen_bewerken` (canManage) | ja | ja (niet op slot) | ja | ja (ook namens anderen: alleen admin/planner) | ja | als `can('planning')` en niet op slot |
| Verantwoordelijke van deze bon | nee | ja (niet op slot) | ja | ja | ja | alleen met `planning`-recht |
| Gekoppeld (uitvoerder), niet verantwoordelijk | nee | nee ("Alleen inzage") | nee | **ja** (`magWerkbonUrenBeheren`) | nee | alleen met `planning`-recht |
| Niet gekoppeld, geen recht | ziet de bon alleen als RLS hem teruggeeft (§5) | nee | nee | nee | nee | — |

`magWerkbonUrenBeheren(werkbon, profile)`: admin/planner of profiel in `assigned_to_ids` of `verantwoordelijke_ids` (werkbonUrenService.js:41-47). RLS-helper heet `bb_mag_werkbon_uren_beheren`.

### Blokken (volgorde op scherm)
1. **Kop** "← Werkbonnen" (of "← Terug naar <klant>" als je via klantkaart kwam) + (canManage) "Nieuwe werkbon" (r.2206-2218).
2. **Headerkaart** (r.2227-2299): projectlabel-knop (groen `#0F7A3F` op `#E8FBEF`, opent project), status-badge, "Alleen inzage", (canManage) knop **Bewerken**; groot: klantnaam (klikbaar → klantkaart) anders titel; daaronder titel; locatie; datum `planningLabel` + venster `starttijd – eindtijd` (vroegste start/laatste eind over alle dagen en personen); **MijnVoertuig** (§2.10).
3. **MijnPlanningMelding** (components/WerkbonVoertuigen.jsx:120-160): alleen als jij in de dagploeg staat op een dag ≥ vandaag: "**Jij bent vandaag/morgen/op <dag> ingepland** van HH:MM tot HH:MM · <Bus (kenteken)> · samen met N collega('s)". Eigen tijd → dagtijd → werkbontijd.
4. **Actierij** (3 knoppen, r.2305-2323):
   - **Bel klant**: `tel:` met `customers.phone` (spaties weg); disabled zonder klant; zonder nummer toast "Geen telefoonnummer bekend voor deze klant" (r.2152-2158).
   - **Route**: `https://maps.google.com/?q=<locatie>` in nieuw venster; disabled zonder locatie (r.2160-2163).
   - **Start klus / Afronden / Afgerond**: disabled als `!canEdit` of afgerond. `gepland` → update status `in_uitvoering` (+ `gestart_op = now()` eenmalig, zie §2.8); `in_uitvoering` → afrondflow (r.2039-2053).
5. **Slotmelding** als ondertekend (rand links `#0f9d58`): "Ondertekend door <naam>", datum/tijd nl-NL, "Uren, taken en materiaal staan op slot. Een correctie loopt via een nieuwe werkbon." + knop **"Ondertekende bon"** (opent korte link via Edge Function `document-url`, `soort:'werkbon_pdf'`, services/documentService.js:8-18) of, zonder PDF, de herstelstatus (§2.9) (r.2326-2370).
6. **Verstuurd-melding** (rand `#FDBA74`): "Ter ondertekening gestuurd naar <email> op <datum>. Nog niet getekend." (r.2373-2381).
7. **Omschrijving** (alleen als omschrijving of oud `notes`): omschrijving (HTML, @-mentions gerenderd) + gele "Interne notitie:"-balk voor oud veld `notes` (r.2384-2401).
8. **Planning** "Planning · N dag(en)" — regels via `planRegels` (components/PlanningBlok.jsx): per dag datum, venster, wie (met afwijkende eigen tijd achter de naam), en per dag de bussen ("Bus 1 · 08:00–16:30 · Jan, Piet · 2/5", alleen met module voertuigen). Leeg: "Deze werkbon staat nog niet ingepland." Actie **"Planning aanpassen"** (opent het bewerkformulier) alleen als `can('planning') && !opSlot` (r.2405-2434).
9. **Taken** (`TakenSection`, r.721-784): kop "Taken · done / total" + voortgangsbalk; vinkje toggelt `afgerond`; prullenbak (confirm `Taak "<x>" verwijderen?`); invoerregel "Nieuwe taak…" + knop "+ Taak" (Enter = opslaan). Geen lege-staat-tekst. Alleen bewerkbaar met `canEdit`.
10. **Uren** "Uren · X,Xu" + "+ Boeken"/"Sluiten" (r.2440-2488). Lijst: datum ("ma 3 nov") · medewerkernaam; onderregel pauze/km/notitie; rechts `HH:MM–HH:MM` + uren met 2 dec. Formulier `HoursQuickAdd` (§2.6).
11. **Foto's** "Foto's · N" (r.1184-1248): drie categorieën:
    | key | label | kleur | bg |
    |---|---|---|---|
    | `voor` | Voor | `#2563EB` | `#EFF4FF` |
    | `tijdens` | Tijdens | `#D97706` | `#FFF7E6` |
    | `na` | Na | `#0F7A3F` | `#E8FBEF` |
    Per categorie thumbnails (tik = open signed URL), ×-knop verwijderen (confirm "Foto verwijderen?"), knop "Foto toevoegen" (`accept="image/*" capture="environment"`, één bestand). Zonder `canEdit` en leeg: "Geen foto's". Upload optimistisch met lokale preview + globale upload-indicator met retry (r.2055-2068).
12. **Materialen** (§2.5).
13. **Kosten** (`WerkbonKostenSection`, r.1099-1182): alleen met `can('kosten') && plan.has('kosten_nacalculatie')`. Kop: met `inkoopprijzen` "Kostprijs" (= materiaal op inkoopprijs + inkopen) met subregel "materiaal € · inkopen €", anders "Inkopen". Lijst inkopen (InkopenKaart) = `project_kosten`-rijen met `werkbon_id`; toevoegen via `createProjectKost(werkbon.projectId, {...form, werkbon_id})`; bewerken/toevoegen alleen admin/planner/`projecten_bewerken`. Bron: `getWerkbonKostenBron(werkbon.id)` → `{ jobCosts, projectKosten }`; totaal via `bouwKostenOverzicht` (services/kostenOverzichtService.js). Melding over "N boekingen op de Kosten-pagina … tellen niet mee". Herlaadt als materiaalregels wijzigen.
14. **Meerwerk** — zelfde component als taken, titel "Meerwerk", geen voortgangsbalk, uitleg-uitklap "Werk dat er tijdens de klus bij kwam … telt niet mee in de taakvoortgang.", placeholder "Wat is er extra gedaan?", knop "+ Meerwerk" (r.2500-2511). Opslag: `werkbon_taken` met `is_meerwerk = true` (geen prijs, geen aparte tabel; oude `werkbon_meerwerk` verwijderd).
15. **Notities** (§2.7) en **Waarschuwingen aan de klant** (§2.7).
16. **Eindacties** (r.2531-2558): "Werkbon als PDF" (altijd); "Klus afronden" (niet afgerond en `canEditDetail`); "Laten ondertekenen" (afgerond, niet op slot, `canEditDetail`); disabled groene knop "Ondertekend en afgerond · <datum>" als op slot.

Laadstaat detail: "Detail laden…" zolang er nog geen detail is (r.2220-2222). Fouten per onderdeel worden stil opgevangen (lege lijst).

### 2.5 Materialen-blok op de werkbon (`MaterialenSection`, r.788-1074)
- Rechten: `magInkoop = can('inkoopprijzen')`; `magBedragen = can('projectbedragen')`; toevoegen/wijzigen = `canEdit` (ook zonder bedragenrecht: monteur noteert verbruik; bibliotheekmateriaal krijgt prijs automatisch, vrij materiaal komt op 0).
- Kolommen (desktop grid) in volgorde: Materiaal · Aantal · Eenheid · [Verkoop als magBedragen] · [Inkoop als magInkoop] · Leverancier · [Subtotaal + "incl." als magBedragen] · acties. Mobiel (≤768px) als kaartjes.
- Invoerregel: select "Kies materiaal" met actieve bibliotheek (`listMaterialen({inclusiefInactief:false})`) + optie "Vrij materiaal (zelf invullen)…" → dan naamveld. Defaults `{ eenheid:'stuk', aantal:1, prijs_per:'', btw_pct:21 }`.
  - Bibliotheekkeuze vult: naam, eenheid, `prijs_per = verkoopprijs`, `btw_pct`, `materiaal_id`, `inkoopprijs_per = inkoopprijs`, `leverancier_id` (r.829-845). Inkoop en leverancier liggen daarna **vast** (readonly, title "Ligt vast op het materiaal in de bibliotheek").
  - Vrij materiaal: inkoop (p/st, alleen met recht) en leverancier (LeverancierSelect, kan nieuwe leverancier aanmaken) vrij in te vullen.
  - Knop "+" disabled zonder naam.
- Opgeslagen regels staan grijs/dicht; één regel tegelijk open via potlood (RegelKnoppen); velden wijzigen schrijft direct (optimistisch, terugdraaien bij fout) (WerkbonPageV2.jsx:1895-1915). Verwijderen met confirm `Materiaal "<naam>" verwijderen?`.
- **Berekeningen**: `subtotaal = round(aantal × prijs_per, 2)` (werkbonService.js:530-532, 582-590); incl. btw via `calcBtw(sub, btw_pct, 'excl').incl`; voet "Totaal materiaal (excl. BTW)" + "€ … incl. BTW" (alleen magBedragen). Bedragformaat `€ 12,34`.
- **Opslag**: insert `werkbon_materialen` {werkbon_id, naam, eenheid, aantal, prijs_per, subtotaal, materiaal_id, leverancier_id, btw_percentage, company_id}; daarna (alleen als inkoop ingevuld) update `werkbon_materiaal_inkoop.inkoopprijs_per` waar `werkbon_materiaal_id = id` (rij is al door trigger aangemaakt; zonder recht weigert RLS stil) (werkbonService.js:529-568). Update: idem gesplitst (r.570-616). Prijzen worden **gekopieerd**, niet gerefereerd.
- De kostregel in `job_costs` (nacalculatie) maakt de DB zelf (trigger, aantal × inkoopprijs, anders verkoopprijs) — niet vanuit de client (WerkbonPageV2.jsx:1878-1883).

### 2.6 Uren boeken (`HoursQuickAdd`, r.503-713)
- Zonder `magWerkbonUrenBeheren`: tekst "Uren op deze werkbon worden geboekt door de uitvoerder of de verantwoordelijke. …" (r.579-587).
- Velden: Datum* (default vandaag), [Medewerker — alleen admin/planner, lijst teamleden, "(ikzelf)"], Starttijd, Eindtijd (`type=time step=300`, op blur afgerond op 5 min `rondAfOpVijf`), Pauze (minuten, knoppen `PauzeKnoppen`), Gereden kilometers (optioneel, integer), Notitie.
- Berekening: `uren = berekenUren(start, eind, pauze)` = eind − begin − pauze (CLAUDE.md "Uren"); hint "≈ X,XX uur (N min pauze eraf)". Fout: "Eindtijd moet later zijn dan starttijd" / "Er blijft geen tijd over na aftrek van de pauze". Opslaan disabled tot datum+start+eind geldig.
- Insert `werkbon_uren` {company_id, werkbon_id, profile_id, datum, start_tijd, eind_tijd, pauze_minuten, uren, reis_km (leeg = null, niet 0), notitie} (werkbonUrenService.js:89-124). RLS-fout 42501 → "Alleen de uitvoerder of de verantwoordelijke van deze werkbon kan hier uren boeken."
- Geen bewerken/verwijderen van uren in het werkbondetail (service heeft wel `updateWerkbonUur`/`deleteWerkbonUur`, gebruikt op urenpagina).

### 2.7 Notities (klant vs intern) en Wkb-waarschuwing
- Tabel `werkbon_notities`: `note`, `voor_klant` (default false), `gevolg`, `waarschuwing_verzonden_op`, `waarschuwing_verzonden_naar`, `created_by`, `profiles(full_name)` (werkbonService.js:758-775).
- UI (`NotitiesSection`, r.1459-1607): twee tabs **Intern** / **Voor de klant** met tellers. Waar je typt bepaalt de zichtbaarheid (geen vinkje). Op tab klant blauwe regel (`#075985` op `#F0F9FF`, rand `#BAE6FD`): "Deze regels staan op de werkbon-PDF en op de pagina waar de klant tekent."
- Toevoegen: `addWerkbonNotitie(werkbonId, text, voorKlant)` (leeg geweigerd) + `createMentionNotifications` voor @-tags (r.2114-2129). Toast "Notitie opgeslagen" / "Notitie voor de klant opgeslagen".
- Per regel: "Naar de klant" / "Naar intern" (`updateWerkbonNotitieZichtbaarheid`, toast "Staat nu op de werkbon"/"Weer intern").
- Op tab klant per regel: **"Waarschuwing voor klant"** (of label "Gewaarschuwd" als al verzonden) → `WaarschuwingModal` (r.1272-1409): stap invoer (Wat heb je geconstateerd?* · Wat kan daarvan het gevolg zijn? (optioneel) · Naar welk e-mailadres?* (default klant-email)) → stap voorbeeld (iframe met exact de mail) → "Nu versturen" (rood `#dc2626`). Service `verstuurWaarschuwing`: e-mail via Edge Function `send-email`, log in mailarchief (`logSentEmail`), dan pas `legWaarschuwingVast` (zet note, gevolg, verzonden_op, verzonden_naar) (werkbonOndertekenenService.js:297-323). Onderwerp "Belangrijke constatering bij <titel>", voettekst art. 7:754 BW.
- **Waarschuwingen aan de klant**-sectie (r.1415-1457): alle notities met `voorKlant && verzondenOp`; geel blok (`#FFFBEB`, rand `#FDE68A`, linkerrand `#F59E0B`), "GECONSTATEERD", "MOGELIJK GEVOLG", "Schriftelijk gemeld op <datum> aan <email>".
- Readonly-weergave (geen canEditDetail): lijst van kaartjes, of "Nog geen interne notities." / "Nog geen notities voor de klant.".
- Notitie bij aanmaken werkbon gaat als **eerste interne logregel** (niet in `werkbonnen.notes`) (r.272-282).

### 2.8 Status, starten, afronden, ondertekenen
- **Start klus**: `updateWerkbon(id, {status:'in_uitvoering'})`; service zet daarna eenmalig `gestart_op = now()` met guard `.is('gestart_op', null)` (werkbonService.js:394-420).
- **Afronden** (`requestComplete`, r.1953-1962): als `effectiveStartOp` ontbreekt (geen gestart_op én geen gepland_op+starttijd) eerst modal **"Wanneer is de klus gestart?"** (Startdatum max vandaag, Starttijd; "Opslaan & verder" → `gestart_op` = ISO van datum+tijd) (r.1966-1978, 2571-2601). Daarna `WerkbonAfrondenModal`.
- **WerkbonAfrondenModal** (components/WerkbonAfrondenModal.jsx):
  - Samenvatting-tegels: Taken `done/total`, Uren `X,XX u`, Materiaal (aantal regels), Foto's (r.162-167).
  - Openstaande taken met vinkjes (oranje blok `#FFF7ED`/`#FDBA74`/`#9A3412`): "Deze taken komen niet op de bon die de klant tekent…" (r.173-212).
  - Waarschuwing als geen uren: "Er zijn nog geen uren op deze werkbon geboekt. Na ondertekenen kan dat niet meer…" (r.214-219).
  - Info: "Op de werkbon staan geen bedragen…" (r.221-226). Knop "Bekijk de bon zoals de klant hem ziet" (PDF in nieuw venster).
  - Drie uitkomsten (r.7-10, 265-299):
    1. **"Klant tekent nu"** → Naam ondertekenaar*, E-mailadres* (regex `^[^\s@]+@[^\s@]+\.[^\s@]+$`), `HandtekeningCanvas` (hoogte 160, lijn `#1e293b` 2.5px, "Wissen", `toDataURL('image/png')`), knop "Ondertekenen en afronden" (disabled zonder handtekening). Bouwt PDF (base64) in de browser mét handtekening; roept Edge Function **`sign-werkbon`** met `{ sign_token, name, email, signature_data_url, signed_pdf_base64?, pdf_fout? }` (werkbonOndertekenenService.js:138-157). Server zet afgerond + ondertekend (op slot) en mailt; `warnings[]` in antwoord worden als fouttoast getoond. Daarna werkbon opnieuw ophalen (WerkbonPageV2.jsx:1981-2002).
    2. **"Per mail"** → e-mail klant; `verstuurWerkbonTerOndertekening`: PDF-bijlage `Werkbon-<nummer>.pdf`, mail "Werkbon <nummer> — graag uw akkoord" met knop naar `${origin}/werkbon/<sign_token>` via `send-email`; log; update `werkbonnen.verstuurd_naar_email, verstuurd_op` (r.181-240). Bon blijft open. Toast "Werkbon verstuurd naar … De bon blijft open tot de klant tekent."
    3. **"Zonder handtekening"** → `updateWerkbon(id, {status:'afgerond', afgerond_op: now, [gestart_op]})`; toast "Klus afgerond." (r.1929-1948, 2010-2016).
  - Fouten in rood `#b91c1c` onderin.
- **Alsnog laten ondertekenen**: afgerond, niet op slot → zelfde modal (r.2545-2549).
- **Heropenen**: er is GEEN aparte heropen-knop. Wie `canManage` heeft kan via **Bewerken** het statusveld (Gepland / In uitvoering / Afgerond) terugzetten (r.328-337). Na ondertekening blokkeert de DB-trigger wijzigingen (zie §5). Ook de Planning-DetailModal heeft een statusselect (PlanningPage.jsx:1096-1126).
- **Publieke ondertekenpagina** `pages/WerkbonOndertekenen.jsx` (zonder sessie): RPC's `get_werkbon_by_sign_token`, `get_werkbon_taken_by_sign_token`, `get_werkbon_uren_by_sign_token`, `get_werkbon_materialen_by_sign_token`, `get_werkbon_notities_by_sign_token`, `get_company_by_werkbon_token`, `get_customer_by_werkbon_token`, `get_werkbon_uitvoerders_by_sign_token` (alle `{ p_token }`) (r.71-78); foto's via `sign-werkbon` met `{ action:'fotos', sign_token }` (werkbonOndertekenenService.js:164-170).

### 2.9 PDF
- "Werkbon als PDF" → `downloadWerkbonPdf(bouwPdfWerkbon(detail,{uitvoerders}), bouwPdfData({...}), customer, company)` (WerkbonPageV2.jsx:2021-2037); zonder handtekening met leeg tekenvak.
- `bouwPdfData` filtert (werkbonOndertekenenService.js:58-98): alleen **afgevinkte** taken (niet-meerwerk) en afgevinkt meerwerk; uren zonder medewerkernaam (datum, start, eind, pauze, uren, notitie); materialen alleen naam/eenheid/aantal (géén prijzen); alleen klantnotities, gesplitst in toelichting en verstuurde waarschuwingen; foto's (url, categorie).
- `bouwPdfWerkbon`: id, signToken, nummer, titel, omschrijving, locatie, geplandOp, gestartOp, afgerondOp, ondertekendOp/DoorNaam/DoorEmail, handtekeningUrl/DataUrl + "UITGEVOERD DOOR" = namen van verantwoordelijken + uitvoerders (r.107-130; WerkbonPageV2.jsx:1791-1797).
- Op de PDF staan nooit bedragen, interne briefing (`notes`) of interne notities (utils/generateWerkbonPdf.js kop).
- **Herstel ontbrekende getekende PDF**: als `ondertekend_op` gezet is maar `ondertekende_pdf_url` leeg, maakt de app bij openen de PDF alsnog en stuurt die naar Edge Function **`getekende-pdf-nazenden`** met `{ soort:'werkbon', id, pdf_base64 }` (services/getekendePdfService.js:23-35; WerkbonPageV2.jsx:1802-1827). Statusteksten (kleur `#b45309`): "Getekende bon wordt alsnog gemaakt…", "Bon alsnog opgeslagen en nagestuurd. Ververs om hem te openen.", "Getekende bon ontbreekt; maken lukte niet. Open de werkbon opnieuw.", "Getekend, PDF ontbreekt".

### 2.10 Voertuigen op de werkbon (lezen)
- `MijnVoertuig` (WerkbonVoertuigen.jsx:166-213): alleen met `plan.has('voertuigen')` en `voertuig_ids` niet leeg, en niet als MijnPlanningMelding al getoond wordt. Toont "Jouw voertuig: <naam (kenteken)> · HH:MM–HH:MM" (per dag als het verschilt) of anders "Voertuigen: <namen>".

---

## 3. Werkbon AANMAKEN / BEWERKEN

Er zijn **vier** ingangen die dezelfde services gebruiken:
1. `WerkbonModal` (WerkbonPageV2.jsx:112-463) — vanaf werkbonpagina, ook geëxporteerd naar projectkaart (`pages/projects/ProjectDetailDrawer.jsx:1602`) en klantkaart (`pages/BbPages1.jsx:1443`). Modi `new` / `edit`.
2. `PlanModal` "Werkbon inplannen" op de Planning-pagina (PlanningPage.jsx:792-957).
3. `QuickPlanModal` na slepen van een niet-ingeplande werkbon (alleen inplannen, PlanningPage.jsx:505-612).
4. `AgendaWerkbonPlanModal` vanuit de agenda voor wie géén planningsmodule heeft (components/AgendaWerkbonPlanModal.jsx; solo zonder persoonkeuze, gedeelde werkruimte met keuze).

### 3.1 Velden `WerkbonModal` (volgorde op scherm)
| Veld | Type / bron | Verplicht | Opmerking |
|---|---|---|---|
| Status (alleen edit) | select gepland/in_uitvoering/afgerond | — | r.328-337 |
| Titel | tekst, placeholder "Bv. Lekkage badkamer leiding repareren" | **ja** ("Titel is verplicht") | r.195, 338-346 |
| Klant | select "— Geen klant —", "+ Nieuwe klant…" (admin/planner of `klanten_bewerken`), klanten | nee | kiezen stelt locatie voor (useKlantAdres) |
| Project (optioneel) | select "— Geen project —", "+ Nieuw project…" (admin/planner of `projecten_bewerken`), projecten gefilterd op klant (`!p.customerId || p.customerId === klant`) | nee | nieuw project met klant zet die klant als die nog leeg is (r.182-192) |
| Locatie | `AdresZoeker` (PDOK), "Zoek straat + huisnummer + plaats", vrij tekst toegestaan | nee | bij klantkeuze: leeg → stil invullen; anders (en altijd bij edit) vraag "Adres van <klant> overnemen? [Overnemen] [Huidige houden]" (components/WerkbonPlanning.jsx:509-565) |
| Dagen + tijden | `WerkbonDagenVelden` (§3.2) | tijd per dag verplicht | |
| Medewerkers + verantwoordelijke | `AssigneeResponsibleSelect` (alleen als er teamleden zijn) + toggle "Mail sturen" (`NotifyMailToggle`, default aan) | verantwoordelijke ≥1 zodra er medewerkers zijn | r.392-403 |
| Voertuigen | `WerkbonVoertuigenBlok` (§3.3) | — | alleen met modules planning + voertuigen |
| Omschrijving | `NoteEditor` (HTML, @-mentions), "Wat moet er gebeuren op locatie? Typ @ om iemand te taggen" | nee | r.416-419 |
| Interne notitie | `NoteEditor` | nee | new: wordt eerste interne notitie in `werkbon_notities`; edit: alleen zichtbaar als oud `notes` gevuld ("Interne notitie (oud veld)") (r.420-436) |

Taken en materialen worden **niet** in het aanmaakformulier ingevoerd; dat gebeurt na aanmaken in het detail (detail opent automatisch, `onWerkbonSaved` → `openDetail`, r.2173-2180).

### 3.2 Dagen, tijden en ploeg (`components/WerkbonPlanning.jsx` + `utils/werkbonDagen.js`)
- **Zonder module `planning`** (`meerdaags=false`): één maandkalender (maandag eerst) "Tik op de dag van de klus." + één tijdveld "Tijd" (begin → eind). Bon met al meerdere dagen: "Startdag", verplaatsen schuift de hele klus (`verplaatsNaar`). Upsell-link "planningsmodule" (r.224-248).
- **Met module `planning`**: kalender met dagen aan/uit tikken (`wisselDag`); per gekozen dag eigen begin/eindtijd; nieuwe dag neemt tijd van vorige (of eerstvolgende) over; eerste dag zonder tijd → `STANDAARD_TIJD = 08:00–16:30`; knop "voor alle dagen" (tijd van dag 1 op alle dagen; alleen als tijden verschillen). Info-uitleg "Tijden en ploeg".
  - Per dag per medewerker (avatar-chip, menu `ActieMenu`): "Niet op deze dag"/"Wel op deze dag", "Andere tijd voor deze persoon" (eigen begin/eind, "Zelfde tijd als de rest", "Klaar"), "Terug naar de tijd van de dag". Wie van een dag gaat verliest ook zijn eigen tijd en zijn voertuigplek.
  - **Dubbel ingepland**-driehoek (oranje) per persoon per dag: `dubbeleBoekingen` vergelijkt met alle andere niet-afgeronde werkbonnen (dagploeg + eigen tijden) en niet-afgeronde activiteiten (`a.time`/`a.endTime`, zonder eind +30 min; werkbon zonder eind +60 min); overlap `a1 < b2 && b1 < a2`. Alleen waarschuwing, geen blokkade (utils/werkbonDagen.js:370-399). Bezetting wordt één keer geladen (`getWerkbonnen()` + `listActivities()`).
- De tijd van de **eerste dag = werkbon.starttijd/eindtijd** (wordt automatisch gesynchroniseerd naar het formulier, r.210-213).
- **Validatie** `controleerPlanning` (utils/werkbonDagen.js:324-347):
  - max **60 dagen** (`MAX_DAGEN`): "Een werkbon kan maximaal 60 dagen hebben; dit zijn er N. Verdeel de klus over meerdere werkbonnen."
  - elke dag begin+eind: "Vul (voor <dag>) een begin- en eindtijd in. Een dag zonder tijd verschijnt niet in de planning."
  - eind > begin: "Op <dag> moet de eindtijd na de begintijd liggen."
  - eigen tijden: "Een eigen tijd op <dag> heeft een begin- en eindtijd nodig." / "Op <dag> ligt een eigen eindtijd vóór de begintijd."
  - 0 dagen is toegestaan (= niet ingepland).
- **Naar DB** `dagenUitPlanning(p, ploegIds, standaard)` (r.286-316) → `[{ datum, starttijd, eindtijd, medewerker_ids, medewerker_tijden }]`: dag 1 en dagen gelijk aan dag 1 krijgen `starttijd/eindtijd = null`; andere dagen alleen hun afwijkende tijd; `medewerker_ids = null` als de dagploeg de hele ploeg is, anders de subset; `medewerker_tijden` alleen voor wie in de dagploeg zit en een volledige tijd heeft. Met voertuigen aangevuld door `metVoertuigen` met `voertuig_ids` (null = alle), `voertuig_tijden` (alleen afwijkers), `medewerker_voertuig`.

### 3.3 Voertuigen-blok (`components/WerkbonVoertuigenBlok.jsx`, `components/WerkbonVoertuigen.jsx`, `utils/voertuigDagen.js`)
- Alleen als `meerdaags && plan.has('voertuigen') && databaseKentVoertuigen()` én voertuigen geladen (`getVoertuigen({inclusiefInactief:true})`; keuzelijst toont actieve + al gekozen) (WerkbonVoertuigen.jsx:48-86).
- "Bussen op deze klus (meerdere mogelijk)" (multiselect, label "<naam> · N plek(ken)"). Geen voertuigen: "Nog geen voertuigen. Voeg ze toe bij Instellingen → Voertuigen." Geen dagen: "Kies eerst de dagen hierboven; daarna plan je per dag een bus in."
- Per bus een uitklapkaart (kleurstip `voertuigen.kleur`, plekken, "alle dagen"/"N van M dagen", waarschuwingsdriehoek): per dag vinkje "rijdt mee", tijd, "eigen tijd"/"tijd van de dag", bezetting `n/zitplaatsen` (vol-stijl), inzittenden met ×, "wie rijdt mee" (kandidaten = dagploeg; uitgegrijsd met reden als niet toegestaan; "zit nu in <andere bus>").
- **Regels** (gelijk aan DB): persoon moet binnen de voertuigtijd werken → "<naam> werkt HH:MM–HH:MM, <bus> staat HH:MM–HH:MM."; nooit meer mensen tegelijk dan `zitplaatsen` → "<bus> heeft N plek(ken), tussen HH:MM en HH:MM zitten er M in." Bus ook op andere werkbon op overlappend moment → "Staat ook op <titel> (HH:MM–HH:MM)." (waarschuwing). Eindpunt exclusief (10–12 en 12–17 overlappen niet). `controleerVoertuigen` blokkeert opslaan alleen bij **nieuwe** koppelingen die niet kloppen (r.259-269).
- Payload werkbon: `voertuig_ids` (alleen meegestuurd als lijst geladen is, anders zou opslaan de voertuigen wissen).

### 3.4 Opslaan — exacte volgorde (`WerkbonModal.submit`, r.194-307)
1. Validatie: titel; `assignedToIds.length && !verantwoordelijkeIds.length` → "Wijs minimaal één verantwoordelijke aan."; `controleerPlanning`; `voertuig.controleer`.
2. `dagen` = (met module) `voertuig.dagen(dagenUitPlanning(...))`, anders [].
3. Payload: `{ titel, customer_id|null, project_id|null, omschrijving|null, gepland_op (met module: dagen[0].datum; zonder: eerste gekozen datum), starttijd|null, eindtijd|null, locatie|null, assigned_to_ids, verantwoordelijke_ids, voertuig_ids? }`. Bij edit ook `notes` en `status`.
4. **Nieuw**: `createWerkbon(payload)` → insert `werkbonnen` met `company_id` (via `withCompanyId`), `assigned_to = assigned_to_ids[0]`, `verantwoordelijke_ids` gefilterd op subset (leeg → [eerste medewerker]), `status` default `gepland`, null-velden weggelaten (werkbonService.js:313-346). Daarna eventuele interne notitie → `addWerkbonNotitie(id, html, false)`.
   **Edit**: `updateWerkbon(id, {...payload, notes, status})` (r.348-426): houdt `assigned_to`, `assigned_to_ids`, `verantwoordelijke_ids` consistent; status → in_uitvoering zet `gestart_op` eenmalig; bij gewijzigde `gepland_op` opnieuw ophalen (DB-trigger schuift dagen).
5. Met module: **RPC `bb_werkbon_dagen_zetten({ p_werkbon_id, p_dagen })`** via `zetWerkbonDagen` (werkbonService.js:256-282). Lege lijst = niet ingepland; dagen niet in de lijst verdwijnen; bestaande dagen houden hun id. Fout hierna → toast "Werkbon opgeslagen, maar de dagen niet: …" en sluiten (geen dubbele aanmaak).
6. Meldingen (fire-and-forget, `services/notificatieService.js`): `notifyNewAssignees` (type `toewijzing_werkbon`, titel "Je bent toegewezen aan <titel>", link `werkbonnen`, optioneel mail) voor nieuw gekoppelden die niet tegelijk nieuw verantwoordelijk zijn; `notifyNieuweVerantwoordelijken`; bij edit `meldPlanningWijziging` (insert `planning_wijzigingen`, soort `verzet`/`ingepland`/`afgehaald`) voor blijvers bij verschoven datum/tijd en voor wie eraf is gehaald.
7. `syncWerkbonEvents(id)` — agenda-items (calendar events) per dag per persoon bijwerken (services/calendarService.js:~180-230).
8. Toast "Werkbon aangemaakt" / "Werkbon bijgewerkt"; detail openen.

`PlanModal` (planning) is hetzelfde minus Status/notes/"+ Nieuwe klant/project", met defaults starttijd 09:00, eindtijd 11:00, dag = vandaag, status `gepland`, en altijd met dagen (module is daar per definitie aan). Verantwoordelijke is hier niet afgedwongen in de UI (service valt terug op eerste medewerker). Extra: `createMentionNotifications` voor de omschrijving (PlanningPage.jsx:809-872).

### 3.5 Teamleden-id's (valkuil)
- `getTeamMembers()` levert `{ id, profileId, fullName, avatarUrl }` met `profileId = id = profiles.id` (notificatieService.js:~407-424). WerkbonModal zoekt op `profileId`, Planning op `id`; in beide gevallen is het het `profiles.id` dat in `assigned_to_ids` staat. Planning gebruikt `getActiveTeamMembers({ includeSelf: true })`.

---

## 4. Planning

**Bestand:** `pages/PlanningPage.jsx`. Route `planning`.

### 4.1 Toegang
- NAV: `permission:'planning'`, `feature:'planning'` (pakket Team of module bij Groei).
- In de pagina: zonder `can('planning')` → slot-icoon, "Geen toegang", "De Planning-pagina vereist het planning-recht." (r.1535-1543).
- Slepen/rekken: `magSlepen = plan.has('planning') && can('planning')` (r.1430). Ondertekende werkbon: niet sleepbaar, slot-icoon + tooltip "Ondertekend — de tijden staan op slot" (r.1435). In voertuigweergave niet sleepbaar.
- Voertuigweergave alleen met `plan.has('voertuigen')` (r.1311-1324, 1566).

### 4.2 Weergave
- **Dag / Week** tabs (in URL `?zicht=dag|week`, default week); vorige/"Vandaag"/volgende; kop "maandag 22 juni 2026" of "22–28 jun 2026" (r.1233-1278, 1553-1564). Week = maandag t/m zondag.
- **Modus**: Totaal | Medewerker | Voertuig (r.1244, 1565-1569) met selector (medewerker: alle teamleden; voertuig: actieve voertuigen "naam (kenteken)").
- **Tijdlijn**: 07:00–20:00, 64 px/uur, uur- en halfuurlijnen, dagkolom min 110 px (horizontaal scrollen op telefoon), vandaag gemarkeerd "VANDAAG" (r.44-54, 1629-1673).
- **Blokken** per dag (r.1676-1760):
  - Meerdaagse bon staat in elke kolom met de tijd van díe dag; label "dag i/N".
  - Totaal: **één blok per medewerker** in de dagploeg, met diens eigen tijd en kleur; geen ploeg → grijs blok.
  - Medewerker: alleen bonnen waarop die persoon staat (dagploeg), met zijn eigen tijd.
  - Voertuig: blok met de voertuigtijd, inzittenden en bezetting `n/zitplaatsen`.
  - Overlappende blokken krijgen lanes naast elkaar (`assignLanes`).
  - Blokinhoud: titel, `HH:MM–HH:MM · dag i/N`, persoon · voertuig · klant; "+N" als meer medewerkers.
- **Kleuren**: Totaal = per medewerker, HSL-palet hues `[120,200,30,280,350,60,160,240,310,170]` (bg `hsl(h,55%,93%)`, tekst `hsl(h,60%,32%)`, rand `hsl(h,50%,80%)`, balk/dot `hsl(h,65%,50%)`); niet toegewezen grijs (bg `#f3f4f6`, tekst `#6b7280`, rand `#e5e7eb`, balk `#9ca3af`). Medewerker/Voertuig-modus: kleur per project (r.120-147, 1340-1350). Activiteiten: groen `#1DDB62` (bg `rgba(29,219,98,.14)`, tekst `#15803d`). Niet-ingepland-kaartjes oranje (`#fff7ed`, rand `#fed7aa`, tekst `#b45309`/`#d97706`).
- **Legenda** (inklapbaar, onthouden in `localStorage['bb.planning.legenda']`): medewerkers (+ "Niet toegewezen") of projecten ("(geen project)") (r.1183-1243, 1352-1370).
- **Activiteiten** worden meegetoond (Totaal: met toewijzing of solo; Medewerker: van die persoon; Voertuig: niet) (r.1389-1394). Zonder eindtijd duren ze 1 uur in de tijdlijn.

### 4.3 Data
`getWerkbonnen()`, `getActiveTeamMembers({includeSelf:true})`, `getProjects()`, `listActivities()`; klanten uit gedeelde `useData()`; `getVoertuigen({inclusiefInactief:true})` alleen met module (r.1282-1317). Laadstaat "Planning laden…". Fout: toast.

### 4.4 Niet-ingeplande werkbonnen
- Definitie: geen enkele dag met starttijd (`!isIngepland(w)`), ongeacht toewijzing (r.1396-1398). Inklapbaar paneel "Niet ingepland (N)"; leeg: "Alle werkbonnen zijn ingepland." (r.1597-1619).
- Kaartje tikken → DetailModal; **slepen** naar een uurvak (drop-id `slot:<datum>:<HH>`) → `QuickPlanModal` "Inplannen op <dag>" met start = dat uur, eind = +1 uur, medewerkers/verantwoordelijke, mailtoggle → `updateWerkbon(id, { gepland_op, starttijd, eindtijd, assigned_to_ids, verantwoordelijke_ids })` (één dag; DB maakt de dag aan / schuift) + meldingen + `syncWerkbonEvents` (r.505-612, 1409-1419). Sleep start na 6 px (PointerSensor).
- Let op: afgeronde bonnen zonder tijd staan ook in "Niet ingepland" (geen statusfilter).

### 4.5 Verplaatsen en tijden aanpassen (blok slepen/rekken)
- `useBlokSlepen` (hooks/useBlokSlepen.js): verslepen verschuift begin+eind, boven/onderrand verzet begin of eind; stap **15 minuten** (`STAP_MIN = 15`); minimaal één stap duur; binnen 07:00–20:00 (tenzij al erbuiten). Alleen **binnen dezelfde dag** (tijd), niet naar een andere dag — ander dag kiezen gaat via de DetailModal of de werkbon.
- Blok met persoon (`_pid`): alleen die persoon op die dag krijgt een eigen tijd (`medewerker_tijden`); gelijk aan dagtijd → afwijking vervalt. Blok zonder persoon: tijd van die datum (`verzetTijd`, utils/werkbonDagen.js:251-268). Tijdens slepen label "alleen <naam>" of "deze dag".
- Opslaan `verzetWerkbon` (r.1446-1489): eerst `bb_werkbon_dagen_zetten`, dan zo nodig `updateWerkbon(id,{starttijd,eindtijd})` (standaardtijd = tijd dag 1), `getWerkbonById`, `bumpRefresh()`, `meldPlanningWijziging(soort 'verzet')` voor de betrokkene(n), `syncWerkbonEvents`. Fout → toast en terugveren.
- Activiteit slepen: `updateActivity(id, { date, time, endTime? })` + `upsertActivityEvent` + melding (r.1491-1526).

### 4.6 DetailModal (tik op blok) — bewerken vanuit planning (r.961-1177)
Velden: Titel, Status, Dagen/tijden/ploeg (`WerkbonDagenVelden` met dubbel-check), Medewerkers + verantwoordelijke + mailtoggle, Voertuigen-blok, Locatie. Opslaan: validatie planning+voertuigen → `updateWerkbon` → meldingen (nieuw toegewezen, nieuw verantwoordelijk, afgehaald, verzet, en per dag erbij/kwijt per blijver) → `bb_werkbon_dagen_zetten` → `syncWerkbonEvents` → toast "Opgeslagen". Klantnaam in kop opent klantkaart.

### 4.7 Andere acties
- **"Werkbon inplannen"** → `PlanModal` (§3.4). **"Activiteit inplannen"** → `PlanActivityModal` (titel*, type call/visit/task/follow, klant, datum*, starttijd* (eind auto +15 min tot handmatig), medewerkers, locatie, notities, optioneel bestaande werkbon van die klant koppelen via `werkbonnen.activity_id`) (r.624-788).

### 4.8 Conflicten / validatie (planning)
- **Dubbel ingepland** (oranje driehoek op blok; klik = uitleg "X staat op <dag> ook ingepland: <titel> (HH:MM–HH:MM). Daardoor is X op dat moment dubbel ingepland.") — alleen waarschuwing, geen blokkade (r.1697-1702, 1808-1835).
- **Voertuigmeldingen** (zelfde driehoek, kop "Klopt niet"): buiten voertuigtijd, te vol, voertuig dubbel.
- Geen beschikbaarheids-/verlofcheck (bewust niet).

### 4.9 Alternatief zonder planningsmodule
Werkbon inplannen kan via de agenda (`AgendaWerkbonPlanModal`) en via het werkbonformulier (één dag + tijd).

---

## 5. Materialen (bibliotheek)

**Bestand:** `pages/MaterialenPage.jsx`, service `services/materiaalService.js`. Route `materialen`, geen NAV-recht of pakketfeature.

### 5.1 Velden (`toMateriaal`, materiaalService.js:26-40)
| Veld (app) | DB-kolom | Opmerking |
|---|---|---|
| naam | `materialen.naam` | verplicht |
| eenheid | `materialen.eenheid` | keuze uit vaste lijst `EENHEDEN = ['stuk','m','m²','liter','uur']` (default `stuk`) |
| artikelnummer | `materialen.artikelnummer` | optioneel |
| verkoopprijs | `materialen.verkoopprijs` | excl. btw, "naar de klant"; null toegestaan |
| inkoopprijs | `materiaal_inkoop.inkoopprijs` (aparte tabel, PK/FK `materiaal_id`, eigen RLS) | alleen zichtbaar/schrijfbaar met `inkoopprijzen`; rij wordt door trigger aangemaakt |
| leverancierId | `materialen.leverancier_id` | **verplicht in UI** ("Kies een leverancier"), ook bij bewerken van oude materialen |
| btwPct | `materialen.btw_pct` | 21 / 9 / 0 (default 21) |
| actief | `materialen.actief` | checkbox alleen bij bewerken: "inactieve materialen zijn niet meer te kiezen op een werkbon" |
- **Geen categorie, geen voorraad** (bewust: "Geen voorraadbeheer — de doelgroep koopt per klus bij de groothandel", MaterialenPage.jsx:8).
- `eigen_eenheden` (services/eigenEenheidService.js) is iets anders: eigen regeltypes met standaardprijs voor offertes/facturen (beheer in Instellingen); niet gekoppeld aan materialen of werkbonnen.

### 5.2 Lijst
- `listMaterialen()` = `materialen` select `*, materiaal_inkoop(inkoopprijs)` order `naam` asc, inclusief inactief (r.85-91). Herladen op `refreshKey`.
- Kop "Materialen", "N materiaal/materialen in je bibliotheek", knop "+ Nieuw materiaal" (geen UI-rechtencheck; DB-RLS bepaalt).
- Zoeken (client): "Zoek op naam of artikelnummer…" (naam of artikelnummer bevat term).
- Tabel: Materiaal (avatar-initialen, naam, artikelnummer, label "inactief" met opacity .55) · Eenheid · Leverancier · [Inkoop (excl. btw)] · Verkoop (excl. btw) · [Marge (excl. btw)] · BTW · acties (openen, prullenbak). Rij tikken = bewerken.
- Geen filters op actief/leverancier, geen sortering anders dan naam, geen paginering.
- Staten: "Materialen laden…"; fout in rode kaart (`#dc2626`) "Materialen laden is mislukt."; leeg: "Geen materialen gevonden" + "Voeg je veelgebruikte materialen toe — dan staan prijs en leverancier meteen goed op een werkbon." of "Pas je zoekopdracht aan.".

### 5.3 Acties
- **Nieuw/bewerken** (`MateriaalModal`): insert `materialen` {naam, eenheid, verkoopprijs, leverancier_id, btw_pct, artikelnummer, actief, company_id} → (met inkoopveld) update `materiaal_inkoop` set `inkoopprijs, updated_at` where `materiaal_id` → opnieuw ophalen (r.99-116). Toast "Materiaal toegevoegd"/"Materiaal bijgewerkt".
- **Marge** = `round(verkoop − inkoop, 2)`, `pct = round(bedrag/verkoop×1000)/10` (één decimaal); null als een prijs ontbreekt; groen `#15A34A`, negatief rood `#dc2626` (r.45-52).
- **Verwijderen**: confirm "\"<naam>\" verwijderen? Werkbonregels die dit materiaal gebruiken blijven bestaan met hun eigen prijzen." → `delete materialen` (materiaal_inkoop cascade). **Archiveren** = vinkje Actief uit.

### 5.4 Koppeling aan werkbonnen / kosten
- Werkbonregel kopieert naam/eenheid/verkoopprijs/btw/inkoop/leverancier en bewaart `materiaal_id` (§2.5). Alleen actieve materialen zijn kiesbaar.
- Kostprijs van werkbonregels staat in `werkbon_materiaal_inkoop.inkoopprijs_per` (per stuk); `job_costs`-spiegelregel door DB-trigger; zichtbaar in Kosten-blok/nacalculatie.

---

## 6. Database (tabellen, RLS, triggers, RPC's, Edge Functions)

Pad-prefix `M/` = `/Users/macbook/BossBase-billing/supabase/migrations/`, `F/` = `.../supabase/functions/`. Laatste stand na alle migraties.

### 6.1 Helperfuncties
- `bb_has_permission(text)`: rol admin/planner → altijd true, anders `user_permissions.granted` (M/20260620030000_security_audit2_fixes.sql:34). (Er is geen `bb_heeft_recht`.)
- `bb_is_admin_or_permission(text)`: admin of expliciet recht (zonder planner-uitzondering).
- `bb_gedeelde_werkruimte()` = `bb_has_feature('gedeelde_werkruimte')` (M/20260728120000_plan_matrix.sql:817); `bb_has_feature([company,] feature)` (plan_matrix:297).
- `bb_mag_schrijven()` / `bb_is_readonly()` / `bb_readonly_reden()` — readonly-modus (M/20260803120000_readonly.sql:95-127); restrictive `readonly_<tabel>`-policies op insert.
- `bb_mag_inkoopprijs_zien()`: alleen admin of recht `inkoopprijzen` (planner NIET automatisch) (M/20260824152000_materialen.sql:26).
- `bb_mag_werkbon_uren_beheren(werkbon_id)`: admin/planner of uid in `assigned_to_ids`/`verantwoordelijke_ids` (M/20260831140000_werkbon_uren.sql:57).
- `bb_planning_recht_vereist()`: `auth.uid() is null OR bb_gedeelde_werkruimte() OR bb_has_permission('planning')` (M/20260916091000…:36).
- `bb_voertuig_te_vol(time[], time[], int, time, time)` — capaciteitsregel voertuig.

### 6.2 `werkbonnen`
- Kolommen: `id uuid pk`, `company_id NN`, `customer_id`, `deal_id`, `offerte_id`, `project_id` (fk set null), `assigned_to` (primair), `assigned_to_ids uuid[] NN default '{}'`, `verantwoordelijke_ids uuid[] NN default '{}'` (check `werkbonnen_verantwoordelijke_subset: verantwoordelijke_ids <@ assigned_to_ids`), `voertuig_ids uuid[] NN default '{}'`, `titel NN`, `omschrijving`, `status NN default 'gepland'`, `gepland_op date`, `starttijd/eindtijd time`, `locatie`, `notes` (interne briefing, legacy), `werkbon_notities` (legacy), `gestart_op`, `afgerond_op`, `nummer`, `sign_token uuid NN default gen_random_uuid()`, `ondertekend_op`, `handtekening_url`, `ondertekend_door_naam/_email`, `ondertekende_pdf_url`, `verstuurd_naar_email`, `verstuurd_op`, `activity_id` (koppeling vanuit Planning-activiteit), `created_at/updated_at`. `voertuig_id` is verwijderd (M/20260916180000:48).
- Check `status in ('gepland','in_uitvoering','afgerond')` (M/20260917150000:49-51). Uniek `(company_id, nummer)` en `(sign_token)`.
- Triggers:
  - `bb_werkbon_nummer_trigger` (BEFORE INSERT): `WB-001`, max+1 per bedrijf, 3 cijfers (M/20260831150000:81-106). Client stuurt geen nummer.
  - `bb_werkbon_gepland_op_sync` (AFTER INS/UPD OF gepland_op): null → alle dagen weg; geen dagen → één dag aanmaken; anders alle dagen schuiven met dezelfde delta (M/20260911133000:221-267).
  - `bb_werkbon_tijden_op_slot`: wijzigen starttijd/eindtijd/gepland_op geweigerd als ondertekend (M/20260916090000:88-111).
  - `bb_werkbon_tijden_planning_recht`: wijzigen starttijd/eindtijd/gepland_op vereist `bb_planning_recht_vereist()` (insufficient_privilege) (M/20260916091000:75-100). **Gevolg: zonder planning-recht kun je bij bewerken geen datum/tijd wijzigen** (ook niet een verantwoordelijke of `werkbonnen_bewerken`), behalve in een gedeelde werkruimte.
  - `bb_werkbon_ploeg_opschonen`, `bb_werkbon_voertuigen` (eigen bedrijf, ontdubbelen), `trg_werkbon_voertuigen_feature` (voertuig toevoegen vereist feature `voertuigen`), `bb_werkbon_voertuigen_opschonen`.
  - `bb_werkbon_status_gevolgen`: projectstatus herberekenen (`bb_project_status_bijwerken`) en deal vooruit (`bb_deal_naar_fase`, nooit terug) (M/20260917150000:138-252).
  - `werkbon_project_naar_inkopen`: projectwissel zet `project_kosten.project_id` mee (M/20260919140000:85-107).
- RLS:
  - SELECT: eigen bedrijf AND (`bb_gedeelde_werkruimte()` OR `planning` OR `alles_inzien` OR `assigned_to = uid` OR `uid = ANY(assigned_to_ids)`) (M/20260920131715:118-128). **Een medewerker zonder die rechten ziet alleen werkbonnen waaraan hij gekoppeld is.** (Verantwoordelijke is altijd ook gekoppeld.)
  - INSERT: eigen bedrijf AND (`planning` OR `werkbonnen_bewerken`) — geen uitzondering voor gedeelde werkruimte — + `readonly_werkbonnen` (M/20260918110000:30-38). (UI: admin/planner/werkbonnen_bewerken; admin/planner vallen via bb_has_permission eronder.)
  - UPDATE: eigen bedrijf AND (gedeelde werkruimte OR `planning` OR `werkbonnen_bewerken` OR `uid = ANY(verantwoordelijke_ids)`) (plan_matrix:875-893). Gekoppelde niet-verantwoordelijke mag dus ook de status niet zetten.
  - DELETE: alleen rol `admin` (UI heeft geen verwijderknop; `deleteWerkbon` bestaat in de service).

### 6.3 `werkbon_dagen`
- Kolommen: `id`, `company_id NN` (trigger), `werkbon_id NN fk cascade`, `datum date NN`, `starttijd/eindtijd time`, `medewerker_ids uuid[]` (NULL = hele ploeg, `{}` = niemand), `medewerker_tijden jsonb {"<pid>":{"starttijd","eindtijd"}}`, `voertuig_ids uuid[]`, `voertuig_tijden jsonb`, `medewerker_voertuig jsonb {"<pid>":"<vid>"}`, `created_at`. Uniek `(werkbon_id, datum)`. Max 60 dagen.
- Triggers: `bb_werkbon_dag_bedrijf`; `bb_werkbon_dag_op_slot` (ondertekend: geen nieuwe dag, geen wijziging datum/tijden/medewerker_tijden/voertuig_tijden; ploeg/voertuigen/koppeling mag wel); `bb_werkbon_dag_planning_recht` (update van datum/tijden vereist planning-recht); `bb_werkbon_dag_ploeg` (dagploeg ⊆ assigned_to_ids; dagploeg zetten vereist feature `planning`); `bb_werkbon_dag_tijden` (eigen tijd alleen voor dagploeg, eind > begin, feature `planning`); `bb_werkbon_dag_voertuigen` (voertuig moet op de werkbon staan; bij nieuwe koppeling persoonstijd binnen voertuigtijd en capaciteit via `bb_voertuig_te_vol`); `trg_werkbon_dag_voertuigen_feature` (feature `voertuigen`); AFTER `bb_werkbon_dagen_na` (max 60; 2e dag vereist feature `planning`; zet `gepland_op = min(datum)`).
- RLS: SELECT volgt werkbonnen (`exists(...)`); INSERT/UPDATE/DELETE: eigen bedrijf AND (gedeelde werkruimte OR `planning` OR `werkbonnen_bewerken` OR verantwoordelijke) (M/20260911133000:61-115).
- **RPC `bb_werkbon_dagen_zetten(p_werkbon_id uuid, p_dagen jsonb) returns setof werkbon_dagen`** — SECURITY INVOKER (RLS geldt), grant `authenticated` (laatste versie M/20260916120000:558-651). Payload `[{datum, starttijd, eindtijd, medewerker_ids|null, medewerker_tijden, voertuig_ids?, voertuig_tijden?, medewerker_voertuig?}]`. Dagen niet in de lijst worden verwijderd; bestaande dag update, nieuwe insert; **ontbrekende voertuigsleutel = bestaande waarde blijft**; lege lijst = niet ingepland.

### 6.4 `werkbon_taken` (incl. meerwerk)
- `id, werkbon_id NN cascade, company_id NN, omschrijving NN, afgerond bool NN false, volgorde int NN 0, is_meerwerk bool NN false, created_at, updated_at` (M/001:366-375; M/20260905130000:21). `werkbon_meerwerk` is gedropt.
- Trigger `bb_werkbon_taken_op_slot` (alle mutaties geweigerd na ondertekenen).
- RLS: SELECT volgt werkbonnen; UPDATE: gedeelde werkruimte OR `werkbonnen_bewerken` OR verantwoordelijke; **INSERT/DELETE: alleen rol admin/planner** (M/001:396-442). → Verschil met UI: een verantwoordelijke (of `werkbonnen_bewerken`-medewerker) ziet de "+ Taak"/prullenbak wel, maar de DB weigert.

### 6.5 `werkbon_materialen`, `werkbon_materiaal_inkoop`
- `werkbon_materialen`: `id, werkbon_id NN cascade, company_id NN, naam NN, eenheid, aantal num NN 1, prijs_per num NN 0, subtotaal num NN 0, materiaal_id fk materialen set null, leverancier_id fk leveranciers set null, btw_percentage num NN 21, timestamps`.
- Triggers: `bb_werkbon_materialen_op_slot`; `wm_inkoop_bij_insert` (maakt `werkbon_materiaal_inkoop`-rij met bibliotheek-inkoopprijs); `wm_spiegel_kost_materiaal` → `wm_spiegel_kost()` houdt `job_costs`-regel bij: bedrag = aantal × coalesce(inkoop, prijs_per); ≤ 0 → regel weg; project/klant alleen bij insert overgenomen (M/20260915130500:55-161).
- RLS: SELECT volgt werkbonnen; INSERT/UPDATE: gedeelde werkruimte OR `werkbonnen_bewerken` OR verantwoordelijke; **DELETE: alleen admin/planner** (M/001:520-530). → UI toont verwijderen ook aan verantwoordelijken.
- `werkbon_materiaal_inkoop`: pk/fk `werkbon_materiaal_id` cascade, `company_id`, `inkoopprijs_per`, `updated_at`. RLS select/update/delete: eigen bedrijf AND `bb_mag_inkoopprijs_zien()`; geen INSERT-policy (alleen via trigger). Trigger `wm_spiegel_kost_inkoop`.
- `job_costs`: restrictive `werkbonmateriaal_kost_alleen_met_inkoop` (spiegelregels onzichtbaar zonder inkooprecht) en `werkbonmateriaal_kost_alleen_via_trigger` (client mag geen job_costs met `werkbon_materiaal_id` inserten).

### 6.6 `materialen`, `materiaal_inkoop`, `eigen_eenheden`
- `materialen` (M/20260824152000:44-58): `id, company_id, naam NN, eenheid NN default 'stuk', verkoopprijs num, leverancier_id, btw_pct NN 21, artikelnummer, actief NN true, created_at, updated_at` (trigger `materialen_touch`). Leverancier is in de DB niet verplicht (alleen UI). RLS: select eigen bedrijf; insert eigen bedrijf AND `bb_mag_schrijven()`; update/delete alleen eigen bedrijf (geen rolcheck).
- `materiaal_inkoop`: pk/fk `materiaal_id` cascade, `company_id`, `inkoopprijs`, `updated_at`; aangemaakt door trigger `materiaal_inkoop_bij_insert`; RLS alleen met `bb_mag_inkoopprijs_zien()`; geen INSERT-policy.
- `eigen_eenheden` (M/20260624130000): `id, company_id, naam NN, standaard_prijs NN 0, eenheid_label, btw_pct, timestamps`; RLS insert/update/delete admin/planner. Hoort bij offertes/facturen.

### 6.7 `voertuigen`
- `id, company_id, naam NN, kenteken, kleur default '#1DDB62', actief default true, zitplaatsen int (1..99 of null; incl. bestuurder), created_at`.
- RLS: alles eigen bedrijf (geen rolcheck) + restrictive `plan_feature_voertuigen_insert/_update` (`bb_has_feature('voertuigen')`) + `readonly_voertuigen`. Trigger `bb_voertuig_verwijderd` haalt het voertuig uit `werkbonnen.voertuig_ids`.
- Service: `getVoertuigen({inclusiefInactief})` order naam; `createVoertuig`/`updateVoertuig`/`deactiveerVoertuig`/`deleteVoertuig` (services/voertuigService.js). Beheer in Instellingen → Voertuigen.

### 6.8 `werkbon_uren`
- `id, company_id NN, werkbon_id NN cascade, profile_id NN fk profiles, datum NN, start_tijd, eind_tijd, pauze_minuten int NN 0, uren num NN (check > 0), reis_km (null of ≥ 0), notitie, timestamps`. Geen project/klant (volgt uit werkbon).
- RLS: select eigen bedrijf; insert/update/delete eigen bedrijf AND `bb_mag_werkbon_uren_beheren(werkbon_id)`; `readonly_werkbon_uren`. Trigger `bb_werkbon_uren_op_slot`.

### 6.9 `werkbon_notities`
- `id, company_id NN, werkbon_id NN cascade, created_by fk profiles, note NN, voor_klant bool NN false, gevolg, waarschuwing_verzonden_op, waarschuwing_verzonden_naar, created_at, updated_at`.
- RLS: select/insert eigen bedrijf (geen werkboncheck); update/delete: `created_by = uid` OR admin/planner; readonly-policy. **Niet** onder het slot.

### 6.10 `werkbon_fotos` + bucket `werkbon-fotos`
- `id, werkbon_id NN cascade, company_id NN, url NN (kaal pad), categorie check ('voor','tijdens','na'), created_at`.
- RLS: select eigen bedrijf; insert/delete: gedeelde werkruimte OR `werkbonnen_bewerken` OR verantwoordelijke; geen update; readonly-policy. Niet onder het slot.
- Bucket privé, pad `{company_id}/{werkbon_id}/{uuid}.{ext}`; lezen via signed URL (3600 s). Client comprimeert vóór upload (`comprimeerAfbeelding`, max zijde `FOTO_MAX_ZIJDE`, kwaliteit 0.82). Andere private buckets: `signed-werkbonnen`, `signatures`.

### 6.11 `planning_wijzigingen`
- `company_id NN, user_id NN (betrokken medewerker), werkbon_id, werkbon_nummer, titel, klant, soort NN check ('ingepland','verzet','afgehaald'), oude_/nieuwe_datum, oude_/nieuwe_start/eind text, aangemaakt_op, verwerkt_op` (M/20260917080000:19-43).
- RLS: select alleen eigen `user_id`; insert binnen eigen bedrijf. Cron `planning-samenvatting-daily` (18:00) → Edge Function `planning-samenvatting` bundelt en mailt. De app schrijft deze rijen bij elke verschuiving (`meldPlanningWijziging`), plus direct een in-app melding.

### 6.12 RPC's publieke ondertekenpagina (security definer, `p_token uuid`, grant anon/authenticated)
`get_werkbon_by_sign_token`, `get_werkbon_taken_by_sign_token` (alleen afgevinkt), `get_werkbon_materialen_by_sign_token` (naam/eenheid/aantal), `get_werkbon_uren_by_sign_token` (zonder namen), `get_werkbon_uitvoerders_by_sign_token`, `get_werkbon_notities_by_sign_token` (alleen voor_klant), `get_werkbon_fotos_by_sign_token`, `get_company_by_werkbon_token`, `get_customer_by_werkbon_token`.

### 6.13 Edge Functions
| Functie | Body | Doet |
|---|---|---|
| `sign-werkbon` | `{sign_token, name, email, signature_data_url, signed_pdf_base64?, pdf_fout?}` of `{action:'fotos', sign_token}` | 409 als al getekend; handtekening → `signatures/werkbon-{id}.png`; update `ondertekend_op, handtekening_url, ondertekend_door_*`, **`status='afgerond'`**, `afgerond_op` (als leeg); PDF → `signed-werkbonnen/{company}/werkbon-{nummer}-ondertekend.pdf`; mails klant+bedrijf; `klant_tijdlijn` 'werkbon_ondertekend'; antwoord `{success, warnings[]}` (F/sign-werkbon/index.ts) |
| `getekende-pdf-nazenden` | `{soort:'werkbon', id, pdf_base64}` | alleen bij getekend zonder PDF-url; update is de claim (nooit dubbel mailen) |
| `document-url` | `{soort:'werkbon_pdf'\|'werkbon_handtekening', id}` of `{soort, token}` | korte link `{url, geldig_seconden:600}` |
| `send-email` | `{to, subject, html, from_name?, reply_to?, attachments?, soort?, company_id?, gerelateerd_type?, gerelateerd_id?}` | JWT (60/uur, geblokkeerd in readonly) |
| `create-notification` | `{notifications:[{user_id,type,title,body?,link?,related_type?,related_id?,email?}]}` | max 50, zelfde bedrijf; types o.a. `toewijzing_werkbon`, `planning_verzet` |
| `planning-samenvatting` | (cron) | bundelt `planning_wijzigingen`, mailt, zet `verwerkt_op` |

### 6.14 Heropenen en het slot
- Status terugzetten (afgerond → gepland/in_uitvoering) is toegestaan, ook na ondertekening; DB reset `afgerond_op`/`gestart_op` niet; projectstatus wordt opnieuw afgeleid, deal gaat niet terug.
- Slot (`ondertekend_op` niet null) blokkeert: alle mutaties op `werkbon_uren`, `werkbon_taken` (incl. meerwerk), `werkbon_materialen`; op `werkbon_dagen` nieuwe dag / datum- en tijdwijzigingen / verwijderen; op `werkbonnen` starttijd, eindtijd, gepland_op. Niet geblokkeerd: status, titel, overige velden, foto's, notities, ploeg, voertuigen, verwijderen werkbon (admin).

---

## 7. Verschillen UI ↔ DB en aandachtspunten voor de app

1. **Taken/meerwerk toevoegen en verwijderen, materiaal verwijderen**: UI staat het toe voor verantwoordelijke en `werkbonnen_bewerken`, maar RLS alleen voor rol admin/planner (§6.4, §6.5). App: knoppen alleen tonen aan admin/planner, of rekening houden met RLS-fout.
2. **Datum/tijd wijzigen** vereist planning-recht (of gedeelde werkruimte) in de DB, ook via het gewone bewerkformulier (§6.2). UI van WerkbonModal laat de velden zien aan canManage zonder die check.
3. **Planner-rol en route-gate**: `App.jsx` routegate kent `planner` niet als planning-recht, `usePermissions` en `bb_has_permission` wel.
4. **Verantwoordelijke afdwingen**: alleen in `WerkbonModal`; in `PlanModal`/`QuickPlanModal`/`DetailModal` vult de service automatisch de eerste medewerker in.
5. **Inkoopprijs**: `bb_mag_inkoopprijs_zien` geeft planner niets automatisch; `usePermissions.can('inkoopprijzen')` geeft planner het ook niet (alleen admin of expliciet recht) — consistent.
6. **Lijst toont alleen wat RLS teruggeeft**: medewerker zonder `planning`/`alles_inzien` (en niet in gedeelde werkruimte) ziet alleen eigen gekoppelde werkbonnen.
7. **Slot omzeilbaar**: `ondertekend_op` is niet tegen update beschermd (wie werkbonnen mag updaten kan hem op null zetten). App moet dit veld nooit schrijven.
8. Risico gemeld door DB-analyse (niet geverifieerd in productie): `readonly_uploads`-policy op `storage.objects` is in M/20260921201845:167-172 opnieuw aangemaakt zonder `AS RESTRICTIVE` → mogelijk te ruime uploadrechten. Buiten scope van de app, wel melden.
9. Geen server-side paginering; werkbonnen worden volledig geladen (per 1000). Voor mobiel overwegen: eigen paginering/filter op toewijzing.
10. Meldingen en agenda-sync (`notifyNewAssignees`, `notifyNieuweVerantwoordelijken`, `meldPlanningWijziging`, `createMentionNotifications`, `syncWerkbonEvents`) gebeuren client-side na elke wijziging; de mobiele app moet ze ook aanroepen om gelijk te lopen.
