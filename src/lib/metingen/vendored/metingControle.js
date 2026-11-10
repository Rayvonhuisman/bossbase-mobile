// ── OVERGENOMEN UIT HET DASHBOARD — niet met de hand bewerken ──
// Bron: BossBase supabase/functions/_shared/metingControle.js
// Dashboardcommit: 0ccd89a
// Bijwerken: node scripts/meting-overnemen.mjs (daarna npm test).
// Alles onder deze kop is een letterlijke kopie (zie scripts/meting-bron.mjs);
// tests/metingen.test.mjs vergelijkt het met het dashboard.
// ── einde overgenomen kop ──
// De controle van metingen die Claude voorstelt, gedeeld door de edge function
// metingen-uitlezen (document én "Vertel het Boss") en het dashboard
// (MetingenBlok: stukken samenvoegen). Gewoon JavaScript, zodat
// scripts/test-meting-boss.mjs het in Node kan testen.
//
// Regel: wat niet klopt wordt rechtgezet en gemarkeerd, nooit stil weggegooid
// (behalve een regel zonder naam én maat). Er wordt hier niets verzonnen.

export const SOORTEN = ['oppervlak', 'lengte', 'stuks', 'inhoud']
export const EENHEDEN = ['mm', 'cm', 'm']
export const MAX_METINGEN = 150
const TWIJFELVELDEN = ['naam', 'soort', 'breedte', 'hoogte', 'diepte', 'aantal', 'eenheid']

// Geen gedachtestreepjes in tekst die de gebruiker ziet (zelfde regel als Boss).
export const zonderStreepjes = t => String(t ?? '')
  .replace(/ [—–]+ /g, ', ').replace(/[—–]/g, '-').trim()

export const getal = v => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1000) / 1000 : null
}

const nl = n => String(Math.round(n * 1000) / 1000).replace('.', ',')

// Wat Claude teruggeeft, nagelopen.
//   ruw         de lijst metingen uit het antwoord
//   toegestaan  Set met de extra-sleutels van de branche
//   opties.gesproken  true bij "Vertel het Boss": dan komen `vervangt` en
//                     `ruimtehoogte` mee (zie wandenErbij)
export function controleer(ruw, toegestaan, opties = {}) {
  const uit = []
  for (const r of (Array.isArray(ruw) ? ruw : []).slice(0, MAX_METINGEN)) {
    const redenen = []
    const velden = new Set((Array.isArray(r?.twijfel_velden) ? r.twijfel_velden : []).map(String))
    const soort = SOORTEN.includes(String(r?.soort)) ? String(r.soort) : 'oppervlak'
    const eenheid = EENHEDEN.includes(String(r?.eenheid)) ? String(r.eenheid) : (opties.gesproken ? 'm' : 'mm')
    const breedte = getal(r?.breedte), hoogte = getal(r?.hoogte), diepte = getal(r?.diepte)
    let aantal = getal(r?.aantal)
    if (!aantal || aantal <= 0) aantal = 1
    const naam = zonderStreepjes(r?.naam).slice(0, 120)
    if (!naam && breedte == null && hoogte == null) continue

    if (!SOORTEN.includes(String(r?.soort))) { redenen.push('Soort was onduidelijk.'); velden.add('soort') }
    // Ontbrekende maten voor de soort.
    if (soort === 'oppervlak' && (breedte == null || (hoogte == null && diepte == null))) { redenen.push('Een maat ontbreekt.'); velden.add(breedte == null ? 'breedte' : 'hoogte') }
    if (soort === 'lengte' && breedte == null && hoogte == null && diepte == null) { redenen.push('De lengte ontbreekt.'); velden.add('breedte') }
    if (soort === 'inhoud' && (breedte == null || hoogte == null || diepte == null)) { redenen.push('Een maat ontbreekt.'); velden.add('diepte') }
    // Ongeloofwaardige getallen voor de eenheid.
    const maten = [breedte, hoogte, diepte].filter(v => v != null)
    if (eenheid === 'mm' && maten.some(v => v > 0 && v < 30)) { redenen.push('Erg kleine maat in mm; misschien cm of m.'); velden.add('eenheid') }
    if (eenheid === 'cm' && maten.some(v => v > 3000)) { redenen.push('Erg grote maat in cm; misschien mm.'); velden.add('eenheid') }
    if (eenheid === 'm' && maten.some(v => v > 200)) { redenen.push('Erg grote maat in m; misschien mm of cm.'); velden.add('eenheid') }
    if (aantal > 500) { redenen.push('Groot aantal.'); velden.add('aantal') }

    const extra = {}
    for (const e of (Array.isArray(r?.extra) ? r.extra : [])) {
      const k = String(e?.sleutel ?? '')
      if (toegestaan.has(k) && String(e?.waarde ?? '').trim()) extra[k] = zonderStreepjes(e.waarde).slice(0, 120)
    }
    const reden = [zonderStreepjes(r?.twijfel_reden), ...redenen].filter(Boolean).join(' ')
    const regel = {
      naam: naam || `Maat ${uit.length + 1}`,
      soort, breedte, hoogte, diepte, aantal, eenheid,
      opmerking: zonderStreepjes(r?.opmerking).slice(0, 300),
      extra,
      twijfel: r?.twijfel === true || redenen.length > 0 || !naam,
      twijfelReden: reden.slice(0, 300),
      twijfelVelden: [...velden].filter(v => TWIJFELVELDEN.includes(v)),
    }
    if (opties.gesproken) {
      regel.vervangt = zonderStreepjes(r?.vervangt).slice(0, 120)
      const rh = getal(r?.ruimtehoogte)
      if (rh) regel.ruimtehoogte = rh
    }
    uit.push(regel)
  }
  return opties.gesproken ? wandenErbij(uit) : uit
}

