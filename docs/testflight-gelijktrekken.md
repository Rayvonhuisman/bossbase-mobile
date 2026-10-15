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
