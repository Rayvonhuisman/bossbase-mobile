# App Store-compliance iOS-app (BossBase)

Stand 2026-10-16, branch `sync/testflight-met-pwa`. Alleen-lezen onderzocht tegen dashboard `origin/main` en de
live database; geen backend gewijzigd.

## 1. Accountverwijdering (richtlijn 5.1.1(v)) — **open blokkade**

**Hoe het nu werkt (code + live functies):**

| Rol | Dashboard en app bieden | Backend doet | Voldoet aan 5.1.1(v)? |
|---|---|---|---|
| Medewerker | "Account deactiveren" (VERWIJDEREN typen) | `delete_own_account()`: `profiles.actief=false`, `verwijderd_op`, Auth-ban 100 jaar, sessies weg. Naam, e-mail, avatar en `auth.users`-rij blijven. | Nee — omkeerbare deactivering |
| Beheerder (niet eigenaar) | idem; laatste actieve beheerder geblokkeerd | idem | Nee |
| Eigenaar | "Bedrijf sluiten" — alleen in het dashboard | `billing-cancel` (opzeggen per einde periode) + `cancel_company_account()` (bedrijf `opgezegd`, alle profielen gedeactiveerd); echte verwijdering pas 2 jaar later via cron `opschonen` | Nee — en in de iOS-app kan de eigenaar niets: de dashboardlink opent op een telefoon het "download de app"-scherm |

Herbevestiging: alleen VERWIJDEREN typen, geen wachtwoord. Bewaarplicht wordt alleen als tekst genoemd (klant
bewaart facturen 7 jaar zelf). Geen functie om eigenaarschap over te dragen.

**Wat de app nu doet (deze branch):**
- Instellingen › Mijn profiel: kaart **"Account verwijderen"** (was "Gevarenzone"), plus een ingang
  "Account verwijderen" op de profielpagina (avatar rechtsboven → Account).
- Teksten zeggen eerlijk wat er gebeurt: wat stopt, wat bij het bedrijf blijft, definitief, en voor de eigenaar
  dat het hele bedrijf en team geraakt worden. Medewerker/beheerder: deactiveren + "Definitieve verwijdering
  aanvragen" (e-mail). Eigenaar: alleen "Verwijdering van bedrijf aanvragen" (e-mail); de dashboardknop staat
  alleen op web. Een medewerker kan nooit het bedrijf verwijderen (server weigert `cancel_company_account`).
- **Dit is niet genoeg voor Apple**: deactiveren + e-mail is expliciet onvoldoende.

**Wat aan de backend ontbreekt (niet gebouwd, apart te beslissen):**
1. Edge Function `account-verwijderen` (verify_jwt, service-role binnen de functie) met herauthenticatie
   (wachtwoord via `signInWithPassword` met een anon-client, of de bestaande e-mailcode).
2. Niet-eigenaar: profiel anonimiseren (`full_name='Verwijderd account'`, e-mail/telefoon leeg, avatar-bestand
   weg), persoonlijke rijen verwijderen (Boss-gesprekken, notificaties, tokens — exact te inventariseren),
   `company_members` ontkoppelen, daarna `auth.admin.deleteUser`. Profiel blijft als anonieme rij omdat
   `werkbon_uren.profile_id` NO ACTION is (uren horen bij de administratie van het bedrijf).
3. Eigenaar: of eigenaarschap overdragen (nieuwe RPC `bb_eigenaar_overdragen`), of "account en bedrijf
   verwijderen": `billing-cancel` + `cancel_company_account` + verwijderdatum (bijv. 30 dagen bedenktijd) waarop
   `opschonen` het bedrijf en alle accounts verwijdert in plaats van na 2 jaar.
4. Beleidsbesluiten: bedenktermijn; lopende incasso bij een jaarabonnement; wat BossBase zelf bewaart.

