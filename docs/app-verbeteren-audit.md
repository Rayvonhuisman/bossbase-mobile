# Audit `origin/app-verbeteren` t.o.v. PWA (`origin/main`) en `sync/testflight-met-pwa`

Datum: 15-10-2026 · Alleen-lezen audit · Repo: `/Users/macbook/bossbase-testflight`

| Ref | Commit | Rol |
|---|---|---|
| `origin/main` | 1ed1ac7 | PWA, bron van waarheid (bevat 71d5f2c en TestFlight-buildcommit 18c2f43) |
| `origin/app-verbeteren` | 828ae24 | 63 commits boven main (55 gewone + 8 merges), 496 bestanden, +23.446/−3.434 |
| `sync/testflight-met-pwa` | 124efec | 6 commits boven main (native iOS: 6d1bf0e, 3e4ce13, 41643ad, 9bc3664, 63f9856, 124efec), 30 bestanden |
| TestFlight-build | 18c2f43 | voorouder van main; bevat **geen** van de nieuwe native modules (webview, print, sharing, file-system, screen-orientation) |

Live metadata gecontroleerd via Supabase MCP (alleen `select` op `information_schema`, `pg_proc`, `pg_policies`, `storage.buckets` en het lezen van de Edge Functions `send-email` en `verify-code`), project `mawzqpnsluljxpbarhng`. Er is niets uitgevoerd, gebouwd of uitgecheckt. De samenvoegproef is gedaan met `git merge-tree` (alleen in het geheugen).

Legenda categorieën: **1** al equivalent aanwezig · **2** achterhaald · **3** alleen web · **4** relevant voor native iPhone · **5** relevant voor iPad · **6** App Store/Apple-compliance · **7** beveiliging/rechten · **8** afhankelijk van database/backend · **9** conflict met PWA of sync-branch · **10** onduidelijk/handmatig

---

## 0. Belangrijkste conclusies (kort)

1. **Functioneel is de branch grotendeels waardevol.** De meeste commits brengen de app op hetzelfde niveau als het dashboard: projectkaart, offertes/facturen, werkbon, planning, agenda, kosten, financiën en registratie. Ze raken de gedeelde code, dus **ook de PWA**. Overnemen moet dus via een PR naar `main` (PWA), en daarna moet de sync-branch daarop rebasen. Niet rechtstreeks in de TestFlight-lijn zetten.
2. **Alle backend-afhankelijkheden bestaan live.** Elke nieuwe tabel, kolom, RPC, Edge Function en bucket die de branch gebruikt is aanwezig (zie §4). De branch vraagt geen migratie.
3. **Er zijn drie blokkerende punten voor de PWA en voor native:**
   - De **PWA-CSP** (`vercel.json:28`, `script-src 'self'`, `connect-src` alleen Supabase, `frame-src 'none'`) blokkeert pdf.js van cdnjs, het inline module-script in de PDF-iframe en `api.pdok.nl`. Daardoor werken de PDF-weergave en het adres zoeken op de live PWA niet. De branch is alleen op localhost getest, zonder CSP.
   - **Nieuwe native modules** (`react-native-webview`, `expo-print`, `expo-sharing`, `expo-file-system`, `expo-screen-orientation`) vragen een nieuwe build. `runtimeVersion.policy: 'appVersion'` blijft 0.1.0. Een EAS Update van deze JS naar de huidige TestFlight-build (18c2f43, zonder die modules) laat de app crashen.
   - **Foto verwijderen** gaat terug naar "eerst het bestand, dan de rij" (68b39f8). Dat is een regressie t.o.v. de rij-eerst-fix van main en de sync-branch.
4. **Donkere modus:** de branch doet het tegenovergestelde van jouw laatste opdracht (zie §5a). Let op: `git merge` neemt de verplaatsing naar Instellingen grotendeels **zonder conflict** over (ProfielTab, AppTopBar, HeaderActions, verwijderen van ThemeToggleButton). Alleen `ThemeProvider.tsx` geeft een conflict.
5. **iPad:** de variant van de sync-branch is beter dan 3023829. Met de branch-variant krijgt een vel (`soort="formulier"`) op de iPad een extra grijze kolom, en de branch gebruikt het KeyboardAvoidingView-patroon dat de sync-branch juist heeft vervangen.
6. **Er staan 289 screenshots (43,8 MB)** in `docs/screenshots/`. Ze tonen productiedata van het testbedrijf. `.easignore` sluit `docs/` niet uit, dus ze gaan mee in elke EAS-upload.

---

## 1. Tabel per commit (chronologisch, `git log --reverse`)

Advies: **O** = overnemen · **A** = aanpassen en dan overnemen · **N** = niet overnemen

