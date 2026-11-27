// ── OVERGENOMEN UIT HET DASHBOARD — niet met de hand bewerken ──
// Bron: BossBase src/lib/metingVelden.js
// Dashboardcommit: 6e48da59
// Bijwerken: node scripts/meting-overnemen.mjs (daarna npm test).
// Alles onder deze kop is een letterlijke kopie (zie scripts/meting-bron.mjs);
// tests/metingen.test.mjs vergelijkt het met het dashboard.
// ── einde overgenomen kop ──
import { brancheVelden, PER_BRANCHE, ALGEMEEN } from './metingVelden.js';
import { tx } from '@/i18n';

// Metingen: soorten, de berekening voor het scherm, en de velden per branche.
//
// De database rekent de echte waarde uit (gegenereerde kolom metingen.waarde,
// functie bb_meting_waarde, migratie 20261127160000). berekenMeting() hieronder
// doet precies hetzelfde, alleen om tijdens het typen al "4 × 1,2 × 1,0 = 4,8 m²"
// te kunnen tonen. Wijzig je de formule, wijzig dan beide.
//
// Aftrekposten (m.aftrekposten: [{ naam, breedte, hoogte, diepte, aantal }], in
// de eenheid van de meting) gaan van de waarde af, nooit onder 0. Per post:
// oppervlak breedte × hoogte, lengte en omtrek één lengte, inhoud b × h × d,
// stuks het aantal. Omtrek is 2 × (breedte + hoogte): een kozijn rondom.

export const SOORTEN = [
  // label en uitleg zijn getters: ze volgen de gekozen taal. eenheid blijft
  // zoals hij is (gaat mee in de omschrijving van een offerteregel).
  { value: 'oppervlak', get label() { return tx('Oppervlak'); }, eenheid: 'm²', get uitleg() { return tx('breedte × hoogte'); } },
  { value: 'lengte',    get label() { return tx('Lengte'); },    eenheid: 'm',  get uitleg() { return tx('strekkende meter'); } },
  { value: 'omtrek',    get label() { return tx('Omtrek'); },    eenheid: 'm',  get uitleg() { return tx('2 × (breedte + hoogte), bijvoorbeeld een kozijn'); } },
  { value: 'stuks',     get label() { return tx('Stuks'); },     eenheid: 'stuk', get uitleg() { return tx('alleen het aantal'); } },
  { value: 'inhoud',    get label() { return tx('Inhoud'); },    eenheid: 'm³', get uitleg() { return tx('breedte × hoogte × diepte'); } },
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

// Welke maten een aftrekpost van deze soort heeft.
export function aftrekVelden(soort) {
  if (soort === 'stuks') return [];
  if (soort === 'lengte' || soort === 'omtrek') return ['breedte'];
  if (soort === 'inhoud') return ['breedte', 'hoogte', 'diepte'];
  return ['breedte', 'hoogte'];
}

export function soortEenheid(soort) {
  return SOORTEN.find(s => s.value === soort)?.eenheid || 'stuk';
}

// Aftrek van één meting, in m², m, m³ of stuks (zelfde regel als de database).
export function berekenAftrek(m) {
  const f = FACTOR[m.eenheid] ?? 0.001;
  return (Array.isArray(m.aftrekposten) ? m.aftrekposten : []).reduce((som, p) => {
    const a = getal(p.aantal) ?? 1;
    const b = getal(p.breedte), h = getal(p.hoogte), d = getal(p.diepte);
    let w = null;
    if (m.soort === 'stuks') w = 1;
    else if (m.soort === 'lengte' || m.soort === 'omtrek') { const l = b ?? h ?? d; w = l == null ? null : l * f; }
    else if (m.soort === 'inhoud') w = b == null || h == null || d == null ? null : b * f * h * f * d * f;
    else { const h2 = h ?? d; w = b == null || h2 == null ? null : b * f * h2 * f; }
    return w == null ? som : som + a * w;
  }, 0);
}

// Bruto waarde (zonder aftrek). Null als er een benodigde maat ontbreekt.
function bruto(m) {
  const f = FACTOR[m.eenheid] ?? 0.001;
  const aantal = getal(m.aantal) ?? 1;
  const b = getal(m.breedte), h = getal(m.hoogte), d = getal(m.diepte);
  if (m.soort === 'stuks') return aantal;
  if (m.soort === 'lengte') { const l = b ?? h ?? d; return l == null ? null : aantal * l * f; }
  if (m.soort === 'omtrek') return b == null || h == null ? null : aantal * 2 * (b * f + h * f);
  if (m.soort === 'inhoud') return b == null || h == null || d == null ? null : aantal * b * f * h * f * d * f;
  const h2 = h ?? d;
  return b == null || h2 == null ? null : aantal * b * f * h2 * f;
}

// Zelfde formule als de database. Null als er een benodigde maat ontbreekt.
export function berekenMeting(m) {
  const w = bruto(m);
  if (w == null) return null;
  return Math.max(0, Math.round((w - berekenAftrek(m)) * 1000) / 1000);
}

// toonWaarde, toonSom en toonMaat blijven Nederlands ('nl-NL', "stuks"): ze
// komen ook in de omschrijving van een offerteregel (MetingenNaarRegels).
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
  const maten = m.soort === 'omtrek' ? `2 × (${delen.join(' + ')})` : delen.join(' × ');
  const aftrek = berekenAftrek(m);
  // "26,08 × 2,45 − 6,78 aftrek = 57,12 m²": met aftrek eerst de bruto maat.
  const minAftrek = aftrek > 0 ? ` − ${toonWaarde(Math.round(aftrek * 100) / 100, eenheid)} aftrek` : '';
  return `${aantal !== 1 ? `${nl(aantal)} × ` : ''}${maten}${minAftrek} = ${toonWaarde(w, eenheid)}`;
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
