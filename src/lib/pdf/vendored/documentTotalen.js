// ── OVERGENOMEN UIT HET DASHBOARD — niet met de hand bewerken ──
// Bron: BossBase supabase/functions/_shared/documentTotalen.js
// Dashboardcommit: a75f674
// Bijwerken: node scripts/pdf-opbouw-overnemen.mjs (daarna npm test).
// Alles onder deze kop is een letterlijke kopie; tests/pdfOpbouw.test.mjs
// vergelijkt het met het dashboard.
// ── einde overgenomen kop ──
// Totalen van een offerte of factuur — één rekenregel voor scherm, PDF en
// opslag, exact gelijk aan de database-triggers (bb_factuurtotalen /
// bb_offertetotalen), want díe bepalen het opgeslagen totaal dat naar de
// boekhouding en de betaallink gaat:
//
//   1. elk regelbedrag afronden op centen;
//   2. per (btw-percentage, regime) de regelbedragen optellen;
//   3. per groep de btw berekenen en één keer afronden — 0 bij verlegd en
//      vrijgesteld, ongeacht het percentage;
//   4. excl + btw.
//
// Afronden zoals Postgres round() op numeric: half van nul af (ook bij
// negatieve bedragen van een creditnota). Alles in hele centen, zodat
// zwevendekommafouten (0,525 → 0,52499…) niet meetellen.
//
// Vroeger rondde de app per regel af en de database per tarief; twee regels van
// € 1,25 à 21% gaven dan € 0,52 btw op het scherm en € 0,53 in de database
// (audit 2026-10-01, M19). Die logica stond op vijf plekken.

const naarCenten = bedrag => {
  const n = Number(bedrag) || 0
  return Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-7)
}

// Half van nul af, voor een deling van hele getallen.
const deelAfgerond = (teller, noemer) => {
  const q = Math.abs(teller) / noemer
  return Math.sign(teller) * Math.floor(q + 0.5 + 1e-9)
}

const ZONDER_BTW = new Set(['verlegd', 'vrijgesteld'])

/**
 * @param {Array} regels
 * @param {object} opties
 * @param {(r) => number} opties.bedrag  regelbedrag excl. btw
 * @param {(r) => number} opties.pct     btw-percentage van de regel
 * @param {(r) => string} [opties.regime] 'normaal' | 'verlegd' | 'vrijgesteld'
 * @returns {{ excl:number, btwPerTarief:Object<string,number>, btw:number, incl:number }}
 *   btwPerTarief: btw per percentage van de belaste regels (ook 0% en € 0),
 *   voor de uitsplitsing onder het totaal. Verlegd en vrijgesteld staan er
 *   niet in: daar hoort een vermelding bij, geen btw-regel.
 */
export function documentTotalen(regels = [], { bedrag, pct, regime = () => 'normaal' } = {}) {
  const groepen = new Map()
  let exclCenten = 0
  for (const r of regels) {
    const c = naarCenten(bedrag(r))
    const p = Number(pct(r))
    const reg = regime(r) || 'normaal'
    const sleutel = `${Number.isFinite(p) ? p : 21}|${reg}`
    groepen.set(sleutel, (groepen.get(sleutel) || 0) + c)
    exclCenten += c
  }
  const btwCentenPerTarief = {}
  let btwCenten = 0
  for (const [sleutel, centen] of groepen) {
    const [p, reg] = sleutel.split('|')
    if (ZONDER_BTW.has(reg)) continue
    // Percentages hebben hooguit twee decimalen (9, 21, eventueel 5,5):
    // reken in honderdsten van een procent om in hele getallen te blijven.
    const pctHonderdsten = Math.round(Number(p) * 100)
    const b = deelAfgerond(centen * pctHonderdsten, 10000)
    btwCentenPerTarief[p] = (btwCentenPerTarief[p] || 0) + b
    btwCenten += b
  }
  const btwPerTarief = Object.fromEntries(
    Object.entries(btwCentenPerTarief).map(([p, c]) => [p, c / 100]))
  return {
    excl: exclCenten / 100,
    btwPerTarief,
    btw: btwCenten / 100,
    incl: (exclCenten + btwCenten) / 100,
  }
}

// Regelbedrag zoals de app het opslaat: aantal × eenheidsprijs, op centen.
export const regelBedrag = (aantal, eenheidsprijs) =>
  naarCenten(Number(aantal || 0) * Number(eenheidsprijs || 0)) / 100
