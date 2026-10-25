#!/usr/bin/env node
/**
 * Neemt de mailopmaak van het dashboard over in src/lib/mail/vendored/.
 * Zie scripts/mail-bron.mjs voor welke bestanden en waarom.
 *
 * Gebruik: node scripts/mail-overnemen.mjs [pad-naar-BossBase]
 * Standaard ../BossBase naast deze repo, of $BOSSBASE_DASHBOARD.
 * Neemt de gecommitte versie (HEAD), niet wat er toevallig onopgeslagen staat.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAIL_BESTANDEN, MAIL_MAP_DASHBOARD, kopVoor, normaliseer, dashboardRepo } from './mail-bron.mjs';

const hier = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(hier, '..');
const repo = dashboardRepo(process.argv[2]);
if (!repo) {
  console.error('Dashboardrepo niet gevonden. Geef het pad mee of zet BOSSBASE_DASHBOARD.');
  process.exit(1);
}

const doelMap = join(appRoot, 'src/lib/mail/vendored');
mkdirSync(doelMap, { recursive: true });
for (const naam of MAIL_BESTANDEN) {
  const bron = `${MAIL_MAP_DASHBOARD}/${naam}`;
  const inhoud = execFileSync('git', ['-C', repo, 'show', `HEAD:${bron}`], { encoding: 'utf8' });
  const commit = execFileSync('git', ['-C', repo, 'log', '-1', '--format=%h', 'HEAD', '--', bron], { encoding: 'utf8' }).trim();
  writeFileSync(join(doelMap, naam), kopVoor(bron, commit) + normaliseer(inhoud));
  console.log(`${naam}  ←  ${bron} @ ${commit}`);
}
