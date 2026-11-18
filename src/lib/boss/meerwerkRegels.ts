// ── Meerwerk met Boss: rekenregels en voorstel ─────────────────────────────
// Puur (geen netwerk), zodat het met node te testen is (tests/bossMeerwerk).
//
// `berekenBedrag` is dezelfde rekenregel als in de edge function boss-meerwerk
// (supabase/functions/_shared/bossMeerwerkRegels.js van het dashboard): het
// bedrag is uren × uurtarief + aantal × prijs, en alleen als elk deel een bron
// heeft. Het venster rekent hiermee opnieuw als de gebruiker uren, aantallen
// of prijzen aanpast, tot hij het bedrag zelf invult. Pas ze samen aan.
//
// `gekoppeldAanMeerwerk` is gekoppeldAanMeerwerk uit lib/werkbonFactuur.js van
// het dashboard: de uren en het materiaal die bij een meerwerkregel horen.

import { locale, tx } from '@/i18n';
import { leesGetalNl } from '@/lib/getalNl';

const rond2 = (n: number) => Math.round(n * 100) / 100;
const getal = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : leesGetalNl(v);
  return n !== null && Number.isFinite(n) ? n : null;
};
const bedragTekst = (n: number) =>
  `€ ${n.toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const getalTekst = (n: number) => n.toLocaleString(locale(), { maximumFractionDigits: 4 });

export type BerekendBedrag = { bedrag: number | null; opbouw: string | null; ontbreekt: string[] };

/**
 * Het bedrag van het meerwerk, alleen als elk deel een bron heeft.
 * Geeft bedrag null als het niet uit te rekenen is (dan staat in `ontbreekt` wat mist).
 */
export function berekenBedrag({
  uren = null,
  uurtarief = null,
  materialen = [],
}: {
  uren?: number | string | null;
  uurtarief?: number | string | null;
  materialen?: { omschrijving: string; aantal: number | string | null; prijs_excl: number | string | null }[];
} = {}): BerekendBedrag {
  const regels: string[] = [];
  const ontbreekt: string[] = [];
  let som = 0;
  const u = getal(uren);
  const tarief = getal(uurtarief);
  if (u !== null && u > 0) {
    if (tarief !== null && tarief > 0) {
      const deel = rond2(u * tarief);
      som += deel;
      regels.push(
        tx('{uren} uur × {tarief} (uurtarief uit Instellingen) = {bedrag}', {
          uren: getalTekst(u),
          tarief: bedragTekst(tarief),
          bedrag: bedragTekst(deel),
        }),
      );
    } else ontbreekt.push('uurtarief');
  }
  for (const m of materialen || []) {
    const a = getal(m.aantal);
    const p = getal(m.prijs_excl);
    if (a === null) {
      ontbreekt.push(`aantal ${m.omschrijving}`);
      continue;
    }
    if (p === null) {
      ontbreekt.push(`prijs ${m.omschrijving}`);
      continue;
    }
    const deel = rond2(a * p);
    som += deel;
    regels.push(
      tx('{aantal} × {naam} à {prijs} (Materialen) = {bedrag}', {
        aantal: getalTekst(a),
        naam: m.omschrijving,
        prijs: bedragTekst(p),
        bedrag: bedragTekst(deel),
      }),
    );
  }
  if (!regels.length && !ontbreekt.length) return { bedrag: null, opbouw: null, ontbreekt: ['uren of materiaal'] };
  if (ontbreekt.length) return { bedrag: null, opbouw: null, ontbreekt };
  const bedrag = rond2(som);
  return {
    bedrag,
    opbouw: [...regels, tx('Totaal {bedrag} excl. btw', { bedrag: bedragTekst(bedrag) })].join('\n'),
    ontbreekt: [],
  };
}

// ── Het voorstel van Boss ──────────────────────────────────────────────────

/** Antwoord van boss-meerwerk (taak 'meerwerk'). */
export type BossMeerwerkResultaat =
  | {
      soort: 'voorstel';
      omschrijving: string;
      uren: number | null;
      materialen: {
        omschrijving: string;
        aantal: number | null;
        eenheid: string | null;
        materiaal_id: string | null;
        prijs_excl: number | null;
      }[];
      bedrag_excl: number | null;
      opbouw: string | null;
      vragen: string[];
    }
  | { soort: 'melding'; melding: string };

/** Het voorstel zoals het in het venster te bewerken is: getallen als tekst. */
export type MeerwerkVoorstel = {
  omschrijving: string;
  uren: string;
  materialen: {
    sleutel: string;
    omschrijving: string;
    aantal: string;
    eenheid: string;
    materiaalId: string | null;
    prijs: string;
  }[];
  bedrag: string;
  opbouw: string;
  vragen: string[];
  waarschuwingen: string[];
};

/** Getal → tekst in een invoerveld ("2,5"); null → leeg. */
export const naarVeld = (v: number | null | undefined) => (v == null ? '' : String(v).replace('.', ','));

/** Tekst uit een invoerveld → getal; leeg = null, onleesbaar = NaN. */
export function leesVeld(v: string | null | undefined): number | null {
  if (v == null || v.trim() === '') return null;
  const n = leesGetalNl(v);
  return n !== null && Number.isFinite(n) ? n : NaN;
}

export function naarVoorstel(
  r: Extract<BossMeerwerkResultaat, { soort: 'voorstel' }>,
  waarschuwingen: string[] = [],
): MeerwerkVoorstel {
  return {
    omschrijving: r.omschrijving || '',
    uren: naarVeld(r.uren),
    materialen: (r.materialen || []).map((m, i) => ({
      sleutel: `m${i}`,
      omschrijving: m.omschrijving || '',
      aantal: naarVeld(m.aantal),
      eenheid: m.eenheid || '',
      materiaalId: m.materiaal_id || null,
      prijs: naarVeld(m.prijs_excl),
    })),
    bedrag: naarVeld(r.bedrag_excl),
    opbouw: r.opbouw || '',
    vragen: r.vragen || [],
    waarschuwingen,
  };
}

/**
 * Wat er niet klopt aan het voorstel (null = in orde): een omschrijving is
 * verplicht, uren en bedrag mogen leeg maar niet onleesbaar, en elk materiaal
 * heeft een naam en een aantal groter dan 0.
 */
export function voorstelOngeldig(v: MeerwerkVoorstel, bedrag: string, magBedragen: boolean): string | null {
  if (!v.omschrijving.trim()) return tx('Vul een omschrijving in.');
  const u = leesVeld(v.uren);
  if (Number.isNaN(u) || (u !== null && u < 0)) return tx('Vul een geldig aantal uren in.');
  if (magBedragen) {
    const b = leesVeld(bedrag);
    if (Number.isNaN(b) || (b !== null && b < 0)) return tx('Vul een geldig bedrag in.');
  }
  for (const m of v.materialen) {
    if (!m.omschrijving.trim()) return tx('Elk materiaal heeft een naam nodig.');
    const a = leesVeld(m.aantal);
    if (a === null || Number.isNaN(a) || a <= 0) return tx('Vul bij {naam} een aantal in.', { naam: m.omschrijving.trim() });
    if (magBedragen && Number.isNaN(leesVeld(m.prijs))) return tx('Vul bij {naam} een geldige prijs in.', { naam: m.omschrijving.trim() });
  }
  return null;
}

// ── Gekoppeld aan meerwerk ─────────────────────────────────────────────────

/** Uren en materiaal die bij één meerwerkregel horen (via meerwerk_taak_id). */
export function gekoppeldAanMeerwerk<
  U extends { meerwerk_taak_id?: string | null; uren: number | string | null },
  M extends { meerwerk_taak_id?: string | null },
>(taakId: string, { uren = [], materialen = [] }: { uren?: U[]; materialen?: M[] } = {}) {
  const u = uren.filter((x) => x.meerwerk_taak_id === taakId);
  const m = materialen.filter((x) => x.meerwerk_taak_id === taakId);
  return { uren: rond2(u.reduce((s, x) => s + (Number(x.uren) || 0), 0)), aantalUren: u.length, materialen: m };
}