// Bij een ruimte waarvan lengte, breedte én hoogte zijn genoemd ("woonkamer 5,20
// bij 4,10, plafond 2,60 hoog") komt er een regel voor de wanden bij: omtrek ×
// hoogte. Uitgerekend uit de genoemde maten, niet geschat; ramen en deuren zijn
// niet afgetrokken, en dat staat erbij. De rekensom doen we hier en niet het
// model, zodat hij altijd klopt.
const wandenNaam = naam => `Wanden ${naam.charAt(0).toLowerCase()}${naam.slice(1)}`.slice(0, 120)
const omtrekVan = (b, h) => Math.round(2 * (b + h) * 1000) / 1000
const wandenOpmerking = (b, h, hoogte) => `Omtrek 2 × (${nl(b)} + ${nl(h)}) × hoogte ${nl(hoogte)}; ramen en deuren niet afgetrokken.`

export function wandenErbij(regels) {
  const uit = []
  for (const r of regels) {
    const { ruimtehoogte, ...regel } = r
    uit.push(regel)
    if (!ruimtehoogte || r.soort !== 'oppervlak' || r.breedte == null || r.hoogte == null) continue
    uit.push({
      naam: wandenNaam(r.naam),
      soort: 'oppervlak', breedte: omtrekVan(r.breedte, r.hoogte), hoogte: ruimtehoogte, diepte: null, aantal: 1, eenheid: r.eenheid,
      opmerking: wandenOpmerking(r.breedte, r.hoogte, ruimtehoogte),
      extra: {},
      twijfel: r.twijfel, twijfelReden: r.twijfel ? r.twijfelReden : '', twijfelVelden: r.twijfel ? r.twijfelVelden : [],
      vervangt: r.vervangt ? wandenNaam(r.vervangt) : '',
      // Van welke ruimte deze wanden zijn: wordt die ruimte later verbeterd
      // ("de keuken was toch 3,10"), dan rekent voegStukToe de wanden opnieuw uit.
      wandenVan: r.naam,
    })
  }
  return uit
}

