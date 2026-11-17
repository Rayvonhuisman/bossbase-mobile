// Werkt alle vertalingen bij na een wijziging in de Nederlandse tekst.
//
//   node scripts/vertalingen-bijwerken.mjs            alles bijwerken
//   node scripts/vertalingen-bijwerken.mjs --droog    alleen laten zien wat er zou gebeuren
//   node scripts/vertalingen-bijwerken.mjs --taal de  één taal
//   node scripts/vertalingen-bijwerken.mjs --init     bronHash zetten in vertaalde artikelen die er nog geen hebben
//   node scripts/vertalingen-bijwerken.mjs --init-alles  bronHash overal op de huidige bron zetten (na een
//                                                        handmatige vertaling van een gewijzigd artikel)
//
// Wat het doet (instellingen in scripts/vertalingen.config.mjs):
// 1. Schermtekst (tx/txn/txm): draait de scanner(s), zoekt per taal de
//    Nederlandse teksten zonder vertaling, laat die vertalen en haalt
//    vertalingen weg waarvan de Nederlandse tekst niet meer bestaat. Een
//    gewijzigde Nederlandse zin is een nieuwe sleutel, dus die wordt vanzelf
//    opnieuw vertaald.
// 2. Artikelen (Markdown, alleen de website): elk vertaald bestand bewaart in
//    zijn kop "bronHash", een vingerafdruk van het Nederlandse bestand. Is de
//    bron veranderd, of bestaat de vertaling nog niet, dan wordt het artikel
//    (opnieuw) vertaald. De vorige vertaling gaat mee als voorbeeld, zodat de
//    woordkeuze gelijk blijft.
//
// Vertalen gebeurt met Claude. Met ANTHROPIC_API_KEY (GitHub Action) via de
// API; zonder sleutel lokaal via de `claude`-opdrachtregel (Claude Code). Elke
// vertaling wordt gecontroleerd (plaatshouders, meervoud, kop van het artikel,
// koppen en links) voordat hij wordt opgeslagen; wat niet klopt blijft
// onvertaald en wordt gemeld.
//
// Regels en woordenlijst: het LEESMIJ-bestand uit de config (dezelfde als voor
// mensen en agents).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { default: CONFIG } = await import('./vertalingen.config.mjs');
const args = process.argv.slice(2);
const DROOG = args.includes('--droog');
const INIT_ALLES = args.includes('--init-alles');
const INIT = args.includes('--init') || INIT_ALLES;
const alleenTaal = args.includes('--taal') ? args[args.indexOf('--taal') + 1] : null;
const TALEN = CONFIG.talen.filter(t => !alleenTaal || t === alleenTaal);
const MODEL = process.env.VERTAAL_MODEL || 'claude-opus-5-5';

