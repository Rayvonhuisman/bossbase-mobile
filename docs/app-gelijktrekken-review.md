# Review app-gelijktrekken — security, datacontract en mutaties

Stand: 2026-10-13. Getoetst tegen het live schema van `mawzqpnsluljxpbarhng` (alleen metadata: policies, triggers,
constraints, functiedefinities, kolomrechten, buckets) en tegen dashboard `origin/main` `331250b`.
Geen bedrijfsrijen gelezen, niets in de database gewijzigd.

## 1. Bevindingen in de app (hersteld op deze branch)

| Ernst | Bevinding | Commit |
|---|---|---|
| Hoog | Projecten, projectdetail, projectkiezers en werkbonmaterialen liepen live vast: kolomrechten op `projects.project_value/geschatte_waarde` en `werkbon_materialen.prijs_per/subtotaal` zijn ingetrokken. Nu via `bb_projectbedragen` / `bb_werkbonmateriaal_bedragen`. | `f0145db` |
| Hoog | Crediteren liet altijd een lege, onverwijderbare creditnota met verbruikt BB-CF-nummer achter (regels in aparte transactie na status `verzonden`). Nu via RPC `bb_factuur_aanmaken`. | `f4a8a10` |
| Hoog | Creditregel: verlegd/vrijgesteld kreeg 21% → schending `factuur_regels_verlegd_nul_check`. | `f4a8a10` |
| Hoog | Gedeelde werkruimte (Groei) gaf in de app financiële inzage; dashboard sinds 4-10 niet meer. | `f4a8a10` |
| Hoog | CSV-export: formule-injectie (`=`, `+`, `-`, `@`). | `9d1cde5` |
| Hoog | Klant bewerken zette HTML-notities stil om naar platte tekst (opmaak en @-vermeldingen weg). | `069dae5` |
| Hoog | Teksten bij klant/project verwijderen klopten niet met de werkelijke cascades. | `069dae5` |
| Midden | Logo-upload zonder rolcheck in de service; limiet 10 MB i.p.v. bucketlimiet 5 MB. | `9d1cde5` |
| Midden | Werkbonfoto: bestand werd vóór de rij verwijderd (wees-rij bij geweigerde delete). | `1ded7a5` |
| Midden | Regels offertes/facturen op rol admin/planner i.p.v. recht `offertes`/`facturen`; plannerrol bestaat niet meer. | `f0145db` |
| Midden | Alleen-lezen blokkeerde alleen aanmaken; nu elke actie, zoals de trigger `a00_readonly_bewaken`. | `f0145db` |
| Midden | Materialen: knoppen zonder recht `inkoopprijzen` (RLS eist dat). | `f4a8a10` |
| Midden | Nieuwe leverancier: knop volgt nu RLS (`klanten_bewerken` of `kosten`). | `069dae5` |
| Laag | Afdruk-iframe zonder sandbox; afdrukvenster hield `opener`. | `f4a8a10` |
| Laag | Betaald zetten zonder datum gaf tussen 00:00–02:00 de datum van gisteren (UTC). | `f4a8a10` |
| Laag | Leverancierskosten telden werkbonmateriaal dubbel. | `6963359` |
| Laag | Notitieknop op ondertekende werkbon (server weigert). | `6963359` |
| Laag | Privé-e-mailadres in `docs/inventaris`. | `9d1cde5` |

Brede scan van de volledige diff: geen secrets, service-role-keys, hardcoded UUID's, wachtwoorden of mocks in
productiecode; alle `console.log` achter `__DEV__`; geen `dangerouslySetInnerHTML`/`innerHTML`; `document.write`
alleen in `afdrukken.web.ts` met volledig ge-escapete HTML uit `documentHtml.ts`; uploads met type-uit-bytes en
groottecontrole (avatar 5 MB, logo 5 MB, werkbonfoto 10 MB, meldpunt 5 MB). Externe hosts in de bundel: alleen
`www.bossbase.nl`, `maps.google.com`, `maps.apple.com` en het eigen Supabase-project.

## 2. Bevindingen aan de serverkant (niet hersteld — vragen een DB- of Edge-Function-wijziging)

| Ernst | Bevinding | Geldt ook voor dashboard |
|---|---|---|
| Midden | Edge Function `offerte-pdf-url` toetst het recht `offertes` niet; via `projects.offerte_id` kan een medewerker met projecttoegang een getekende offerte-PDF (met bedragen) ophalen. | ja |
| Midden | Storage `bedrijf-logos`: insert/update/delete toetsen alleen de bedrijfsmap, niet de rol admin. | ja |
| Midden | Storage `werkbon-fotos`: delete/update toetst niet of de werkbon ondertekend is. | ja |
| Laag | Storage `factuur-pdfs`: insert/update/delete zonder recht `facturen` (lezen wél). App schrijft hier niet. | ja |
| Laag | `send-email` verstuurt HTML naar adressen van het eigen bedrijf voor elke ingelogde gebruiker (rate-limited). | ja |
| Laag | `klant_tijdlijn.created_by` wordt door de client meegestuurd. | ja |
| Laag | Geen unieke index `(company_id, nummer)` op offertes/facturen. | ja |

