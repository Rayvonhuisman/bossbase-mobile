// ── OVERGENOMEN UIT HET DASHBOARD — niet met de hand bewerken ──
// Bron: BossBase supabase/functions/_shared/pdfOpbouw.js
// Dashboardcommit: aac2a38
// Bijwerken: node scripts/pdf-opbouw-overnemen.mjs (daarna npm test).
// Alles onder deze kop is een letterlijke kopie; tests/pdfOpbouw.test.mjs
// vergelijkt het met het dashboard.
// ── einde overgenomen kop ──
// De opmaak van de offerte-, factuur- en werkbon-PDF. Eén bron voor de app
// (src/utils/generatePdf.js en generateWerkbonPdf.js, jsPDF in de browser) en
// voor de server (_shared/ondertekendExemplaar.ts, jsPDF in Deno), zodat het
// ondertekende exemplaar er precies zo uitziet als de PDF die de klant kent.
//
// Niets hierin gebruikt de browser of de database. Wat per omgeving verschilt,
// komt binnen via `omgeving`:
//   naarDataUrl(url)                 → data-URL van een afbeelding, of null
//   bereidAfbeelding(dataUrl, wmm, hmm) → { dataUrl, formaat, breedte, hoogte } in mm
//   afmetingen(dataUrl)              → { w, h } in pixels, of null
//   documentUrl({ soort, id, token, opgeslagen }) → korte link (alleen de app)
//   supabaseUrl                      → voor de oude publieke handtekeninglink (alleen de app)
// Ontbreekt een functie, dan wordt dat onderdeel overgeslagen (geen logo, geen
// foto), nooit de hele PDF.

import { documentTotalen } from './documentTotalen.js';
import { regimeVanPct, regimeVoorOpslag } from './btwRegime.js';
import { htmlToPdfText } from './notitieTekst.js';

const euro = n => `€ ${Number(n || 0).toFixed(2).replace('.', ',')}`;

// Documenttotalen uit de regels — voor zowel facturen als offertes.
//
// Het eindbedrag kwam hier eerder uit document.totaalIncl. Bij facturen stonden
// de btw-regels eronder al wél uit de regels, waardoor de PDF op een factuur met
// een scheef opgeslagen totaal zichtbaar niet optelde. Bij offertes was het
// omgekeerd: daar werd het btw-bedrag berekend als incl − excl, zodat de som
// altijd klopte maar het bedrag niet bij het percentage ernaast hoefde te horen
// — "BTW 21%" met € 1.630,00 op € 7.764,00 is 20,99%.
//
// Nu is er één bron voor beide, met dezelfde regel als useRegelTotals, de
// database-triggers (bb_factuurtotalen / bb_offertetotalen) en de boekhoudexport:
// btw per tarief groeperen, per groep afronden, dan optellen. Het regime bepaalt
// óf er btw is — bij vrijgesteld en verlegd nooit, ongeacht het percentage.
//
// Het bedrag per regel heet anders: een factuurregel heeft regelprijs, een
// offerteregel subtotaal. Offerteregels hebben bovendien niet altijd een eigen
// percentage; die vallen terug op het percentage van de offerte zelf.
export function pdfTotalen(regels = [], { bedragVeld, standaardPct = 21 } = {}) {
  return documentTotalen(regels, {
    bedrag: r => r[bedragVeld],
    pct: r => r.btwPct ?? standaardPct,
    regime: r => regimeVoorOpslag(r.btwRegime || regimeVanPct(r.btwPct ?? standaardPct)),
  });
}


export function hexToRgb(hex) {
  const h = (hex || '#1DDB62').replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return [isNaN(r) ? 29 : r, isNaN(g) ? 219 : g, isNaN(b) ? 98 : b];
}

export function luminance([r, g, b]) {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

export const fmtDate = d => {
  if (!d) return '';
  const parts = String(d).slice(0, 10).split('-');
  if (parts.length !== 3) return d;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
};

// Altijd Nederlandse tijd: op de server (Deno, UTC) stond een ondertekening
// van 14:39 anders als 12:39 in het exemplaar.
export const fmtDateTime = d => {
  if (!d) return '';
  try {
    return new Date(d).toLocaleString('nl-NL', {
      day: 'numeric', month: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      timeZone: 'Europe/Amsterdam',
    });
  } catch { return String(d); }
};

// Datum van een tijdstip (ISO) als DD-MM-JJJJ, in Nederlandse tijd. Een
// handtekening van 00:30 viel met .slice(0, 10) op de UTC-dag ervoor.
export const fmtDatumVanTijdstip = d => {
  if (!d) return '';
  try {
    return fmtDate(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(d)));
  } catch { return fmtDate(String(d).slice(0, 10)); }
};

const TYPE_OMSCHR_DEFAULT = {
  uren: 'Arbeidsuren', m2: 'Prijs per m²', stuks: 'Materiaalkosten', km: 'Reisvergoeding', vast: 'Overige kosten',
};

// Ink palette matching the design prototype. Geëxporteerd omdat de werkbon-PDF
// (generateWerkbonPdf.js) dezelfde huisstijl aanhoudt — één palet, geen kopie
// die na de eerste kleurwijziging uit de pas loopt.
export const C = {
  dark:    [20, 22, 28],      // #14161c
  soft:    [60, 66, 80],      // #3c4250
  muted:   [128, 134, 154],   // #80869a
  faint:   [170, 176, 192],   // #aab0c0
  line:    [231, 233, 239],   // #e7e9ef
  lineStr: [211, 215, 224],   // #d3d7e0
  paper:   [255, 255, 255],
  panel:   [246, 247, 250],   // #f6f7fa
  green:   [15, 157, 88],     // #0f9d58
  // Waarschuwingen (Wkb) op de werkbon. Amber en niet rood: rood leest als een
  // fout van de klant, terwijl dit een melding is. Donker genoeg om ook in
  // zwart-wit op te vallen tussen de grijze panelen.
  warnBg:   [255, 251, 235],  // #fffbeb
  warnLine: [245, 158, 11],   // #f59e0b
  warnInk:  [146,  94,  6],   // #925e06
};

// NL91ABNA0417164300 → NL91 ABNA 0417 1643 00
export function formatIban(iban) {
  return String(iban || '').replace(/\s+/g, '').toUpperCase().replace(/(.{4})/g, '$1 ').trim();
}



// Onder het handtekeningvak van een exemplaar dat de server bij het tekenen
// maakt: het kenmerk (SHA-256 van de vastgelegde inhoud) en wie het maakte.
// Alleen de server geeft dit mee (document.ondertekeningExtra).
function ondertekeningKenmerk(doc, extra, x, yOnder, breedte) {
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(128, 134, 154);
  const regels = [
    extra.kenmerk ? `Kenmerk (SHA-256 van de inhoud): ${extra.kenmerk}` : null,
    'Dit exemplaar is bij het ondertekenen door BossBase op de server opgemaakt uit de gegevens van het document.',
  ].filter(Boolean).flatMap(t => doc.splitTextToSize(t, breedte - 10));
  doc.text(regels, x + 5, yOnder);
}

