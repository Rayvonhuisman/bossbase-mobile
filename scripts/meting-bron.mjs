/**
 * Gedeeld door scripts/meting-overnemen.mjs en tests/metingen.test.mjs: welke
 * dashboardbestanden de app voor Metingen overneemt, en hoe.
 *
 * Drie bestanden, alle drie letterlijk:
 *   - supabase/functions/_shared/metingControle.js  controle en samenvoegen van
 *     stukken (voegStukToe), ook gebruikt door de edge function metingen-uitlezen;
 *   - supabase/functions/_shared/metingVelden.js     velden per branche;
 *   - src/lib/metingVelden.js                        soorten, berekening en weergave
 *     ("4 × 1,2 × 1,0 = 4,8 m²"). Hier is één regel anders: de import van de
 *     brancheVelden wijst naar de kopie ernaast (`vervang`).
 *
 * De kop en de vergelijking zijn die van de PDF-opmaak (pdf-opbouw-bron.mjs).
 */
import { execFileSync } from 'node:child_process';
import { KOP_EINDE } from './pdf-opbouw-bron.mjs';

export { KOP_EINDE, zonderKop, commitUitKop, dashboardRepo } from './pdf-opbouw-bron.mjs';

export const METING_MAP_APP = 'src/lib/metingen/vendored';

export const METING_BESTANDEN = [
  { bron: 'supabase/functions/_shared/metingControle.js', doel: 'metingControle.js', vervang: [] },
  { bron: 'supabase/functions/_shared/metingVelden.js', doel: 'metingVelden.js', vervang: [] },
  {
    bron: 'src/lib/metingVelden.js',
    doel: 'metingWeergave.js',
    vervang: [["from '../../supabase/functions/_shared/metingVelden.js'", "from './metingVelden.js'"]],
  },
];

/** De dashboardinhoud zoals hij in de app hoort te staan (na `vervang`). */
export function naarApp(inhoud, vervang) {
  let uit = inhoud;
  for (const [oud, nieuw] of vervang) {
    if (!uit.includes(oud)) throw new Error(`verwachte regel niet gevonden: ${oud}`);
    uit = uit.split(oud).join(nieuw);
  }
  return uit;
}

export function kopVoorMeting(bronpad, commit) {
  return [
    '// ── OVERGENOMEN UIT HET DASHBOARD — niet met de hand bewerken ──',
    `// Bron: BossBase ${bronpad}`,
    `// Dashboardcommit: ${commit}`,
    '// Bijwerken: node scripts/meting-overnemen.mjs (daarna npm test).',
    '// Alles onder deze kop is een letterlijke kopie (zie scripts/meting-bron.mjs);',
    '// tests/metingen.test.mjs vergelijkt het met het dashboard.',
    KOP_EINDE,
    '',
  ].join('\n');
}

/**
 * Een bestand uit de dashboardrepo op een ref, of null als het daar niet staat.
 * De werkmap van het dashboard kan achterlopen (main lokaal niet bijgewerkt);
 * daarom proberen we HEAD én origin/main.
 */
export function dashboardBestand(repo, ref, pad) {
  try {
    return execFileSync('git', ['-C', repo, 'show', `${ref}:${pad}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

export const DASHBOARD_REFS = ['HEAD', 'origin/main'];