## 3. Alleen in de UI afgeschermd (bewust, gelijk aan dashboard)

- `bedrijfsfinancien` (tegels Vandaag): geen eigen serverrecht; de onderliggende data valt onder `facturen`/`verkoop`.
- `projectbedragen` op offerte-/factuurbedragen in het projectdetail: wie `offertes`/`facturen` heeft, kan die via de API lezen.
- Groei (gedeelde werkruimte): iedereen opent Team en Database en kan klantgegevens als CSV exporteren.

Echte servergrenzen: `offertes`/`offerte_items` → `offertes`; `facturen`/`factuur_regels` → `facturen`;
`job_costs` → `kosten` of werkbontoegang; `materiaal_inkoop` → `bb_mag_inkoopprijs_zien`; projectbedragen en
werkbonmateriaalprijzen alleen via de RPC's met rechtencheck.

## 4. Mutaties

Overal: `company_id` dat de client meestuurt wordt door RLS `WITH CHECK company_id = current_company_id()` afgedwongen,
plus triggers `a00_readonly_bewaken` (alleen-lezen) en `a0_verwijzingen_zelfde_bedrijf` (verwijzingen binnen het
eigen bedrijf). Een gebruiker kan dus geen ander bedrijf, profiel of eigenaar meegeven.

| Mutation | Pagina | Tabel/functie | Bedrijfscontrole | Recht | Testbaar | Cleanup |
|---|---|---|---|---|---|---|
| activiteit create/update/complete/delete | Activiteiten, klantkaart, project | `activities` | RLS check | update/delete: `planning`, toegewezen, of `verkoop`+deal | ja | delete rij |
| klant create/update/delete | Relaties | `customers` (+`klant_tijdlijn`) | RLS | `klanten_bewerken` (+limiet); delete `klanten_verwijderen` | ja (zonder `snelstart_id`) | delete klant (cascade tijdlijn, deals, activiteiten) |
| klantnotitie | klantkaart | `klant_tijdlijn` | RLS | — | alleen op een testklant | geen DELETE-policy: alleen via klant verwijderen |
| leverancier create/update/delete | Relaties | `leveranciers` (+`leverancier_tijdlijn`) | RLS | insert `klanten_bewerken`/`kosten`; delete `klanten_verwijderen` | ja | delete (RESTRICT bij `job_costs`) |
| deal create/fase/verloren/heropen | Pipeline | `deals` (+trigger maakt project) | RLS | `verkoop` | ja | delete deal (admin) + project |
| project create/update/delete | Projecten | `projects` | RLS | `projecten_bewerken`; delete admin | ja | delete (cascade notes/foto's/kosten) |
| projectnotitie | project | `project_notes` | RLS | auteur of `projecten_bewerken` | ja | delete rij |
| werkbon create/update/status | Werkbonnen | `werkbonnen` + RPC `bb_werkbon_dagen_zetten` + `calendar_events` | RLS | `planning`/`werkbonnen_bewerken`/verantwoordelijke | ja, **alleen met het testaccount zelf op de bon** | delete werkbon (admin; cascade dagen, events, taken, materiaal, notities, uren) |
| toewijzingsmelding | werkbonformulier | Edge `create-notification` | Edge | ingelogd | ja: zonder collega's geen rij, nooit mail (geen `email`-veld) | rijen bij collega's alleen met service-role |
| planningwijziging | werkbon bewerken | `planning_wijzigingen` | RLS | ingelogd | **nee met collega's** (cron 18:00 mailt) | alleen service-role |
| werkbontaak / meerwerk | werkbon | `werkbon_taken` | RLS | werkruimte/`werkbonnen_bewerken`/verantwoordelijke | ja | delete rij |
| werkbonmateriaal | werkbon | `werkbon_materialen` (+triggers inkoop + `job_costs`-spiegel) | RLS | idem | ja | delete rij; controleer spiegel-`job_costs` |
| werkbonnotitie | werkbon | `werkbon_notities` | RLS | eigen of `werkbonnen_bewerken` | ja | delete rij |
| werkbonfoto | werkbon | storage `werkbon-fotos` + `werkbon_fotos` | pad = bedrijf | idem | ja | in app verwijderen (rij, dan bestand) |
| werkbonuren | werkbon, uren | `werkbon_uren` | RLS | `bb_mag_werkbon_uren_beheren` | ja | delete rij |
| werkdaguren | Uren | `urenregistratie` | RLS | eigen; ander: admin/`planning` | ja | delete rij |
| kostenregel | Kosten | `job_costs` | RLS | `kosten` + `kosten_nacalculatie` | ja | delete rij |
| materiaal (bibliotheek) | Materialen | `materialen` (+`materiaal_inkoop`) | RLS | `inkoopprijzen` | ja | delete (inkoop cascade) |
| conceptofferte + regels | Offertes | `offertes`, `offerte_items` | RLS | `offertes` (+limiet) | ja | delete offerte (cascade); `plan_usage_events` blijft (service-role) |
| conceptfactuur + regels | Facturen | RPC `bb_factuur_aanmaken`, `factuur_regels` | RPC + RLS | `facturen` (+limiet) | ja (concept) | delete concept; `plan_usage_events` blijft |
| factuur betaald / verzonden / crediteren | Facturen | `mark_factuur_betaald`, `facturen`, RPC | RPC/RLS | `facturen` | **nee**: niet terug te draaien zonder service-role | — |
| bedrijfsinstellingen / bedrijf | Instellingen | `bedrijfsinstellingen`, `companies` | RLS admin | admin | ja, met exact terugzetten | oude waarde terugzetten |
| templates / fasen / redenen / voertuigen / eenheden | Instellingen | resp. tabellen | RLS admin | admin (+feature) | ja | delete rij |
| logo / avatar | Instellingen, profiel | storage + `companies.logo_url` / `profiles.avatar_url` | pad = bedrijf | admin / eigen | ja | bestand verwijderen, URL terugzetten |
| export loggen | Database | `klant_tijdlijn` | RLS | ingelogd | alleen op testklant | via klant verwijderen |
| melding gelezen | Meldingen | `notifications` | RLS `user_id = uid` | eigen | ja | `read_at` terug op null |
| teamlid uitnodigen | Team | `company_members` + `send-email` | RLS admin | admin | **nee** (echte mail) | — |
| rechten per lid | Team | `user_permissions` | RLS admin + doel in bedrijf | admin + `rollen_rechten` | ja, op bestaand testlid | oude set herstellen |
| teamlid (de)activeren / verwijderen | Team | Edge `delete-team-member` | Edge | admin | **nee** | — |
| account deactiveren | Profiel | RPC `delete_own_account` | RPC | eigen | **nee** | — |
| meldpunt / Boss | Hulp | Edge `meldpunt` / `boss-chat` | Edge | ingelogd | **nee** (mail / extern AI) | — |

## 5. Praktijktest op de afgeschermde Preview (2026-10-14)

Preview `dpl_2kzPANqiVWPvLUYmCapFmgRKNpAk` (commit `237b54f`), testbedrijf **test audit** (pakket Team, proef),
gebruiker Niels Test Audit (beheerder), Supabase `mawzqpnsluljxpbarhng`. Chromium (Playwright), 1180×820.

**Alleen lezen (27 routes):** allemaal geladen, 0× 4xx/5xx, 0 consolefouten, 0 paginafouten, 6–20 verzoeken per
pagina (geen lussen). Aantallen gelijk aan de database (3 klanten, 2 leveranciers, 2 facturen, € 150 kosten).
Factuurdetail met PDF (lijst + signed URL), Boss, meldingen en Bug of idee openen correct; niets verstuurd.

**Mutaties (allemaal via de app-UI, prefix `APP-TEST –`):** klant aanmaken/wijzigen/verwijderen, klantnotitie,
leverancier (IBAN-controle blokkeert ongeldig zonder verzoek) aanmaken/wijzigen/notitie/verwijderen, kostenregel
(€ 121 incl. → € 100 excl.) aanmaken/wijzigen/verwijderen, project aanmaken/verwijderen (bedragen via
`bb_projectbedragen`), activiteit aanmaken/wijzigen/afronden/verwijderen (tijdzone correct), werkbon meerdaags
aanmaken (RPC + 2 agenda-items), planning aanpassen (dag verzet, eigen tijd), taak, meerwerk, interne notitie,
materiaal (subtotaal door trigger, inkoop, spiegel-`job_costs`), werkbonuren (afronding 5 min), werkdaguren
aanmaken/wijzigen/verwijderen, werkbonfoto uploaden/verwijderen (rij + storage). Elke actie: precies één verzoek,
juiste `company_id`, juiste gebruiker, geen duplicaten. 0 notifications, 0 planning_wijzigingen, 0 mails.

**Niet uitgevoerd (blokkade):** conceptofferte/-factuur (trigger schrijft `plan_usage_events`, niet op te ruimen
zonder service-role); instellingen (formulier zette `''` → NULL — hersteld in `ff4b6ba`, nog niet live getest).

**Restant in testbedrijf:** werkbon `WB-001` (`940cfeea…`) met 1 werkbonuur en 2 notities. Werkbonnen en
werkbonuren zijn in app én dashboard niet via de UI te verwijderen. Inert gemaakt (geen klant, dagen, medewerkers,
agenda-items). Opruimen vraagt een handmatige delete met toestemming (cascade ruimt uren en notities op).

**Gevonden en hersteld:** knoppen/keuzes zonder rol of `aria-checked` op web; foto verscheen pas na herladen;
instellingen schreven ongewijzigde velden; logo-hint 10 MB i.p.v. 5 MB; urenlabels (`ff4b6ba`, `7c6546d`).

**Rollen/pakketten:** alleen beheerder + Team getest; er bestaan geen andere testaccounts of testbedrijven
(medewerker, Groei, alleen-lezen). Geblokkeerd tot er veilige fixtures zijn.