export async function buildPdf(doc, type, document, regels, customer, company, omgeving = {}) {
  const W = 210, M = 16, CW = W - 2 * M;
  const totalen = pdfTotalen(regels || [], type === 'factuur'
    ? { bedragVeld: 'regelprijs', standaardPct: 21 }
    : { bedragVeld: 'subtotaal', standaardPct: Number(document.btwPct ?? 21) });
  const accent = hexToRgb(company?.brandingColor);
  const accentInk = luminance(accent) > 0.62 ? C.dark : C.paper;

  const tc = c => doc.setTextColor(c[0], c[1], c[2]);
  const fc = c => doc.setFillColor(c[0], c[1], c[2]);
  const dc = c => doc.setDrawColor(c[0], c[1], c[2]);

  // ── ACCENT BAND (top of page) ────────────────────────────────
  // Op elke pagina dezelfde band, net als op de werkbon.
  const bandje = () => { fc(accent); doc.rect(0, 0, W, 1.6, 'F'); };
  bandje();

  let y = 17;
  let paginas = 1;
  // Nieuwe pagina zodra `nodig` mm niet meer past (footer staat op 282).
  const ruimte = (nodig, grens = 272) => {
    if (y + nodig <= grens) return false;
    doc.addPage(); paginas += 1; bandje(); y = 17;
    return true;
  };

  // ── HEADER ───────────────────────────────────────────────────

  let headerBottom = y;

  // Logo links — als geen logo: toon bedrijfsnaam als tekst
  if (company?.logoUrl) {
    const logoData = await omgeving.naarDataUrl?.(company.logoUrl);
    if (logoData) {
      try {
        const logo = await omgeving.bereidAfbeelding?.(logoData, 55, 20);
        if (logo) {
          doc.addImage(logo.dataUrl, logo.formaat, M, y, logo.breedte, logo.hoogte, '', 'FAST');
          headerBottom = Math.max(headerBottom, y + logo.hoogte);
        }
      } catch {}
    }
  } else if (company?.name) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    tc(C.dark);
    doc.text(company.name, M, y + 9);
    headerBottom = Math.max(headerBottom, y + 13);
  }

  // Bedrijfsgegevens rechts
  let ry = y + 1;
  if (company?.name) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    tc(C.dark);
    doc.text(company.name, W - M, ry, { align: 'right' });
    ry += 5;
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  tc(C.soft);
  if (company?.address) { doc.text(company.address, W - M, ry, { align: 'right' }); ry += 4; }
  const compCity = [company?.postalCode, company?.city].filter(Boolean).join('  ');
  if (compCity) { doc.text(compCity, W - M, ry, { align: 'right' }); ry += 4; }
  if (company?.email) { doc.text(company.email, W - M, ry, { align: 'right' }); ry += 4; }
  const regParts = [
    company?.kvk ? `KvK ${company.kvk}` : null,
    company?.btwNumber ? `BTW ${company.btwNumber}` : null,
  ].filter(Boolean);
  if (regParts.length) {
    tc(C.muted);
    doc.text(regParts.join(' · '), W - M, ry, { align: 'right' });
    ry += 4;
  }

  y = Math.max(headerBottom, ry) + 9;

  // ── TITLE ROW ────────────────────────────────────────────────

  // doctitle: hoofdletter op eerste letter, rest lowercase — exact zoals design HTML
  const docTitle = document.isCredit ? 'Creditfactuur' : (type === 'factuur' ? 'Factuur' : 'Offerte');

  // Lijn 1: document type (bijv. "Offerte")
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(30);
  tc(C.dark);
  doc.text(docTitle, M, y + 11);

  // Lijn 2: nummer in accentkleur (line-height .9 op 40px = ~9.5mm)
  doc.setFontSize(30);
  tc(accent);
  doc.text(document.nummer || '', M, y + 21);

  if (document.isCredit && document.creditNote) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    tc(C.muted);
    doc.text(document.creditNote, M, y + 29);
  }

  // Meta rechts — bottom-aligned met de onderkant van de titel (y+21)
  const metaX = W - M - 72;
  let metaY = y + 8;
  const metaRow = (label, val) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    tc(C.muted);
    doc.text(label, metaX, metaY);
    doc.setFont('helvetica', 'bold');
    tc(C.dark);
    doc.text(val || '', W - M, metaY, { align: 'right' });
    metaY += 5;
  };

  metaRow(type === 'factuur' ? 'Factuurnummer' : 'Offertenummer', document.nummer);
  // Offertedatum: pak het eerste beschikbare datumveld, ongeacht de objectvorm
  // (mapped camelCase, ruwe snake_case, of een al-geformatteerd datum-veld).
  // Zo verschijnt de datum altijd — net als de factuurdatum op de factuur-PDF.
  const offerteDatum = document.createdAt || document.created_at
    || document.datum || document.offertedatum
    || document.verzondenOp || document.verzonden_op || null;
  const docDate = type === 'factuur'
    ? document.factuurdatum
    : (offerteDatum ? String(offerteDatum).slice(0, 10) : null);
  metaRow('Datum', fmtDate(docDate));
  if (type === 'factuur') {
    metaRow('Vervaldatum', fmtDate(document.vervaldatum));
    if (document.betalingskenmerk) metaRow('Kenmerk', document.betalingskenmerk);
  } else {
    metaRow('Geldig tot', fmtDate(document.geldigTot));
    const signedAt = document.signedAt || document.signed_at;
    if (signedAt) metaRow('Ondertekend', fmtDatumVanTijdstip(signedAt));
  }

  y = Math.max(y + 26, metaY) + 5;

  // ── PARTIES ──────────────────────────────────────────────────

  // Accent top-border
  dc(accent);
  doc.setLineWidth(0.6);
  doc.line(M, y, W - M, y);

  const partyStartY = y + 4;
  const colMid = M + CW / 2;

  // VAN (links — bedrijf)
  let vanY = partyStartY + 3;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  tc(C.muted);
  doc.text('VAN', M, vanY);
  vanY += 5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  tc(C.dark);
  if (company?.name) { doc.text(company.name, M, vanY); vanY += 5.5; }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  tc(C.soft);
  if (company?.address) { doc.text(company.address, M, vanY); vanY += 4.5; }
  const compCity2 = [company?.postalCode, company?.city].filter(Boolean).join('  ');
  if (compCity2) { doc.text(compCity2, M, vanY); vanY += 4.5; }
  if (company?.email) { doc.text(company.email, M, vanY); vanY += 4.5; }

  // AAN (rechts — klant)
  const aanX = colMid + 7;
  let aanY = partyStartY + 3;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  tc(C.muted);
  doc.text('AAN', aanX, aanY);
  aanY += 5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  tc(C.dark);
  if (customer?.name) { doc.text(customer.name, aanX, aanY); aanY += 5.5; }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  tc(C.soft);
  if (customer?.address) { doc.text(customer.address, aanX, aanY); aanY += 4.5; }
  const custPostal = customer?.postcode || customer?.postalCode || customer?.postal_code;
  const custCity = [custPostal, customer?.city].filter(Boolean).join('  ');
  if (custCity) { doc.text(custCity, aanX, aanY); aanY += 4.5; }
  if (customer?.email) { doc.text(customer.email, aanX, aanY); aanY += 4.5; }
  const custPhone = customer?.phone || customer?.phone_number;
  if (custPhone) { doc.text(custPhone, aanX, aanY); aanY += 4.5; }
  const custKvk = customer?.kvkNumber || customer?.kvk;
  const custBtw = customer?.btwNumber || customer?.btw_number;
  const custReg = [custKvk ? `KvK ${custKvk}` : null, custBtw ? `BTW ${custBtw}` : null].filter(Boolean);
  if (custReg.length) { tc(C.muted); doc.text(custReg.join(' · '), aanX, aanY); tc(C.soft); aanY += 4.5; }

  y = Math.max(vanY, aanY) + 4;

  // Verticale scheiding
  dc(C.line);
  doc.setLineWidth(0.3);
  doc.line(colMid, partyStartY, colMid, y - 2);

  // Onderrand
  dc(C.line);
  doc.setLineWidth(0.3);
  doc.line(M, y, W - M, y);
  y += 9;

  // ── ITEMS TABEL ───────────────────────────────────────────────

  const COL_PERC = [0.48, 0.11, 0.16, 0.10, 0.15];
  const COL_W = COL_PERC.map(p => CW * p);
  const COL_X = [];
  let cx = M;
  COL_W.forEach(w => { COL_X.push(cx); cx += w; });

  // Kolomkoppen (ook bovenaan elke vervolgpagina)
  const kolomKoppen = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    tc(C.muted);
    ['OMSCHRIJVING', 'AANTAL', 'EENHEIDSPRIJS', 'BTW', 'BEDRAG'].forEach((h, i) => {
      const isR = i >= 1;
      doc.text(h, isR ? COL_X[i] + COL_W[i] - 1 : COL_X[i], y, { align: isR ? 'right' : 'left' });
    });
    y += 4;

    // Accent scheidingslijn onder headers
    dc(accent);
    doc.setLineWidth(0.6);
    doc.line(M, y, W - M, y);
    y += 7;
  };
  kolomKoppen();

  // Rijen. Vroeger stopte de tabel stil bij y > 238 ("if (y > 238) return"):
  // een offerte met veel regels verloor alles na de eerste pagina. Nu een
  // vervolgpagina met dezelfde kolomkoppen.
  (regels || []).forEach((r, idx) => {
    if (ruimte(11)) kolomKoppen();
    else if (idx > 0) {
      dc(C.line);
      doc.setLineWidth(0.3);
      doc.line(M, y - 3, W - M, y - 3);
    }

    // Omschrijving (vet)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    tc(C.dark);
    const omschr = doc.splitTextToSize(r.omschrijving || TYPE_OMSCHR_DEFAULT[r.type] || '', COL_W[0] - 2);
    doc.text(omschr[0] || '', COL_X[0], y);

    // Overige kolommen
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    tc(C.soft);

    // Nederlands decimaalteken, net als de bedragen ernaast: 2,5 in plaats van
    // 2.5. Hele aantallen blijven zonder decimalen (2, niet 2,00).
    const aantalTxt = Number(r.aantal ?? 1).toLocaleString('nl-NL', { maximumFractionDigits: 2 });
    doc.text(aantalTxt, COL_X[1] + COL_W[1] - 1, y, { align: 'right' });

    const prijs = type === 'factuur' ? r.eenheidsprijs : r.prijsPer;
    doc.text(euro(prijs), COL_X[2] + COL_W[2] - 1, y, { align: 'right' });

    const btwPct = r.btwPct !== undefined ? r.btwPct : (document.btwPct ?? 21);
    // Bij verlegd en vrijgesteld zegt "0%" niets: de kolom noemt het regime.
    const regime = regimeVoorOpslag(r.btwRegime || regimeVanPct(btwPct));
    const btwTekst = regime === 'verlegd' ? 'verlegd' : regime === 'vrijgesteld' ? 'vrijgesteld' : `${btwPct}%`;
    doc.text(btwTekst, COL_X[3] + COL_W[3] - 1, y, { align: 'right' });

    const bedrag = type === 'factuur' ? r.regelprijs : r.subtotaal;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    tc(C.dark);
    doc.text(euro(bedrag), COL_X[4] + COL_W[4] - 1, y, { align: 'right' });

    y += 11;
  });

  // Lijn na laatste rij
  dc(C.line);
  doc.setLineWidth(0.3);
  doc.line(M, y - 2.5, W - M, y - 2.5);
  y += 7;

  // ── TOTALEN ──────────────────────────────────────────────────

  const totW = CW * 0.58;
  const totX = W - M - totW;
  ruimte(15 + (Object.keys(totalen.btwPerTarief).length + 1) * 8 + 10);

  const subRow = (label, val) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    tc(C.muted);
    doc.text(label, totX, y);
    doc.setFont('helvetica', 'bold');
    tc(C.dark);
    doc.text(val, W - M, y, { align: 'right' });
    y += 8;
  };

  // Facturen en offertes delen nu hetzelfde blok: subtotaal, één regel per
  // btw-tarief, eindbedrag — alle drie uit dezelfde berekening over de regels.
  subRow('Subtotaal excl. BTW', euro(totalen.excl));
  dc(C.line); doc.setLineWidth(0.3); doc.line(totX, y - 6, W - M, y - 6);
  Object.entries(totalen.btwPerTarief)
    .sort(([a], [b]) => Number(a) - Number(b))
    .forEach(([pct, amt]) => subRow(`BTW ${pct}%`, euro(amt)));

  y += 2;

  // Grand total box (accent achtergrond)
  const grandH = 13;
  fc(accent);
  doc.roundedRect(totX - 2, y - 1, totW + 2, grandH, 2.1, 2.1, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  tc(accentInk);
  doc.text('Totaal incl. BTW', totX + 4, y + 8);

  doc.setFontSize(14);
  doc.text(euro(totalen.incl), W - M - 3, y + 8, { align: 'right' });

  y += grandH + 10;

  // ── NOTITIE / GELDIGHEID ──────────────────────────────────────

  const rawNotes = document.notities || document.notes;
  const defaultNote = !rawNotes && type === 'offerte' && document.geldigTot
    ? `Deze offerte is geldig tot ${fmtDate(document.geldigTot)}. Na akkoord ontvangt u een bevestiging per e-mail.`
    : null;
  const noteText = rawNotes || defaultNote;

  if (noteText) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const noteLines = doc.splitTextToSize(noteText, CW - 22);
    const noteH = Math.max(13, noteLines.length * 4 + 10);
    ruimte(noteH + 8);

    fc(C.panel);
    doc.roundedRect(M, y, CW, noteH, 2.1, 2.1, 'F');

    // Bereken eerste-regel baseline zodat het tekstblok verticaal gecentreerd staat
    const noteLineH = 4; // komt overeen met noteH-formule (4mm per regel)
    const noteBlockH = Math.max(0, noteLines.length - 1) * noteLineH;
    const noteTextY = y + (noteH - noteBlockH) / 2 + 1;

    // 'i' badge — gecentreerd met de visuele middenlijn van de tekst
    fc(accent);
    doc.ellipse(M + 6, noteTextY - 1, 2.1, 2.1, 'F');
    tc(accentInk);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text('i', M + 6, noteTextY, { align: 'center' });

    tc(C.soft);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(noteLines.slice(0, 5), M + 11.5, noteTextY);

    y += noteH + 8;
  }

  // ── BETAALGEGEVENS EN BTW-VERMELDING (facturen) ───────────────
  // Een factuur zonder rekeningnummer kan de klant niet betalen (audit
  // 2026-10-01, H11). Bij verlegde btw hoort de vermelding "btw verlegd" plus
  // het btw-nummer van de opdrachtgever op de factuur (art. 35a Wet OB).
  if (type === 'factuur') {
    const regimes = (regels || []).map(r => r.btwRegime);
    const klantBtw = customer?.btwNumber || customer?.btw_number;
    const regelsTekst = [];
    if (regimes.includes('verlegd')) {
      regelsTekst.push(`Btw verlegd.${klantBtw ? ` Btw-nummer afnemer: ${klantBtw}` : ''}`);
    }
    if (regimes.includes('vrijgesteld')) regelsTekst.push('Een deel van deze factuur is vrijgesteld van btw.');
    if (!document.isCredit && company?.iban) {
      const iban = formatIban(company.iban);
      const tnv = company.ibanTnv || company.name || '';
      const vervalTekst = document.vervaldatum ? ` vóór ${fmtDate(document.vervaldatum)}` : '';
      const kenmerk = document.betalingskenmerk || document.nummer;
      regelsTekst.push(`Graag het totaalbedrag${vervalTekst} overmaken op ${iban}${tnv ? ` t.n.v. ${tnv}` : ''}${kenmerk ? `, onder vermelding van ${kenmerk}` : ''}.`);
    }
    if (regelsTekst.length) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      const lijnen = regelsTekst.flatMap(t => doc.splitTextToSize(t, CW));
      ruimte(lijnen.length * 4.2 + 6);
      tc(C.dark);
      doc.text(lijnen, M, y);
      y += lijnen.length * 4.2 + 6;
    }
  }

  // ── HANDTEKENING (alleen bij ondertekende offertes) ───────────

  const signedAt = type === 'offerte' ? (document.signedAt || document.signed_at) : null;
  if (signedAt) {
    const signedByName = document.signedByName || document.signed_by_name || '';
    const signedByEmail = document.signedByEmail || document.signed_by_email || '';

    // Signature image ophalen — direct dataUrl (verse ondertekening), opgeslagen URL, of via storage
    let sigImgData = null;
    if (document.signatureDataUrl) {
      sigImgData = document.signatureDataUrl;
    } else if (document.signatureUrl && omgeving.documentUrl) {
      // Korte link op het moment van gebruik (document-url); zie documentService.
      const url = await omgeving.documentUrl({ soort: 'offerte_handtekening', id: document.id, token: document.sign_token || document.signToken, opgeslagen: document.signatureUrl });
      if (url) sigImgData = await omgeving.naarDataUrl?.(url);
    } else if (omgeving.supabaseUrl) {
      const signToken = document.sign_token || document.signToken;
      if (signToken) {
        try {
          const sigUrl = `${omgeving.supabaseUrl}/storage/v1/object/public/signatures/${signToken}.png`;
          sigImgData = await omgeving.naarDataUrl?.(sigUrl);
        } catch {}
      }
    }

    const hasImg = Boolean(sigImgData);
    const extra = document.ondertekeningExtra || null;
    const signBlockH = (hasImg ? 52 : 42) + (extra ? 16 : 0);

    // Nieuwe pagina als handtekening vak niet past
    ruimte(signBlockH + 20, 270);

    // Buitenrand
    dc(C.lineStr);
    doc.setLineWidth(0.4);
    doc.roundedRect(M, y, CW, signBlockH, 2.1, 2.1, 'S');

    // Header achtergrond (paneel-kleur, afgerond boven)
    fc(C.panel);
    doc.roundedRect(M, y, CW, 13, 2.1, 2.1, 'F');
    doc.rect(M, y + 7, CW, 6, 'F'); // rechte onderhoeken

    // Scheidingslijn onder header
    dc(C.line);
    doc.setLineWidth(0.3);
    doc.line(M, y + 13, W - M, y + 13);

    // Groen vinkje badge (18px = 4.76mm diameter, radius 2.38mm)
    fc(C.green);
    doc.ellipse(M + 7, y + 6.5, 2.4, 2.4, 'F');
    // Vinkje als lijnen (Helvetica ondersteunt ✓ niet in standaard encoding)
    dc(C.paper);
    doc.setLineWidth(0.5);
    doc.line(M + 5.8, y + 6.6, M + 6.7, y + 7.6);
    doc.line(M + 6.7, y + 7.6, M + 8.4, y + 5.4);

    // Titel
    tc(C.dark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Digitaal ondertekend', M + 13, y + 8);

    // Datum rechts (.meta-min: 10px = 7.5pt, color muted)
    tc(C.muted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(`Akkoord · ${fmtDatumVanTijdstip(signedAt)}`, W - M, y + 8, { align: 'right' });

    // Velden
    let fy = y + 20;
    const fields = [
      ['Ondertekend door', signedByName || ''],
      ['E-mailadres', signedByEmail || ''],
      ['Datum en tijd', fmtDateTime(signedAt)],
      ...(extra?.ip ? [['IP-adres', extra.ip]] : []),
    ];
    fields.forEach(([label, val]) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      tc(C.muted);
      doc.text(label, M + 5, fy);
      doc.setFont('helvetica', 'bold');
      tc(C.dark);
      doc.text(val, M + 48, fy);
      fy += 5.5;
    });

    // Handtekening afbeelding (rechts) — behoud de aspect ratio van de
    // originele afbeelding zodat de handtekening niet vervormt.
    if (hasImg) {
      try {
        const maxW = 58, maxH = 22;
        let drawW = maxW, drawH = maxH;
        const dims = await omgeving.afmetingen?.(sigImgData);
        if (dims && dims.w > 0 && dims.h > 0) {
          const ratio = dims.w / dims.h;
          drawW = maxW;
          drawH = maxW / ratio;
          if (drawH > maxH) { drawH = maxH; drawW = maxH * ratio; }
        }
        const sigX = W - M - drawW - 2;
        const sigY = y + 16;
        doc.addImage(sigImgData, 'PNG', sigX, sigY, drawW, drawH, '', 'FAST');
        dc(C.lineStr);
        doc.setLineWidth(0.3);
        doc.line(sigX, sigY + drawH + 1, sigX + drawW, sigY + drawH + 1);
        tc(C.muted);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.text(`Handtekening — ${signedByName}`, sigX + drawW, sigY + drawH + 5, { align: 'right' });
      } catch {}
    }

    if (extra) ondertekeningKenmerk(doc, extra, M, y + signBlockH - 13, CW);
    y += signBlockH + 8;
  }

  // ── FOOTER ────────────────────────────────────────────────────

  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    const footY = 282;
    dc(C.line);
    doc.setLineWidth(0.3);
    doc.line(M, footY - 3, W - M, footY - 3);

    // LEFT: "Gegenereerd door **BossBase**"
    doc.setFontSize(7.5);
    const genX = M;
    doc.setFont('helvetica', 'normal');
    tc(C.faint);
    const prefixGen = 'Gegenereerd door ';
    doc.text(prefixGen, genX, footY + 4);
    const prefixGenW = doc.getTextWidth(prefixGen);
    doc.setFont('helvetica', 'bold');
    tc(C.muted);
    doc.text('BossBase', genX + prefixGenW, footY + 4);

    // RIGHT: doc reference
    doc.setFont('helvetica', 'normal');
    tc(C.faint);
    const docRef = type === 'factuur'
      ? `Factuur ${document.nummer || ''}`
      : `Offerte ${document.nummer || ''}`;
    doc.text(`${docRef} · Pagina ${p} van ${paginas}`, W - M, footY + 4, { align: 'right' });
  }
}

