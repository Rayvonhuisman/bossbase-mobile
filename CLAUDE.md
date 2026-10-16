# BossBase-app — werkafspraken

Dit bestand wordt bij elke sessie ingelezen. De app deelt database, edge functions,
rechten en pakketten met het dashboard (~/BossBase); zie ook ~/BossBase/CLAUDE.md.

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
