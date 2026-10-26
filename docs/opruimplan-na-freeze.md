# Opruimplan na de freeze (niet uitgevoerd)

Los van de uitrol van de accountverwijdering. Alles hieronder is op 17-10-2026
**alleen gelezen** (metadata en relaties, geen inhoud). Niets is verwijderd of
gewijzigd. Uitvoeren pas na de freeze, per onderdeel, met de controles erbij.
Identifiers gemaskeerd (eerste 8 tekens); de volledige waarden staan in de
database en worden pas bij uitvoering opnieuw opgezocht.

## 1. Negen `dashboard_widgets` van TEST Stamvol — verwijderen

| Kenmerk | Waarde |
| --- | --- |
| Bedrijf | `7e57c0de…` (TEST Stamvol, bewust verwijderd), bestaat niet meer |
| Gebruiker | `7e57c0de…`, geen profiel en geen login meer |
| Aangemaakt / gewijzigd | 21-09-2026 / 21-09-2026 |
| Soort | widgetindeling (`accepted_value`, `actions_today` ×2, `active_deals`, `customers`, `monthly_revenue_chart`, `new_leads`, `open_offertes`, `open_pipeline_value`); geen `settings` |
| Ids | `c509eb41…`, `e9975f69…`, `176a69dd…`, `a14ceb87…`, `fe967e4d…`, `5af8a5f5…`, `1b3730b5…`, `957fdfd3…`, `c8ca446b…` |
| Inkomende verwijzingen | geen (geen enkele FK verwijst naar `dashboard_widgets`) |
| Uitgaande | geen FK (daarom bleven ze staan) |

Uitvoering (één transactie, weigert bij een ander aantal):

```sql
begin;
do $$
declare n int;
begin
  delete from public.dashboard_widgets d
   where d.company_id = '7e57c0de-0000-4000-b000-000000000000'
     and not exists (select 1 from public.companies c where c.id = d.company_id)
     and not exists (select 1 from public.profiles p where p.id = d.user_id);
  get diagnostics n = row_count;
  if n <> 9 then raise exception 'verwacht 9 rijen, kreeg %', n; end if;
end $$;
commit;
```

## 2. `superadmin_log` — behouden

Vier regels verwijzen naar een bedrijf dat niet meer bestaat (ids 3, 4, 5, 6; 08-10-2026):

| Id | Bedrijf | Soort / actie | Uitkomst | Inhoud |
| --- | --- | --- | --- | --- |
| 3 | `7e57c0de…` (TEST Stamvol) | klant / `klant.notitie` | gelukt | `voor`/`na` leeg; `doel` = bedrijfsnaam; `door_naam` = medewerker BossBase |
| 4 | `40905fa9…` | support / `support.boss_lezen` | gelukt | idem |
| 5, 6 | `2e5c3d90…` | support / `support.boss_lezen` | gelukt | idem |

