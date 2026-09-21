# Mobiele rechten- en functiematrix

Bijgewerkt op 2026-09-09, na het volledig werkend maken van de schrijfacties.
Elke regel is geverifieerd tegen de **live** database (`mawzqpnsluljxpbarhng`) en
tegen `origin/main` van het dashboard — niet tegen lokale migraties, want die
liepen achter.

## Hoe je deze tabel leest

**Toegang = recht/rol × abonnementsfeature × read-onlystand × RLS.** Alle vier de
lagen moeten ja zeggen. De app toetst de eerste drie vóór het tekenen van een
knop (`usePermissions().mag(module, actie)`, gevoed door `ACTIES` in
`src/lib/permissions.ts`) en laat de vierde altijd door de server beantwoorden.

Twee dingen die vaak door elkaar lopen en hier bewust uit elkaar staan:

- **`alles_inzien` is geen bewerkrecht.** Het opent de projecten en werkbonnen
  van het hele team en geeft nul schrijfrechten. Geverifieerd (zie Testronde).
- **Read-only blokkeert alléén aanmaken.** De restrictive policies (`readonly_*`)
  staan uitsluitend op INSERT. Bewerken, afronden, verwijderen en een factuur op
  betaald zetten blijven werken op een verlopen account — precies wat
  `READONLY_BLIJFT_WERKEN` in het dashboard belooft.

---

## Matrix

| Menuonderdeel | Mobiele route | Lezen | Schrijven | Vereist recht | Feature | Supabase-bron | Status |
|---|---|---|---|---|---|---|---|
| **Vandaag** | `/(tabs)/today` | dagoverzicht, volgende afspraak, weektotaal uren, open werkbonnen | snelle acties openen de bijbehorende schermen | — | — | `calendar_events`, `activities`, `werkbonnen`, `urenregistratie`, `werkbon_uren` | ✅ Volledig werkend¹ |
| **Agenda** | `/(tabs)/planning` | dag/week/maand, afspraken + activiteiten + ingeplande werkbonnen | afspraak aanmaken, wijzigen, verwijderen | aanmaken: geen · wijzigen/verwijderen: `planning`, of eigen afspraak | — | `calendar_events` | ✅ Volledig werkend |
| **Werkbonnen** | `/(tabs)/work-orders`, `/work-orders/[id]`, `/work-orders/new` | lijst, detail, taken, materialen, uren, foto's, notities | aanmaken, status, taken, materialen, uren, notities, foto's uploaden/verwijderen, ondertekenen | aanmaken: rol admin/planner · bewerken: `werkbonnen_bewerken`, `planning`, of verantwoordelijke | `werkbonnen` | `werkbonnen`, `werkbon_taken`, `werkbon_materialen`, `werkbon_uren`, `werkbon_notities`, `werkbon_fotos` + bucket `werkbon-fotos` | ✅ Volledig werkend (was al) |
| **Uren** | `/(tabs)/hours`, `/hours/new` | week- en teamoverzicht, werkdaguren + werkbonuren | boeken, **wijzigen, verwijderen** | werkbonuren: uitvoerder/verantwoordelijke, admin, planner · werkdaguren: eigen rijen, admin, planner | `uren` | `urenregistratie`, `werkbon_uren` | ✅ Volledig werkend |
| **Klanten** | `/(tabs)/customers`, `/customers/[id]`, `/customers/new` | lijst, zoeken, klantkaart, werkbonnen, **notities** | aanmaken, **wijzigen, verwijderen, notitie toevoegen** | aanmaken: geen · wijzigen: `klanten_bewerken` · verwijderen: `klanten_verwijderen` | `klanten` (limiet) | `customers`, `notes` | ✅ Volledig werkend |
| **Activiteiten** | `/activities` | alle activiteiten, open/afgerond | **aanmaken, wijzigen, afronden, heropenen, verwijderen** | geen (bedrijfsbreed) | — | `activities` | ✅ Volledig werkend |
| **Taken** | `/tasks` | open taken (`type='task'`) | **aanmaken, wijzigen, afronden, verwijderen** | geen (bedrijfsbreed) | — | `activities` | ✅ Volledig werkend |
| **Notities** | `/notes` | alle notities + klant | **aanmaken, wijzigen, verwijderen** | geen (bedrijfsbreed) | — | `notes` | ✅ Volledig werkend² |
| **Foto's & bestanden** | `/files` | alle werkbonfoto's, gegroepeerd per werkbon | via werkbondetail: uploaden en verwijderen | zie Werkbonnen | `werkbonnen` | `werkbon_fotos` + bucket `werkbon-fotos` | ✅ Volledig werkend³ |
| **Pipeline** | `/pipeline` | deals per fase, bedragen, prioriteit, verliesreden | **aanmaken, wijzigen, fase wisselen, verwijderen** | zien/bewerken: `verkoop` · verwijderen: rol admin | `crm_pipeline` | `deals`, `pipeline_stages`, `lost_reasons` | ✅ Volledig werkend⁴ |
| **Projecten** | `/projects` | lijst, status, waarde, deadline, **notities** | **aanmaken, wijzigen, status, notities, verwijderen** | bewerken: `projecten_bewerken` · verwijderen: rol admin | — | `projects`, `project_notes` | ✅ Volledig werkend⁵ |
| **Offertes** | `/offers` | lijst, totalen, status, **regels** | **aanmaken, wijzigen, status, regels toevoegen/verwijderen, verwijderen** | offerte: `offertes` · regels: rol admin/planner | `offertes` (limiet) | `offertes`, `offerte_items` | ⚠️ Werkend, versturen geblokkeerd⁶ |
| **Facturen** | `/invoices` | lijst, totalen, betaalstand, **regels** | **aanmaken, wijzigen, regels, betaald zetten, verwijderen** | factuur: `facturen` · regels: rol admin/planner · regel verwijderen: rol admin | `facturen` (limiet) | `facturen`, `factuur_regels`, RPC `mark_factuur_betaald` | ⚠️ Werkend, versturen geblokkeerd⁶ |
| **Kosten** | `/expenses` | lijst, categorie, leverancier, bedragen | **aanmaken, wijzigen, verwijderen, leverancier aanmaken** | `kosten` | `kosten_nacalculatie` | `job_costs`, `leveranciers`, `import_genegeerd` | ✅ Volledig werkend⁷ |
| **Team** | `/team` | teamleden, rollen, status, openstaande uitnodigingen | **uitnodigen, uitnodiging wijzigen/intrekken, (de)activeren, verwijderen, rechten per teamlid** | pagina: `team` · beheer: rol admin · rechten: rol admin + feature | `rollen_rechten` (voor rechtenbeheer) | `profiles`, `company_members`, `user_permissions`, edge fn `delete-team-member`, `send-email` | ⚠️ Werkend, rolwijziging geblokkeerd⁸ |
| **Bedrijfsinstellingen** | `/settings` | tarieven, btw, agenda-uren, bedrijfsgegevens | **tarieven/btw/agenda wijzigen, bedrijfsgegevens wijzigen** | pagina: `instellingen` · wijzigen: rol admin | — | `bedrijfsinstellingen`, `companies` | ✅ Volledig werkend |
| **Integraties** | `/integrations` | **echte status** Moneybird/SnelStart/AFAS, Google Agenda, Stripe | **Google koppelen en ontkoppelen, Stripe ontkoppelen** | pagina: `instellingen` · wijzigen: rol admin | `boekhoudkoppeling` (server) | RPC `get_accounting_status`, `google_calendar_status`, `google_calendar_disconnect`, `stripe_connections`, edge fn `google-calendar-auth-url` | ⚠️ Werkend, boekhouding koppelen op desktop⁹ |
| **Mijn profiel** | `/profile` | naam, rol, bedrijf | **naam wijzigen, wachtwoord wijzigen** | eigen profiel (`id = auth.uid()`) | — | `profiles`, Supabase Auth | ✅ Volledig werkend |
| **Help & support** | `/support` | FAQ, contact | mail/bel-acties | — | — | — | ✅ Volledig werkend |