| # | Hash | Titel (verkort) | Cat. | Bevinding (bestand:regel op app-verbeteren) | Advies | Reden |
|---|---|---|---|---|---|---|
| 1 | 8a87a4d | Homepage: thema in Instellingen, Boss-hoofd, widgets | 4, 9 | `AppTopBar.tsx:123` haalt de ThemeToggleButton weg; `ThemeToggleButton.tsx` is verwijderd; `ProfielTab.tsx:182` krijgt de kaart "Weergave"; `ThemeProvider.tsx` vervangt `toggleColorMode/setColorMode` door `voorkeur/setVoorkeur` en voegt `Appearance.addChangeListener` toe (r. 69). Daarnaast persoonlijke widgets via `werkbon_dagen` en ploeg (`planningRegels.ts`), activiteiten van vandaag bovenaan (`activityService.ts`) en `assets/boss-hoofd.png` | A | De widgetfixes, het Boss-hoofd en de Appearance-listener overnemen. De themaverplaatsing **niet**: die botst met de keuze voor één zon/maan-knop in de kop (§5a) |
| 2 | 816abdb | Widget Nieuwe aanvragen + checklist | 4, 5 | `today.tsx` (+117), `overzichtCijfers.ts` | O | Gelijk aan het dashboard, puur client, geen nieuwe backend |
| 3 | e728f81 | Voertuig i.p.v. bus; route-helper | 4, 5, 6, 9 | `lib/routeLinks.ts` (nieuw), `linking.ts` `openMaps` → Apple Kaarten/`comgooglemaps://`; `app.config.ts` `infoPlist.LSApplicationQueriesSchemes: ['comgooglemaps']` | O | Goede native verbetering. Het blok `infoPlist` handmatig samenvoegen met de iPad-oriëntaties van de sync-branch (conflict in app.config.ts). Werkt pas na een nieuwe build |
| 4 | 67df350 | Projectkaart: statusstrook, aanvraag prominent | 4, 5, 9 | `ProjectDetailScherm.tsx` (+401/−130), `projectService.ts`; plus 2 png's | O | Conflict met sync (`openExtern` in ProjectDetailScherm). De versie van de branch nemen en `openExtern` erin terugzetten. Png's niet meenemen |
| 5 | 7670686 | Aanvraagtekst in groen vak | 4 | `ProjectDetailScherm.tsx` (+12) | O | Cosmetisch, goedgekeurd door de gebruiker |
| 6 | 7407306 | Filters onthouden (`useOnthouden`) | 3, 4 | `lib/useOnthouden.ts`, `onthoudenRegels.ts`; 10 lijstpagina's | O | Per gebruiker in AsyncStorage/localStorage, geen gevoelige data. Conflict met sync in expenses/invoices/offers (alleen de imports) |
| 7 | 90d7bd7 | Adres zoeken via PDOK | 3, 4, 7, 9 | `lib/adresZoeken.ts:9-10` (`https://api.pdok.nl/...`), `AdresZoeker.tsx` | A | **PWA-CSP blokkeert `api.pdok.nl`** (`vercel.json:28` connect-src). Eerst de CSP aanpassen. Adresfragmenten gaan naar een derde partij: dat in de privacyverklaring en het App Privacy-label opnemen |
| 8 | f2dfba7 | Werkbon-kopkaart; FotoViewer | 4, 5, 9 | `components/FotoViewer.tsx` (nieuw, 4 a11y-labels), `work-orders/[id].tsx` (+416) | O | Goede native viewer in plaats van een browsertab. Conflict met sync (VelStatusbalk/openExtern) in `work-orders/[id].tsx` |
| 9 | bcca56e | Checklist bijgewerkt | — | alleen `docs/app-verbeteren.md` | N | Alleen documentatie |
| 10 | 34a5455 | Uren: "Vul je werkdag in" | 4, 8 | `UrenHerinneringKaart.tsx`, `urenHerinneringService.ts` leest `bedrijfsinstellingen.uren_herinnering_*` (live: ja) | O | Gelijk aan het dashboard |
| 11 | 0d0a296 | Urenherinnering zonder Date.now() bij renderen | 4 | `UrenHerinneringKaart.tsx` | O | Fix bij #10 |
| 12 | 8ad8041 | PDF-module (jsPDF, overgenomen pdfOpbouw) | 4, 10 | `package.json` `jspdf: 4.2.1`; `src/lib/pdf/vendored/pdfOpbouw.js` (1210 regels, letterlijke kopie uit het dashboard); tests/scripts hangen af van de lokale dashboardrepo (`scripts/pdf-opbouw-bron.mjs`) | O | Pure JS. Er moet een afspraak komen over wie de vendored kopie bijwerkt (`npm run pdf:overnemen`). In CI slaat de test over als het dashboard ontbreekt |
| 13 | 4f3e997 | Kleur in de tegels | 4 | `AppKpiCard.tsx`, `DocumentOnderdelen.tsx` | O | Cosmetisch |
| 14 | 6670de3 | PDF-weergave (WebView/iframe + pdf.js) | 4, 5, 6, 7, 9, 10 | `PdfFrame.tsx:30-33` laadt een WebView met `originWhitelist={['*']}`, `baseUrl` cdnjs en zonder `onShouldStartLoadWithRequest`; `pdfWeergaveHtml.ts:19-20` laadt pdf.js 4.10.38 **van cdnjs, zonder SRI**; `pdfDelen.ts` gebruikt expo-sharing/print/file-system; `afdrukken*`/`documentHtml.ts` zijn verwijderd | A | (a) De PWA-CSP blokkeert cdnjs en het inline module-script (de srcdoc-iframe erft de CSP). (b) Vraagt een nieuwe native build. (c) pdf.js lokaal bundelen (of SRI toevoegen) en navigatie in de WebView tegenhouden. (d) Zonder netwerk geen PDF |
| 15 | befd054 | Facturen openstaand/verlopen zoals het dashboard | 4 | `documentLogica.ts` (`isVerlopen`, `openstaandPerFactuur`) | O | Bugfix voor de tellingen |
| 16 | 3023829 | iPad in de app | 1, 5, 6, 9 | `app.config.ts:24-29` `orientation:'default'`, `supportsTablet:true`, infoPlist-oriëntaties; `MobielKader.tsx:16-17` (geen uitzondering voor `formulier`); `schermstand.ts` + `expo-screen-orientation` (alleen Android); `app/_layout.tsx:30` | N (deels) | Equivalent aan sync 6d1bf0e/3e4ce13, maar de sync-variant is beter (§5b). Alleen de bijgewerkte doc-comment van `bepaalSchermklasse` overnemen. `expo-screen-orientation` niet toevoegen zolang Android-tablets niet aan de orde zijn |
| 17 | 287187a | Agenda: type, project, tijden, uurvenster | 4, 8 | `activityService.ts` schrijft `calendar_events.type/deal_id/start_at/end_at` en `klant_tijdlijn`; `bedrijfsinstellingen.agenda_start_uur/eind_uur` (live: ja) | O | Gelijk aan het dashboard |
| 18 | c3dbcca | Planning-bouwstenen, ploegkeuze, mail bij toewijzen | 4, 7, 8 | `PloegKeuze.tsx`, `werkbonLogica.ts` (`verzetTijd`), `workOrderService.ts` (create-notification, `planning_wijzigingen`) | O | Bestaande RPC's en functies |
| 19 | e2383dc | Planning: blok aantikken, inplannen | 4, 5, 7 | `components/planning/PlanningPanelen.tsx` (+432); `magSlepen` = recht planning + module, niet bij alleen-lezen of een ondertekende bon | O | Rechten gelijk aan het dashboard. De server dwingt dat ook af (RLS/trigger) |
| 20 | a44c61f | Planning aanpassen met alleen het recht planning | 4, 7 | `work-orders/[id].tsx`, `work-orders/bewerk/[id].tsx` | O | Verruimt client-gating. Live afgedekt door de RPC `bb_werkbon_dagen_zetten`/RLS, maar zie §3 (S-7: testen met een rol die alleen planning heeft) |
| 21 | 5a4b768 | Uren: week of maand | 4 | `hours.tsx`, `urenRegels.ts` | O | — |
| 22 | d5a1659 | Kosten: bon toevoegen/bekijken/verwijderen | 4, 6, 7, 8, 9 | `kiesFoto.ts` (camera/bibliotheek); `jobCostService.ts:276-298` `koppelBonnen` overschrijft `bijlage_url`; `:444-495` `deleteJobCost` verwijdert de bonbestanden ná de rij; bucket `kosten-bijlagen` (live: ja, privé) | A | (a) Bij bewerken met een nieuwe bon blijven de oude bestanden als wees achter. (b) `koppelBonnen` kan dezelfde paden aan meerdere posten koppelen: verwijderen van één post wist dan de bon van de andere (nu alleen met 1 id aangeroepen, maar de API laat het toe). (c) De bon is alleen client-side verplicht en de post bestaat al vóór de upload. (d) De gebruiksbeschrijving voor camera/foto's noemt alleen "werkbon" (§2 Privacy). Conflict met sync (`openExtern` in expenses.tsx) |
| 23 | f8afced | Relaties: type, bron, betaaltermijn | 4, 8 | `customerService.ts` gebruikt `customers.type/source/betaaltermijn_dagen` (live: ja) | O | 1 png niet meenemen |
| 24 | 59641ef | metro.config: optionele jsPDF-deps eruit | 4, 10 | `metro.config.js` (nieuw) | A | Overnemen. **`.vercelignore` is een toelatingslijst zonder `metro.config.js`**, dus de webbuild op Vercel negeert hem (bundel +1,6 MB, wel werkend). Toevoegen aan `.vercelignore` en controleren met `check:bundel` |
| 25 | a6dd612 | Relaties: geen knop in een knop | 3, 4 | `customers.tsx`; 7 png's | O | Toegankelijkheid en geldige HTML op web. Png's niet meenemen |
| 26 | 693236e | Geen knop in een knop: agenda, pipeline, database | 4 | `AppListItem.tsx` (losse vink/actie), `DealKaart.tsx` | O | Toegankelijkheid (VoiceOver) |
| 27 | 2054339 | Nieuwe aanvragen week t.o.v. week | 4 | `today.tsx` | O | — |
| 28 | 568d548 | Offertes en facturen: alle acties | 4, 6, 7, 8, 9 | `documentMailService.ts` (send-email, `sent_emails`, `stripe-create-payment-link`), `factuurService.ts` (factuur-pdfs `{bedrijf}/{factuur_id}.pdf` r. 1001-1002, moneybird/snelstart-sync, `get_accounting_status`), `offerteService.ts` (getekende-pdf-nazenden) | O | Alles bestaat live. De paden passen bij de nieuwe policy (`bb_factuur_pdf_pad_ok` + recht facturen). De Stripe-betaallink is voor facturen van fysieke diensten aan eindklanten (geen IAP-plicht, 3.1.3(e)/3.1.5). Grootste conflict met sync (imports en Linking in invoices/offers) |
| 29 | 0ecbfc1 | Projectkaart: alle tabs | 4, 5, 7, 8, 9 | `project/*Tab.tsx`, `projectKostenService.ts` (`project_kosten`), `projectService.ts:517-586` (project-fotos `{bedrijf}/{project}/…`, rij-eerst verwijderen), `collegaMeldingen` | O | Live: ja. Foto's verwijderen goed (rij eerst). 19 png's niet meenemen |
| 30 | 357789c | Activiteiten: meerdere toegewezenen, eindtijd | 4, 8 | `activityService.ts` `assigned_to_ids`, `end_time` (live: ja) | O | Herstelt dataverlies (bewerken overschreef de toegewezenen) |
| 31 | ba15ad4 | Horizontaal scrollen op web | 3 | `zichtbareViewport.web.ts` per as, `AppFilterChips.tsx` | O | PWA-bugfix. Botst niet met sync (die wijzigt de native `zichtbareViewport.ts`) |
| 32 | 57cb51e | Checklist | — | docs | N | Alleen documentatie |
| 33 | 0852a7b | Klantkaart "+" vult de klant in | 4 | `customers/[id].tsx`, `projects.tsx` | O | — |
| 34 | 4c82564 | Regelbedragen met centen; screenshots | 4 | `RegelEditor.tsx`, `invoices.tsx`; 7+ png's | O | Code overnemen, png's niet |
| 35 | 197124f | Wachtwoord vergeten in de app | 4, 7, 8 | `wachtwoordService.ts` → `request-password-reset` (live: ja); `linking.ts` verwijdert `openWachtwoordHerstel` | O | De server geeft altijd success, dus geen user-enumeratie. Reset gaat via de website |
| 36 | ac45570 | Werkbon als PDF | 4, 8 | `pdf/werkbonPdf.ts:122-125` (signed URLs `werkbon-fotos`, 1 u) | O | — |
| 37 | 68b39f8 | Werkbon laten ondertekenen, Wkb, @-vermeldingen | 4, 5, 7, 8, 9 | `werkbonVersturen.ts:60-93` (send-email, `sent_emails`), `werkbonOndertekenenService.ts` (sign-werkbon), `HandtekeningVak.tsx` (WebView-canvas), `AfrondenModal.tsx:126-127` en `WaarschuwingModal.tsx:92` (formSheet + KeyboardAvoidingView), **`workOrderService.ts:438-456` foto verwijderen: eerst het bestand, dan de rij** | A | Foto verwijderen terugzetten naar rij-eerst (sync/main). Beide modals omzetten naar het sync-patroon (`VelStatusbalk`, `automaticallyAdjustKeyboardInsets`/`ToetsenbordVlak`). HandtekeningVak: 0 a11y-labels |
| 38 | b895e08 | Werkbondetail gelijk aan het dashboard | 4, 5, 7, 8, 9 | `work-orders/[id].tsx` (+740): `opSlot`/`canEdit` (r. 273/280), FotoViewer verwijderen alleen bij `canEdit` (r. 1135); `openUrl` met rauwe `Linking.openURL` (r. 595); `Regels.tsx`, `KostenInhoud.tsx`; 26 png's | A | Groot conflict met sync (KeyboardAvoidingView→View+VelStatusbalk in 5 modals). De sync-modals aanhouden en de nieuwe functies erin overnemen. Png's niet |
| 39 | 69a4c64 | Afspraakbevestiging per mail | 4, 7, 8 | `autoMailService.ts:17-80` (email_templates, send-email, sent_emails, `meld_mail_fout`); variabelen ge-escaped (`autoMail.ts:46-53`) | O | Server-side afgedekt: send-email staat alleen ontvangers van het eigen bedrijf toe, rate limit 60/u, read-only-check, e-mail geverifieerd |
| 40 | 696b8e7 | @-vermeldingen: één implementatie | 4 | `lib/mentions.ts`; `collegaMeldingen.ts` −99 | O | Opschoning |
| 41 | 5c8d5a8 | Checklist | — | docs | N | Alleen documentatie |
| 42 | 8354544 | Nieuwe werkbon: maker standaard uitvoerder | 4 | `WerkbonFormulier.tsx` | O | — |
| 43 | 014efed | Nieuwe aanvraag: e-mail/telefoon, ontvangstbevestiging | 4, 7, 8 | `NieuweAanvraagSheet.tsx`, `autoMailService.ts` `stuurAanvraagOntvangen` | O | Zelfde servergrenzen als #39 |
| 44 | 02459dc | Pipeline ⋮-menu zijmarge | 4 | `pipeline.tsx:1` | O | — |
| 45 | 7c3c18c | Registratie zoals het dashboard (6-cijferige code) | 4, 6, 7, 8, 10 | `(onboarding)/pakket.tsx` (Groei/Team, "30 dagen gratis … tenzij je een abonnement afsluit" r. 75-77), `verify.tsx`, `AuthProvider.tsx` (status `needs-verification`, `signUp` met metadata), `registratieService.ts` (akkoord-vastleggen, request-verification-code, verify-code: live ja); 15 png's | A | Server is robuust (verify-code: HMAC, 5 pogingen, pakket alleen `team`/default, akkoord-vangnet). **Ongetest native en tegen productie.** Registratie in de app maakt account verwijderen in de app verplicht (5.1.1(v)); de eigenaar moet nu naar het dashboard (§2). Alleen testen met een testaccount |
| 46 | e2554e5 | Agenda: werkbon uit afspraak, notitielog | 4, 8 | `AfspraakExtra.tsx`, `calendar_events.comments/werkbon_id` (live: ja) | O | — |
| 47 | 648949e | Checklist | — | docs | N | Alleen documentatie |
| 48 | 236f0b3 | Financiën: nieuwe pagina | 4, 5, 7, 8 | `financien.tsx`, `financienService.ts` → RPC `bb_financien_kpi` (live: ja, SECURITY INVOKER, leunt op RLS); `permissions.ts` `/financien: bedrijfsfinancien` (alleen client) | O | Zelfde model als het dashboard. 9 png's niet meenemen |
| 49 | 67a50cd | Activiteiten: notitielog (`activiteit_notities`) | 4, 8 | `NotitieLog.tsx`, `activityService.ts` | O | Tabel en policies live: ja (eigen bedrijf; wijzigen/verwijderen door de maker of planning) |
| 50 | f3927ef | Instellingen: betaaltermijn en branche | 4, 7, 8 | `settingsService.ts` → `bedrijfsinstellingen.betaaltermijn_dagen`, `companies.branche` (live: ja) | O | RLS bepaalt wie mag schrijven |
| 51 | 5241c78 | Klantkaart: e-mails, tijdlijn, @ | 4, 7, 8, 9 | `customers/[id].tsx` (+363), `documentMailService.ts`, `klantTijdlijnService.ts`; 7 png's | O | Merget automatisch met de toetsenbordprops van sync (`automaticallyAdjustKeyboardInsets`). Na de merge op een toestel controleren |
| 52 | d12219f | Checklist | — | docs | N | Alleen documentatie |
| 53 | ee05310 | Projecten: KPI-tegels op tablet; screenshots 9 formaten | 3, 5 | `projects.tsx` (kleine fix); 140 bestanden waarvan ~32+ png's | O (alleen code) | Fix wel, png's niet |
| 54 | 1d721b3 | @-vermeldingen via MentionInvoer | 4 | `customers/[id].tsx`, `NotitiesTab.tsx` | O | — |
| 55 | 828ae24 | Checklist: afgerond | — | docs | N | Alleen documentatie |

