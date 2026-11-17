# BossBase-app — werkafspraken

Dit bestand wordt bij elke sessie ingelezen. De app deelt database, edge functions,
rechten en pakketten met het dashboard (~/BossBase); zie ook ~/BossBase/CLAUDE.md.

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

## Testen: altijd met Test Account Claude

**Vaste regel: test alleen met het bedrijf "Test Account Claude", nooit met echte
klanten** (zoals Glasmeesters) en nooit met de eigen beheeraccounts. Dat geldt voor
elke sessie en elke agent, in het dashboard (~/BossBase) en in de app (~/bossbase-mobile).
Beide delen dezelfde productiedatabase.

- Bedrijf-id `c1a0de00-0000-4000-a000-000000000000`: Team (met planning en voertuigen),
  `is_testbedrijf = true`, geen proefmails.
- Vier logins, wachtwoorden in `~/test-account-claude-wachtwoorden.txt` (staan
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
  (zelfde code als sign-offerte, zonder mail). Beide staan in ~/BossBase.

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
