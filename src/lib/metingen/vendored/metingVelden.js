// ── OVERGENOMEN UIT HET DASHBOARD — niet met de hand bewerken ──
// Bron: BossBase supabase/functions/_shared/metingVelden.js
// Dashboardcommit: cd8c8f4
// Bijwerken: node scripts/meting-overnemen.mjs (daarna npm test).
// Alles onder deze kop is een letterlijke kopie (zie scripts/meting-bron.mjs);
// tests/metingen.test.mjs vergelijkt het met het dashboard.
// ── einde overgenomen kop ──
// Velden per branche bij een meting. Gedeeld door het dashboard
// (src/lib/metingVelden.js) en de edge function metingen-uitlezen, zodat Claude
// precies de velden invult die het formulier toont.
//
// ── Velden per branche ──────────────────────────────────────────────────────
// companies.branche is vrije tekst (de keuzelijst staat in lib/branches.js,
// oudere bedrijven hebben bijvoorbeeld "Aannemer / bouw" of niets). Daarom
// herkennen we de branche aan een woord en niet aan een exacte waarde. Glas
// (glazenmaker) staat sinds 22 oktober 2026 als eigen branche in de lijst; een
// kozijnmaker krijgt de kozijnvelden, met de glassoort erbij.
//
// type: 'keuze' (opties, met vrije invoer erbij) of 'tekst'.
const GLAS = [
  { key: 'glassoort', label: 'Glassoort', type: 'keuze', opties: ['HR++', 'HR+++ (triple)', 'Dubbel glas', 'Enkel glas', 'Gelaagd', 'Gehard', 'Melkglas', 'Brandwerend'] },
  { key: 'opbouw', label: 'Opbouw', type: 'tekst', placeholder: 'bijv. 4-15-4 of 33.1-15-4' },
  { key: 'maatsoort', label: 'Gemeten', type: 'keuze', opties: ['Dagmaat', 'Sponningmaat', 'Glasmaat'] },
  { key: 'kozijn', label: 'Kozijn', type: 'keuze', opties: ['Hout', 'Kunststof', 'Aluminium', 'Staal'] },
];

const KOZIJN = [
  { key: 'kozijn', label: 'Materiaal kozijn', type: 'keuze', opties: ['Hout', 'Kunststof', 'Aluminium', 'Staal'] },
  { key: 'uitvoering', label: 'Uitvoering', type: 'keuze', opties: ['Vast raam', 'Draai-kiepraam', 'Valraam', 'Schuifpui', 'Deur', 'Hefschuifpui'] },
  { key: 'kleur', label: 'Kleur', type: 'tekst', placeholder: 'bijv. RAL 9001 binnen, 7016 buiten' },
  { key: 'glassoort', label: 'Glassoort', type: 'keuze', opties: ['HR++', 'HR+++ (triple)', 'Dubbel glas', 'Gelaagd', 'Geen glas'] },
];

// Glas eerst: "Glas" en "Glaszetter" moeten niet als kozijnmaker tellen.
export const PER_BRANCHE = [
  { test: /glas|glaz/i, velden: GLAS },
  { test: /kozijn|raam|ramen/i, velden: KOZIJN },
  {
    test: /schilder|stuka|behang/i,
    velden: [
      { key: 'ondergrond', label: 'Ondergrond', type: 'keuze', opties: ['Hout', 'Muur', 'Plafond', 'Stucwerk', 'Metaal', 'Kunststof', 'Beton'] },
      { key: 'binnen_buiten', label: 'Binnen of buiten', type: 'keuze', opties: ['Binnen', 'Buiten'] },
      { key: 'lagen', label: 'Lagen', type: 'tekst', placeholder: 'bijv. grondlaag + 2 lagen' },
    ],
  },
  {
    test: /hovenier|tuin|groen|bestrat/i,
    velden: [
      { key: 'materiaal', label: 'Materiaal', type: 'tekst', placeholder: 'bijv. betontegels 30×30, graszoden' },
      { key: 'ondergrond', label: 'Ondergrond', type: 'keuze', opties: ['Zand', 'Klei', 'Gras', 'Bestrating', 'Beton'] },
      { key: 'laagdikte', label: 'Laagdikte', type: 'tekst', placeholder: 'bijv. 10 cm' },
    ],
  },
  {
    test: /dak/i,
    velden: [
      { key: 'dakbedekking', label: 'Dakbedekking', type: 'keuze', opties: ['Bitumen', 'EPDM', 'Dakpannen', 'Leien', 'Zink', 'Golfplaten', 'Sedum'] },
      { key: 'helling', label: 'Helling', type: 'keuze', opties: ['Plat', 'Schuin'] },
      { key: 'isolatie', label: 'Isolatie', type: 'tekst', placeholder: 'bijv. PIR 100 mm' },
    ],
  },
  {
    test: /elektr/i,
    velden: [
      { key: 'ruimte', label: 'Ruimte', type: 'tekst', placeholder: 'bijv. keuken' },
      { key: 'materiaal', label: 'Materiaal', type: 'tekst', placeholder: 'bijv. 3×2,5 mm² VD' },
    ],
  },
  {
    test: /installat|loodgiet|sanitair|warmte/i,
    velden: [
      { key: 'ruimte', label: 'Ruimte', type: 'tekst', placeholder: 'bijv. badkamer' },
      { key: 'materiaal', label: 'Materiaal', type: 'tekst', placeholder: 'bijv. koper 15 mm, PVC 110' },
    ],
  },
  {
    test: /schoonma/i,
    velden: [
      { key: 'wat', label: 'Wat', type: 'keuze', opties: ['Glas', 'Vloer', 'Gevel', 'Zonnepanelen', 'Kozijnen'] },
      { key: 'binnen_buiten', label: 'Binnen of buiten', type: 'keuze', opties: ['Binnen', 'Buiten', 'Beide'] },
    ],
  },
  {
    test: /aannem|bouw|timmer|verbouw/i,
    velden: [
      { key: 'ruimte', label: 'Ruimte', type: 'tekst', placeholder: 'bijv. woonkamer' },
      { key: 'materiaal', label: 'Materiaal', type: 'tekst', placeholder: 'bijv. gipsplaat, vloerdelen' },
    ],
  },
];

export const ALGEMEEN = [
  { key: 'ruimte', label: 'Ruimte', type: 'tekst', placeholder: 'bijv. woonkamer' },
  { key: 'materiaal', label: 'Materiaal', type: 'tekst', placeholder: '' },
];

export function brancheVelden(branche) {
  const b = String(branche || '');
  return PER_BRANCHE.find(p => p.test.test(b))?.velden || ALGEMEEN;
}