// ── Werkbon ────────────────────────────────────────────────────────────────

const W = 210, M = 16, CW = W - 2 * M;
const PAGE_BOTTOM = 272; // onder deze y past niets meer; footer staat op 282

const uurFmt = n => `${Number(n || 0).toFixed(2).replace('.', ',')} u`;
const aantalFmt = n => Number(n ?? 0).toLocaleString('nl-NL', { maximumFractionDigits: 2 });

const tijdFmt = t => (t ? String(t).slice(0, 5) : null);

/**
 * Bouwt de werkbon-PDF.
 *
 * @param {object} doc      jsPDF-document
 * @param {object} werkbon  { nummer, titel, omschrijving, locatie, geplandOp,
 *                            gestartOp, afgerondOp, ondertekendOp,
 *                            ondertekendDoorNaam, ondertekendDoorEmail,
 *                            handtekeningDataUrl | handtekeningUrl }
 * @param {object} data     { taken, uren, materialen, notities, waarschuwingen, fotos }
 * @param {object} customer klantgegevens
 * @param {object} company  bedrijfsgegevens incl. brandingColor/logoUrl
 */
export async function buildWerkbonPdf(doc, werkbon, data, customer, company, omgeving = {}) {
  const { taken = [], uren = [], materialen = [], meerwerk = [], notities = [],
          waarschuwingen = [], fotos = [] } = data || {};
  const accent = hexToRgb(company?.brandingColor);
  const accentInk = luminance(accent) > 0.62 ? C.dark : C.paper;

  const tc = c => doc.setTextColor(c[0], c[1], c[2]);
  const fc = c => doc.setFillColor(c[0], c[1], c[2]);
  const dc = c => doc.setDrawColor(c[0], c[1], c[2]);

  // Elke pagina begint met dezelfde accentband, zodat een werkbon met veel
  // foto's er op pagina 3 niet ineens anders uitziet.
  const bandje = () => { fc(accent); doc.rect(0, 0, W, 1.6, 'F'); };
  bandje();

  let y = 17;
  let paginas = 1;

  /** Nieuwe pagina zodra `nodig` mm niet meer past. Geeft terug of hij sprong. */
  const ruimte = (nodig) => {
    if (y + nodig <= PAGE_BOTTOM) return false;
    doc.addPage();
    paginas += 1;
    bandje();
    y = 17;
    return true;
  };

  // ── HEADER ──────────────────────────────────────────────────────────────
  let headerBottom = y;
  if (company?.logoUrl) {
    const logoData = await omgeving.naarDataUrl?.(company.logoUrl);
    if (logoData) {
      try {
        const logo = await omgeving.bereidAfbeelding?.(logoData, 55, 20);
        if (logo) {
          doc.addImage(logo.dataUrl, logo.formaat, M, y, logo.breedte, logo.hoogte, '', 'FAST');
          headerBottom = Math.max(headerBottom, y + logo.hoogte);
        }
      } catch { /* logo is niet essentieel */ }
    }
  } else if (company?.name) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); tc(C.dark);
    doc.text(company.name, M, y + 9);
    headerBottom = Math.max(headerBottom, y + 13);
  }

  let ry = y + 1;
  if (company?.name) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); tc(C.dark);
    doc.text(company.name, W - M, ry, { align: 'right' }); ry += 5;
  }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); tc(C.soft);
  if (company?.address) { doc.text(company.address, W - M, ry, { align: 'right' }); ry += 4; }
  const compCity = [company?.postalCode, company?.city].filter(Boolean).join('  ');
  if (compCity) { doc.text(compCity, W - M, ry, { align: 'right' }); ry += 4; }
  if (company?.email) { doc.text(company.email, W - M, ry, { align: 'right' }); ry += 4; }
  if (company?.phone) { doc.text(company.phone, W - M, ry, { align: 'right' }); ry += 4; }

  y = Math.max(headerBottom, ry) + 9;

  // ── TITEL ───────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold'); doc.setFontSize(30); tc(C.dark);
  doc.text('Werkbon', M, y + 11);
  doc.setFontSize(30); tc(accent);
  doc.text(werkbon?.nummer || '', M, y + 21);

  const metaX = W - M - 72;
  let metaY = y + 8;
  const metaRow = (label, val) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); tc(C.muted);
    doc.text(label, metaX, metaY);
    doc.setFont('helvetica', 'bold'); tc(C.dark);
    doc.text(val || '', W - M, metaY, { align: 'right' });
    metaY += 5;
  };
  metaRow('Werkbonnummer', werkbon?.nummer);
  const uitgevoerdOp = werkbon?.afgerondOp || werkbon?.gestartOp || werkbon?.geplandOp;
  metaRow('Uitgevoerd op', fmtDate(uitgevoerdOp ? String(uitgevoerdOp).slice(0, 10) : null));
  if (werkbon?.locatie) {
    // Lange adressen mogen de meta-kolom niet uit lopen.
    const kort = doc.splitTextToSize(werkbon.locatie, 50)[0];
    metaRow('Locatie', kort);
  }
  if (werkbon?.ondertekendOp) {
    metaRow('Ondertekend', fmtDatumVanTijdstip(werkbon.ondertekendOp));
  }

  y = Math.max(y + 26, metaY) + 5;

  // ── PARTIJEN ────────────────────────────────────────────────────────────
  dc(accent); doc.setLineWidth(0.6); doc.line(M, y, W - M, y);
  const partyStartY = y + 4;
  const colMid = M + CW / 2;

  let vanY = partyStartY + 3;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7); tc(C.muted);
  doc.text('UITGEVOERD DOOR', M, vanY); vanY += 5;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); tc(C.dark);
  if (company?.name) { doc.text(company.name, M, vanY); vanY += 5.5; }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); tc(C.soft);
  if (company?.address) { doc.text(company.address, M, vanY); vanY += 4.5; }
  if (compCity) { doc.text(compCity, M, vanY); vanY += 4.5; }
  // Wie er namens het bedrijf voor staat: de uitvoerder(s) en de
  // verantwoordelijke van de werkbon. Bewust NIET afgeleid uit de urenregels —
  // dat zou de namen die we net van de urentabel hebben gehaald hier weer
  // binnenhalen, en het is ook een ander gegeven.
  const uitvoerders = (werkbon?.uitvoerders || []).filter(Boolean);
  if (uitvoerders.length) {
    tc(C.muted);
    doc.splitTextToSize(uitvoerders.join(', '), CW / 2 - 10).slice(0, 2)
      .forEach(r => { doc.text(r, M, vanY); vanY += 4.5; });
  }

  const aanX = colMid + 7;
  let aanY = partyStartY + 3;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7); tc(C.muted);
  doc.text('KLANT', aanX, aanY); aanY += 5;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); tc(C.dark);
  if (customer?.name) { doc.text(customer.name, aanX, aanY); aanY += 5.5; }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); tc(C.soft);
  if (customer?.address) { doc.text(customer.address, aanX, aanY); aanY += 4.5; }
  const custCity = [customer?.postcode || customer?.postalCode, customer?.city].filter(Boolean).join('  ');
  if (custCity) { doc.text(custCity, aanX, aanY); aanY += 4.5; }
  if (customer?.email) { doc.text(customer.email, aanX, aanY); aanY += 4.5; }
  if (customer?.phone) { doc.text(customer.phone, aanX, aanY); aanY += 4.5; }

  y = Math.max(vanY, aanY) + 4;
  dc(C.line); doc.setLineWidth(0.3);
  doc.line(colMid, partyStartY, colMid, y - 2);
  doc.line(M, y, W - M, y);
  y += 9;

  // ── Gedeelde bouwstenen voor de blokken hieronder ───────────────────────
  const sectieKop = (titel, extra) => {
    ruimte(14);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); tc(C.muted);
    doc.text(titel.toUpperCase(), M, y);
    if (extra) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7); tc(C.dark);
      doc.text(extra, W - M, y, { align: 'right' });
    }
    y += 3;
    dc(accent); doc.setLineWidth(0.6); doc.line(M, y, W - M, y);
    y += 6;
  };

  const scheiding = () => { dc(C.line); doc.setLineWidth(0.3); doc.line(M, y - 3, W - M, y - 3); };

  // ── UITGEVOERD WERK ─────────────────────────────────────────────────────
  const werkTekst = htmlToPdfText(werkbon?.omschrijving) || werkbon?.titel || '';
  if (werkTekst) {
    sectieKop('Uitgevoerd werk');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); tc(C.soft);
    const regels = doc.splitTextToSize(werkTekst, CW);
    for (const r of regels) {
      ruimte(6);
      doc.text(r, M, y);
      y += 4.6;
    }
    y += 5;
  }

  // ── TAKEN ───────────────────────────────────────────────────────────────
  // Uitsluitend de afgevinkte taken: dat is het werk waarvoor de klant tekent.
  // De aanroeper zeeft ze al (bouwPdfData) en de sign-token-functie levert ze
  // niet uit; deze filter is het derde slot op dezelfde deur.
  const gedaan = taken.filter(t => t.afgerond);
  if (gedaan.length) {
    sectieKop('Uitgevoerde werkzaamheden');
    gedaan.forEach((t, i) => {
      ruimte(9);
      if (i > 0) scheiding();
      // Vinkje getekend als lijnen — de standaard Helvetica-encoding kent geen ✓.
      fc(C.green); doc.ellipse(M + 2, y - 1.2, 1.9, 1.9, 'F');
      dc(C.paper); doc.setLineWidth(0.45);
      doc.line(M + 1.1, y - 1.2, M + 1.8, y - 0.4);
      doc.line(M + 1.8, y - 0.4, M + 3.1, y - 2.2);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9); tc(C.dark);
      const regels = doc.splitTextToSize(t.omschrijving || '', CW - 12);
      doc.text(regels[0] || '', M + 7, y);
      y += 7.5;
    });
    y += 4;
  }

  // ── GEWERKTE UREN ───────────────────────────────────────────────────────
  if (uren.length) {
    const totaal = uren.reduce((s, u) => s + Number(u.uren || 0), 0);
    sectieKop('Gewerkte uren', `Totaal ${uurFmt(totaal)}`);
    // Geen kolom MEDEWERKER: wie het werk deed is loonadministratie. Datum,
    // tijden, pauze, opmerking en totaal blijven — dat is wat de uren verklaart.
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); tc(C.muted);
    doc.text('DATUM', M, y);
    doc.text('TIJD', M + 34, y);
    doc.text('UREN', W - M, y, { align: 'right' });
    y += 6;
    uren.forEach((u, i) => {
      ruimte(10);
      if (i > 0) scheiding();
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); tc(C.dark);
      doc.text(fmtDate(u.datum), M, y);
      doc.setFont('helvetica', 'normal'); tc(C.soft);
      const van = tijdFmt(u.startTijd || u.start_tijd);
      const tot = tijdFmt(u.eindTijd || u.eind_tijd);
      const pauze = Number(u.pauzeMinuten ?? u.pauze_minuten ?? 0);
      doc.text(van && tot ? `${van} – ${tot}${pauze ? ` (${pauze} min pauze)` : ''}` : '', M + 34, y);
      doc.setFont('helvetica', 'bold'); tc(C.dark);
      doc.text(uurFmt(u.uren), W - M, y, { align: 'right' });
      // De opmerking verklaart een uitloop en is voor de klant het antwoord op
      // "waarom stond je daar zo lang" — dus onder de regel, niet ernaast.
      const opmerking = u.notitie || u.opmerking;
      if (opmerking) {
        y += 4.4;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); tc(C.muted);
        const regels = doc.splitTextToSize(opmerking, CW - 40);
        doc.text(regels[0] || '', M + 34, y);
      }
      y += 7;
    });
    dc(C.line); doc.setLineWidth(0.3); doc.line(M, y - 2.5, W - M, y - 2.5);
    y += 8;
  }

  // ── GEBRUIKT MATERIAAL (zonder prijzen — zie kop van dit bestand) ───────
  if (materialen.length) {
    sectieKop('Gebruikt materiaal');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); tc(C.muted);
    doc.text('OMSCHRIJVING', M, y);
    doc.text('AANTAL', W - M, y, { align: 'right' });
    y += 6;
    materialen.forEach((m, i) => {
      ruimte(9);
      if (i > 0) scheiding();
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); tc(C.dark);
      doc.text(doc.splitTextToSize(m.naam || '', CW - 40)[0] || '', M, y);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); tc(C.soft);
      doc.text(`${aantalFmt(m.aantal)}${m.eenheid ? ` ${m.eenheid}` : ''}`, W - M, y, { align: 'right' });
      y += 7.5;
    });
    dc(C.line); doc.setLineWidth(0.3); doc.line(M, y - 2.5, W - M, y - 2.5);
    y += 8;
  }

  // ── EXTRA UITGEVOERD WERK ───────────────────────────────────────────────
  // Meerwerk staat hier als omschrijving, zonder bedrag. De klant tekent dat het
  // werk is uitgevoerd; wat het kost bepaalt het bedrijf bij het factureren. De
  // interne inschatting van de monteur komt hier dus niet — die is geen prijs.
  if (meerwerk.length) {
    sectieKop('Extra uitgevoerd werk');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); tc(C.muted);
    ruimte(6);
    doc.text('Dit werk zat niet in de oorspronkelijke opdracht.', M, y);
    y += 6;
    meerwerk.forEach((mw, i) => {
      ruimte(9);
      if (i > 0) scheiding();
      // Zelfde vinkje als bij de werkzaamheden: het ís uitgevoerd.
      fc(C.green); doc.ellipse(M + 2, y - 1.2, 1.9, 1.9, 'F');
      dc(C.paper); doc.setLineWidth(0.45);
      doc.line(M + 1.1, y - 1.2, M + 1.8, y - 0.4);
      doc.line(M + 1.8, y - 0.4, M + 3.1, y - 2.2);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); tc(C.dark);
      const regels = doc.splitTextToSize(mw.omschrijving || '', CW - 12);
      doc.text(regels[0] || '', M + 7, y);
      y += 7.5;
    });
    dc(C.line); doc.setLineWidth(0.3); doc.line(M, y - 2.5, W - M, y - 2.5);
    y += 8;
  }

  // ── TOELICHTING VOOR DE KLANT ───────────────────────────────────────────
  // Alleen regels die als klantnotitie zijn gemarkeerd. Interne notities komen
  // hier niet binnen: de aanroeper geeft ze niet mee en de sign-token-functie
  // levert ze niet uit.
  if (notities.length) {
    sectieKop('Toelichting');
    notities.forEach((n, i) => {
      const tekst = htmlToPdfText(n.note || n.body || '');
      if (!tekst) return;
      const regels = doc.splitTextToSize(tekst, CW - 22);
      const blokH = Math.max(13, regels.length * 4 + 10);
      ruimte(blokH + 4);
      fc(C.panel);
      doc.roundedRect(M, y, CW, blokH, 2.1, 2.1, 'F');
      const eersteRegelY = y + (blokH - Math.max(0, regels.length - 1) * 4) / 2 + 1;
      fc(accent); doc.ellipse(M + 6, eersteRegelY - 1, 2.1, 2.1, 'F');
      tc(accentInk); doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
      doc.text('i', M + 6, eersteRegelY, { align: 'center' });
      tc(C.soft); doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      doc.text(regels, M + 11.5, eersteRegelY);
      y += blokH + (i < notities.length - 1 ? 4 : 8);
    });
  }

  // ── WAARSCHUWINGEN AAN DE KLANT (Wkb) ───────────────────────────────────
  // Bewust een eigen blok en niet bij de toelichting: dit is het onderdeel dat
  // er in het opleverdossier toe doet. Het moet in één oogopslag te zien zijn
  // dát er gewaarschuwd is, wát er is geconstateerd, wat het gevolg kan zijn en
  // wanneer het is verstuurd. Amberkleurig kader, dus ook in zwart-wit anders
  // dan de rest.
  if (waarschuwingen.length) {
    sectieKop('Waarschuwingen aan de klant');

    waarschuwingen.forEach((w, i) => {
      // Eerst het lettertype zetten, dán pas opmeten: splitTextToSize rekent met
      // de ACTUELE instellingen. Deed ik dat andersom, dan mat hij met het font
      // van de sectiekop en liep de tekst het kader uit.
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      const tekstBreedte = CW - 12;      // 6 mm lucht links én rechts
      const watRegels = doc.splitTextToSize(htmlToPdfText(w.note) || '', tekstBreedte);
      const gevolgRegels = w.gevolg ? doc.splitTextToSize(htmlToPdfText(w.gevolg), tekstBreedte) : [];
      // kop + constatering + (kop + gevolg) + verzendregel
      const blokH = 9 + watRegels.length * 4
        + (gevolgRegels.length ? 5 + gevolgRegels.length * 4 : 0)
        + 7;
      ruimte(blokH + 4);

      fc(C.warnBg); dc(C.warnLine); doc.setLineWidth(0.4);
      doc.roundedRect(M, y, CW, blokH, 2.1, 2.1, 'FD');
      // Accentbalkje links, zodat het blok ook bij een fotokopie opvalt.
      fc(C.warnLine); doc.rect(M, y + 1, 1.4, blokH - 2, 'F');

      let ly = y + 6;
      tc(C.warnInk); doc.setFont('helvetica', 'bold'); doc.setFontSize(7);
      doc.text('GECONSTATEERD', M + 6, ly);
      ly += 4;
      tc(C.dark); doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      doc.text(watRegels, M + 6, ly);
      ly += watRegels.length * 4;

      if (gevolgRegels.length) {
        ly += 1;
        tc(C.warnInk); doc.setFont('helvetica', 'bold'); doc.setFontSize(7);
        doc.text('MOGELIJK GEVOLG', M + 6, ly);
        ly += 4;
        tc(C.dark); doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
        doc.text(gevolgRegels, M + 6, ly);
        ly += gevolgRegels.length * 4;
      }

      // De verzenddatum is het bewijs; zonder die regel is dit een notitie.
      ly += 3;
      tc(C.soft); doc.setFont('helvetica', 'italic'); doc.setFontSize(7);
      doc.text(
        w.verzondenOp
          ? `Schriftelijk aan de klant gemeld op ${fmtDateTime(w.verzondenOp)}`
          : 'Nog niet verstuurd',
        M + 6, ly,
      );

      y += blokH + (i < waarschuwingen.length - 1 ? 4 : 8);
    });
  }

  // ── FOTO'S ──────────────────────────────────────────────────────────────
  // Twee per rij. De bijschriften komen uit de categorie ("voor", "na", …) —
  // dat is precies waar de foto's bij een discussie voor dienen.
  if (fotos.length) {
    const gap = 6;
    const vakW = (CW - gap) / 2;
    const vakH = 52;
    const pad = 2;

    // Elke foto teruggebracht tot wat er in het vak wordt afgedrukt. Een
    // telefoonfoto is al gauw 4 MB; met acht foto's op een bon is de bijlage
    // anders niet meer te mailen. Zie bereidAfbeeldingVoor in src/utils/generatePdf.js.
    const geladen = [];
    for (const f of fotos) {
      const dataUrl = f.dataUrl || (f.url ? await omgeving.naarDataUrl?.(f.url) : null);
      if (!dataUrl) continue;
      const klaar = await omgeving.bereidAfbeelding?.(dataUrl, vakW - pad * 2, vakH - pad * 2);
      if (klaar) geladen.push({ ...klaar, categorie: f.categorie || '' });
    }

    if (geladen.length) {
      sectieKop("Foto's", `${geladen.length} ${geladen.length === 1 ? 'foto' : "foto's"}`);
      for (let i = 0; i < geladen.length; i += 2) {
        const rij = geladen.slice(i, i + 2);
        ruimte(vakH + 9);
        rij.forEach((f, k) => {
          const x = M + k * (vakW + gap);
          dc(C.line); doc.setLineWidth(0.3);
          doc.roundedRect(x, y, vakW, vakH, 2.1, 2.1, 'S');
          // Gecentreerd in het vak, met de originele verhouding — een uitgerekte
          // 'voor'-foto is geen bewijs meer.
          const ix = x + (vakW - f.breedte) / 2;
          const iy = y + (vakH - f.hoogte) / 2;
          try { doc.addImage(f.dataUrl, f.formaat, ix, iy, f.breedte, f.hoogte, '', 'FAST'); } catch { /* sla over */ }
          if (f.categorie) {
            doc.setFont('helvetica', 'bold'); doc.setFontSize(7); tc(C.muted);
            doc.text(f.categorie.toUpperCase(), x, y + vakH + 4);
          }
        });
        y += vakH + 9;
      }
      y += 2;
    }
  }

  // ── HANDTEKENING ────────────────────────────────────────────────────────
  // Zelfde blok als op de ondertekende offerte, zodat een klant die beide krijgt
  // hetzelfde bewijsstuk herkent.
  const ondertekendOp = werkbon?.ondertekendOp || werkbon?.ondertekend_op;
  if (ondertekendOp) {
    const naam = werkbon.ondertekendDoorNaam || werkbon.ondertekend_door_naam || '';
    const email = werkbon.ondertekendDoorEmail || werkbon.ondertekend_door_email || '';
    let sigData = werkbon.handtekeningDataUrl || null;
    if (!sigData && werkbon.handtekeningUrl && omgeving.documentUrl) {
      // Korte link op het moment van gebruik (document-url); zie documentService.
      const url = await omgeving.documentUrl({ soort: 'werkbon_handtekening', id: werkbon.id, token: werkbon.signToken, opgeslagen: werkbon.handtekeningUrl });
      if (url) sigData = await omgeving.naarDataUrl?.(url);
    }

    const hasImg = Boolean(sigData);
    const extra = werkbon.ondertekeningExtra || null;
    const blokH = (hasImg ? 52 : 42) + (extra ? 16 : 0);
    ruimte(blokH + 6);

    dc(C.lineStr); doc.setLineWidth(0.4);
    doc.roundedRect(M, y, CW, blokH, 2.1, 2.1, 'S');
    fc(C.panel);
    doc.roundedRect(M, y, CW, 13, 2.1, 2.1, 'F');
    doc.rect(M, y + 7, CW, 6, 'F');
    dc(C.line); doc.setLineWidth(0.3); doc.line(M, y + 13, W - M, y + 13);

    fc(C.green); doc.ellipse(M + 7, y + 6.5, 2.4, 2.4, 'F');
    dc(C.paper); doc.setLineWidth(0.5);
    doc.line(M + 5.8, y + 6.6, M + 6.7, y + 7.6);
    doc.line(M + 6.7, y + 7.6, M + 8.4, y + 5.4);

    tc(C.dark); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text('Akkoord met het uitgevoerde werk', M + 13, y + 8);
    tc(C.muted); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
    doc.text(`Ondertekend · ${fmtDatumVanTijdstip(ondertekendOp)}`, W - M, y + 8, { align: 'right' });

    let fy = y + 20;
    [['Ondertekend door', naam || ''],
     ['E-mailadres', email || ''],
     ['Datum en tijd', fmtDateTime(ondertekendOp)],
     ...(extra?.ip ? [['IP-adres', extra.ip]] : [])].forEach(([label, val]) => {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); tc(C.muted);
      doc.text(label, M + 5, fy);
      doc.setFont('helvetica', 'bold'); tc(C.dark);
      doc.text(val, M + 48, fy);
      fy += 5.5;
    });

    if (hasImg) {
      try {
        const dims = await omgeving.afmetingen?.(sigData);
        const maxW = 58, maxH = 22;
        let drawW = maxW, drawH = maxH;
        if (dims?.w > 0 && dims?.h > 0) {
          drawW = maxW; drawH = maxW / (dims.w / dims.h);
          if (drawH > maxH) { drawH = maxH; drawW = maxH * (dims.w / dims.h); }
        }
        const sigX = W - M - drawW - 2;
        const sigY = y + 16;
        doc.addImage(sigData, 'PNG', sigX, sigY, drawW, drawH, '', 'FAST');
        dc(C.lineStr); doc.setLineWidth(0.3);
        doc.line(sigX, sigY + drawH + 1, sigX + drawW, sigY + drawH + 1);
        tc(C.muted); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
        doc.text(`Handtekening — ${naam}`, sigX + drawW, sigY + drawH + 5, { align: 'right' });
      } catch { /* zonder afbeelding blijven de velden staan */ }
    }
    if (extra) ondertekeningKenmerk(doc, extra, M, y + blokH - 13, CW);
    y += blokH + 8;
  } else {
    // Nog niet getekend: een leeg vak, zodat een uitgeprinte bon ter plekke met
    // pen kan worden afgetekend als de telefoon leeg is.
    ruimte(40);
    dc(C.lineStr); doc.setLineWidth(0.4);
    doc.roundedRect(M, y, CW, 34, 2.1, 2.1, 'S');
    tc(C.muted); doc.setFont('helvetica', 'bold'); doc.setFontSize(7);
    doc.text('AKKOORD MET HET UITGEVOERDE WERK', M + 5, y + 7);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
    doc.text('Naam', M + 5, y + 17);
    doc.text('Datum', M + 5, y + 27);
    dc(C.line); doc.setLineWidth(0.3);
    doc.line(M + 22, y + 18, M + 90, y + 18);
    doc.line(M + 22, y + 28, M + 90, y + 28);
    doc.text('Handtekening', W - M - 62, y + 27);
    doc.line(W - M - 62, y + 20, W - M - 5, y + 20);
    y += 40;
  }

  // ── FOOTER op elke pagina ───────────────────────────────────────────────
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    const footY = 282;
    dc(C.line); doc.setLineWidth(0.3); doc.line(M, footY - 3, W - M, footY - 3);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal'); tc(C.faint);
    const prefix = 'Gegenereerd door ';
    doc.text(prefix, M, footY + 4);
    doc.setFont('helvetica', 'bold'); tc(C.muted);
    doc.text('BossBase', M + doc.getTextWidth(prefix), footY + 4);
    doc.setFont('helvetica', 'normal'); tc(C.faint);
    doc.text(`Werkbon ${werkbon?.nummer || ''} · Pagina ${p} van ${paginas}`, W - M, footY + 4, { align: 'right' });
  }
}