### Merges (apart)

| Hash | Samengevoegd | Eigen resolutie | Advies |
|---|---|---|---|
| 1531dd3 | wt/adreszoeker | geen (alleen `planning.tsx` automatisch) | Volgt #7 |
| 20f15b3 | wt/pdf | geen | Volgt #12 |
| 83ab5e0 | wt/projectkaart | 21 regels in `customerService.ts`, `domain.ts` | Volgt #29 |
| 78e1385 | wt/documenten | **693 regels** conflictresolutie in `invoices.tsx`/`offers.tsx` | Volgt #28. Bij overnemen deze bestanden als geheel van de branch nemen, niet per commit |
| cf16d6a | wt/werkbon | 117 regels (`workOrderService.ts`, `collegaMeldingService.ts`, docs) | Volgt #37/#38 |
| 6a69bc3 | wt/registratie | geen | Volgt #45 |
| 473205b | wt/financien | geen (`DocumentOnderdelen.tsx` automatisch) | Volgt #48 |
| b028fd0 | wt/klantkaart | geen | Volgt #51 |

### Telling (55 gewone commits)

| Oordeel | Aantal | Commits |
|---|---|---|
| Volledig relevant (overnemen) | **40** | 816abdb, e728f81, 67df350, 7670686, 7407306, f2dfba7, 34a5455, 0d0a296, 8ad8041, 4f3e997, befd054, 287187a, c3dbcca, e2383dc, a44c61f, 5a4b768, f8afced, a6dd612, 693236e, 2054339, 568d548, 0ecbfc1, 357789c, ba15ad4, 0852a7b, 4c82564, 197124f, ac45570, 69a4c64, 696b8e7, 8354544, 014efed, 02459dc, e2554e5, 236f0b3, 67a50cd, f3927ef, 5241c78, ee05310 (alleen code), 1d721b3 |
| Gedeeltelijk (aanpassen) | **8** | 8a87a4d, 90d7bd7, 6670de3, d5a1659, 59641ef, 68b39f8, b895e08, 7c3c18c |
| Niet (equivalent of alleen docs) | **7** | 3023829 (sync-variant beter), bcca56e, 57cb51e, 5c8d5a8, 648949e, d12219f, 828ae24 |