- **Doel:** auditlogboek van handelingen in de superadmin (20261008160116).
- **Bewust zonder FK** ("het logboek moet blijven staan als een bedrijf wordt
  verwijderd") en **onveranderlijk**: de trigger `superadmin_log_grendel` weigert
  wissen, truncate en elke wijziging behalve het één keer zetten van de uitkomst.
- **Bewaarbeleid:** er is er geen; het logboek groeit onbeperkt.
- **Persoonsgegevens:** `door_naam` (medewerker van BossBase) en `doel`, dat de
  naam van het klantbedrijf bevat. Bij een eenmanszaak is dat een persoonsnaam.
  `voor`/`na` zijn bij deze vier regels leeg.

Voorstel (apart besluit, eigen migratie): bewaartermijn van 2 jaar voor het
logboek; bij verwijdering van een bedrijf `doel` vervangen door de gehashte
referentie uit `account_verwijderingen`. Beide vragen een gecontroleerde
uitzondering in de grendel (alleen via een service_role-functie, met reden). Tot
dat besluit: niets aan doen. De accountverwijdering laat het logboek ook staan.

## 3. Oudere zeventien rijen — niet verwijderen zonder besluit

| Tabel | Ids | Bedrijf | Aangemaakt / gewijzigd | Gegevens | Waarom zonder bedrijf | Verwijzingen | Voorstel |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `dashboard_widgets` (10) | `71e58432…`, `841d0ed9…`, `b2fe00e7…`, `2b27c7f0…`, `1ad16b02…`, `44ecd898…`, `7f20f9b6…`, `16277601…`, `599debb3…`, `b855a6b4…` | `11111111…` (bestaat niet; vaste testwaarde) | 06-07-2026 / 06-07-2026 | widgetindeling, geen settings; gebruiker `22222222…` bestaat niet | testindeling uit juli zonder bedrijf; geen FK | in: geen, uit: geen FK | verwijderen (zelfde patroon als §1, verwacht 10) |
| `superadmin_log` (3) | 4, 5, 6 | zie §2 | 08-10-2026 | auditregel | bewust zonder FK | geen | behouden (§2) |
| `omzet_momentopnames` (4) | maand 2026-10 | `066b7931…`, `4e6dca4e…`, `8786d988…`, `8a4decee…` | 08-10 en 16-10-2026 | pakket, status, interval, MRR van BossBase | momentopname van de eigen omzet, geen FK | geen | behouden tot het omzetbeleid is besloten: geen persoonsgegevens buiten het verweesde bedrijfs-id. De nieuwe verwijderflow ruimt ze voortaan wel op bij verwijdering. |

## 4. Dertien opslagobjecten zonder verwijzing — niet geopend

Geen enkele tekst- of jsonkolom in `public` bevat de objectnaam (doorzocht met een
alleen-lezen query over alle kolommen), en geen code, mailtemplate of configuratie
in de drie repositories noemt hem. `last_accessed_at` is overal gelijk aan de
aanmaakdatum. Geen eigenaar (`owner` leeg: geüpload met service_role).

| Bucket | Pad | Grootte | Type | Aangemaakt | eTag (md5) |
| --- | --- | --- | --- | --- | --- |
| avatars | `bossbase-mail-test/mail-logo.png` | 9 768 | png | 06-10-2026 | `0c75dfb6fcfc256c1710219e7d225cee` |
| avatars | `bossbase-mail-test/niels.jpg` | 14 132 | jpeg | 06-10-2026 | `1e6957f06e3f8b06d7a1c00e7c64f2b0` |
| signatures | `8ded11a4-….png` | 5 898 | png | 17-09-2026 | `99a64d6fc681534fcb9f53d52ffa9cea` |
| signatures | `c333d7dc-…-a477e763-….png` | 7 308 | png | 05-10-2026 | `e7b201fa1b18506621b1b0979ed72f18` |
| signatures | `werkbon-991ce103-…-a9ac0219-….png` | 7 528 | png | 05-10-2026 | `a657174c2ab3ce7286d02e4146743273` |
| signed-offertes | `offerte-BB-004-ondertekend.pdf` | 9 878 | pdf | 05-06-2026 | `b9f4b6e16dc6f2ca68bc5511e8606662` |
| signed-offertes | `offerte-BB-005-ondertekend.pdf` | 11 029 | pdf | 05-06-2026 | `2960a611c0fa61d0541213926fcc9cba` |
| signed-offertes | `offerte-BB-006-ondertekend.pdf` | 9 715 | pdf | 05-06-2026 | `aeb41bfb40f625f54d4c12fafb5a46e8` |
| signed-offertes | `offerte-BB-011-ondertekend.pdf` | 15 749 | pdf | 05-06-2026 | `b7bae40d220fb315d367d0cb0186b1aa` |
| signed-offertes | `offerte-BB-012-ondertekend.pdf` | 13 371 | pdf | 05-06-2026 | `eb9acfe2786d6db6d6538b0bdd45b17e` |
| signed-offertes | `offerte-BB-013-ondertekend.pdf` | 10 915 | pdf | 09-06-2026 | `291495c9eee59802bc41ecf9de79aec1` |
| signed-offertes | `offerte-BB-150-ondertekend.pdf` | 22 671 | pdf | 16-09-2026 | `3d0122e039cc7c905a25da171303672d` |
| signed-werkbonnen | `werkbon-WB-003-ondertekend.pdf` | 24 582 | pdf | 31-08-2026 | `e614f23be032a4710a8a2a31a445c035` |

**Correctie op het vorige rapport:** de twee bestanden in `avatars/` staan onder
`bossbase-mail-test/`, en de mails gebruiken ze níét (`_shared/bossbaseMail.ts`
laadt `https://www.bossbase.nl/brand/mail-logo.png` en `…/niels.jpg`). Het zijn
testuploads van BossBase zelf, zonder klantgegevens.

De elf documenten (handtekeningen en ondertekende offertes/werkbonnen) staan in de
oude padvorm zonder bedrijfsmap; daardoor hoort geen bestaand bedrijf erbij. Een
eerder verstuurde ondertekende link (tot 10 jaar geldig, zie
`uitrol-accountverwijdering.md`) kan nog naar zo'n bestand wijzen; dat is niet te
zien zonder toegangslogboek. Voorstel na de freeze: eerst de Storage-logboeken van
de afgelopen 30 dagen op deze paden doorzoeken (alleen paden, geen inhoud); geen
toegang gevonden → verwijderen via de Storage-API met deze lijst, en vooraf de eTag
opnieuw vergelijken zodat alleen exact deze objecten weggaan.

## 5. Stripe — later, alleen lezen

Via bestaande servertooling met de geheime sleutel (niet tonen): alleen zoeken op de
twee verwijderde testbedrijven (`metadata.company_id` = de bekende ids, gemaskeerd in
het verslag). Geen refund, cancel, detach of metadatawijziging. In de database
verwijst niets meer naar een Stripe-klant van deze bedrijven.
