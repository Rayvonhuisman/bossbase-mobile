# App gelijktrekken met het dashboard

Centraal voortgangs- en overdrachtsdocument. Een nieuwe sessie leest dit eerst.

- **Bron van waarheid (functioneel):** het BossBase-dashboard, repo `/Users/macbook/BossBase website`,
  branch `main` = `a37a907` (uitgecheckt in worktree `/Users/macbook/BossBase-billing`). Alleen-lezen.
- **App:** worktree `/Users/macbook/bossbase-gelijk`, branch `app-gelijktrekken`.
- **Visuele basis:** de bestaande app-stijl (`src/theme`, `src/components`).

## Uitgangssituatie (2026-10-13)

| | |
|---|---|
| `origin/main` app | `80bcb40` (Merge PR #1, productie op app.bossbase.nl) |
| Branch | `app-gelijktrekken`, vanaf `origin/main` |
| Eerste commit op de branch | merge van `origin/feature/ipados-compatibility` (`739aa07`, nog niet op main): centrale breekpunten, leesbreedte, focus, iPad-installatie |
| Dashboard | `main` `a37a907` |
| Vercel | poort `exit 0`, bescherming `all_except_custom_domains`; niets gedeployed vanuit deze branch |
| Bestaande niet-gerelateerde wijzigingen | oude checkout `/Users/macbook/bossbase-mobile`: alleen `design-reference/` (ongemoeid) |

Grenzen: niets in de dashboardrepo, geen database/RLS/functies/Edge Functions, geen Supabase-/DNS-/Vercel-config,
niet mergen, niet uitrollen, geen echte verzendacties, alleen testbedrijven of lokale mocks.

## Inhoud

1. Inventaris dashboard (per pagina)
2. Vergelijking dashboard ↔ app
3. Rechtenmatrix
4. Checklist
5. Database-/Edge-Function-afhankelijkheden (geblokkeerd)
6. Apparaatmatrix en testresultaten
7. Voortgangslog

---