Zodra dat er is, roept de app hem aan vanuit dezelfde kaart (sheet met wachtwoord + VERWIJDEREN).

## 2. Abonnementen en aankopen op iOS (richtlijn 3.1.1/3.1.3)

Eén regel: `toonAankoopInfo()` (`src/lib/aankoopInfo.ts`, pure kern `aankoopRegels.ts`) — **false op iOS**, true op
web en Android (ongewijzigd). Geen StoreKit/IAP toegevoegd.

| Plek | Web/Android | iOS |
|---|---|---|
| Instellingen › Abonnement | pakket met € per maand, extra gebruikers, jaarabonnement, "Gratis uitproberen t/m", welkomstactie, modules met prijs, looptijd, knop "Abonnement beheren op het dashboard" | pakketnaam, "Huidig pakket", status, "Proefperiode t/m", gebruik (aantallen), modulenamen zonder prijs; kaart Beheren: *"Je abonnement wordt buiten de app beheerd."* zonder knop |
| E-mailtemplates (eigen template zonder feature) | "zit in Groei en Team … wijzig je op het dashboard" + knop "Naar het dashboard" | "zit niet in je huidige abonnement", alleen "Sluiten" |
| Team: uitnodigen bij volle gebruikerslimiet | "Pas je abonnement aan op het dashboard" | zonder verwijzing |
| Team: rollen & rechten | "Dat zit in Groei en Team" | "zit niet in je huidige abonnement" |
| Facturen: herinneringen | "wijzig je op het dashboard" | zonder verwijzing |
| Alleen-lezen-meldingen (menu, abonnementstab, foutmeldingen) | "zodra je een abonnement kiest", "Werk je betaalgegevens bij" | "zodra je abonnement actief is", "Zodra de betaling in orde is …", "wordt buiten de app beheerd" |
| Registratie: pakketkeuze (Groei/Team, "dagen gratis proberen") | getoond | overgeslagen; proef start op het standaardpakket (zoals het dashboard zonder keuze) |

Geen Stripe-checkout of -portal in de app (gecontroleerd). De Stripe-betaallink op **facturen** is betaling voor
fysieke diensten van de klant en valt buiten 3.1.1.

## 3. PDOK (adres zoeken) en privacy

**Wat er naar PDOK gaat** (`src/lib/adresZoeken.ts`, `src/components/AdresZoeker.tsx`), rechtstreeks vanaf het
toestel naar `https://api.pdok.nl/bzk/locatieserver/search/v3_1/` (Locatieserver van PDOK/Kadaster):
- `suggest`: de getypte zoektekst (`q`, vanaf 3 tekens, 300 ms na typen), vast filter `type:adres`, `rows=8`;
- `lookup`: het PDOK-id van de gekozen suggestie;
- technisch bij elk verzoek: IP-adres en standaard-HTTP-kopregels van het toestel (zoals bij elke webaanvraag).

Niet verstuurd: coördinaten, klant- of gebruikersgegevens, sessie of token. BossBase logt of bewaart de
zoektekst niet (geen server ertussen); het gekozen adres wordt alleen opgeslagen als de gebruiker het formulier
bewaart, zoals elk ander adresveld. Of en hoe lang PDOK verzoeken logt, staat in het privacybeleid van PDOK/Kadaster
— hier geen eigen claim.

**Voorstel privacytekst (app en privacybeleid):**
> Adres zoeken: als je een adres begint te typen, stuurt de app je zoektekst rechtstreeks naar de Locatieserver
> van PDOK (Kadaster) om passende Nederlandse adressen voor te stellen. Daarbij ontvangt PDOK, zoals bij elke
> internetaanvraag, ook je IP-adres. BossBase bewaart je zoektekst niet; alleen het adres dat je opslaat komt in
> je administratie. Zie het privacybeleid van PDOK voor wat zij met verzoeken doen.

