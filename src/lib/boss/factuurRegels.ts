/**
 * Factuurregels en Boss: wat Boss van de factuur ziet, en een voorstel van
 * Boss toepassen.
 *
 * Overgenomen uit het dashboard (`BossFactuurPaneel` in
 * `src/components/boss/BossAssistent.jsx`), omgezet naar het regelmodel van de
 * app. Puur: tests/bossFactuur.test.mjs.
 */
import { nieuweId, nummerNaarVeld, regelprijs, veldNaarNummer, type Regel } from '../regels';
import { btwVoorVoorstel } from './offerteRegels';

/** Een regel zonder omschrijving telt niet: de nieuwe factuur begint met een lege regel. */
export const isLegeFactuurRegel = (r: Regel) => !String(r.omschrijving || '').trim();

/** Een regel die Boss zonder prijs neerzette, mag niet stil als € 0 de factuur op. */
export const prijsOntbreekt = (r: Regel) => Boolean(r.bossPrijsOntbreekt) && String(r.prijs ?? '').trim() === '';
export const aantalZonderPrijs = (regels: Regel[]) => regels.filter(prijsOntbreekt).length;

/** Elke regel heeft een vaste ref nodig, zodat Boss een bestaande regel aanpast in plaats van er een bij te zetten. */
export const metRefs = (regels: Regel[]) => regels.map((r) => (r.id ? r : { ...r, id: nieuweId() }));

/** Wat Boss van de factuur te zien krijgt. */
export function factuurRegelsVoorBoss(regels: Regel[]) {
  return regels.filter((r) => !isLegeFactuurRegel(r)).map((r) => ({
    ref: r.id,
    type: r.type,
    omschrijving: r.omschrijving,
    // Getallen, geen tekstvelden: de functie leest "2,5" anders als 0.
    aantal: veldNaarNummer(r.aantal),
    eenheidsprijs: String(r.prijs ?? '').trim() === '' ? null : veldNaarNummer(r.prijs),
    btw_pct: r.btwPct,
    btw_regime: r.btwRegime,
  }));
}

export type FactuurVoorstelRegel = {
  ref?: string | null;
  type: string;
  omschrijving: string;
  aantal: number;
  eenheid?: string | null;
  eenheidsprijs: number | null;
  btw_regime?: string | null;
  btw_pct?: number | null;
  bron?: string | null;
  tekst_door_boss?: boolean;
};

/**
 * Past een voorstel toe op de regels. `voor` is de stand toen de vraag werd
 * gesteld: wat de gebruiker daarna zelf toevoegde, blijft staan.
 */
export function pasFactuurVoorstelToe(
  regels: Regel[],
  voorstel: FactuurVoorstelRegel[],
  { voor, maakRegel, standaardPct = 21 }: { voor: Regel[]; maakRegel: () => Regel; standaardPct?: number },
): { regels: Regel[]; gewijzigd: string[] } {
  const vm = new Map(regels.map((r) => [r.id, r]));
  const voorIds = new Set(voor.map((r) => r.id));
  const gewijzigd: string[] = [];
  const nieuw: Regel[] = voorstel.map((b) => {
    const oud = b.ref ? vm.get(b.ref) : undefined;
    const basis: Regel = oud ? { ...oud } : { ...maakRegel(), id: nieuweId() };
    const r: Regel = {
      ...basis,
      type: b.type,
      omschrijving: b.omschrijving,
      aantal: nummerNaarVeld(Number(b.aantal)),
      prijs: b.eenheidsprijs == null ? '' : nummerNaarVeld(b.eenheidsprijs),
      ...btwVoorVoorstel(b, oud ?? null, standaardPct),
      bossBron: b.bron && !['factuur', 'opdracht'].includes(b.bron) ? b.bron : (oud?.bossBron || null),
      bossTekst: Boolean(b.tekst_door_boss) || (Boolean(oud?.bossTekst) && oud?.omschrijving === b.omschrijving),
      bossPrijsOntbreekt: b.eenheidsprijs == null,
    };
    if (!oud || oud.omschrijving !== r.omschrijving || veldNaarNummer(oud.aantal) !== veldNaarNummer(r.aantal) || oud.prijs !== r.prijs) {
      gewijzigd.push(r.id!);
    }
    return r;
  });
  // Wat de gebruiker na het voorstel zelf toevoegde, blijft staan.
  regels.filter((r) => !voorIds.has(r.id) && !isLegeFactuurRegel(r)).forEach((r) => nieuw.push(r));
  const eind = nieuw.filter((r) => !isLegeFactuurRegel(r));
  return { regels: eind.length ? eind : [{ ...maakRegel(), id: nieuweId() }], gewijzigd };
}

/** Totaal van een lijst regels uit een voorstel, voor de kaart in het gesprek. */
export function voorstelTotaal(lijst: { aantal: number | string; prijs: number | string | null; btwPct: number }[]) {
  let excl = 0;
  let btw = 0;
  for (const r of lijst) {
    const b = regelprijs({ aantal: String(r.aantal ?? 0), prijs: String(r.prijs ?? 0) } as Regel);
    excl += b;
    btw += (b * r.btwPct) / 100;
  }
  return { excl: Math.round(excl * 100) / 100, incl: Math.round((excl + btw) * 100) / 100 };
}