const lees = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const leesJson = p => (fs.existsSync(path.join(ROOT, p)) ? JSON.parse(lees(p)) : {});
const schrijfJson = (p, d) => {
  const gesorteerd = Object.fromEntries(Object.keys(d).sort().map(k => [k, d[k]]));
  fs.writeFileSync(path.join(ROOT, p), JSON.stringify(gesorteerd, null, 1) + '\n');
};
const houders = s => [...String(s).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');
const bronTekst = k => (k.includes('::') ? k.split('::').slice(1).join('::') : k);
const context = k => (k.includes('::') ? k.split('::')[0] : null);

// ── Woordenlijst uit het LEESMIJ-bestand ─────────────────────────────────────
const LEESMIJ = lees(CONFIG.leesmij);
function woordenlijst(taal) {
  const regels = LEESMIJ.split('\n').filter(r => r.startsWith('|'));
  const kop = regels[0]?.split('|').map(c => c.trim()) || [];
  const kolom = kop.indexOf(taal);
  if (kolom < 0) return '';
  return regels.slice(2).map(r => r.split('|').map(c => c.trim())).filter(c => c[1] && c[kolom])
    .map(c => `- ${c[1]} → ${c[kolom]}`).join('\n');
}
const TAALNAMEN = { en: 'British English', de: 'German', fr: 'French (use a non-breaking space U+00A0 before : ; ? ! %)', es: 'Spanish (Spain)', pt: 'European Portuguese (pt-PT, informal "tu")', pl: 'Polish', ro: 'Romanian (ș/ț with comma below)', bg: 'Bulgarian', uk: 'Ukrainian (modern, no russicisms)', tr: 'Turkish (rephrase so no case suffix is attached to a {placeholder})' };
const PLURAL = taal => new Intl.PluralRules(taal).resolvedOptions().pluralCategories;

function systeem(taal, soort) {
  return `You translate text for BossBase, Dutch business software for trade companies in the Netherlands (painters, installers, gardeners, contractors): customers, quotes, scheduling, work orders, hours, invoices. Users are often tradespeople and office staff who speak ${TAALNAMEN[taal] || taal} as their native language. Translate from Dutch into ${TAALNAMEN[taal] || taal}.

Write it the way a native speaker would in a good, modern software product: natural, clear, informal (address the user as "you" in the informal form), short for buttons and labels. Never word-for-word or stiff. Keep facts, numbers, prices and promises exactly as in the Dutch; add nothing.

Rules:
- Keep every {placeholder} exactly (same names, not translated); its position may change.
- Do not translate brand and plan names: BossBase, Boss, Moneybird, SnelStart, AFAS, Stripe, iDEAL, Starter, Groei, Team, Basis, Compleet, Pro, KvK, IBAN.
- Never use a word for "monteur" (mechanic/fitter); use the word for "employee".
- Dutch laws and institutions keep their Dutch name, with a short explanation where useful.
- Keep leading/trailing spaces and line breaks (\\n) as in the source.

Fixed terms for ${taal} (use these consistently):
${woordenlijst(taal)}
${soort === 'ui' ? CONFIG.uiExtra || '' : CONFIG.artikelExtra || ''}`;
}

// ── Claude aanroepen: API of de claude-opdrachtregel ─────────────────────────
let api = null;
async function claude({ system, prompt, schema, maxTokens }) {
  if (process.env.ANTHROPIC_API_KEY) {
    if (!api) { const { default: Anthropic } = await import('@anthropic-ai/sdk'); api = new Anthropic(); }
    const stream = api.beta.messages.stream({
      model: MODEL,
      max_tokens: maxTokens,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'high', ...(schema ? { format: { type: 'json_schema', schema } } : {}) },
      system,
      messages: [{ role: 'user', content: prompt }],
    });
    const msg = await stream.finalMessage();
    if (msg.stop_reason === 'refusal') throw new Error(`geweigerd (${msg.stop_details?.category || 'onbekend'})`);
    if (msg.stop_reason === 'max_tokens') throw new Error('antwoord afgekapt (max_tokens)');
    const tekst = msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
    return schema ? JSON.parse(tekst) : tekst;
  }
  // Lokaal zonder sleutel: Claude Code in de headless-stand.
  const cli = ['-p', '--output-format', 'json', '--model', 'opus', '--append-system-prompt', system];
  if (schema) cli.push('--json-schema', JSON.stringify(schema));
  const r = spawnSync('claude', cli, { input: prompt, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw new Error(`geen ANTHROPIC_API_KEY en de claude-opdrachtregel werkt niet: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`claude gaf foutcode ${r.status}: ${(r.stderr || '').slice(0, 300)}`);
  const uit = JSON.parse(r.stdout);
  if (uit.is_error) throw new Error(`claude: ${String(uit.result).slice(0, 300)}`);
  if (schema) return uit.structured_output ?? JSON.parse(uit.result);
  return uit.result;
}

// ── 1. Schermtekst ──────────────────────────────────────────────────────────
const BATCH = 120;
const SCHEMA_UI = {
  type: 'object',
  additionalProperties: false,
  required: ['vertalingen'],
  properties: {
    vertalingen: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['i', 'tekst', 'vormen'],
        properties: {
          i: { type: 'integer' },
          tekst: { type: 'string', description: 'Translation (for non-plural items). Empty string for plural items.' },
          vormen: {
            type: 'object',
            additionalProperties: false,
            required: ['one', 'few', 'many', 'other'],
            description: 'Plural forms (only for plural items; use empty strings otherwise and for categories the language does not use).',
            properties: { one: { type: 'string' }, few: { type: 'string' }, many: { type: 'string' }, other: { type: 'string' } },
          },
        },
      },
    },
  },
};

async function vertaalUi(doel, taal, bron, boek) {
  const mist = Object.keys(bron).filter(k => boek[k] == null || boek[k] === '');
  if (!mist.length) return 0;
  console.log(`  ${doel.naam}/${taal}: ${mist.length} te vertalen`);
  if (DROOG) return 0;
  // Bestaande vertalingen als voorbeeld van toon en termen.
  const voorbeelden = Object.keys(boek).filter(k => typeof boek[k] === 'string').slice(0, 60)
    .map(k => `${JSON.stringify(bronTekst(k))} → ${JSON.stringify(boek[k])}`).join('\n');
  const vormen = PLURAL(taal);
  let gedaan = 0;
  for (let b = 0; b < mist.length; b += BATCH) {
    const stuk = mist.slice(b, b + BATCH);
    const items = stuk.map((k, i) => ({
      i,
      tekst: bron[k].soort === 'meervoud' ? undefined : bronTekst(k),
      meervoud: bron[k].soort === 'meervoud' ? { een: bronTekst(k).split('|')[0], meer: bronTekst(k).split('|').slice(1).join('|') } : undefined,
      context: context(k) || undefined,
      bestand: bron[k].bestanden?.[0],
    }));
    const prompt = `Translate these Dutch interface texts. "context" tells what kind of word it is; "bestand" is the source file it appears in.
For a plural item ("meervoud": Dutch singular "een" and plural "meer", {n} is the count) fill "vormen" with the plural categories this language uses: ${vormen.join(', ')}; leave the other categories as empty strings and "tekst" empty. For normal items fill "tekst" and leave "vormen" empty strings.

Existing translations, for tone and terms:
${voorbeelden}

Items:
${JSON.stringify(items, null, 1)}`;
    let uit;
    try {
      uit = await claude({ system: systeem(taal, 'ui'), prompt, schema: SCHEMA_UI, maxTokens: 32000 });
    } catch (e) {
      console.log(`    ! ${e.message}`);
      continue;
    }
    for (const v of uit.vertalingen || []) {
      const k = stuk[v.i];
      if (!k) continue;
      if (bron[k].soort === 'meervoud') {
        const obj = Object.fromEntries(Object.entries(v.vormen || {}).filter(([c, t]) => vormen.includes(c) && t));
        const meer = bronTekst(k).split('|').slice(1).join('|');
        const een = bronTekst(k).split('|')[0];
        if (!obj.other || Object.values(obj).some(t => houders(t) !== houders(meer) && houders(t) !== houders(een))) {
          console.log(`    ! meervoud klopt niet: ${k}`);
          continue;
        }
        boek[k] = obj;
      } else {
        if (!v.tekst || houders(v.tekst) !== houders(bronTekst(k))) {
          console.log(`    ! plaatshouders kloppen niet: ${k}`);
          continue;
        }
        boek[k] = v.tekst;
      }
      gedaan++;
    }
  }
  return gedaan;
}

// ── 2. Artikelen ────────────────────────────────────────────────────────────
const hash = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
function splits(bron, id) {
  const m = bron.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!m) throw new Error(`${id}: kop tussen --- ontbreekt`);
  return { kop: JSON.parse(m[1]), tekst: m[2] };
}
const koppen = t => (t.match(/^#{2,3} /gm) || []).length;
const links = t => [...t.matchAll(/\]\(([^)]+)\)/g)].map(m => m[1]).join(' ');
const VAST = ['type', 'path', 'volgorde', 'gepubliceerd', 'gewijzigd', 'bronnenGecontroleerd', 'onderwerp'];

function controleerArtikel(nl, vert) {
  const fouten = [];
  for (const v of VAST) if (JSON.stringify(nl.kop[v]) !== JSON.stringify(vert.kop[v])) fouten.push(`${v} gewijzigd`);
  if (JSON.stringify(nl.kop.ai?.onderdelen) !== JSON.stringify(vert.kop.ai?.onderdelen)) fouten.push('ai.onderdelen gewijzigd');
  if (JSON.stringify(Object.keys(nl.kop).sort()) !== JSON.stringify(Object.keys(vert.kop).filter(k => k !== 'bronHash').sort())) fouten.push('andere sleutels in de kop');
  if (koppen(nl.tekst) !== koppen(vert.tekst)) fouten.push(`aantal koppen ${koppen(vert.tekst)} ≠ ${koppen(nl.tekst)}`);
  if (links(nl.tekst) !== links(vert.tekst)) fouten.push('linkdoelen verschillen');
  if (nl.kop.cta?.href !== vert.kop.cta?.href) fouten.push('cta.href gewijzigd');
  return fouten;
}

async function vertaalArtikelen() {
  if (!CONFIG.artikelen) return;
  const { bronMappen, vertaaldMap } = CONFIG.artikelen;
  for (const map of bronMappen) {
    for (const bestand of fs.readdirSync(path.join(ROOT, map)).filter(f => f.endsWith('.md')).sort()) {
      const bronPad = path.join(map, bestand);
      const bron = lees(bronPad);
      const h = hash(bron);
      const nl = splits(bron, bronPad);
      for (const taal of TALEN) {
        const doelPad = path.join(vertaaldMap, taal, path.basename(map), bestand);
        const bestaat = fs.existsSync(path.join(ROOT, doelPad));
        const oud = bestaat ? lees(doelPad) : null;
        const oudKop = oud ? splits(oud, doelPad).kop : null;
        if (INIT) {
          if (oud && (INIT_ALLES || !oudKop.bronHash)) {
            const nieuw = oud.replace(/^---\s*\n[\s\S]*?\n---/, `---\n${JSON.stringify({ ...oudKop, bronHash: h }, null, 2)}\n---`);
            fs.writeFileSync(path.join(ROOT, doelPad), nieuw);
          }
          continue;
        }
        if (oudKop?.bronHash === h) continue;
        console.log(`  artikel ${doelPad}: ${bestaat ? 'bron gewijzigd' : 'nieuw'}`);
        if (DROOG) continue;
        const prompt = `Translate this Dutch website article (a JSON head between --- lines, then Markdown) into ${TAALNAMEN[taal] || taal}. Return ONLY the complete translated file, nothing else.

In the JSON head:
- Translate: title, description, kruimel, kicker, h1, lead, noot, puntenTitel, punten[].titel/tekst, stappen.titel/intro, stappen.items[].titel/tekst, faq[].v/a, gerelateerd[].titel/tekst, slot.titel, ai.titel/lead, beeld.alt, beeld.bijschrift, samenvatting, cta.titel/tekst/label, cta2.label, downloads[].label/tekst/paginaTitel.
- Do NOT change: type, path, volgorde, gepubliceerd, gewijzigd, bronnenGecontroleerd, onderwerp, ai.onderdelen, any href/src/url/bestand/naam/width/height/formaat/pagina, bronnen[].url and bronnen[].uitgever, and "gerelateerd" when it is a list of paths. bronnen[].titel: keep the Dutch title and add a short translation in brackets.
- If cta.label is exactly "Start 14 dagen gratis", keep it exactly like that (Dutch).
- title ends with " | BossBase" like the source, at most 65 characters; description at most 160 characters.
- The head must stay valid JSON (escape double quotes).
In the Markdown: translate everything, keep the same headings (##, ###), tables and checklists; translate link text but never link targets.
${oud ? `\nThe previous translation of an earlier version of this article is below. Reuse its wording and terms wherever the meaning is unchanged; only change what the new Dutch source changes.\n\nPREVIOUS TRANSLATION:\n${oud}\n` : ''}
DUTCH SOURCE:
${bron}`;
        try {
          let uit = await claude({ system: systeem(taal, 'artikel'), prompt, maxTokens: 64000 });
          uit = uit.trim().replace(/^```[a-z]*\n|\n```$/g, '');
          const vert = splits(uit, doelPad);
          const fouten = controleerArtikel(nl, vert);
          if (fouten.length) { console.log(`    ! niet opgeslagen: ${fouten.join('; ')}`); continue; }
          vert.kop.bronHash = h;
          fs.mkdirSync(path.dirname(path.join(ROOT, doelPad)), { recursive: true });
          fs.writeFileSync(path.join(ROOT, doelPad), `---\n${JSON.stringify(vert.kop, null, 2)}\n---\n${vert.tekst.replace(/^\n+/, '')}`);
          console.log('    opgeslagen');
        } catch (e) {
          console.log(`    ! ${e.message}`);
        }
      }
    }
  }
}

// ── Draaien ─────────────────────────────────────────────────────────────────
if (!INIT) {
  for (const doel of CONFIG.schermtekst) {
    for (const opdracht of doel.scan) {
      const r = spawnSync('node', opdracht, { cwd: ROOT, encoding: 'utf8' });
      if (r.status !== 0 && !/vertaald/.test(r.stdout || '')) {
        console.error(`Scanner ${opdracht.join(' ')} faalde:\n${r.stdout}${r.stderr}`);
        process.exit(1);
      }
    }
    const bron = leesJson(doel.bron);
    console.log(`${doel.naam}: ${Object.keys(bron).length} teksten`);
    for (const taal of TALEN) {
      const p = `${doel.map}/${taal}.json`;
      const boek = leesJson(p);
      // Vertalingen van teksten die niet meer bestaan: weg.
      let weg = 0;
      for (const k of Object.keys(boek)) if (!(k in bron)) { delete boek[k]; weg++; }
      const nieuw = await vertaalUi(doel, taal, bron, boek);
      if (!DROOG && (nieuw || weg)) {
        schrijfJson(p, boek);
        console.log(`  ${doel.naam}/${taal}: ${nieuw} vertaald, ${weg} verouderd verwijderd`);
      }
    }
  }
}
await vertaalArtikelen();
console.log(DROOG ? 'Droog: niets opgeslagen.' : 'Klaar.');
