/**
 * Vercel-configuratie en de bundelscanner. Een verkeerde regel hier maakt een
 * featurebranch tot productie, of laat een geheim ongemerkt de bundel in.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { controleerBundel } from '../scripts/controleer-bundel.mjs';

const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
const header = (bron, naam) =>
  vercel.headers.find((h) => h.source === bron)?.headers.find((h) => h.key === naam)?.value;

test('Git-deployments: alleen main en feature/pwa-web, al het andere uit', () => {
  const regels = vercel.git.deploymentEnabled;
  assert.equal(regels['*'], false);
  assert.equal(regels['**'], false);
  for (const [branch, aan] of Object.entries(regels)) {
    if (aan) assert.ok(['main', 'feature/pwa-web'].includes(branch), branch);
  }
});

test('beveiligingsheaders op elke pagina', () => {
  const csp = header('/(.*)', 'Content-Security-Policy');
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self'(;|$)/);
  assert.doesNotMatch(csp, /unsafe-eval/);
  assert.match(csp, /connect-src[^;]*https:\/\/mawzqpnsluljxpbarhng\.supabase\.co/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(header('/(.*)', 'Strict-Transport-Security'), /max-age=\d{7,}/);
  assert.equal(header('/(.*)', 'X-Content-Type-Options'), 'nosniff');
  assert.equal(header('/(.*)', 'X-Frame-Options'), 'DENY');
});

test('sw.js wordt nooit door de browser gecachet', () => {
  assert.match(header('/sw.js', 'Cache-Control'), /no-store/);
});

async function exportMet(bestanden) {
  const map = await mkdtemp(join(tmpdir(), 'bundel-'));
  for (const [pad, inhoud] of Object.entries(bestanden)) {
    await mkdir(join(map, pad, '..'), { recursive: true });
    await writeFile(join(map, pad), inhoud);
  }
  return map;
}
const jwt = (payload) =>
  ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify(payload)).toString('base64url'), 'handtekening123'].join('.');

test('bundelscanner: publieke anon-sleutel en eigen Supabase-project mogen', async () => {
  const map = await exportMet({
    'a.js': `const u="https://mawzqpnsluljxpbarhng.supabase.co",k="${jwt({ role: 'anon' })}";`,
  });
  const r = await controleerBundel(map);
  assert.deepEqual(r.bevindingen, []);
  assert.equal(r.anonSleutels, 1);
});

test('bundelscanner: service-role, geheimen, sourcemaps en vreemde projecten vallen op', async () => {
  const map = await exportMet({
    'a.js': `k="${jwt({ role: 'service_role' })}";s="sb_secret_abcdefghijklmnop";p={password:"hunter22"}`,
    'b.js': 'u="https://abcdefghijklmnopqrst.supabase.co"',
    'a.js.map': '{}',
    'src/x.tsx': '',
  });
  const soorten = (await controleerBundel(map)).bevindingen.map((b) => b.soort).join(' | ');
  for (const verwacht of ['service_role', 'sb_secret_', 'wachtwoord', 'sourcemap', 'TypeScript-bron', 'onverwacht Supabase']) {
    assert.ok(soorten.includes(verwacht), `${verwacht} niet gevonden in: ${soorten}`);
  }
  // De waarde zelf komt nooit in een bevinding.
  assert.ok(!soorten.includes('hunter22'));
});