**App Store Connect › App Privacy — te controleren (niet gewijzigd):**
- [ ] "Contact Info › Physical Address": adressen van klanten/leveranciers/werklocaties worden opgeslagen
      (app-functionaliteit, gekoppeld aan het bedrijfsaccount). Controleren of dit al zo is opgegeven.
- [ ] Zoektekst naar PDOK: geen tracking, geen advertenties. Beoordelen of dit als "verzameld" geldt: de
      zoektekst gaat naar een derde (PDOK) en wordt door BossBase niet bewaard. Apple vraagt gegevens die de app
      of derde partners verzamelen; leg dit vast als "Physical Address — App Functionality — niet gekoppeld aan
      identiteit — geen tracking", tenzij juridisch anders beoordeeld.
- [ ] "Photos or Videos": werkbonfoto's, kostenbonnen, projectfoto's (App Functionality, gekoppeld).
- [ ] "User Content › Other": notities, handtekeningen (werkbon ondertekenen).
- [ ] "Contact Info › Name/Email/Phone": account- en klantgegevens.
- [ ] "Identifiers": gebruikers-ID (Supabase), App Functionality.
- [ ] "Diagnostics": alleen als crash-/foutmeldingen (Bug of idee met schermafbeelding) zo worden opgegeven.
- [ ] Privacybeleid-URL bijwerken met de PDOK-alinea (aparte websitewijziging, niet gepubliceerd).

## 4. Universele links (voorstel, niet gepubliceerd)

- Bundle ID `nl.bossbase.app`, Team ID **`U458LGVK6M`** (bewezen: App Store-provisioningprofiel van build 0.1.0 (5)),
  entitlement `applinks:app.bossbase.nl` (prebuild gecontroleerd).
- Wachtwoord-reset loopt via `www.bossbase.nl/reset-password` (ander domein) — wordt niet door de app
  onderschept. Geen app-route accepteert een redirect-parameter (geen open redirect).
- Niet `/*`: dan zou elke pagina van app.bossbase.nl (ook `/installeren`, login, statische bestanden) de app openen.
  Beperkt voorstel — alleen inhoudspagina's achter de login:

```json
{
  "applinks": {
    "details": [
      {
        "appIDs": ["U458LGVK6M.nl.bossbase.app"],
        "components": [
          { "/": "/today" }, { "/": "/menu" },
          { "/": "/work-orders" }, { "/": "/work-orders/*" },
          { "/": "/customers" }, { "/": "/customers/*" },
          { "/": "/project/*" }, { "/": "/deal/*" }, { "/": "/projects" }, { "/": "/pipeline" },
          { "/": "/activities" }, { "/": "/planning" }, { "/": "/planningbord" }, { "/": "/hours" },
          { "/": "/offers" }, { "/": "/invoices" }, { "/": "/expenses" }, { "/": "/materialen" },
          { "/": "/database" }, { "/": "/team" }, { "/": "/settings" }, { "/": "/financien" }
        ]
      }
    ]
  }
}
```
Publiceren (aparte releaseactie): `public/.well-known/apple-app-site-association` (zonder extensie), via
`vercel.json` met `Content-Type: application/json`, zonder redirect, en `.well-known` in `.vercelignore`
toelaten. Daarna controleren met `https://app-site-association.cdn-apple.com/a/v1/app.bossbase.nl`.

## 5. Achtergebleven productietestdata van `app-verbeteren` (alleen gelezen, niets gewijzigd)

Testbedrijf **TEST Stamvol Bouw BV** `7e57c0de-0000-4000-b000-000000000000` (`is_testbedrijf = true`).

