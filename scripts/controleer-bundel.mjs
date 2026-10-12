#!/usr/bin/env node
/**
 * Controleert een webexport (standaard `dist`) op dingen die nooit naar een
 * browser mogen: geheime sleutels, privétokens, wachtwoorden, broncode en
 * sourcemaps.
 *
 * Meldt alleen het bestand en de soort bevinding — nooit de gevonden waarde
 * zelf, zodat een uitgelekt geheim niet alsnog in een log of CI-uitvoer belandt.
 *
 * Toegestaan in de bundel: de publieke Supabase-URL van het BossBase-project en
 * de publieke "anon"-sleutel (een JWT met rol `anon`, of een `sb_publishable_`).
 * Die zijn bedoeld voor de client; RLS beschermt de data.
 *
 * Gebruik: node scripts/controleer-bundel.mjs [exportmap]
 * Exitcode 1 bij een bevinding.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const VERWACHT_SUPABASE = 'mawzqpnsluljxpbarhng.supabase.co';

/** Patronen zonder legitiem gebruik in een frontend. */
const VERBODEN = [
  ['Supabase secret key (sb_secret_)', /sb_secret_[A-Za-z0-9_-]{10,}/],
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |)PRIVATE KEY-----/],
  ['GitHub-token', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}/],
  ['Stripe live secret key', /\bsk_live_[A-Za-z0-9]{16,}/],
  ['Anthropic/OpenAI API-sleutel', /\bsk-(?:ant-|proj-)[A-Za-z0-9_-]{20,}/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['Slack-token', /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
  ['Google API-sleutel', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['Vercel-token', /\bvercel_[A-Za-z0-9]{24,}/i],
  ['Postgres-verbinding met wachtwoord', /postgres(?:ql)?:\/\/[^\s:'"/]+:[^\s@'"]+@/],
  ['wachtwoord als letterlijke waarde', /\b(?:password|passwd|wachtwoord)\s*[:=]\s*["'][^"'\s]{6,}["']/i],
];

const JWT = /eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
const SUPABASE_HOST = /\b([a-z0-9]{20})\.supabase\.co\b/g;

/** Bestanden die niet in een publieke export horen. */
const VERBODEN_BESTAND = [
  ['sourcemap', (p) => p.endsWith('.map')],
  ['omgevingsbestand', (p) => /(^|\/)\.env(\.|$)/.test(p)],
  ['TypeScript-bron', (p) => /\.(ts|tsx)$/.test(p) && !p.endsWith('.d.ts')],
  ['Git-map', (p) => p.split('/').includes('.git')],
];

const TEKST = new Set(['.js', '.mjs', '.html', '.json', '.css', '.webmanifest', '.txt', '.map', '']);

async function alleBestanden(map) {
  const uit = [];
  for (const naam of await readdir(map)) {
    const pad = join(map, naam);
    if ((await stat(pad)).isDirectory()) uit.push(...(await alleBestanden(pad)));
    else uit.push(pad);
  }
  return uit;
}

function jwtRol(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return typeof payload.role === 'string' ? payload.role : '(geen rol)';
  } catch {
    return null; // geen echte JWT
  }
}

export async function controleerBundel(map) {
  const bevindingen = [];
  let anonSleutels = 0;
  const hosts = new Set();

  for (const pad of await alleBestanden(map)) {
    const rel = relative(map, pad).split('\\').join('/');
    for (const [soort, test] of VERBODEN_BESTAND) {
      if (test(rel)) bevindingen.push({ bestand: rel, soort });
    }
    if (!TEKST.has(extname(pad))) continue;
    const inhoud = await readFile(pad, 'utf8');

    for (const [soort, patroon] of VERBODEN) {
      if (patroon.test(inhoud)) bevindingen.push({ bestand: rel, soort });
    }
    for (const [token] of inhoud.matchAll(JWT)) {
      const rol = jwtRol(token);
      if (rol === null) continue;
      if (rol === 'anon') anonSleutels += 1;
      else bevindingen.push({ bestand: rel, soort: `JWT met rol "${rol}"` });
    }
    for (const [, ref] of inhoud.matchAll(SUPABASE_HOST)) hosts.add(`${ref}.supabase.co`);
  }

  for (const host of hosts) {
    if (host !== VERWACHT_SUPABASE) {
      bevindingen.push({ bestand: '(bundel)', soort: `onverwacht Supabase-project ${host}` });
    }
  }
  return { bevindingen, anonSleutels, hosts: [...hosts] };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const map = process.argv[2] ?? 'dist';
  const { bevindingen, anonSleutels, hosts } = await controleerBundel(map);
  for (const b of bevindingen) console.error(`✖ ${b.bestand}: ${b.soort}`);
  console.log(
    `Bundelcontrole ${map}: ${bevindingen.length} bevinding(en); ` +
      `${anonSleutels}× publieke anon-sleutel; Supabase: ${hosts.join(', ') || 'geen'}.`,
  );
  process.exit(bevindingen.length ? 1 : 0);
}