// ── Stukken samenvoegen (dashboard) ─────────────────────────────────────────
// Bij "Vertel het Boss" spreekt de gebruiker per ruimte in en laat hij elk stuk
// apart verwerken. De regels komen bij elkaar in één controlevenster. Elke regel
// draagt het id van zijn stuk (`stuk`).
//
// voegStukToe(regels, stukId, nieuw):
//   - regels van hetzelfde stuk gaan eerst weg: opnieuw verwerken vervangt, er
//     komt niets dubbel;
//   - een nieuwe regel met `vervangt` (de naam van een eerdere meting, bij "nee,
//     de keuken was 3,10") vervangt die eerdere regel op zijn plek;
//   - een nieuwe regel die precies gelijk is aan een bestaande (naam, soort,
//     maten, aantal, eenheid) wordt overgeslagen.
//   - opties.opnieuw (een bestaand stuk opnieuw verwerken): een regel met de
//     naam van een meting uit een ander stuk wordt overgeslagen. Dat andere stuk
//     heeft hem dan later verbeterd, en die verbetering blijft staan.
//   - wordt een ruimte verbeterd en staan haar wanden er al (wandenVan), dan
//     worden die opnieuw uitgerekend met de nieuwe maten.
// Geeft { regels, toegevoegd, vervangen, overgeslagen } terug.
const sleutelVan = r => [String(r.naam || '').trim().toLowerCase(), r.soort, getal(r.breedte), getal(r.hoogte), getal(r.diepte), getal(r.aantal) || 1, r.eenheid].join('|')
const zelfdeNaam = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()

export function voegStukToe(regels, stukId, nieuw, maakSleutel = () => Math.random().toString(36).slice(2), opties = {}) {
  let lijst = (regels || []).filter(r => r.stuk !== stukId)
  let toegevoegd = 0, vervangen = 0, overgeslagen = 0
  const nieuweNamen = (nieuw || []).map(n => n.naam)
  for (const n of nieuw || []) {
    const { vervangt, ...rest } = n
    const regel = { ...rest, stuk: stukId, sleutel: maakSleutel() }
    if (opties.opnieuw && lijst.some(r => zelfdeNaam(r.naam, regel.naam))) { overgeslagen++; continue }
    const doel = vervangt && !opties.opnieuw ? lijst.findIndex(r => zelfdeNaam(r.naam, vervangt)) : -1
    if (doel >= 0) {
      const oud = lijst[doel]
      lijst = lijst.map((r, i) => (i === doel ? regel : r))
      vervangen++
      // De wanden van deze ruimte opnieuw uitrekenen, tenzij het antwoord ze zelf meegeeft.
      const b = getal(regel.breedte), h = getal(regel.hoogte)
      if (regel.soort === 'oppervlak' && b != null && h != null && !nieuweNamen.some(x => zelfdeNaam(x, wandenNaam(regel.naam)))) {
        lijst = lijst.map(r => {
          if (!r.wandenVan || !zelfdeNaam(r.wandenVan, oud.naam)) return r
          const hoogte = getal(r.hoogte)
          return { ...r, naam: wandenNaam(regel.naam), wandenVan: regel.naam, breedte: omtrekVan(b, h), opmerking: hoogte != null ? wandenOpmerking(b, h, hoogte) : r.opmerking }
        })
      }
      continue
    }
    if (lijst.some(r => sleutelVan(r) === sleutelVan(regel))) { overgeslagen++; continue }
    lijst = [...lijst, regel]
    toegevoegd++
  }
  // Opnieuw verwerkt: wanden van een ruimte die een later stuk verbeterde,
  // rekenen met die verbeterde ruimte.
  if (opties.opnieuw) {
    lijst = lijst.map(r => {
      if (r.stuk !== stukId || !r.wandenVan) return r
      const ruimte = lijst.find(x => x.stuk !== stukId && zelfdeNaam(x.naam, r.wandenVan))
      const b = getal(ruimte?.breedte), h = getal(ruimte?.hoogte), hoogte = getal(r.hoogte)
      if (b == null || h == null) return r
      return { ...r, breedte: omtrekVan(b, h), opmerking: hoogte != null ? wandenOpmerking(b, h, hoogte) : r.opmerking, twijfel: false, nagekeken: true, twijfelReden: '', twijfelVelden: [] }
    })
  }
  return { regels: lijst, toegevoegd, vervangen, overgeslagen }
}