| Item | Wat | Afhankelijk |
|---|---|---|
| WB-221 `4cbfb5b4-51dc-4ea1-b7af-aaa1ff4a70f0` | volledig testdata (15-10), gepland 15-10 | 1 `werkbon_dagen` `9870529e-…`; seed-afspraak `0d64c51f-…` ("Sollicitatiegesprek") kreeg `werkbon_id` en 1 testnotitie in `comments`. **Let op:** `calendar_events.werkbon_id` is ON DELETE CASCADE — eerst loskoppelen, anders verdwijnt de seed-afspraak |
| WB-166 `2f6c28bc-0353-4e51-9e95-f9fb66e7d246` | seed-werkbon, op 15-10 ingepland op 20-10 09:00–12:00 | testdata: `werkbon_dagen` `2dc1eaff-…`, agenda-item `5a56c9e1-…`, notification `19ae145c-…`, planning_wijziging `33d5c021-…` (al verwerkt, mail al weg). Seed-taken/materialen blijven. Origineel waarschijnlijk: `gepland_op` NULL, 07:30–16:00 |
| WB-161 `288738f5-…` | teruggezet | rest: agenda-item `81aff468-…`, 2 notifications (`1f4ef611-…`, `bfe25be1-…`), 2 planning_wijzigingen (`a3dfd31a-…`, `4a6eaa7d-…`, verwerkt) |
| Overig | notifications `80f5981a-…`, `bbc2e3c8-…` (verwijderde testactiviteit), tijdlijn `e9a0ab45-…`; plus testdeal/project, factuur BB-F161 + creditnota BB-CF005, ondertekende WB-019, verstuurde testmails | facturen/creditnota/ondertekening/mails zijn definitief of verstuurd — apart besluit |

**Pakketten:** Stamvol staat op Groei (origineel Groei, bewezen via de documenthistorie: "tijdelijk op Team (was Groei)") —
niets terug te zetten. `test audit` is een Team-proef die bij de aanmelding is gekozen (`gekozen_pakket = team`) — terecht.
**WB-001** (test audit) ongewijzigd en inert.

**Cleanupvoorstel (niet uitgevoerd; via SQL-editor/service-role in één transactie, niet via de app — de app schrijft
planning_wijzigingen die om 18:00 een mail sturen):**
1. `update calendar_events set werkbon_id = null, comments = '[]'::jsonb where id = '0d64c51f-5066-4e74-9758-f7ba21c0f0d0'` → 1
2. `delete from werkbonnen where id = '4cbfb5b4-51dc-4ea1-b7af-aaa1ff4a70f0'` → 1 (cascade: 1 werkbon_dagen)
3. `delete from werkbon_dagen where id = '2dc1eaff-cf5b-472d-848a-87ecf88c5215'` → 1 (cascade: agenda-item `5a56c9e1-…`; trigger zet `gepland_op` op NULL), daarna `update werkbonnen set starttijd = '07:30', eindtijd = '16:00' where id = '2f6c28bc-0353-4e51-9e95-f9fb66e7d246'` → 1
4. `delete from notifications where id in ('19ae145c-73f2-4a0f-9959-70b6007eebbd','1f4ef611-7ac4-41e6-80e9-cf7414e62ae0','bfe25be1-8249-4cbd-8612-b0382ffd50b7','80f5981a-c3ad-4c15-88e9-d0360b470858','bbc2e3c8-6bf8-4f6a-9692-51dca8ed98c1')` → 5
5. `delete from calendar_events where id = '81aff468-cf1c-486e-94a7-4d2984a904ff'` → 1
6. `delete from planning_wijzigingen where id in ('a3dfd31a-157a-4ee6-9339-cca2233c9f09','4a6eaa7d-b2bc-427a-9d6d-1a5b2e3fdf8c','33d5c021-9c4e-4e7d-915c-4368482ec7a2')` → 3 (al verwerkt; geen mail)
7. optioneel `delete from klant_tijdlijn where id = 'e9a0ab45-6812-4485-88d1-995785a884df'` → 1

Controle daarna: WB-166 `gepland_op` NULL en 0 dagen/agenda-items; geen WB-221; afspraak `0d64c51f-…` bestaat met
`werkbon_id` NULL. WB-001 niet aanraken.
