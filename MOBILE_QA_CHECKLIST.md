# BossBase Mobile — QA Checklist

Generated as part of the functional-hardening pass. Use this as the manual-QA list when smoke-testing the app in Expo Go.

Legend:
- [x] ✓ verified in code review / static analysis
- [ ] ⏳ needs manual device verification
- [-] ✗ known limitation — see notes

---

## Static verification (this pass)

- [x] `npm run typecheck` — passes (no TS errors)
- [x] No `service_role` / `SUPABASE_SERVICE_ROLE` usage in mobile code
- [x] No `bypass RLS` / `disable RLS` patterns
- [x] No `customers.updated_at` in any Supabase query (only UI fallback)
- [x] StatusBadge handles `concept`, `open`, `gepland`, `in_uitvoering` / `in_progress`, `afgerond` / `completed`, `geannuleerd` / `cancelled` zonder waarschuwingen
- [x] All `Alert.alert('Wordt nog gebouwd')` placeholders vervangen door `notAvailableAlert(feature)` met consistente Dutch copy
- [x] Customer detail route bestaat: `app/customers/[id].tsx`
- [x] Planning page gebruikt real `activityService` (calendar_events + activities)
- [x] All `tel:` / `mailto:` / `maps` calls gaan via `src/lib/linking.ts` met fallback
- [x] **Bottom tabs = 6:** Vandaag/Planning/Werkbonnen/Klanten/Uren/**Menu** (hamburger, na Uren)
- [x] **Menu** is een eigen tab (`app/(tabs)/menu.tsx`) — pure navigatie-hub, rol-aware
- [x] **Profiel-icoon rechtsboven** op alle AppHeader-pagina's + detail-stacks → opent **`/profile`** (account), NIET het menu
- [x] `ProfileSettingsButton` (hernoemd van ProfileMenuButton) navigeert naar `/profile`
- [x] Profiel/account verplaatst naar eigen stack `app/profile/` (buiten de tabs); oude `app/menu/` stack verwijderd
- [x] Alle nieuwe `/(more)/*` + `/profile` + `/(tabs)/menu` routes typechecken (typed-routes geregenereerd)
- [x] Geen dode buttons: geen `onPress={() => {}}` / `onPress={undefined}` / console-only onPress in app/ of src/
- [x] Nieuwe services queryen via anon-client zonder client-side `company_id` filter (RLS-safe), géén service-role
- [x] Role-gating: `/expenses /projects /pipeline /offers /invoices` admin+planner; `/team /settings /integrations` admin-only; disallowed → "Geen toegang" zonder service-call

---

## UI-polish + dark mode (deze pass)

Statische verificatie:
- [x] Wuif-emoji 👋 verwijderd uit de Vandaag-begroeting ("Hoi, {naam}")
- [x] Datumlabel boven de naam = volledige weekdag (`weekday: 'long'`, nl-NL → "Donderdag 18 jun.")
- [x] "Uren schrijven"-kaart is wit (geen `primary` meer) met leesbare donkere tekst
- [x] `ThemeProvider` (light/dark) + persistente voorkeur via AsyncStorage (`bb.colorMode`), default light
- [x] `ThemeToggleButton`: Maan-icoon in light (→ dark), Zon-icoon in dark (→ light)
- [x] `HeaderActions` zet de theme-toggle **links** van het profiel-icoon; profiel-icoon blijft rechts en opent `/profile`
- [x] `npm run typecheck` slaagt; gewijzigde bestanden lint-schoon

Theme-dekking (model: **donker canvas + lichte kaarten**, m.u.v. Vandaag = volledig donker):
- Volledig donker: Vandaag, alle headers (AppHeader), AppSection, KPI-cards, Loading/Error/Empty, bottom tab bar, StatusBar.
- Donker canvas + lichte kaarten: Planning, Werkbonnen, Klanten, Uren, Menu, Profiel, alle /(more)-pagina's, werkbon-/klantdetail.
- Merk-groen accent en statusbadges blijven gelijk in beide modi.

Handmatige theme-checks:
- [ ] Toggle links van profiel-icoon zichtbaar op elke hoofdpagina + detailpagina's
- [ ] Maan in light; tik → dark; Zon in dark; tik → light
- [ ] Voorkeur blijft behouden na app-herstart
- [ ] Profiel-icoon opent /profile; toggle opent NIET /profile
- [ ] In dark mode: achtergrond donker, geen onleesbare tekst, tab bar + statusbar leesbaar
- [ ] Vandaag in dark mode: kaarten/hero donker, groen accent intact
- [ ] Andere pagina's in dark mode: donkere achtergrond, lichte kaarten met leesbare tekst

> Bekende vervolgstap: Werkbonnen/Klanten/Uren/Planning + detail- en /(more)-pagina's gebruiken bewust **lichte kaarten** op een donkere achtergrond. Volledige kaart-voor-kaart donkere styling (zoals Vandaag) is een vervolg-pass; alles is nu leesbaar en consistent.

---

## Labels & menu cleanup (deze pass)

Statische verificatie:
- [x] "Planning" → **"Agenda"** als zichtbaar label: bottom tab, paginatitel, menu-item, onboarding feature-chip, subtitels/laad-/foutmeldingen
- [x] Route blijft `app/(tabs)/planning.tsx`; interne code (`PlanningItem`, `PlanningScreen`, `formatPlanningDate`, `activityService`, …) ongewijzigd
- [x] **Integraties** verwijderd uit Menu-tab; toegevoegd onder **Profiel → Koppelingen** (admin only) → `/integrations`
- [x] Activiteiten-subtitel: "Calls, meetings en notities" → **"Bellen, meetings en notities"**
- [x] `npm run typecheck` slaagt; gewijzigde bestanden lint-schoon

Handmatige checks:
- [ ] Bottom tab toont "Agenda" i.p.v. "Planning"; tab opent het bestaande agenda/planning-scherm
- [ ] Paginatitel zegt "Agenda"
- [ ] Menu toont géén Integraties meer
- [ ] Profiel toont "Koppelingen → Integraties" (alleen admin); opent de Integraties-pagina (geen dode knop)
- [ ] medewerker/planner zien Integraties niet in Profiel
- [ ] Menu-item "Activiteiten" toont "Bellen, meetings en notities"
- [ ] Geen kapotte navigatie; auth + bottom nav werken

---

## Navigatie-soepelheid (deze pass)

Statische verificatie:
- [x] `AnimatedScreen` (RN Animated API — werkt in Expo Go, native driver): opacity 0→1 + translateY 8→0, 180ms, `Easing.out(cubic)`, mount-once, respecteert "reduce motion"
- [x] Geïntegreerd in `AppScreen` → álle AppScreen-pagina's animeren (6 tabs + 14 /(more)-pagina's)
- [x] Los toegepast op niet-AppScreen-schermen: login, profiel, klantdetail, werkbondetail
- [x] Root-stack: detailgroepen (`work-orders`, `customers`, `profile`, `(more)`) `animation: 'slide_from_right'`; `(auth)`/`(onboarding)`/`(tabs)` `animation: 'fade'`
- [x] Detail-substacks (`work-orders`, `customers`) + `(more)`/`profile` ook `slide_from_right`; `(auth)` `fade`
- [x] Bottom tabs: `animation: 'fade'` (cross-fade) + bestaande groene actieve capsule
- [x] Pressed-states al consistent op gedeelde componenten (Button, AppCard, AppListItem, WorkOrderCard, AppFilterChips, AppFab)
- [x] Geen nieuwe dependency; `npm run typecheck` slaagt; nieuwe bestanden lint-schoon

Handmatige checks (Expo Go):
- [ ] Login-scherm faded/schuift subtiel in; login → app voelt vloeiend (fade, geen rare slide)
- [ ] Tab-wissels (Vandaag/Agenda/Werkbonnen/Klanten/Uren/Menu) cross-faden; geen harde sprong of blanco flits
- [ ] Werkbon-detail schuift van rechts in; terug schuift natuurlijk weg
- [ ] Klantdetail schuift van rechts in; terug werkt
- [ ] Profiel (rechtsboven) en /(more)-pagina's schuiven soepel in en terug
- [ ] Snel tabben crasht niet; data blijft staan (geen full-screen loader bij terugkeren naar geladen tab)
- [ ] Statusupdate / notitie / urenregistratie / uitloggen werken nog
- [ ] Animatie blokkeert geen taps; scrollen blijft vloeiend

---

## Backend-integratie & sync (deze pass)

Statische verificatie:
- [x] Geen mock-data meer in `app/` (MOCK uit `today.tsx` en `hours.tsx` verwijderd)
- [x] Vandaag echt: volgende afspraak (`getNextPlanningItem`), tijdlijn (`listPlanningItemsForRange`), "Uren vandaag" + "Open werkbonnen" KPI; "Omzet vandaag" = `—`
- [x] Uren echt: today-summary, weekstrip, registraties, Team-filter (`listCompanyTimeEntries`); mock team/attention/quick-add weg
- [x] Geen service-role; geen `customers.updated_at` query; RLS = bron van waarheid
- [x] `npm run typecheck` slaagt; gewijzigde bestanden lint-schoon

Desktop ↔ mobiel sync (handmatig, met admin-account):
- [ ] Maak klant aan op desktop → verschijnt in app na refresh (Klanten)
- [ ] Maak werkbon aan op desktop → verschijnt in Werkbonnen + Vandaag/Agenda na refresh
- [ ] Wijzig werkbon-status in app → zichtbaar op desktop na refresh (zelfde statuswaarden)
- [ ] Voeg notitie toe in app (werkbon-detail) → zichtbaar in `werkbonnen.notes` op desktop
- [ ] Voeg uren toe in app (werkbon-detail) → verschijnt in `urenregistratie` op desktop + in Uren-tab
- [ ] Wijzig agenda/afspraak op desktop → verschijnt in Agenda + Vandaag na refresh
- [ ] Wijzig klant op desktop → app toont wijziging na refresh
- [ ] Vandaag KPI "Uren vandaag" en "Open werkbonnen" kloppen met echte data
- [ ] Pull-to-refresh op Vandaag/Agenda/Werkbonnen/Klanten/Uren werkt; data blijft staan tijdens refresh

Veiligheid:
- [ ] Geen `column customers.updated_at` fout in logs
- [ ] Geen onbekende-status-waarschuwingen voor bekende statussen
- [ ] Medewerker ziet eigen toegewezen werkbonnen/agenda; admin/planner bedrijfsbreed
- [ ] Geen dode knoppen; geen nep-"opgeslagen"

---

## Blank screen / loading reliability QA (deze pass)

Root cause (gefixt): `AnimatedScreen` startte content op `opacity: 0` en onthulde pas ná een async `AccessibilityInfo.isReduceMotionEnabled()`-call — bij een snelle remount bleef de opacity op 0 hangen = **wit scherm** tot je wegnavigeerde en terugkwam. Nu start de reveal **synchroon** op mount en eindigt altijd op `opacity: 1`.

Statische verificatie:
- [x] `AnimatedScreen` onthult nooit meer gegated achter een promise (geen vastgelopen opacity 0)
- [x] `ScreenErrorBoundary` toegevoegd en in `AppScreen` gewikkeld → render-fouten tonen een NL-fallback + "Opnieuw proberen", nooit wit
- [x] Stale-while-refresh: `werkbonnen` + `klanten` tonen alleen de volledige loader/error als er nog geen data is; refetch behoudt bestaande lijst
- [x] Bottom-tab `animation: 'none'` (betrouwbaar; geen detached/blank tab bij snel wisselen) — entrance-animatie blijft via AnimatedScreen
- [x] Elke pagina heeft loading/empty/error/data-state; `AppScreen` heeft altijd `flex:1` + thema-achtergrond
- [x] `npm run typecheck` slaagt; nieuwe bestanden lint-schoon

Handmatig (Expo Go) — per pagina: first load · refresh · error · retry · snel wisselen:
- [ ] Vandaag — eerste keer tonen (geen wit), pull-to-refresh, data blijft staan
- [ ] Agenda — idem
- [ ] Werkbonnen — idem; refetch behoudt lijst
- [ ] Klanten — idem; refetch behoudt lijst
- [ ] Uren — idem
- [ ] Werkbon-detail — loading/niet-gevonden/error/retry, geen wit
- [ ] Klant-detail — idem
- [ ] **Snel achter elkaar alle tabs tikken → geen enkel wit scherm**
- [ ] **Geen pagina vereist nog "wegnavigeren en terug" om te laden**
- [ ] Internet uit → error-state met retry; internet aan → retry laadt zonder van pagina te wisselen
- [ ] Status wijzigen / notitie / uren toevoegen / uitloggen werken nog

---

## Dark mode QA (deze pass — volledige theming)

Root cause: veel componenten/schermen gebruikten de statische LICHTE `ds`-palette zonder `useTheme`, dus kaarten/inputs/lijsten bleven wit in dark mode terwijl de paginabodem wel donker werd.

Statische verificatie:
- [x] Gedeelde componenten theme-aware: AppCard, AppListItem/AppListGroup, AppFilterChips, AppSearchBar, AppFab(groen), AppKpiCard, AppHeader, AppSection, EmptyState, ErrorState, LoadingScreen, PlaceholderState, Button, FormField
- [x] Schermen theme-aware: today, planning, work-orders(tab), customers(tab), hours, menu, login, work-order detail, customer detail, profile, alle 13 /(more)-pagina's
- [x] Inputs: login e-mail/wachtwoord + AppSearchBar + FormField → `t.card` bg, `t.line` border, `t.ink` tekst, `t.muted2` placeholder
- [x] Actieve filter-chip = groene pill; inactieve chip = `t.card` + `t.line`
- [x] StatusBadge: status-pastels blijven (leesbaar als lichte pill op donkere kaart)
- [x] Bottom tab bar al theme-aware (t.card/t.line, groene actieve capsule)
- [x] `npm run typecheck` slaagt; gewijzigde bestanden lint-schoon
- [x] Bewuste resterende lichte kleuren: onboarding-flow (eigen lichte branding, pre-login); witte stip op de donkere geselecteerde dag-pill in Agenda (contrast, correct in beide modi)

Handmatig — zet toestel/het thema op **dark** en controleer per scherm:
- [ ] Login: donkere achtergrond, donkere inputvelden met leesbare tekst
- [ ] Vandaag/Agenda/Werkbonnen/Klanten/Uren: geen witte kaarten; tekst leesbaar
- [ ] Werkbon-detail + Klant-detail: kaarten/secties donker, tekst leesbaar
- [ ] Menu + alle /(more)-pagina's: lijstrijen donker, bedragen/labels leesbaar
- [ ] Zoekbalken + filter-chips donker; actieve chip groen
- [ ] Loading/empty/error states donker
- [ ] Geen witte rechthoeken/blokken; geen onleesbare donkere tekst op donker
- [ ] Schakel terug naar **light**: alles ziet er nog correct uit (geen regressie)

---

## Floating CTA / bottom spacing QA (deze pass)

Probleem: het laatste lijst-item viel achter de groene FAB; en Klanten/Uren/Werkbonnen hadden zowel een top-"+" als een grote groene CTA voor dezelfde actie.

Fix:
- [x] `AppScreen` heeft nu `floatingAction` prop → scroll-content krijgt `insets.bottom + 150` onderpadding (klaart zowel de floating tab bar als de FAB)
- [x] Klanten/Werkbonnen/Uren geven `floatingAction` door → laatste item volledig zichtbaar boven de FAB
- [x] Dubbele create verwijderd: de top-"+" is weg op Klanten, Werkbonnen, Uren; de enige create-actie is de groene FAB onderaan
- [x] Geen plus-vormige filterknop meer (de "Filters"/"Zoeken" headeracties zonder icoon toonden een "+"); filteren gaat via de chips, zoeken via de in-body zoekbalk
- [x] Top-rechts blijft enkel het profiel-icoon
- [x] FAB blijft rol-bewust (Nieuwe klant/werkbon alleen admin/planner; Uren toevoegen voor iedereen)
- [x] Planning houdt z'n enkele header-"+" (geen FAB, dus geen duplicaat)
- [x] `npm run typecheck` slaagt; lint schoon (op nieuwe wijzigingen)

| Pagina | FAB aanwezig | Dubbele "+" verwijderd | Laatste item zichtbaar | Filter/create visueel onderscheiden | Resultaat |
|---|---|---|---|---|---|
| Werkbonnen | ja (admin/planner) | ja | ⏳ device | ja (chips ≠ groene FAB) | ⏳ |
| Klanten | ja (admin/planner) | ja | ⏳ device | ja | ⏳ |
| Uren | ja (allen) | ja | ⏳ device | ja | ⏳ |
| Planning | nee (header-"+") | n.v.t. | ⏳ device | n.v.t. | ⏳ |

---

## Navigatie-transitie QA (deze pass)

Oorzaak van "statisch": tab-switch had `animation: 'none'` én `AnimatedScreen` animeerde alleen bij de eerste mount → een al-gemounte tab opnieuw openen = directe pop zonder flow.

Fix:
- [x] `AnimatedScreen` is nu **focus-gebaseerd** (`useIsFocused`): animeert elke keer dat een scherm focus krijgt — opacity 0.9→1 + translateY 8→0, ~200ms, native driver
- [x] Opacity-vloer 0.9 (nooit 0) → kan nooit wit/blank worden, ook bij snelle re-focus
- [x] Tab `animation: 'none'` blijft (betrouwbaar; geen native tab-transitie die eerder blanco schermen gaf) — de flow komt van de focus-animatie
- [x] Tab-knoppen hebben pressed-feedback (opacity 0.6); actieve groene capsule blijft
- [x] Stack-transities ongewijzigd en al native: detail/menu/(more) sliden van rechts, top-level groepen faden
- [x] push/replace correct: alleen auth/onboarding gebruiken replace; alle gebruikersnavigatie gebruikt push
- [x] `npm run typecheck` slaagt; gewijzigde bestanden lint-schoon

Handmatig (Expo Go):
Tab-transities:
- [ ] Vandaag→Planning→Werkbonnen→Klanten→Uren: zichtbare fade+slide-in per wissel, geen statische pop
- [ ] Snel tabben: geen blank/wit scherm; content blijft staan
Detail-transities:
- [ ] Werkbonnen→werkbon-detail slidet van rechts; terug slidet weg
- [ ] Klanten→klant-detail slidet; terug werkt
Menu-transities:
- [ ] Menu-item / profiel-icoon opent met slide; terug soepel
Data:
- [ ] Pagina's worden niet blank tijdens refresh; bestaande data blijft zichtbaar

---

## Manual checklist — moet op device of simulator

### 1. App start + auth
- [ ] App start zonder crash
- [ ] Sessie wordt hersteld na reload (geen opnieuw inloggen)
- [ ] Login werkt met geldig account
- [ ] Foutmelding NL bij foute creds (geen Engelse Supabase error)
- [ ] Profiel + bedrijf laden direct na login
- [ ] Bottom tabs verschijnen

### 2. Vandaag — `app/(tabs)/today.tsx`
- [ ] Greeting toont voornaam uit profile
- [ ] KPI strip rendert (mock)
- [ ] Quick action **Uren schrijven** → navigeert naar `/(tabs)/hours`
- [ ] Quick action **Nieuwe werkbon** → toont "Nog niet beschikbaar"-alert
- [ ] Quick action **Nieuwe klant** → navigeert naar `/(tabs)/customers`
- [ ] Quick action **Foto bij werk** → toont "Nog niet beschikbaar"
- [ ] Hero "Navigeer" → opent Maps (mock-adres)
- [ ] Hero "Bel" → opent telefoon-app (mock-nummer)
- [ ] Hero "Bon" → navigeert naar `/work-orders/{mock-id}` (toont "Werkbon niet gevonden" — OK want mock-id)
- [ ] Timeline rij tap → navigeert naar werkbon-detail (idem)
- [ ] **Deze week** sectie toont echte uren-bars deze week
- [ ] "Open" link in week-card → navigeert naar `/(tabs)/hours`

### 3. Planning — `app/(tabs)/planning.tsx` (Dag / Week / Maand)
- [ ] Pagina opent zonder crash; begint in **Dag**-view
- [ ] **Echte data:** combineert `calendar_events` + `activities` + `werkbonnen` (gepland_op) — geen mock
- [ ] Dag: week-strip wisselt geselecteerde dag; "Volgende"-highlight verschijnt alleen vandaag bij een komend item
- [ ] Dag: lege dag → "Geen afspraken gepland voor deze dag."
- [ ] **Vorige** periode (‹) werkt: Dag −1 dag, Week −7 dagen, Maand −1 maand
- [ ] **Volgende** periode (›) werkt analoog
- [ ] **Vandaag**-knop springt terug naar vandaag
- [ ] Week-view: dagen Ma–Zo met item-aantallen; dag aantikken → opent Dag voor die datum
- [ ] Week-view leeg → "Geen planning deze week."
- [ ] Maand-view: kalendergrid; dagen met planning tonen een groene stip; dag selecteren toont lijst eronder
- [ ] Maand-view leeg → "Geen planning deze maand."
- [ ] Datumranges kloppen rond middernacht (geen UTC-verschuiving van "vandaag")
- [ ] Kaart "Bel" → telefoon-app (alleen als telefoon bekend)
- [ ] Kaart "Route" → Maps (alleen als adres bekend)
- [ ] Kaart "Werkbon" / rij-tap op werkbon-item → opent werkbon-detail
- [ ] Rij-tap op item met klant (zonder werkbon) → opent klant-detail
- [ ] Items zonder werkbon én zonder klant zijn niet-tikbaar (geen dode tap)
- [ ] Statusbadge toont correct (Gepland/In uitvoering/Afgerond) per item
- [ ] Loading → "Planning wordt geladen…"; Error → retry-knop; geen rauwe Supabase-fout in UI
- [ ] Eén bron faalt (bv. werkbonnen) → andere bronnen tonen alsnog (partial-error alleen in dev-log)
- [ ] Scope-label: admin/planner "Bedrijfsbrede planning"; medewerker "Je eigen toegewezen planning"
- [ ] Geen mock "Team vandaag"-strip meer
- [ ] Header "+" → "Nieuwe afspraak" alert (create-flow nog niet beschikbaar); profiel-icoon rechtsboven → /profile

### 4. Werkbonnen — `app/(tabs)/work-orders.tsx`
- [ ] Real data laadt uit `werkbonnen`
- [ ] Pull-to-refresh werkt
- [ ] Search filtert op naam/titel/adres
- [ ] Filter chips Alles/Open/Lopend/Klaar/Mijn werken
- [ ] Urgent banner verschijnt bij lopende werkbon
- [ ] Card tap → opent detail
- [ ] Header filter → "Nog niet beschikbaar"
- [ ] Header plus → "Nieuwe werkbon" alert (admin/planner)
- [ ] Empty state bij 0 werkbonnen
- [ ] Status badges tonen correcte kleur (groen=lopend, blauw=gepland, etc.)

### 5. Werkbon detail — `app/work-orders/[id].tsx`
- [ ] Werkbon laadt (titel, klant, status, locatie, omschrijving)
- [ ] Status-wijzig knop opent action sheet met toegestane statussen
- [ ] Status updaten persist in DB (zichtbaar op desktop)
- [ ] **Notitie toevoegen** modal opent
- [ ] Notitie opgeslagen → verschijnt in lijst
- [ ] Notitie zichtbaar in `werkbonnen.notes` veld (desktop dashboard)
- [ ] **Uren toevoegen** modal opent
- [ ] Datum + uren + notitie validatie werkt
- [ ] Uren opgeslagen → verschijnen in lijst
- [ ] Uren zichtbaar in `urenregistratie` (desktop)
- [ ] Klant "Bel" / "Mail" / "Route" werken

### 6. Klanten — `app/(tabs)/customers.tsx`
- [ ] Real data laadt uit `customers`
- [ ] **GEEN `column customers.updated_at does not exist` error** in Expo log
- [ ] Search filtert op naam/email/phone/adres/stad/kvk
- [ ] Filter chips Alle/Actief/Recent/Zakelijk/Particulier werken
- [ ] "Recent geopend" strip toont 4 meest recent gewijzigde
- [ ] A-Z lijst groepeert correct
- [ ] Card "Bel" → telefoon-app (als nummer bekend)
- [ ] Card "Route" → Maps (als adres bekend)
- [ ] Card tap → **navigeert naar `/customers/{id}`** (nieuw)
- [ ] Header filters → "Nog niet beschikbaar"
- [ ] FAB "Nieuwe klant" (admin/planner) → "Nog niet beschikbaar"

### 7. Klant detail — `app/customers/[id].tsx` (NEW)
- [ ] Klantnaam in header
- [ ] Avatar met initialen
- [ ] Type-badge (Zakelijk/Particulier)
- [ ] KvK-nummer indien aanwezig
- [ ] Bellen-knop → telefoon (disabled als geen nummer)
- [ ] Route-knop → Maps (disabled als geen adres)
- [ ] Mail-knop → mail (disabled als geen email)
- [ ] Contact-card met telefoon + email (tappable)
- [ ] Adres-card → Maps
- [ ] Werkbonnen-sectie toont werkbonnen van deze klant
- [ ] Werkbon tap → werkbon-detail
- [ ] Back-knop werkt
- [ ] Empty states tonen netjes (geen werkbonnen / notities placeholder)

### 8. Uren — `app/(tabs)/hours.tsx`
- [ ] Real data uit `urenregistratie` voor profile
- [ ] Summary ring toont vandaag-uren %
- [ ] Week-strip toont uren per dag van deze week
- [ ] Quick-add card → "Nog niet beschikbaar" (verwijst naar werkbon-detail)
- [ ] Filter chips Vandaag/Week/Open/Mijn/Team werken
- [ ] Team-filter (admin/planner) → laadt company-wide
- [ ] Entry "Meer"-knop → "Nog niet beschikbaar"
- [ ] FAB → "Nog niet beschikbaar"
- [ ] Pull-to-refresh werkt

### 9. Profiel-icoon + Profiel/account — `app/profile/index.tsx`
- [ ] Profiel-avatar (initialen) staat rechtsboven op **elke** pagina: Vandaag, Planning, Werkbonnen, Klanten, Uren, **Menu**
- [ ] Profiel-icoon staat ook op werkbon-detail en klant-detail (native header rechts)
- [ ] Tap op profiel-icoon → opent **`/profile`** (account), **NIET** het menu
- [ ] Profiel toont naam + email + rol-label NL (Beheerder/Planner/Medewerker) + bedrijfsnaam
- [ ] App-versie onderaan
- [ ] Terug-knop sluit profiel
- [ ] Secundaire rijen (voorkeuren/account) → "Nog niet beschikbaar"
- [ ] **Uitloggen** werkt (Supabase signOut + redirect naar login)

### 9b. Menu-tab — `app/(tabs)/menu.tsx`
- [ ] Menu-tab toont hamburger-icoon (drie streepjes), na Uren; actief = groene tint
- [ ] Tap op Menu-tab opent de Menu-hub (titel "Menu", subtitel "Alle functies van BossBase")
- [ ] Profiel-icoon rechtsboven op de Menu-tab opent `/profile` (niet zichzelf)
- [ ] **Rol-aware:** admin ziet alle 6 secties; planner ziet Werk + Sales + Support; medewerker ziet alleen Werk + Support
- [ ] Elke menu-rij navigeert naar een echt scherm óf toont "Nog niet beschikbaar" (geen dode knop)
- [ ] Niet-bestaande items (Documenten, Rollen & rechten) → veilige NL-alert
- [ ] **"Analyse & rapportage" (Dashboard/Omzet/Uren-/Werkbonrapportage) is NIET meer aanwezig in het Menu** — desktop-only; geen lege sectiekop blijft achter

### 10. Dashboard routes — `app/(more)/*`
- [ ] **Activiteiten** opent, toont echte `activities` of nette empty state
- [ ] **Taken** opent, toont open taken
- [ ] **Notities** opent, toont `notes`
- [ ] **Kosten** (admin/planner) opent, toont `job_costs` met bedragen
- [ ] **Projecten** (admin/planner) opent, toont `projects`
- [ ] **Pipeline** (admin/planner) opent, deals gegroepeerd per fase
- [ ] **Offertes** (admin/planner) opent, toont `offertes`
- [ ] **Facturen** (admin/planner) opent, toont `facturen`
- [ ] **Team** (admin) opent, toont `company_members`
- [ ] **Bedrijfsinstellingen** (admin) opent, toont tarieven/BTW read-only
- [ ] **Integraties** (admin) opent, tap op provider → eerlijke "beheren op desktop"-uitleg (geen nepstatus)
- [ ] **Foto's & bestanden** opent → nette placeholder (geen crash, geen nepdata)
- [ ] **Support** opent; E-mail → mail-app, Bel → telefoon-app
- [ ] Medewerker die `/pipeline` direct opent ziet "Geen toegang" (geen data-call)
- [ ] Elke route: loading → data/empty/error netjes; back-knop werkt; geen crash

### 11. Bottom tabs
- [ ] Vandaag · Planning · Werkbonnen · Klanten · Uren · **Menu** zichtbaar (6 tabs; **Profiel NIET als tab**)
- [ ] Menu-tab = hamburger-icoon, staat na Uren
- [ ] Actieve tab heeft groene tint (ook Menu)
- [ ] 6 labels passen / lezen netjes op kleine iPhone (fontSize 10)
- [ ] Tab switch behoudt scroll-positie (verwacht RN-gedrag)

### 12. Cross-tenant (security)
- [ ] Werkbonnen tonen alleen werkbonnen van eigen bedrijf
- [ ] Klanten tonen alleen klanten van eigen bedrijf
- [ ] Uren tonen alleen eigen / eigen-bedrijf
- [ ] Calendar events tonen alleen eigen bedrijf
- [ ] Klant-detail via direct URL met een ander companyId → error "Klant niet gevonden"

### 13. Logs (Expo Metro)
- [ ] Geen onbekende-status-waarschuwingen voor bekende statussen
- [ ] Geen `column does not exist` fouten
- [ ] Geen RLS-fouten in normaal gebruik
- [ ] Geen service-role / admin-key logs

---

## Bekende limitaties (NIET QA-blokkerend)

| Limitatie | Reden | Doc |
|---|---|---|
| Vandaag hero/timeline tonen mock | Geen aggregate query / next-appt service | MOBILE_BACKEND_GAPS.md #6 |
| Uren team-sectie mock | Geen aggregate view per profile_id | MOBILE_BACKEND_GAPS.md #5/9 |
| Uren attention mock | Schema mist signaal-velden | MOBILE_BACKEND_GAPS.md #5 |
| Profiel hero-stats `—` | Geen aggregate view | MOBILE_BACKEND_GAPS.md #5 |
| Foto upload niet beschikbaar | Geen storage bucket + tabel | MOBILE_BACKEND_GAPS.md #4 |
| Create-flows niet beschikbaar | Forms nog niet gebouwd in mobile | MOBILE_BACKEND_GAPS.md #8 |
| Klantnotities placeholder | Geen noteService mobile-side | MOBILE_FUNCTIONALITY_MATRIX.md |

---

## Topbar / header QA (AppTopBar pass)

Nieuwe gedeelde **`AppTopBar`** (fixed, subtiel gescheiden chrome) vervangt de oude
meescrollende `AppHeader` op elke pagina. Geïntegreerd via `AppScreen` `header`-prop
(tabs + (more)) en als vaste sibling boven de ScrollView (detailpagina's + profiel).

Design: oppervlak `t.card` (licht: wit/off-white, donker: verhoogd donker), dunne
onderrand `t.line` + zachte schaduw, safe-area-top eigen aan de bar, groen alleen
voor de kleine `meta`-pill. Detailpagina's: `variant="detail"` + terugknop; native
Stack-header verborgen (`headerShown:false`).

| Pagina | Titel | Subtitle / meta | Right cluster | Back | Dark mode | Safe area | Geen dubbele actie | Pass |
|---|---|---|---|---|---|---|---|---|
| Vandaag | "Vandaag" (eyebrow: "Hoi, {naam}") | datum · n afspraken · meta `{n} open` | 🌙 + profiel | — | ⏳ | ⏳ | ✓ (geen top-plus) | ⏳ |
| Agenda (planning) | "Agenda" | subtitle per view · meta `{n} items` | 🌙 + profiel | — | ⏳ | ⏳ | ✓ (non-functionele "+" verwijderd) | ⏳ |
| Werkbonnen | "Werkbonnen" | n totaal · meta `{n} open` | 🌙 + profiel | — | ⏳ | ⏳ | ✓ (create = FAB) | ⏳ |
| Klanten | "Klanten" | n klanten · n zakelijk · meta `{n} actief` | 🌙 + profiel | — | ⏳ | ⏳ | ✓ (create = FAB) | ⏳ |
| Uren | "Uren" | scope-subtitle · meta `{u} vandaag` | 🌙 + profiel | — | ⏳ | ⏳ | ✓ (create = FAB) | ⏳ |
| Menu | "Menu" (eyebrow: bedrijfsnaam) | "Alle functies van BossBase" | 🌙 + profiel | — | ⏳ | ⏳ | ✓ | ⏳ |
| Werkbon detail | werkbon-titel (eyebrow "Werkbon") | klantnaam · meta = status | geen | ✓ | ⏳ | ⏳ | ✓ (status-actie in body) | ⏳ |
| Klant detail | klantnaam (eyebrow "Klant") | plaats · type | geen | ✓ | ⏳ | ⏳ | ✓ (acties in body) | ⏳ |
| Profiel | "Profiel" | rol · bedrijf | potlood (bewerken) | ✓ | ⏳ | ⏳ | ✓ | ⏳ |
| (more) pagina's (13) | paginanaam | bestaande subtitle/telling | geen | ✓ | ⏳ | ⏳ | ✓ | ⏳ |

Algemene checks (handmatig in Expo Go):
- [ ] Topbar is op elke pagina zichtbaar gescheiden van de content (rand + lichte schaduw), in licht én donker.
- [ ] Topbar scrollt NIET weg; content scrollt eronder door (geen content verborgen achter de bar).
- [ ] Geen dubbele header / geen dubbele titel op detailpagina's (native Stack-header is verborgen).
- [ ] Geen dubbele "+"-knop waar al een bottom-FAB bestaat (Werkbonnen, Klanten, Uren).
- [ ] Terugknop werkt op alle detail-/sub-pagina's en op profiel.
- [ ] Profiel-avatar + thema-toggle staan alleen op de hoofdtabs, niet op detail/(more).
- [ ] Safe area correct op iPhone met notch (bar begint onder de status bar, geen overlap).
- [ ] Floating bottom-tabbar werkt nog; content wordt niet achter de tabbar verborgen.
- [ ] Navigatie-transities (slide-from-right naar detail) nog vloeiend; geen layout-sprong van de bar.
- [x] `npm run typecheck` — passes (no TS errors)
- [x] `npm run lint` — geen nieuwe problemen t.o.v. baseline (alleen pre-existing env.ts/onboarding/etc.)

---

## Aanbevolen test accounts

Voor volledige role-coverage:
- **admin** — alle features zichtbaar, alle FABs, team-secties
- **planner** — zelfde als admin minus settings (eventueel)
- **medewerker** — geen create-FABs, primair eigen data, geen team-sectie

Als geen planner/medewerker-account bestaat: maak in desktop een test-medewerker aan met `role='medewerker'` en login mobile met die credentials.
