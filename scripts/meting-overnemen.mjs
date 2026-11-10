#!/usr/bin/env node
/**
 * Neemt de metinglogica van het dashboard over in src/lib/metingen/vendored/.
 *
 * "Vertel het Boss" voegt stukken samen met voegStukToe, en de lijst rekent en
 * toont maten zoals het dashboard. Dat moet in de app precies hetzelfde doen,
 * dus geen eigen versie maar een kopie (zie scripts/meting-bron.mjs voor welke
 * bestanden). tests/metingen.test.mjs vergelijkt de kopie met het dashboard.
 *
 * Gebruik: node scripts/meting-overnemen.mjs [pad-naar-BossBase] [ref]
 * Standaard ../BossBase naast deze repo, of $BOSSBASE_DASHBOARD; ref standaard
 * HEAD, en origin/main als het bestand op HEAD nog niet bestaat.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DASHBOARD_REFS,
  METING_BESTANDEN,
  METING_MAP_APP,
  dashboardBestand,
  dashboardRepo,
  kopVoorMeting,
  naarApp,
} from './meting-bron.mjs';

const hier = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(hier, '..');
const repo = dashboardRepo(process.argv[2]);
if (!repo) {
  console.error('Dashboardrepo niet gevonden. Geef het pad mee of zet BOSSBASE_DASHBOARD.');
  process.exit(1);
}
const refs = process.argv[3] ? [process.argv[3]] : DASHBOARD_REFS;

for (const { bron, doel, vervang } of METING_BESTANDEN) {
  const ref = refs.find((r) => dashboardBestand(repo, r, bron) !== null);
  if (!ref) {
    console.error(`${bron} staat niet in ${repo} (${refs.join(', ')})`);
    process.exit(1);
  }
  const inhoud = dashboardBestand(repo, ref, bron);
  const commit = execFileSync('git', ['-C', repo, 'log', '-1', '--format=%h', ref, '--', bron], { encoding: 'utf8' }).trim();
  writeFileSync(join(appRoot, METING_MAP_APP, doel), kopVoorMeting(bron, commit) + naarApp(inhoud, vervang));
  console.log(`${doel}  ←  ${bron} @ ${commit} (${ref})`);
}
