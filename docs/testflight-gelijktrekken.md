# TestFlight-app gelijk aan de PWA

Stand 2026-10-15. Branch `sync/testflight-met-pwa` vanaf `origin/main` `1ed1ac7` (merge van PR #2, geteste head
`04f8d3f`). Dezelfde codebase bedient de PWA (web) en de iOS/Android-app; "gelijktrekken" betekent hier: de
native build vanaf de actuele `main`, plus de native-specifieke onderdelen goed zetten.

## 1. Wat staat er in TestFlight

| Gegeven | Waarde | Zekerheid |
|---|---|---|
| Bundle identifier | `nl.bossbase.app` | bewezen (EAS-build, app.config) |
| Marketingversie / buildnummer | `0.1.0` / `5` | bewezen (laatste EAS iOS-build, profiel `production`, distributie `store`) |
| Commit | `18c2f43` "Supabase-omgeving bereikt de productiebundel weer" (20-09-2026) | bewezen voor build 5 |
| In TestFlight aangeboden | build 5 | **waarschijnlijk** — submissiegeschiedenis is met de beschikbare tooling niet uit te lezen; build 5 is de nieuwste store-build, er zijn geen OTA-updates gepubliceerd |
| Branch | lokale `main` (6 commits niet in `origin/main`); `18c2f43` zelf zit niet in `origin/main` | bewezen |
| Buildprofiel / kanaal / omgeving | `production` / `production` / `production` | bewezen |
| Runtimeversie / SDK | `0.1.0` (policy appVersion) / 57.0.0 | bewezen |
| Updates-URL | `https://u.expo.dev/4e4f5d3e-…` | bewezen |
| iPad | `supportsTablet: false` → op iPad als vergrote iPhone-app | bewezen |
| Oriëntatie | `portrait` (overal) | bewezen |
| Deployment target | iOS 16.4 (prebuild) | bewezen |
| Native plugins | expo-router, expo-asset, expo-secure-store, expo-font, datetimepicker, expo-image-picker (camera/foto-teksten), expo-splash-screen | bewezen |

De vijf TestFlight-commits (`ffe5dce`, `825c4fb`, `1239ed0`, `fcb8496`, `18c2f43`) staan inhoudelijk ook in
`origin/main`: `src/lib/env.ts` en `eas.json` identiek, `.easignore` en `app.config.ts` alleen uitgebreid (web).
`origin/main` bevat 55 commits meer: het volledige PWA- en gelijktrekwerk.

Let op: `origin/app-verbeteren` (63 eigen commits, laatst 15-10) is een aparte lijn die niet in `main` zit. Die is
hier bewust niet meegenomen; bron van waarheid is `main`.

## 2. Verschillenmatrix (native ↔ PWA)

| Onderdeel | PWA | TestFlight (build 5) | Na deze branch | Bestanden | Risico | Test |
|---|---|---|---|---|---|---|
| Functies, schermen, rechten, berekeningen | `main` | stand 20-09 (zonder gelijktrekwerk, zonder securityfixes in de app) | gelijk aan `main` (zelfde code) | alle | middel (veel nieuw) | unit, web-praktijktest, hardware |
| iPad | tabletindeling vanaf 700 px | vergrote iPhone | echte iPad-app, tabletindeling vanaf 700 pt | `app.config.ts`, `schermklasseRegels.ts`, `MobielKader.tsx` | middel | unit, prebuild-plist, hardware |
| Oriëntatie | vrij | staand | iPhone staand, iPad alle vier, Android-telefoon staand | `app.config.ts` | laag | prebuild-plist/manifest |
| Multitasking (Split View/Stage Manager) | venster volgt | niet (geen iPad-app) | aan (`UIRequiresFullScreen` false), indeling volgt vensterbreedte | `app.config.ts`, `schermklasse.ts` | middel | hardware |
| Thema | knop in kop, startscript, geen flits | — (nog niet aanwezig) | knop in kop; opstartscherm blijft tot keuze gelezen; zonder keuze systeem | `ThemeProvider.tsx`, `app.config.ts` | laag | unit, hardware |
| iPad-menu twee kolommen | ja | n.v.t. | ja (tabletindeling) | `menu.tsx` | laag | unit |
| Weekurenwidget volle breedte | ja | n.v.t. | ja | `today.tsx` | laag | unit |
| Scherpe eerste render | geen extra lagen | — | `AnimatedScreen` zonder eerste animatie (gedeeld); native ScrollView heeft geen geforceerde laag | `AnimatedScreen.tsx` | laag | hardware |
| Toetsenbord | viewport-logica (web) | KeyboardAvoidingView (vellen fout) | venstercoördinaten in vellen, scrollen sluit toetsenbord niet | zie §3 | middel | hardware |
| Installatie-uitleg, service worker | ja | — | verborgen; `/installeren` → start | `installeren.tsx`, `pwa.ts` | laag | unit |
| Afdrukken | printvenster | — | melding "via de webversie" | `afdrukken.ts` | laag | hardware |
| CSV-export | download | — | deelvenster | `csvExport.ts` | laag | hardware |
| Universele links | n.v.t. | entitlement `applinks:app.bossbase.nl` | ongewijzigd; **AASA-bestand ontbreekt op app.bossbase.nl** (zie §5) | — | laag | — |