Totaal: 40 volledig + 8 gedeeltelijk + 7 niet = 55. Daarnaast 8 merges zonder eigen beslissing (ze volgen hun onderliggende commits). Van de 7 "niet" zijn er 6 alleen documentatie en 1 equivalent (iPad).

---

## 2. Per onderwerp

| Onderwerp | Wat app-verbeteren doet | Stand main/sync | Oordeel |
|---|---|---|---|
| **Sign in with Apple** | Niets. Geen OAuth, geen `expo-apple-authentication` | Ook niet | Niet vereist (4.8): alleen e-mail/wachtwoord, geen login via derden |
| **Account verwijderen** | Ongewijzigd. `ProfielTab`: een teamlid deactiveert via RPC `delete_own_account` (live: ja). De eigenaar ziet "Bedrijf sluiten op het dashboard" (externe link) en "Verwijdering aanvragen" (mailto) | Zelfde in main en sync | **Risico 5.1.1(v), hoog.** Registratie gebeurt volledig in de app (en wordt met #45 nog completer). Apple eist dat verwijderen *in de app* te starten is en echt verwijdert, niet deactiveert. Advies: een in-app-flow voor de eigenaar (bijvoorbeeld de Edge Function `billing-cancel` + `cancel_company_account`) met een bevestigingsstap. Bestaand probleem, niet veroorzaakt door de branch |
| **Stripe / in-app payments** | `stripe-create-payment-link` voor de **facturen van de klant aan zijn eindklant** (#28). Geen verkoop van digitale goederen | — | Toegestaan: betaling voor fysieke diensten buiten de app (3.1.3(e)/3.1.5) |
| **Abonnementen / Restore Purchases** | Ongewijzigd: `AbonnementTab` toont prijzen en "Abonnement beheren op het dashboard". Nieuw in de registratie: pakketkeuze Groei/Team + "tenzij je een abonnement afsluit" (`pakket.tsx:75-77`) | Bestaat al in main | **Risico 3.1.1/3.1.3, middel.** Abonnement buiten IAP met een link ernaar. Restore Purchases is niet van toepassing zonder IAP. Advies voor de iOS-build: de link naar abonneren of beheren en de prijzen verbergen (multiplatform/zakelijk) of eerst laten toetsen. Geen nieuw probleem van de branch, maar de pakketkeuze maakt het zichtbaarder |
| **Rapporteren/blokkeren** | n.v.t. Er is geen gebruikerscontent tussen vreemden (1.2 geldt niet: B2B, alleen het eigen bedrijf) | — | Geen actie |
| **Privacyteksten (Info.plist)** | Ongewijzigd: `photosPermission`/`cameraPermission` noemen alleen "werkbon". De branch gebruikt camera en foto's nu ook voor de **kostenbon** (#22) en **projectfoto's** (#29). Nieuw: `LSApplicationQueriesSchemes` | — | **Aanpassen (5.1.1(ii)):** de teksten moeten elk gebruik dekken, bijvoorbeeld "…om foto's bij werkbonnen, projecten en kostenbonnen vast te leggen". Microfoon: zelfde als main (plugin-standaard) |
| **Privacy manifest** | Geen eigen `PrivacyInfo.xcprivacy`/`privacyManifests` | Ook niet | De nieuwe Expo-modules leveren er zelf een (file-system gebruikt de API voor bestandstijden). Na de build het samengevoegde manifest controleren. Het App Privacy-label aanvullen met PDOK (adresinvoer naar een derde partij) |
| **Camera/foto** | `kiesFoto.ts` (toestemming vragen en netjes melden bij weigeren), FotoViewer | — | Goed. Alleen de teksten (zie boven) |
| **Pushmeldingen** | Geen. Meldingen blijven in de app (`create-notification`) | Geen | Geen actie |
| **Universal links** | `associatedDomains: ['applinks:app.bossbase.nl']` ongewijzigd | Zelfde | Geen wijziging |
| **Deep links** | Nieuwe interne routeparameters (bijv. klant vooraf ingevuld via de klantkaart). Route-knop naar `maps.apple.com` / `comgooglemaps://` | sync: `openExtern` met een melding bij weigeren | Samenvoegen: de route-helper van de branch en `openExtern` van sync. De branch voegt 9 nieuwe rauwe `Linking.openURL`-aanroepen toe of laat ze staan (menu.tsx:135-137, support.tsx:32-39, ProfielTab.tsx:218, onboarding/account.tsx:23, work-orders/[id].tsx:595). Na de merge naar `openExtern` omzetten |
| **Splash/iconen** | Ongewijzigd (alleen `assets/boss-hoofd.png`) | sync: ThemeProvider houdt de splash vast tot het thema bekend is (41643ad) | De sync-variant aanhouden |
| **Native navigatie** | Nieuwe schermen: Financiën, onboarding `pakket`/`verify`, en de status `needs-verification` in de layouts | — | Overnemen. Op de iPad testen in een vel |
| **Toetsenbord** | Nieuwe formSheet-modals (`AfrondenModal`, `WaarschuwingModal`) en de bestaande werkbonmodals houden `KeyboardAvoidingView` | sync (9bc3664) heeft dit juist vervangen door `VelStatusbalk` + `automaticallyAdjustKeyboardInsets`/`ToetsenbordVlak` | **De sync-variant aanhouden**, nieuwe modals daarop aanpassen. Modals die `FormSheet` gebruiken (DocumentMailSheet, KostenTab, OffertesTab, klantkaart) krijgen de sync-fix vanzelf |
| **iPad** | Zie §5b | sync 6d1bf0e/3e4ce13 | De sync-variant aanhouden |
| **Rotatie** | `orientation:'default'` + `expo-screen-orientation` lock alleen op Android-telefoons (`schermstand.ts`, `app/_layout.tsx:30`). iOS via de infoPlist-sleutels | sync: `orientation:'portrait'` + infoPlist-sleutels (Expo's `withOrientation` respecteert een expliciete `infoPlist.UISupportedInterfaceOrientations`, dus op iOS werken beide hetzelfde) | Voor iOS gelijkwaardig. De branch voegt een extra native module toe voor alleen Android. **Niet overnemen** zolang er geen Android-tabletdoel is |
| **Split View/Stage Manager** | infoPlist `~ipad` alle 4 standen, `supportsTablet:true` | Zelfde | Gelijk. `UIRequiresFullScreen` blijft false (Expo-standaard) |
| **Toegankelijkheid** | Geen knop in een knop meer (a6dd612, 693236e). FotoViewer en PdfWeergave hebben labels. HandtekeningVak 0 labels | — | Overnemen. Label/hint toevoegen aan het handtekeningvak |
| **Offline** | PDF-weergave hangt af van cdnjs (online). Mails en meldingen gaan client-side en zijn weg als de app halverwege stopt | sync 63f9856: stil verversen na terugkeer | pdf.js lokaal bundelen. Mails in de toekomst server-side triggeren |
| **Foutafhandeling** | Consequent `schrijf()`/`writeFout`, Nederlandse meldingen, `meld_mail_fout` bij mislukte mail. Mislukt opruimen van opslag blijft stil | — | Goed |
| **Native buildconfig** | Nieuw: `expo-file-system ~57.0.7`, `expo-print ~57.0.2`, `expo-sharing ~57.0.23`, `expo-screen-orientation ~57.0.3`, `react-native-webview 13.16.1`, `jspdf 4.2.1` (`package.json:28-53`), `metro.config.js` | sync voegt geen deps toe | **Nieuwe build verplicht.** `runtimeVersion: appVersion` (0.1.0) verhogen of de versie ophogen vóór een EAS Update, anders crasht 18c2f43. `metro.config.js` toevoegen aan `.vercelignore` |
| **App Store-review** | Registratie in de app → 5.1.1(v). Prijzen + link naar het dashboard → 3.1.1. Gebruiksbeschrijvingen → 5.1.1(ii). Demo-account voor review nodig (registratie maakt een echt bedrijf aan) | — | Zie de punten hierboven |

---

## 3. Beveiligingsbevindingen

| # | Ernst | Bevinding | Plaats | Voorstel |
|---|---|---|---|---|
| S-1 | **Hoog (regressie)** | Werkbonfoto: eerst het bestand, dan de rij. Als het verwijderen van de rij wordt geweigerd (RLS of trigger `bb_werkbon_kind_op_slot`) terwijl het bestand al weg is, blijft een rij achter die naar niets wijst. De live storage-policy `werkbon_fotos_delete` eist nu `w.ondertekend_op IS NULL`, wat het geval "ondertekend" afdekt. Maar elk ander verschil tussen RLS op de rij en de storage-policy (bijv. gedeelde werkruimte uit, verantwoordelijke gewijzigd) leidt nog tot dataverlies | `workOrderService.ts:438-456` (app-verbeteren) t.o.v. `sync…:workOrderService.ts:418-441` | De rij-eerst-versie van main/sync aanhouden. Projectfoto's doen het al rij-eerst (`projectService.ts:569-586`) |
| S-2 | Middel | PDF-WebView: `originWhitelist={['*']}`, `baseUrl` cdnjs, geen navigatiefilter, pdf.js van een CDN zonder SRI. Een gecompromitteerde CDN-versie kan JS uitvoeren met toegang tot de PDF-inhoud (financiële documenten) en de `postMessage`-brug | `PdfFrame.tsx:30-33`, `pdfWeergaveHtml.ts:19-20` | pdf.js als asset bundelen of SRI-hash toevoegen. `onShouldStartLoadWithRequest` alleen voor `about:`/data. `MailVoorbeeld.tsx` heeft wel `javaScriptEnabled={false}` (goed), maar ook geen navigatiefilter |
| S-3 | Middel (PWA) | De PWA-CSP blokkeert de nieuwe functies. Wie de CSP versoepelt om ze te laten werken (`script-src https://cdnjs…`, `'unsafe-inline'`), verzwakt de PWA | `vercel.json:28` (main) | Eerst pdf.js zelf hosten (`'self'`). Alleen `connect-src https://api.pdok.nl` toevoegen. Geen `unsafe-inline` voor scripts: het inline module-script als los bestand of met een hash |
| S-4 | Middel | Kostenbonnen: gedeelde `bijlage_url` over meerdere posten mogelijk, zodat verwijderen van één post de bon van een andere wist. Bij bewerken blijven oude bestanden als wees achter. "Bon verplicht" wordt alleen client-side afgedwongen | `jobCostService.ts:276-298, 488-494`; `expenses.tsx:355-358` | Pad per post. Bij vervangen de oude bestanden opruimen. Server-side check (trigger) als de bon echt verplicht is |
| S-5 | Laag (backend, informatief) | Live policy `kosten_bijlagen_insert/update/delete` checkt alleen de bedrijfsmap, geen recht `kosten` en geen padvorm. Bucket heeft geen mime-whitelist. Elk teamlid kan dus bonnen van het bedrijf verwijderen of overschrijven via de API | `pg_policies` storage.objects | Gelijktrekken met `werkbon-fotos`: `bb_opslag_pad_veilig`, `cardinality = 2`, recht kosten/werkbonnen_bewerken, mime image/*/pdf |
| S-6 | Laag | Mails worden client-side opgebouwd (HTML) en gearchiveerd (`sent_emails`-insert vanaf de client). Variabelen worden ge-escaped (`mailTemplate.ts:29`, `documentMail.ts:21`, `autoMail.ts:46`). send-email (live gelezen) weigert vreemde ontvangers, bepaalt afzender en reply-to zelf, heeft een rate limit van 60/u, max 5 ontvangers en 3 PDF-bijlagen, en een read-only- en verificatiecheck | `documentMailService.ts`, `werkbonVersturen.ts`, `autoMailService.ts` | Acceptabel. Het archief is door de client te vervalsen (zoals in het dashboard). Op termijn server-side loggen |
| S-7 | Laag | Rechtenverruiming "planning aanpassen met alleen het recht planning" en de pagina Financiën (`bedrijfsfinancien`) zijn alleen client-gating. `bb_financien_kpi` is SECURITY INVOKER en leunt op RLS van facturen/offertes/job_costs | `a44c61f`, `permissions.ts` | Testen met een rol die alleen planning heeft en met een monteur (testaccount) |
| S-8 | Info | Registratie: user_metadata (pakket, branche, telefoon) is door de gebruiker te kiezen. verify-code accepteert alleen `team` als afwijking en kapt branche en telefoon af. Wachtwoord-reset geeft altijd success | live `verify-code`, `request-password-reset` | In orde |
| S-9 | Info | Geen service-role-sleutels, secrets of hardcoded e-mailadressen/ID's in `app/` of `src/`. Scripts lezen `BB_TEST_EMAIL/WACHTWOORD` uit env en weigeren alles buiten `TEST_BEDRIJF = '7e57c0de-…'` (`scripts/vergelijk-pdf.mjs:33,126,201`). Test-e-mails zijn voorbeeldwaarden. Geen mocks in productiecode | — | In orde |
| S-10 | Middel (privacy) | **289 screenshots, 43.758.693 bytes (≈43,8 MB)** in `docs/screenshots/` (formaten 144, projectkaart 34, werkbon 34, registratie 28, documenten 25, klantkaart 12, financiën 9, projectkaart-voorstel 3; grootste 616 kB). Ze tonen productiedata van het testbedrijf "TEST Stamvol Bouw BV" (namen van medewerkers en klanten, bedragen). `.easignore` sluit alleen `design-reference/` uit, dus de screenshots gaan mee in elke EAS-upload. `.vercelignore` sluit `docs/` wel uit | `docs/screenshots/**` | Niet naar `main` mergen. Apart bewaren (artefact, LFS of buiten de repo). `docs/` toevoegen aan `.easignore`. Nagaan of de repo openbaar is |
| S-11 | Info | De branch-doc meldt tests tegen **productie** met het testbedrijf (tijdelijk naar Team gezet en terug, testmails naar een eigen alias, WB-221/WB-166 en een aanvraag blijven staan). Dat past niet bij de werkwijze "alleen test audit, gebruiker logt zelf in" | `docs/app-verbeteren.md` | Opmerken bij de gebruiker. De achtergebleven testdata in het testbedrijf controleren |

---

## 4. Backend-afhankelijkheden (live gecontroleerd)

| Soort | Naam | Gebruikt door | Bestaat live |
|---|---|---|---|
| Edge Function | send-email | #28, #37, #39, #43, #51 | ja (v50) |
| Edge Function | sign-werkbon | #37 | ja |
| Edge Function | document-url | #36/#38 | ja |
| Edge Function | getekende-pdf-nazenden | #28, #38 | ja |
| Edge Function | create-notification | #18, #29, #30 | ja |
| Edge Function | stripe-create-payment-link | #28 | ja |
| Edge Function | moneybird-sync-factuur, snelstart-sync-factuur | #28 | ja |
| Edge Function | request-password-reset | #35 | ja |
| Edge Function | akkoord-vastleggen, request-verification-code, verify-code | #45 | ja |
| RPC | bb_financien_kpi(date,date) | #48 | ja (invoker) |
| RPC | meld_mail_fout(…6 args) | #28, #39 | ja (definer) |
| RPC | get_accounting_status() | #28 | ja |
| RPC | delete_own_account() | (bestaand) | ja |
| Tabel | activiteit_notities | #49 | ja (+ policies) |
| Tabel | klant_tijdlijn, sent_emails, email_templates, project_kosten, project_fotos, werkbon_materiaal_inkoop, stripe_connections, planning_wijzigingen, bedrijfsinstellingen, job_costs | diverse | ja |
| Kolom | calendar_events.type/deal_id/start_at/end_at/comments/werkbon_id/activiteit_id/assigned_to | #17, #46 | ja |
| Kolom | activities.assigned_to_ids, end_time | #30 | ja |
| Kolom | customers.type, source, betaaltermijn_dagen | #23 | ja |
| Kolom | bedrijfsinstellingen.agenda_start_uur/eind_uur, betaaltermijn_dagen, uren_herinnering_* | #10, #17, #50 | ja |
| Kolom | companies.branche, branding_color; job_costs.bijlage_url; werkbonnen.ondertekend_op/gestart_op/verantwoordelijke_ids | diverse | ja |
| Bucket/pad | werkbon-fotos `{bedrijf}/{werkbon}/{bestand}` (privé; insert/update/delete alleen bij `ondertekend_op IS NULL`) | #8, #36, #37 | ja, het pad klopt |
| Bucket/pad | factuur-pdfs `{bedrijf}/{factuur_id}.pdf` (`bb_factuur_pdf_pad_ok` + recht facturen + `bb_mag_schrijven`) | #28 (`factuurService.ts:1001-1002, 228`) | ja, het pad klopt |
| Bucket/pad | kosten-bijlagen `{bedrijf}/{bestand}` (privé) | #22 | ja, het pad klopt (zie S-5) |
| Bucket/pad | project-fotos `{bedrijf}/{project}/{bestand}` | #29 | ja, het pad klopt |
| Bucket | bedrijf-logos (publiek; schrijven alleen admin) | De branch uploadt **geen** logo's, leest alleen `logo_url` voor mails en PDF's | ja, geen conflict |

Conclusie: **geen ontbrekende backend.** Geen migratie nodig.

---

## 5. Conflictvoorstellen

### 5a. Donkere modus

- **main/PWA + jouw laatste opdracht:** één zon/maan-knop in de kop (`AppTopBar` → `HeaderActions` of `ThemeToggleButton`), geen tweede bediening.
- **app-verbeteren (8a87a4d):** knop weg uit de kop, nieuwe keuze Licht/Donker/Zoals het apparaat in Instellingen › Mijn profiel › Weergave (`ProfielTab.tsx:182`). `ThemeToggleButton.tsx` is verwijderd en de context-API is vervangen door `voorkeur/setVoorkeur`.
- **Merge-gevaar:** `git merge-tree` geeft alleen een conflict in `ThemeProvider.tsx`. ProfielTab (Weergave-kaart), AppTopBar, HeaderActions, `components/index.ts` en het verwijderen van ThemeToggleButton gaan **zonder conflict** mee. Wie het conflict naar sync oplost, houdt een ProfielTab over die `voorkeur/setVoorkeur` gebruikt maar niet krijgt (TS-fout), en een header zonder knop.
- **Voorstel:** `ThemeProvider.tsx` van sync aanhouden (splash vasthouden, `toggleColorMode`). Daarin alleen de `Appearance.addChangeListener` van de branch overnemen (r. 69), en die laten werken zolang er geen opgeslagen keuze is. Dat lost op dat "systeemthema volgen" niet bijwerkt terwijl de app open staat. AppTopBar, HeaderActions en ThemeToggleButton van main houden. De Weergave-kaart uit ProfielTab weglaten. `themaKeuze*.ts` en `tests/themaEnWeekWidget.test.mjs` niet overnemen (of alleen het widgetdeel). `userInterfaceStyle:'automatic'` staat al in sync.

### 5b. iPad-config en schermklasse: 3023829 t.o.v. 6d1bf0e/3e4ce13

| Bestand | app-verbeteren (3023829) | sync (6d1bf0e/3e4ce13) | Beter |
|---|---|---|---|
| `app.config.ts` | `orientation:'default'` + infoPlist (iPhone portrait, iPad 4 standen) + `LSApplicationQueriesSchemes` | `orientation:'portrait'` + dezelfde infoPlist + uitleg | **sync** voor de oriëntatie (iOS gelijk, Android blijft portrait zonder extra module). **`LSApplicationQueriesSchemes` uit de branch toevoegen** aan het infoPlist-blok van sync |
| `src/components/MobielKader.tsx` | Kolom ook voor `soort="formulier"`. In een iPad-formSheet geeft `useWindowDimensions` de vensterbreedte (bijv. 1024) en niet die van het vel, dus de inhoud krijgt een 600-kolom met een grijze rand **binnen** het vel | `if (soort === 'formulier' \|\| width <= max) return children` | **sync** |
| `src/lib/schermklasseRegels.ts` | Platformcheck eruit + bijgewerkte doc-comment | Platformcheck eruit, maar de doc-comment zegt nog "Alleen in de webapp" (verouderd) | **Code van sync, comment van app-verbeteren** |
| `src/lib/schermklasse.ts` | niet gewijzigd | comment bijgewerkt | sync |
| `src/lib/schermstand.ts(.web)` + `expo-screen-orientation` + `app/_layout.tsx` | Android-telefoon portrait-lock | — | **niet overnemen** (extra native module voor Android) |
| `src/providers/ThemeProvider.tsx` | Appearance-listener, Weergave-API | splash vasthouden tot het thema bekend is | **sync + listener** (zie 5a) |
| `tests/ipad.test.mjs` | test op `orientation:'default'` en infoPlist | test incl. Split View 507 → telefoon | **sync**, aangevuld met de assert op infoPlist-oriëntaties uit de branch (zonder `orientation:'default'`) |
| Overige sync-onderdelen (`toestelRegels.ts`, `ToetsenbordVlak.tsx`, `VelStatusbalk.tsx`, FormSheet/SelectField/AppScreen/useLaden) | ontbreken | aanwezig | sync |

### 5c. De 15 overlappende bestanden (`comm -12`)

Uitkomst van `git merge-tree sync/testflight-met-pwa origin/app-verbeteren`: **10 conflicten**, 5 automatisch samengevoegd (waarvan 2 inhoudelijk riskant).

| Bestand | sync doet | app-verbeteren doet | Merge | Voorstel |
|---|---|---|---|---|
| `app.config.ts` | `orientation:'portrait'`, `userInterfaceStyle:'automatic'`, `supportsTablet:true`, infoPlist iPad-oriëntaties | Hetzelfde met `orientation:'default'` + `LSApplicationQueriesSchemes` | **conflict** | sync aanhouden + `LSApplicationQueriesSchemes: ['comgooglemaps']` toevoegen. Tegelijk de gebruiksbeschrijvingen van image-picker verbreden (§2) |
| `app/(more)/expenses.tsx` | `Linking.openURL(bijlageUrl)` → `openExtern` | Bon-viewer in de app, bonnen toevoegen, `useOnthouden`, centen | **conflict** | Branch-versie nemen. Overgebleven externe opens via `openExtern`. S-4 oplossen |
| `app/(more)/invoices.tsx` | `openPdf` via `openExtern` | Volledig herschreven (PdfWeergave, mail, credit, herinneringen), merge-resolutie van 693 regels | **conflict** | Branch-versie nemen. Het oude `Linking`-pad is weg. Afhankelijk van de CSP-fix (S-3) en de nieuwe build |
| `app/(more)/offers.tsx` | `openGetekend` via `openExtern` | Volledig herschreven | **conflict** | Zelfde als invoices |
| `app/(tabs)/_layout.tsx` | Alleen comment over toetsenbord en tabbalk | Status `needs-verification` → codescherm | automatisch | OK. Op een toestel testen dat de tabbalk bij een open toetsenbord in het codescherm verdwijnt |
| `app/(tabs)/menu.tsx` | 3× `openExtern` | Menu-item Financiën | automatisch | OK. Resultaat bevat beide |
| `app/customers/[id].tsx` | ScrollView `automaticallyAdjustKeyboardInsets` + `keyboardShouldPersistTaps` | E-mails, tijdlijn, MentionInvoer, "+"-knoppen, type/bron | automatisch | OK, maar controleren of de ScrollView-props van sync nog op de juiste ScrollView staan na +363 regels |
| `app/work-orders/[id].tsx` | 5 modals: KeyboardAvoidingView → View + `VelStatusbalk` + `automaticallyAdjustKeyboardInsets` | +740/+416: kopkaart, FotoViewer, afronden, PDF, kosten, inline regels | **conflict** | Branch als basis, dan de modalpatronen van sync er handmatig in zetten (r. ~1712, 1919, 2083 op de branch). `openUrl` (r. 595) → `openExtern` |
| `src/components/instellingen/ProfielTab.tsx` | mailto via `openExtern` | Weergave-kaart (thema) | **automatisch (riskant)** | De Weergave-kaart weghalen (5a). `openExtern` houden |
| `src/components/MobielKader.tsx` | Kolom, geen kolom voor `formulier` | Kolom, ook voor `formulier` | **conflict** | sync (5b) |
| `src/components/project/ProjectDetailScherm.tsx` | Foto openen via `openExtern` | Herontwerp + tabs (+774), foto's in FotoViewer | **conflict** | Branch-versie. Overgebleven externe links via `openExtern` |
| `src/lib/linking.ts` | `openExtern()` toegevoegd | `openMaps` via routeLinks; `openWachtwoordHerstel` verwijderd | automatisch | OK. Resultaat bevat beide. Controleren dat niemand `openWachtwoordHerstel` nog importeert (login.tsx van de branch doet dat niet) |
| `src/lib/schermklasseRegels.ts` | Platformcheck eruit (comment verouderd) | Platformcheck eruit (comment bijgewerkt) | **conflict** | Code is gelijk. De comment van de branch nemen |
| `src/providers/ThemeProvider.tsx` | Splash vasthouden, `toggleColorMode` | `voorkeur/setVoorkeur`, Appearance-listener | **conflict** | sync + listener (5a) |
| `tests/ipad.test.mjs` | Split View-asserts | config-asserts met `orientation:'default'` | **conflict** | sync + infoPlist-asserts zonder `'default'` |

---

## 6. Aanbevolen volgorde

1. **Niet** de branch als geheel mergen. Een nieuwe branch vanaf `main` (PWA) maken en per thema overnemen (cherry-pick of bestand-voor-bestand): homepage/widgets → agenda/planning → activiteiten → relaties/klantkaart → werkbon → offertes/facturen/PDF → kosten → financiën → registratie. Screenshots, `docs/app-verbeteren.md` en de themaverplaatsing laten liggen.
2. Vooraf of tegelijk de PWA-CSP aanpassen: pdf.js zelf hosten, `connect-src` + `https://api.pdok.nl`. De PDF-weergave en het adres zoeken op een preview testen (route volgens de Vercel-afspraak).
3. S-1 (foto rij-eerst) en S-4 (kostenbonnen) herstellen vóór de merge.
4. Na de merge naar main de sync-branch rebasen en de 10 conflicten oplossen volgens §5c.
5. Een nieuwe native build met de 5 nieuwe modules. De versie of runtimeVersion verhogen; **geen EAS Update** naar 18c2f43.
6. Voor App Store: de gebruiksbeschrijvingen aanpassen, account/bedrijf verwijderen in de app voor de eigenaar, en de abonnementslink en prijzen in iOS heroverwegen.
7. Alleen testen met het testaccount ("test audit"). De registratieflow nooit tegen productie zonder een afgesproken testadres.
