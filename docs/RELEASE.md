# BossBase-webapp (PWA): previews en releases

De webapp draait op Vercel-project `bossbase-pwa` en is voor klanten bereikbaar op
`https://app.bossbase.nl`. Dezelfde code levert ook de iOS- en Android-app; die
gaan via EAS en worden hier niet geraakt.

## Spelregels

- **`main` is de enige productiebranch.** Production ontstaat alleen uit een
  geteste, via een pull request gemergde commit op `main`.
- **Featurebranches worden nooit Production.** In `vercel.json` staan alleen
  `main` en `feature/pwa-web` aan voor Git-deployments; alle andere branches
  bouwen niet.
- **Een push bouwt vanzelf (sinds 22-10).** De Ignored Build Step is leeg: een
  push naar `main` gaat direct naar Production (`app.bossbase.nl`), een push
  naar `feature/pwa-web` wordt een Preview. Andere branches bouwen niet
  (`vercel.json`). De stappen hieronder over de Ignored Build Step open- en
  dichtzetten zijn daarmee vervallen.
- **Wie kan uitrollen:** alleen wie naar de GitHub-repo mag pushen (Rayvonhuisman,
  BossBase) en lid is van het Vercel-team *Bossbase* (bossbase en
  rayvonhuisman-2797, beiden eigenaar). Vercel weigert commits van auteurs die
  het niet aan een teamlid kan koppelen ("Deployment was blocked"), en Git Fork
  Protection staat aan: een pull request vanuit een fork bouwt pas na goedkeuring.
- **Previews zijn afgeschermd** met Vercel Deployment Protection. Na de
  livegang staat de bescherming op *Standard Protection*: alle previews en
  gegenereerde `*.vercel.app`-adressen vragen een Vercel-login, alleen
  `app.bossbase.nl` is openbaar.
- **Nooit force-pushen.** GitHub kan dat
  op het huidige gratis plan niet afdwingen voor een privé-repo; de
  `pre-push`-hook in de lokale clone weigert het wel (zie onderaan).
- In de webbundel staan alleen de publieke Supabase-URL en de anon-sleutel.
  Nooit een service-role-sleutel in Vercel, GitHub Actions of de code.

## Controles (lokaal en in GitHub Actions)

```bash
npm ci
npm run typecheck
npm run lint
npm test              # service worker, caching, installatie, toetsenbord, config
npm run build:web     # expo export + service worker afmaken
npm run check:bundel  # geen geheimen, sourcemaps of broncode in dist/
```

`.github/workflows/ci.yml` draait dezelfde stappen op elke pull request en elke
push naar `main` of `feature/pwa-web`.

## Een nieuwe Preview

1. Werk op `feature/pwa-web` (of een branch die je daarin merget). Alle
   controles hierboven groen.
2. Zet de Ignored Build Step open voor alleen die branch:
   ```sh
   if [ "$VERCEL_GIT_COMMIT_REF" = "feature/pwa-web" ]; then exit 1; else exit 0; fi
   ```
   (Project → Settings → Git → Ignored Build Step, of via de API.)
3. `git push origin feature/pwa-web` — zonder `--force`.
4. Wacht tot precies één deployment met target *Preview* op READY staat.
5. Zet de Ignored Build Step terug op exact `exit 0`, ook als de build mislukte.
6. Test op `https://bossbase-pwa-git-feature-pwa-web-<team>.vercel.app/` (Vercel-login
   nodig). Een geïnstalleerde PWA toont "Nieuwe versie beschikbaar"; tik op
   Herladen.

## Een nieuwe Production-release

1. Pull request van `feature/pwa-web` naar `main`; wacht tot CI groen is en de
   Preview van dezelfde commit getest is.
2. Merge de PR (geen squash nodig; nooit force-pushen).
3. Zet de Ignored Build Step open voor alleen `main`:
   ```sh
   if [ "$VERCEL_GIT_COMMIT_REF" = "main" ]; then exit 1; else exit 0; fi
   ```
   en trigger de build met een redeploy van de merge-commit, of met de push
   die de merge al deed (dan moet de stap vóór de merge open staan).
4. Wacht tot de deployment met target *Production* READY is en controleer
   `https://app.bossbase.nl` (inloggen, Vandaag, manifest, service worker).
5. Zet de Ignored Build Step terug op exact `exit 0`.

## Terugdraaien (rollback)

- **Snel:** Vercel → Deployments → de vorige Production-deployment →
  *Instant Rollback*. `app.bossbase.nl` wijst binnen seconden weer naar de
  vorige versie; geïnstalleerde apps krijgen bij de volgende start die versie
  (paginabezoeken gaan netwerk-eerst).
- **Blijvend:** maak een revert-commit op `feature/pwa-web`, en release die via
  de normale route.
- **Service worker kwijt willen:** publiceer een `sw.js` die bij `activate` alle
  caches wist en `self.registration.unregister()` aanroept (zie de kop van
  `public/sw.js`).
- **Domein loskoppelen:** verwijder `app.bossbase.nl` uit het Vercel-project en
  het CNAME-record bij Mijndomein. Raak daarbij `bossbase.nl`, `www`, MX, SPF,
  DKIM en DMARC niet aan.

## DNS

`bossbase.nl` gebruikt de nameservers van Mijndomein. Voor de webapp is er
precies één record: `app` → CNAME naar het doel dat Vercel opgeeft bij het
domein in project `bossbase-pwa`. De website (`bossbase.nl`, `www`) hoort bij
een ander Vercel-project en de mail bij Google; die records blijven ongemoeid.

## Lokale beveiliging tegen verkeerde pushes

`.git/hooks/pre-push` in de lokale clone weigert:

- elke push naar `main` (main verandert alleen via een gemergde pull request);
- elke push die geen fast-forward is (force-push).

De hook staat niet in Git zelf; installeer hem opnieuw na een verse clone (zie
`scripts/pre-push.sh`).