## 3. Native-specifiek (audit en herstel)

| Punt | Bevinding | Hersteld |
|---|---|---|
| Browser-API's in gedeelde code | alle `window`/`document`/`navigator` achter een platformcontrole | n.v.t. |
| Toetsenbord in vellen (FormSheet, SelectField, werkbon-modals) | KeyboardAvoidingView rekent t.o.v. de ouder; in een pageSheet/formSheet viel de opslaanknop onder het toetsenbord | `ToetsenbordVlak` (meet in venstercoördinaten), `automaticallyAdjustKeyboardInsets` in werkbon-modals, AppScreen en notitie-invoer |
| Scrollen sluit toetsenbord | `on-drag` in FormSheet | `none` |
| Toetsenbord open → tabbalk/homebalkmarge | alleen op web | `useToetsenbordOpen` ook native (Keyboard-events) |
| Statusbalk achter een vel (iPhone) | donkere klok op zwart | `VelStatusbalk`: licht zolang het vel open is |
| Links/PDF/bestanden openen | stil falen bij weigering (bijv. `tel:` op iPad) | `openExtern()` met melding |
| Verversen bij terugkeren | alleen web | native na achtergrond → actief (niet na Face ID) |
| iPad-kolom in vellen | grijze stroken in pageSheet | kader alleen buiten vellen |
| Boss | geen streaming op iOS | terugval toont het hele antwoord; gesprek-id blijft |
| Deeplinks | alle meldingroutes bestaan; zonder sessie → login | n.v.t. (na login naar Vandaag, gelijk aan PWA) |
| Toegankelijkheid | `aria-*` hebben ook `accessibilityState` (VoiceOver) | n.v.t. |
| Camera/fotobibliotheek | toestemming pas bij gebruik, melding bij weigering; teksten in Info.plist | n.v.t. |
| Afdrukken / CSV | native: melding / deelvenster | n.v.t. |

## 4. Backend

