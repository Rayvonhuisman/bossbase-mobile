// ── OVERGENOMEN UIT HET DASHBOARD — niet met de hand bewerken ──
// Bron: BossBase src/lib/metingVelden.js
// Dashboardcommit: 07b8184
// Bijwerken: node scripts/meting-overnemen.mjs (daarna npm test).
// Alles onder deze kop is een letterlijke kopie (zie scripts/meting-bron.mjs);
// tests/metingen.test.mjs vergelijkt het met het dashboard.
// ── einde overgenomen kop ──
import { brancheVelden, PER_BRANCHE, ALGEMEEN } from './metingVelden.js';

// Metingen: soorten, de berekening voor het scherm, en de velden per branche.
//
// De database rekent de echte waarde uit (gegenereerde kolom metingen.waarde,
// migratie 20261022120000). berekenMeting() hieronder doet precies hetzelfde,
// alleen om tijdens het typen al "4 × 1,2 × 1,0 = 4,8 m²" te kunnen tonen. Wijzig
// je de formule, wijzig dan beide.

export const SOORTEN = [
  { value: 'oppervlak', label: 'Oppervlak', eenheid: 'm²', uitleg: 'breedte × hoogte' },
  { value: 'lengte',    label: 'Lengte',    eenheid: 'm',  uitleg: 'strekkende meter' },
  { value: 'stuks',     label: 'Stuks',     eenheid: 'stuk', uitleg: 'alleen het aantal' },
  { value: 'inhoud',    label: 'Inhoud',    eenheid: 'm³', uitleg: 'breedte × hoogte × diepte' },
];

export const MAAT_EENHEDEN = ['mm', 'cm', 'm'];

const FACTOR = { mm: 0.001, cm: 0.01, m: 1 };

const getal = v => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v));

// Welke maatvelden een soort gebruikt (voor het formulier).
export function maatVelden(soort) {
  if (soort === 'stuks') return [];
  if (soort === 'lengte') return ['breedte'];
  if (soort === 'inhoud') return ['breedte', 'hoogte', 'diepte'];
  return ['breedte', 'hoogte'];
}

export function soortEenheid(soort) {
  return SOORTEN.find(s => s.value === soort)?.eenheid || 'stuk';
}

// Zelfde formule als de database. Null als er een benodigde maat ontbreekt.
export function berekenMeting(m) {
  const f = FACTOR[m.eenheid] ?? 0.001;
  const aantal = getal(m.aantal) ?? 1;
  const b = getal(m.breedte), h = getal(m.hoogte), d = getal(m.diepte);
  let w = null;
  if (m.soort === 'stuks') w = aantal;
  else if (m.soort === 'lengte') { const l = b ?? h ?? d; w = l == null ? null : aantal * l * f; }
  else if (m.soort === 'inhoud') w = b == null || h == null || d == null ? null : aantal * b * f * h * f * d * f;
  else { const h2 = h ?? d; w = b == null || h2 == null ? null : aantal * b * f * h2 * f; }
  return w == null ? null : Math.round(w * 1000) / 1000;
}

const nl = (n, max = 3) => Number(n).toLocaleString('nl-NL', { maximumFractionDigits: max });
// Maten zonder duizendtalpunt: "1250 × 1480 mm", zoals een vakman ze schrijft.
const maat = n => Number(n).toLocaleString('nl-NL', { maximumFractionDigits: 3, useGrouping: false });

export function toonWaarde(waarde, eenheid) {
  if (waarde == null) return '';
  return `${nl(waarde, eenheid === 'stuk' ? 0 : 2)} ${eenheid === 'stuk' ? (Number(waarde) === 1 ? 'stuk' : 'stuks') : eenheid}`;
}

// "4 × 1,2 × 1,0 = 4,8 m²": de maten in meters, zodat de som klopt met de
// uitkomst. Bij stuks alleen het aantal.
export function toonSom(m) {
  const w = berekenMeting(m);
  if (w == null) return '';
  const eenheid = soortEenheid(m.soort);
  if (m.soort === 'stuks') return toonWaarde(w, eenheid);
  const f = FACTOR[m.eenheid] ?? 0.001;
  const delen = maatVelden(m.soort)
    .map(k => getal(m[k]) ?? (k === 'hoogte' && m.soort === 'oppervlak' ? getal(m.diepte) : null))
    .filter(v => v != null)
    .map(v => nl(v * f, 3));
  const aantal = getal(m.aantal) ?? 1;
  return `${aantal !== 1 ? `${nl(aantal)} × ` : ''}${delen.join(' × ')} = ${toonWaarde(w, eenheid)}`;
}

// Korte maat in de ingevoerde eenheid: "1200 × 1000 mm".
export function toonMaat(m) {
  const delen = ['breedte', 'hoogte', 'diepte'].map(k => getal(m[k])).filter(v => v != null).map(maat);
  if (!delen.length) return '';
  return `${delen.join(' × ')} ${m.eenheid || 'mm'}`;
}

// ── Velden per branche ──────────────────────────────────────────────────────
// De lijst staat in supabase/functions/_shared/metingVelden.js: de edge function
// metingen-uitlezen gebruikt dezelfde.
export { brancheVelden };

// Voor het tonen van opgeslagen extra velden. Een sleutel uit een andere branche
// (bedrijf heeft de branche gewijzigd) blijft zichtbaar met de sleutel als label.
export function extraRegels(extra, branche) {
  const velden = brancheVelden(branche);
  const alle = [...velden, ...PER_BRANCHE.flatMap(p => p.velden), ...ALGEMEEN];
  return Object.entries(extra || {})
    .filter(([, v]) => String(v ?? '').trim())
    .map(([k, v]) => ({ key: k, label: alle.find(x => x.key === k)?.label || k, waarde: String(v) }));
}

// Wat er in de bestandskeuze mag. DXF/DWG bewust niet: Claude leest die niet
// en de meetapps zetten de maten er niet bruikbaar in. Vraag dan om de PDF.
export const DOCUMENT_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.gif,.heic,.heif,.csv,.txt,.xlsx,.xls,application/pdf,image/*,text/csv,text/plain';
export const DOCUMENT_MAX = 25 * 1024 * 1024;
