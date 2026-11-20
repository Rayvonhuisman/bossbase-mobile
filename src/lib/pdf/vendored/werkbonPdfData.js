// ── OVERGENOMEN UIT HET DASHBOARD — niet met de hand bewerken ──
// Bron: BossBase supabase/functions/_shared/werkbonPdfData.js
// Dashboardcommit: dfd24b17
// Bijwerken: node scripts/pdf-opbouw-overnemen.mjs (daarna npm test).
// Alles onder deze kop is een letterlijke kopie; tests/pdfOpbouw.test.mjs
// vergelijkt het met het dashboard.
// ── einde overgenomen kop ──
// Welke werkbongegevens op de PDF mogen: alleen wat de klant hoort te zien.
// Gedeeld tussen de app (werkbonOndertekenenService) en de server (het
// ondertekende exemplaar), zodat dezelfde zeef op beide routes staat.

/**
 * Zet de losse detailgegevens om naar wat de PDF nodig heeft, en zeeft daarbij
 * alles weg wat de klant niet hoort te zien. Eén plek, gebruikt door de app én
 * door de publieke pagina, zodat de twee PDF's identiek zijn.
 */
/**
 * Splitst KLANTNOTITIES in gewone toelichting en verstuurde Wkb-waarschuwingen.
 *
 * Een verstuurde waarschuwing ís een klantnotitie, maar hoort niet tussen de
 * toelichting: in het opleverdossier moet juist te zien zijn dát er gewaarschuwd
 * is, met de verzenddatum als bewijs.
 *
 * Verwacht een lijst waar de interne notities al uit zijn. De app filtert daar
 * zelf op `voorKlant`; de sign-token-RPC geeft alleen klantregels terug en levert
 * dat veld niet eens mee. Zou deze functie zelf op voor_klant filteren, dan
 * hield ze bij de ondertekenpagina precies niets over.
 */
export function splitsKlantnotities(klantnotities = []) {
  // De app geeft camelCase door, de RPC snake_case.
  const verzonden = n => n.verzondenOp || n.waarschuwing_verzonden_op || null;
  return {
    notities: klantnotities.filter(n => !verzonden(n)).map(n => ({ note: n.note })),
    waarschuwingen: klantnotities.filter(verzonden).map(n => ({
      note: n.note,
      gevolg: n.gevolg || '',
      verzondenOp: verzonden(n),
    })),
  };
}

/** Het meerwerkbedrag excl. btw, of null. Leest camelCase (app/dashboard) en snake_case (RPC). */
export function meerwerkBedrag(m) {
  const v = m?.bedragExcl ?? m?.bedrag_excl
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

export function bouwPdfData({ taken = [], uren = [], materialen = [], meerwerk = [], notities = [], fotos = [] }) {
  return {
    // Alleen afgevinkte regels: de klant tekent voor het uitgevoerde werk. Wat
    // nog openstaat blijft in de app staan — anders tekent hij voor een lijst
    // met wat er níét gedaan is, en dat is een discussie in plaats van een bon.
    //
    // Taken en meerwerk komen uit dezelfde tabel maar krijgen een eigen blok, zodat
    // zichtbaar is wat er tijdens de klus bij is gevraagd.
    taken: taken.filter(t => t.afgerond && !t.isMeerwerk).map(t => ({
      omschrijving: t.omschrijving, afgerond: true,
    })),
    // Geen medewerkernaam: wie het werk deed is loonadministratie en gaat de
    // klant niet aan. De opmerking blijft wél mee — die verklaart de uren.
    uren: uren.map(u => ({
      datum: u.datum,
      startTijd: u.startTijd || u.start_tijd || null,
      eindTijd: u.eindTijd || u.eind_tijd || null,
      pauzeMinuten: u.pauzeMinuten ?? u.pauze_minuten ?? 0,
      uren: Number(u.uren || 0),
      notitie: u.notitie || u.opmerking || '',
    })),
    // Alleen naam, aantal en eenheid: geen prijs_per, geen subtotaal, geen
    // inkoopprijs. Die velden zitten wel in het materiaal-object van de app,
    // dus dit filter is het enige dat ze tegenhoudt — laat het staan.
    materialen: materialen.map(m => ({
      naam: m.naam, eenheid: m.eenheid || '', aantal: Number(m.aantal || 0),
    })),
    // Meerwerk: dezelfde regel als bij taken — alleen afgevinkt. Uit `meerwerk`
    // als de aanroeper een aparte lijst meegeeft (de app), anders uit de
    // takenlijst zelf (de ondertekenpagina krijgt één lijst uit de RPC).
    //
    // Het bedrag (verkoopprijs excl. btw, werkbon_meerwerk_prijs) gaat mee als
    // het er is: de klant mag zien wat het meerwerk kost als er een bedrag is
    // gerekend (Niels, 20-11-2026). Alleen dat bedrag, nooit de uren of iets
    // anders uit die tabel.
    meerwerk: (meerwerk.length ? meerwerk : taken.filter(t => t.isMeerwerk))
      .filter(m => m.afgerond)
      .map(m => ({ omschrijving: m.omschrijving, bedragExcl: meerwerkBedrag(m) })),
    // Alleen wat expliciet als klantnotitie is gemarkeerd, en daarbinnen
    // gesplitst in gewone toelichting en verstuurde waarschuwingen.
    ...splitsKlantnotities(
      notities.filter(n => n.voorKlant === true || n.voor_klant === true),
    ),
    fotos: fotos.map(f => ({ url: f.url, categorie: f.categorie || '' })),
  }
}