### Voetnoten

1. **Vandaag** — de tegel "Omzet vandaag" toont `n.b.`. Er is geen omzet-aggregaat
   in de database en het dashboard rekent dat client-side over de volledige
   facturenset. Terecht leeg, geen alleen-lezenprobleem.
2. **Notities** — het scherm was stúk, niet alleen-lezen: de service las `body` en
   `author`, kolommen die niet bestaan (de tekstkolom heet `content`). Elke
   aanroep gaf 42703 en de gebruiker zag "Notities konden niet worden geladen".
3. **Foto's** — de placeholder ("bucket `werkbon-photos` bestaat nog niet") was
   verouderd. De bucket heet `werkbon-fotos`, bestaat mét policies, en de app
   schreef er via het werkbondetail al naartoe.
4. **Pipeline** — was óók stuk: `next_activity`/`next_date` bestaan niet op
   `deals`, en de embed naar `customers` miste de expliciete FK-naam terwijl er
   twee foreign keys naar die tabel lopen.
5. **Projecten** — de app gebruikte statussen (`in_progress`, `on_hold`,
   `completed`) die in de database niet voorkomen. Nu de echte set: concept,
   offerte_akkoord, lopend, wachten_op_klant, te_factureren, afgerond, risico.
6. **Offertes/facturen** — aanmaken, wijzigen, regels, status en betaald zetten
   werken. **Versturen naar de klant** kan niet: het dashboard bouwt de PDF in de
   browser met jsPDF en geeft die als bijlage aan `send-email`. React Native heeft
   dat niet. Zie voorstel 3 in `MOBILE_SERVERWIJZIGINGEN.sql`. Creditfacturen
   maken zit evenmin in de app.
