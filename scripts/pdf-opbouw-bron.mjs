/**
 * Gedeeld door scripts/pdf-opbouw-overnemen.mjs en tests/pdfOpbouw.test.mjs:
 * welke dashboardbestanden de app overneemt, en hoe de kop eruitziet die
 * erboven komt. De test haalt die kop er weer af en vergelijkt de rest.
 */
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const VENDOR_MAP_DASHBOARD = 'supabase/functions/_shared';

/** pdfOpbouw.js en alles wat hij importeert (en zij weer). */
export const VENDOR_BESTANDEN = ['pdfOpbouw.js', 'documentTotalen.js', 'btwRegime.js', 'notitieTekst.js'];

export const KOP_EINDE = '// ── einde overgenomen kop ──';

export function kopVoor(bronpad, commit) {
  return [
    '// ── OVERGENOMEN UIT HET DASHBOARD — niet met de hand bewerken ──',
    `// Bron: BossBase ${bronpad}`,
    `// Dashboardcommit: ${commit}`,
    '// Bijwerken: node scripts/pdf-opbouw-overnemen.mjs (daarna npm test).',
    '// Alles onder deze kop is een letterlijke kopie; tests/pdfOpbouw.test.mjs',
    '// vergelijkt het met het dashboard.',
    KOP_EINDE,
    '',
  ].join('\n');
}

/** De inhoud zonder kop, zoals hij in het dashboard staat. */
export function zonderKop(tekst) {
  const i = tekst.indexOf(KOP_EINDE);
  if (i === -1) return tekst;
  return tekst.slice(i + KOP_EINDE.length + 1);
}

/** De commit uit de kop, of null. */
export function commitUitKop(tekst) {
  return tekst.match(/^\/\/ Dashboardcommit: (\S+)$/m)?.[1] ?? null;
}

/** Pad naar de dashboardrepo: argument, $BOSSBASE_DASHBOARD of ../BossBase. */
export function dashboardRepo(arg) {
  const hier = dirname(fileURLToPath(import.meta.url));
  const kandidaten = [
    arg,
    process.env.BOSSBASE_DASHBOARD,
    resolve(hier, '../../BossBase'),
    join(process.env.HOME || '', 'BossBase'),
  ].filter(Boolean);
  return kandidaten.find((p) => existsSync(join(p, VENDOR_MAP_DASHBOARD, 'pdfOpbouw.js'))) ?? null;
}
