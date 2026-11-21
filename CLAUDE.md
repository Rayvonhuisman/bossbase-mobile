# BossBase-app — werkafspraken

Dit bestand wordt bij elke sessie ingelezen. De app deelt database, edge functions,
rechten en pakketten met het dashboard (~/BossBase/dashboard); zie ook ~/BossBase/dashboard/CLAUDE.md.

## Nooit iets versturen naar echte gebruikers of klanten zonder akkoord

**Vaste regel: stuur nooit een mail, melding of bericht naar echte gebruikers of
klanten zonder uitdrukkelijk akkoord van Niels.** Dat geldt voor eenmalige
verzendingen, aankondigingen, bulkmails en tests. Laat vooraf zien naar wie het
gaat (aantal en bedrijven) en de volledige tekst, en wacht op akkoord. Testen
gebeurt alleen met Test Account Claude en +adressen van Niels.

Een opdracht als "kondig het aan" of "stuur het rond" is géén akkoord om te
versturen: maak het klaar, laat ontvangers en tekst zien, en wacht. Op 22 oktober
2026 ging de aankondiging van de verwerkersovereenkomst zonder dat akkoord naar
zeven beheerders, onder wie die van Glasmeesters. Aankondigingen van juridische
documenten gaan daarom standaard alleen als melding in het dashboard (edge
function `juridisch-aankondigen`); een mail kan pas na akkoord per keer.

## Uitrollen: alleen via een release, nooit direct (sinds 20-11-2026)

**Er draaien echte klanten.** De app (app.bossbase.nl: een push naar `main` is meteen live), het dashboard en de website die nu live staan
moeten blijven werken. Daarom gaat er **niets meer direct naar `main`** en wordt
er niets meer los uitgerold. Dit geldt voor elke sessie, elke agent en voor
Niels en Rayvon zelf. Het gaat voor elke eerdere afspraak om "meteen uit te rollen".

1. **Werk op een eigen tak** (`feature/<onderwerp>`), het liefst in een eigen
   worktree. Eén tak per wijziging; alles wat bij elkaar hoort (frontend, app,
   migratie, edge function, Boss-kennis) op dezelfde tak.
2. **Test los, niet op productie**: lokaal (devserver) en op de preview van de tak,
   altijd met Test Account Claude. Een push van een tak (niet `main`) maakt alleen
   een preview.
   - **Edge functions** niet deployen onder hun echte naam. Testen kan met een
     tijdelijke kopie onder een andere naam (`<naam>-test`), die je na het testen
     weer verwijdert (`supabase functions delete <naam>-test`).
   - **Migraties** alleen als droogloop in een teruggedraaide transactie (zie
     hieronder). Schrijf ze zo dat de huidige frontend en app ermee blijven werken
     (alleen toevoegen; niets hernoemen of weghalen wat live nog gebruikt wordt).
3. **Eén pull request naar `main`** met een beschrijving voor de briefing
   (`Onderwerp:`, `## Wat`, `## Wat merk je ervan`) en wat er getest is.
4. **Uitrollen pas na uitdrukkelijk akkoord van Niels op die release**, en dan in
   één keer, in de volgorde van "Uitrolvolgorde" in ~/BossBase/CLAUDE.md: edge functions,
   migraties, `migratie:check`, en dan de pull request mergen (`gh pr merge`).
   Een opdracht om iets te bouwen is géén akkoord om het uit te rollen.
5. Noodherstel (iets live is kapot) mag sneller, maar ook dan eerst Niels vragen.

Een push naar `main` wordt lokaal tegengehouden door `.githooks/pre-push`
(`npm install` zet `core.hooksPath` via het `prepare`-script). Alleen voor een
uitrol na akkoord: `BB_RELEASE=1 git push ...`. Mergen van een pull request op
GitHub of met `gh pr merge` is de gewone weg.

## Testen: altijd met Test Account Claude

**Vaste regel: test alleen met het bedrijf "Test Account Claude", nooit met echte
klanten** (zoals Glasmeesters) en nooit met de eigen beheeraccounts. Dat geldt voor
elke sessie en elke agent, in het dashboard (~/BossBase/dashboard) en in de app (~/BossBase/app).
Beide delen dezelfde productiedatabase.

- Bedrijf-id `c1a0de00-0000-4000-a000-000000000000`: Team (met planning en voertuigen),
  `is_testbedrijf = true`, geen proefmails.
- Vier logins, wachtwoorden in `~/BossBase/geheim/test-account-claude-wachtwoorden.txt` (staan
  nergens anders, ook niet in git):
  - `nielsgrevink+claude-eigenaar@gmail.com` is admin en eigenaar.
  - `nielsgrevink+claude-planner@gmail.com` heeft de rechten planning, werkbonnen en alles inzien.
  - `nielsgrevink+claude-kantoor@gmail.com` heeft de rechten offertes, facturen, verkoop en klanten.
  - `nielsgrevink+claude-monteur@gmail.com` heeft alleen het recht projecten.
- **Eén sessie per gebruiker.** Een tweede login maakt de eerste ongeldig. REST
  blijft werken, maar edge functions geven dan 401 "Ongeldige sessie". Geef elke
  agent of elk script dus een eigen login.
- **Geen mails naar echte adressen.** Klanten van het testbedrijf hebben
  `nielsgrevink+claude-klantN@gmail.com`. Laat de crons met rust: geen vervallen
  openstaande facturen en geen klantbezoeken in de toekomst zonder reden.
- Opnieuw opbouwen kan met `scripts/seed-test-account-claude.sql` (zie de kop
  daarvan). De ondertekende offerte maakt `scripts/onderteken-test-offerte.ts`
  (zelfde code als sign-offerte, zonder mail). Beide staan in ~/BossBase/dashboard.

## Talen: Nederlands schrijven, de rest gaat vanzelf

De app is er in elf talen (src/i18n, zie src/i18n/LEESMIJ.md). Nederlands is de
bron: zet elke nieuwe of gewijzigde schermtekst in `tx()` / `txn()` / `txm()`
en schrijf hem gewoon in het Nederlands.

**Vertalen gebeurt automatisch.** Na elke push naar main vertaalt de GitHub
Action `Vertalingen` (.github/workflows/vertalingen.yml) de nieuwe en
gewijzigde teksten met Claude, controleert ze en zet ze als commit
"Vertalingen bijgewerkt" op main. Een gewijzigde Nederlandse zin is een nieuwe
sleutel, dus die wordt vanzelf opnieuw vertaald; vertalingen van verdwenen
teksten worden opgeruimd. Tot de Action klaar is, toont de app Nederlands.

Wil je het meteen (bijvoorbeeld om te testen): `npm run talen:bijwerken`. Dat
draait hetzelfde script lokaal; zonder ANTHROPIC_API_KEY gebruikt het de
`claude`-opdrachtregel. De Action heeft de repository-secret
`ANTHROPIC_API_KEY` nodig.