7. **Kosten** — de databaseconstraint `job_costs_leverancier_verplicht` eist een
   leverancier bij elk positief bedrag. Dit bedrijf had er nul, dus het formulier
   zou onbruikbaar zijn; daarom kan een leverancier ter plekke worden aangemaakt
   (zelfde tabel en regels als de leverancierspagina).
8. **Team** — de rol van een bestaand teamlid wijzigen kan niet: de UPDATE-policy
   op `profiles` is `id = auth.uid()`, dus ook het dashboard kan dit niet. Zie
   voorstel 2 in `MOBILE_SERVERWIJZIGINGEN.sql`.
9. **Integraties** — status is echt en komt uit veilige RPC's; er staat geen token
   in de app. Een boekhoudkoppeling opzetten vraagt een API-token plus een
   testronde en blijft desktopwerk — dat is de flow van het dashboard zelf, geen
   mobiele beperking.

---

## Testronde

Schrijfacties zijn getest als de ingelogde gebruiker (rol `authenticated` met
zijn eigen JWT-claims), in transacties die daarna zijn **teruggedraaid**. Dat
raakt exact dezelfde policies als de app.

### Bevoegde gebruiker (admin) — alles OK

`notities`, `activiteiten`, `pipeline`, `projecten`, `projectnotities`,
`offertes`, `offerteregels`, `facturen`, `factuurregels`, `kosten`,
`leveranciers`, `agenda`, `bedrijfsinstellingen`, `bedrijfsgegevens`:
insert/update/delete alle geslaagd.

### Betaald zetten is idempotent

```
facturen  betaald_1e  true      ← eerste aanroep wijzigt
facturen  betaald_2e  false     ← tweede aanroep doet niets
```

De app toont bij `false` "Deze factuur stond al op betaald" in plaats van een
succesmelding. Twee keer tikken levert geen tweede boeking naar de boekhouding.

### Medewerker met `alles_inzien` — inzage, geen schrijfrechten

| Controle | Uitkomst |
|---|---|
| projecten zichtbaar | JA |
| UPDATE projects | **GEWEIGERD (0 rijen)** |
| INSERT deals | **GEWEIGERD (42501)** |
| INSERT offertes | **GEWEIGERD (42501)** |
| UPDATE bedrijfsinstellingen | **GEWEIGERD (0 rijen)** |
| INSERT notes (geen rechtgate) | GESCHREVEN |

De twee "0 rijen"-regels zijn het belangrijkste resultaat van deze hele ronde:
dat is een **stille weigering** — geen foutcode, geen melding. Precies het geval
waarvoor `schrijf()` in `src/lib/writeResult.ts` bestaat.

### Verlopen proefperiode — aanmaken dicht, bijwerken open

| Controle | Uitkomst |
|---|---|
| `bb_readonly_reden` | `proefperiode_verlopen` |
| INSERT notes | **GEWEIGERD (42501)** |
| INSERT activities | **GEWEIGERD (42501)** |
| UPDATE facturen (betaald zetten) | GESCHREVEN |

### Cross-tenant — dicht

| Controle | Uitkomst |
|---|---|
| klanten van andere bedrijven zichtbaar | 0 |
| werkbonnen van andere bedrijven zichtbaar | 0 |
| facturen van andere bedrijven zichtbaar | 0 |
| INSERT notitie bij ander bedrijf | **GEWEIGERD (42501)** |

### Wat niet is getest

- **Tikken in de UI.** Er is geen `idb` op deze machine, dus de formulieren zijn
  niet met echte taps doorlopen. De leeskant is wél live gecontroleerd in de
  simulator (zie hieronder); de schrijfkant op policyniveau met de JWT van de
  gebruiker.
- **Dashboard ↔ mobiel heen en weer.** Vraagt twee sessies naast elkaar; de
  gedeelde bron is wel geverifieerd (dezelfde tabellen, kolommen en statussen).
- **Verlopen proefaccount in de app zelf.** De read-onlystand is op de database
  nagespeeld, niet met een echt verlopen account ingelogd.

### Live gecontroleerd in de simulator

Alle schermen geladen zonder fouten in de Metro-log: Vandaag, Agenda, Werkbonnen,
Uren, Klanten, Activiteiten, Taken, Notities, Foto's, Pipeline, Projecten,
Offertes, Facturen, Kosten, Team, Bedrijfsinstellingen, Integraties, Profiel.
Facturen (9 rijen), Pipeline (5 deals) en Integraties (echte koppelstatus) laadden
eerder in het geheel niet.

---

## Bouwcontroles

```
npm run typecheck   → schoon
npm run lint        → 21 problemen (was 35 vóór dit werk)
```

De resterende lintmeldingen zitten allemaal in bestanden van vóór dit werk
(`AnimatedScreen`, `env.ts`, en het `useEffect(load)`-patroon in de bestaande
tabschermen). Geen enkele komt uit nieuwe code.
