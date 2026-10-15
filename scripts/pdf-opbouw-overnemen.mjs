#!/usr/bin/env node
/**
 * Neemt de PDF-opmaak van het dashboard over in src/lib/pdf/vendored/.
 *
 * De offerte- en factuur-PDF moeten in de app exact gelijk zijn aan die van het
 * dashboard. Daarom geen eigen opmaak, maar een letterlijke kopie van
 * supabase/functions/_shared/pdfOpbouw.js plus de helpers die hij importeert.
 * Elk bestand krijgt een kop met het bronpad en de commit; daaronder staat de
 * inhoud ongewijzigd. tests/pdfOpbouw.test.mjs vergelijkt die inhoud met het
 * dashboard, zodat een wijziging daar niet ongemerkt aan de app voorbijgaat.
 *
 * Gebruik: node scripts/pdf-opbouw-overnemen.mjs [pad-naar-BossBase]
 * Standaard ../BossBase naast deze repo, of $BOSSBASE_DASHBOARD.
 * Neemt de gecommitte versie (HEAD), niet wat er toevallig onopgeslagen staat.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VENDOR_BESTANDEN, VENDOR_MAP_DASHBOARD, kopVoor, dashboardRepo } from './pdf-opbouw-bron.mjs';

const hier = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(hier, '..');
const repo = dashboardRepo(process.argv[2]);
if (!repo) {
  console.error('Dashboardrepo niet gevonden. Geef het pad mee of zet BOSSBASE_DASHBOARD.');
  process.exit(1);
}

for (const naam of VENDOR_BESTANDEN) {
  const bron = `${VENDOR_MAP_DASHBOARD}/${naam}`;
  const inhoud = execFileSync('git', ['-C', repo, 'show', `HEAD:${bron}`], { encoding: 'utf8' });
  const commit = execFileSync('git', ['-C', repo, 'log', '-1', '--format=%h', 'HEAD', '--', bron], { encoding: 'utf8' }).trim();
  const doel = join(appRoot, 'src/lib/pdf/vendored', naam);
  writeFileSync(doel, kopVoor(bron, commit) + inhoud);
  console.log(`${naam}  ←  ${bron} @ ${commit}`);
}