Geen backendwijziging nodig. De app gebruikt dezelfde Supabase-omgeving (`env.ts` ongewijzigd t.o.v. build 5) en
sluit aan op de live regels van 14-10 (`offerte-pdf-url` v9, opslagrechten logo's/werkbonfoto's/factuur-PDF's).

## 5. Bekende beperkingen

- Universele links (`https://app.bossbase.nl/...` opent de app) werken pas met
  `/.well-known/apple-app-site-association` op `app.bossbase.nl` (Apple Team ID nodig). Niet aangemaakt.
- Simulator op deze machine reageert niet (`simctl openurl` time-out); native visueel alleen op echt toestel te
  bevestigen.

## 6. app-verbeteren

Bron: `origin/app-verbeteren` (828ae24), 55 gewone commits + 8 merges boven
`main`. Samengevoegd op `sync/testflight-met-pwa` met merge-commit 8786846 en
vier losse fixcommits (11c5dc2 beveiliging foto/kostenbon, e6478e6 CSP/PDF,
a965036 systeemthema, 9bd73dc permissieteksten). Niet gepusht.

**Telling (55 gewone commits):** 40 overgenomen zoals ze zijn, 8 aangepast
overgenomen, 7 niet. De 8 merges volgen hun onderliggende commits.

### Per commit

| Hash | Wat | Besluit | Waarom |
|---|---|---|---|
| 8a87a4d | Homepage: thema in Instellingen, Boss-hoofd, widgets | aangepast | Widgets, Boss-hoofd en de Appearance-listener wel; themaverplaatsing niet (één zon/maan-knop in de kop) |
| 816abdb | Widget Nieuwe aanvragen + checklist | overgenomen | |
| e728f81 | Voertuig; route-helper (Apple Kaarten/Google Maps) | overgenomen | `LSApplicationQueriesSchemes` in het infoPlist-blok van HEAD |
| 67df350 | Projectkaart: statusstrook, aanvraag | overgenomen | png's niet |
| 7670686 | Aanvraagtekst in groen vak | overgenomen | |
| 7407306 | Filters onthouden | overgenomen | |
| 90d7bd7 | Adres zoeken via PDOK | aangepast | `https://api.pdok.nl` in `connect-src` |
| f2dfba7 | Werkbon-kopkaart, FotoViewer | overgenomen | |
| bcca56e | Checklist | niet | alleen docs |
| 34a5455 | Uren: "Vul je werkdag in" | overgenomen | |
| 0d0a296 | Urenherinnering zonder Date.now() | overgenomen | |
| 8ad8041 | PDF-module (jsPDF) | overgenomen | |
| 4f3e997 | Kleur in de tegels | overgenomen | |
| 6670de3 | PDF-weergave (WebView/iframe + pdf.js) | aangepast | pdf.js zelf gehost (web) / cdnjs (app), beide met SRI; inline script op sha256 in de CSP; WebViews met navigatiefilter |
| befd054 | Facturen openstaand/verlopen | overgenomen | |
| 3023829 | iPad in de app | niet (deels) | HEAD-variant beter; alleen doc-comment van `bepaalSchermklasse`. Android-lock + `expo-screen-orientation` weg |
| 287187a | Agenda: type, project, tijden | overgenomen | |
| c3dbcca | Planning-bouwstenen, ploegkeuze | overgenomen | |
| e2383dc | Planning: blok aantikken | overgenomen | |
| a44c61f | Planning met alleen het recht planning | overgenomen | testen met een rol met alleen planning |
| 5a4b768 | Uren: week of maand | overgenomen | |
| d5a1659 | Kosten: bon toevoegen/bekijken/verwijderen | aangepast | eigen pad per post, oude bon opruimen bij vervangen, alleen niet-gedeelde eigen paden verwijderen |
| f8afced | Relaties: type, bron, betaaltermijn | overgenomen | png niet |
| 59641ef | metro.config | aangepast | `metro.config.js` toegelaten in `.vercelignore` |
| a6dd612 | Relaties: geen knop in een knop | overgenomen | png's niet |
| 693236e | Geen knop in een knop (agenda, pipeline, database) | overgenomen | |
| 2054339 | Nieuwe aanvragen week t.o.v. week | overgenomen | |
| 568d548 | Offertes en facturen: alle acties | overgenomen | |
| 0ecbfc1 | Projectkaart: alle tabs | overgenomen | png's niet |
| 357789c | Activiteiten: meerdere toegewezenen | overgenomen | |
| ba15ad4 | Horizontaal scrollen op web | overgenomen | |
| 57cb51e | Checklist | niet | alleen docs |
| 0852a7b | Klantkaart "+" vult klant in | overgenomen | |
| 4c82564 | Regelbedragen met centen | overgenomen | png's niet |
| 197124f | Wachtwoord vergeten in de app | overgenomen | |
| ac45570 | Werkbon als PDF | overgenomen | |
| 68b39f8 | Laten ondertekenen, Wkb, @-vermeldingen | aangepast | foto verwijderen weer rij-eerst; AfrondenModal/WaarschuwingModal met VelStatusbalk + `automaticallyAdjustKeyboardInsets` |
| b895e08 | Werkbondetail gelijk aan dashboard | aangepast | modals van HEAD aangehouden; bellen via `callPhone` |
| 69a4c64 | Afspraakbevestiging per mail | overgenomen | |
| 696b8e7 | @-vermeldingen: één implementatie | overgenomen | |
| 5c8d5a8 | Checklist | niet | alleen docs |
| 8354544 | Nieuwe werkbon: maker is uitvoerder | overgenomen | |
| 014efed | Nieuwe aanvraag: ontvangstbevestiging | overgenomen | |
| 02459dc | Pipeline ⋮-menu zijmarge | overgenomen | |
| 7c3c18c | Registratie zoals het dashboard | aangepast | code overgenomen, voorwaardenlinks via `openExtern`; alleen testen met een testaccount |
| e2554e5 | Agenda: werkbon uit afspraak | overgenomen | |
| 648949e | Checklist | niet | alleen docs |
| 236f0b3 | Financiën | overgenomen | png's niet |
| 67a50cd | Activiteiten: notitielog | overgenomen | |
| f3927ef | Instellingen: betaaltermijn, branche | overgenomen | |
| 5241c78 | Klantkaart: e-mails, tijdlijn | overgenomen | |
| d12219f | Checklist | niet | alleen docs |
| ee05310 | Projecten: KPI-tegels op tablet | overgenomen | alleen de code, geen screenshots |
| 1d721b3 | @-vermeldingen via MentionInvoer | overgenomen | |
| 828ae24 | Checklist afgerond | niet | alleen docs |

Niet overgenomen: `docs/screenshots/` (289 png's, ~44 MB, met gegevens van
het testbedrijf), `docs/app-verbeteren.md`, de Weergave-kaart in Mijn profiel,
`src/lib/schermstand*.ts` en `expo-screen-orientation`.

### Conflictbesluiten

| Bestand | Besluit |
|---|---|
| `app.config.ts` | HEAD + `LSApplicationQueriesSchemes: ['comgooglemaps']`; daarna bredere camera-/fototekst |
| `app/(more)/expenses.tsx`, `invoices.tsx`, `offers.tsx` | versie van de branch, geen rauwe `Linking.openURL` |
| `app/work-orders/[id].tsx` | branch als basis, modals van HEAD (VelStatusbalk, `automaticallyAdjustKeyboardInsets`, `keyboardShouldPersistTaps`), hoofdlijst ook; `callPhone` |
| `src/components/MobielKader.tsx` | HEAD |
| `src/components/project/ProjectDetailScherm.tsx` | branch (foto's in FotoViewer) |
| `src/lib/schermklasseRegels.ts` | code gelijk; comment van de branch |
| `src/providers/ThemeProvider.tsx` | HEAD + Appearance-listener (a965036) |
| `tests/ipad.test.mjs` | HEAD |
| Stil samengevoegd: `ProfielTab.tsx`, `AppTopBar.tsx`, `HeaderActions.tsx`, `ThemeToggleButton.tsx`, `themaKeuze*.ts` | terug naar HEAD (één knop in de kop) |
| Stil samengevoegd: `customers/[id].tsx`, `(tabs)/_layout.tsx`, `menu.tsx`, `linking.ts` | gecontroleerd, in orde |

### Open releasepunten (App Store)

- **5.1.1(v) account verwijderen:** registratie kan volledig in de app, maar
  de eigenaar kan zijn account/bedrijf niet in de app verwijderen (alleen via
  het dashboard of een mail). Nodig vóór indienen: een in-app-flow met
  bevestiging.
- **3.1.1 abonnementen:** prijzen, pakketkeuze (Groei/Team) en de link naar
  abonneren/beheren op het dashboard. Op iOS verbergen of vooraf laten
  toetsen.
- **5.1.1(ii) gebruiksbeschrijvingen:** camera/foto's bijgewerkt (9bd73dc);
  App Privacy-label aanvullen met PDOK (adresinvoer naar een derde partij).
- **Nieuwe native build verplicht:** `react-native-webview`, `expo-print`,
  `expo-sharing`, `expo-file-system`. Versie of `runtimeVersion` ophogen;
  geen EAS Update naar de huidige TestFlight-build (18c2f43).
- PDF in de app laadt pdf.js van cdnjs: zonder netwerk geen PDF-weergave.
