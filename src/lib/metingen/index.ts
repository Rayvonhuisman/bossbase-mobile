/**
 * Metingen in de app: de regels rond het blok op de projectkaart en "Vertel het
 * Boss". Wat het dashboard al heeft, komt uit `./vendored` (letterlijke kopieën,
 * zie scripts/meting-overnemen.mjs): de berekening en weergave van een maat, de
 * velden per branche, en `voegStukToe` voor het samenvoegen van stukken. Hier
 * staat alleen wat de app eromheen nodig heeft, zonder React, zodat het in Node
 * te testen is (tests/metingen.test.mjs).
 */
import { voegStukToe } from './vendored/metingControle.js';
import {
  SOORTEN,
  MAAT_EENHEDEN,
  maatVelden,
  toonSom,
  toonMaat,
  toonWaarde,
  berekenMeting,
  extraRegels,
  brancheVelden,
} from './vendored/metingWeergave.js';

export { SOORTEN, MAAT_EENHEDEN, maatVelden, toonSom, toonMaat, toonWaarde, berekenMeting, extraRegels, brancheVelden, voegStukToe };

export type Soort = 'oppervlak' | 'lengte' | 'stuks' | 'inhoud';
export type Eenheid = 'mm' | 'cm' | 'm';
export type BrancheVeld = { key: string; label: string; type: 'keuze' | 'tekst'; opties?: string[]; placeholder?: string };

/** Een opgeslagen meting, zoals `toMeting` in het dashboard (metingService.js). */
export type Meting = {
  id: string;
  projectId: string;
  werkbonId: string | null;
  documentId: string | null;
  materiaalId: string | null;
  naam: string;
  soort: Soort;
  breedte: number | '';
  hoogte: number | '';
  diepte: number | '';
  aantal: number;
  eenheid: Eenheid;
  waarde: number | null;
  waardeEenheid: string;
  opmerking: string;
  extra: Record<string, string>;
  fotos: string[];
  volgorde: number;
  createdAt: string;
};

/**
 * Het formulier: maten als tekst, zoals ze getypt zijn ("1,20"). Een komma is
 * in Nederland het decimaalteken; pas bij rekenen en opslaan wordt het een getal.
 */
export type MetingForm = {
  id?: string;
  naam: string;
  soort: Soort;
  breedte: string;
  hoogte: string;
  diepte: string;
  aantal: string;
  eenheid: Eenheid;
  opmerking: string;
  extra: Record<string, string>;
  materiaalId: string | null;
};

/** Een regel in de controlelijst van "Vertel het Boss" (nog niet opgeslagen). */
export type Regel = MetingForm & {
  sleutel: string;
  stuk?: string;
  nagekeken: boolean;
  twijfel?: boolean;
  twijfelReden?: string;
  twijfelVelden?: string[];
  wandenVan?: string;
};

export type Stuk = { id: string; tekst: string; aantal: number };

/** Wat de edge function per meting teruggeeft (na `controleer`). */
export type VoorstelMeting = {
  naam: string;
  soort: Soort;
  breedte: number | null;
  hoogte: number | null;
  diepte: number | null;
  aantal: number;
  eenheid: Eenheid;
  opmerking: string;
  extra: Record<string, string>;
  twijfel: boolean;
  twijfelReden: string;
  twijfelVelden: string[];
  vervangt?: string;
  wandenVan?: string;
};

export const LEEG_FORM: MetingForm = {
  naam: '',
  soort: 'oppervlak',
  breedte: '',
  hoogte: '',
  diepte: '',
  aantal: '1',
  eenheid: 'mm',
  opmerking: '',
  extra: {},
  materiaalId: null,
};

/** "1,20" → 1.2; leeg of onzin → null. */
export function leesGetal(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(/\s/g, '').replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Een getal zoals een vakman het typt: komma, geen duizendtalpunt. */
export function getalTekst(v: unknown): string {
  const n = leesGetal(v);
  return n === null ? '' : String(n).replace('.', ',');
}

/** Het formulier als meting met getallen, voor de berekening (toonSom) en het opslaan. */
export function alsMaten(f: Pick<MetingForm, 'soort' | 'breedte' | 'hoogte' | 'diepte' | 'aantal' | 'eenheid'>): {
  soort: Soort;
  eenheid: Eenheid;
  breedte: number | '';
  hoogte: number | '';
  diepte: number | '';
  aantal: number;
} {
  const aantal = leesGetal(f.aantal);
  return {
    soort: f.soort,
    eenheid: f.eenheid,
    breedte: leesGetal(f.breedte) ?? '',
    hoogte: leesGetal(f.hoogte) ?? '',
    diepte: leesGetal(f.diepte) ?? '',
    aantal: aantal && aantal > 0 ? aantal : 1,
  };
}

export function formUitMeting(m: Meting): MetingForm {
  return {
    id: m.id,
    naam: m.naam,
    soort: m.soort,
    breedte: getalTekst(m.breedte),
    hoogte: getalTekst(m.hoogte),
    diepte: getalTekst(m.diepte),
    aantal: getalTekst(m.aantal) || '1',
    eenheid: m.eenheid,
    opmerking: m.opmerking,
    extra: { ...m.extra },
    materiaalId: m.materiaalId,
  };
}

/** Nieuw formulier: zelfde soort en eenheid als de vorige meting, zoals het dashboard. */
export function nieuwForm(vorige?: Pick<Meting, 'soort' | 'eenheid'> | null): MetingForm {
  return { ...LEEG_FORM, soort: vorige?.soort ?? 'oppervlak', eenheid: vorige?.eenheid ?? 'mm', extra: {} };
}

/** Totaal per eenheid voor de kop: "12,4 m² · 7 m · 3 stuks". Zelfde als het dashboard. */
export function totalen(metingen: Pick<Meting, 'waarde' | 'waardeEenheid'>[]): string {
  const per: Record<string, number> = {};
  for (const m of metingen) if (m.waarde != null) per[m.waardeEenheid] = (per[m.waardeEenheid] || 0) + m.waarde;
  return ['m²', 'm', 'm³', 'stuk']
    .filter((e) => per[e])
    .map((e) => toonWaarde(Math.round((per[e] as number) * 100) / 100, e))
    .join(' · ');
}

/**
 * Alleen de velden die de gebruiker invult, zoals `naarRij` in het dashboard.
 * waarde en waarde_eenheid rekent de database uit; die sturen we nooit mee.
 * Komma's in maten worden punten. Een bestaande koppeling met een materiaal
 * blijft staan (de app wijzigt die niet).
 */
export function naarRij(m: MetingForm) {
  const maten = alsMaten(m);
  const extra = Object.fromEntries(
    Object.entries(m.extra || {})
      .filter(([, v]) => String(v ?? '').trim())
      .map(([k, v]) => [k, String(v).trim()]),
  );
  return {
    naam: String(m.naam || '').trim(),
    soort: m.soort || 'oppervlak',
    breedte: maten.breedte === '' ? null : maten.breedte,
    hoogte: maten.hoogte === '' ? null : maten.hoogte,
    diepte: maten.diepte === '' ? null : maten.diepte,
    aantal: maten.aantal,
    eenheid: m.eenheid || 'mm',
    opmerking: String(m.opmerking || '').trim() || null,
    extra,
    materiaal_id: m.materiaalId || null,
  };
}

// ── Vertel het Boss ────────────────────────────────────────────────────────

let teller = 0;
export const nieuweSleutel = () => `m${Date.now().toString(36)}${(teller++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Een voorstel van Boss als regel in de controlelijst; twijfel = eerst nakijken. */
export function naarRegel(r: VoorstelMeting & { sleutel?: string; stuk?: string }, maakSleutel = nieuweSleutel): Regel {
  return {
    naam: r.naam ?? '',
    soort: r.soort ?? 'oppervlak',
    breedte: getalTekst(r.breedte),
    hoogte: getalTekst(r.hoogte),
    diepte: getalTekst(r.diepte),
    aantal: getalTekst(r.aantal) || '1',
    eenheid: r.eenheid ?? 'm',
    opmerking: r.opmerking ?? '',
    extra: r.extra ?? {},
    materiaalId: null,
    sleutel: r.sleutel || maakSleutel(),
    ...(r.stuk ? { stuk: r.stuk } : {}),
    ...(r.vervangt ? { vervangt: r.vervangt } : {}),
    ...(r.wandenVan ? { wandenVan: r.wandenVan } : {}),
    twijfel: r.twijfel,
    twijfelReden: r.twijfelReden,
    twijfelVelden: r.twijfelVelden ?? [],
    nagekeken: !r.twijfel,
  } as Regel;
}

/** Zelfde tekst, los van hoofdletters en spaties: dan is het hetzelfde stuk. */
export const gelijkeTekst = (a: string, b: string) =>
  a.replace(/\s+/g, ' ').trim().toLowerCase() === b.replace(/\s+/g, ' ').trim().toLowerCase();

/** Is deze tekst al als een ander stuk verwerkt? Geeft het stuknummer (1-based) of null. */
export function alVerwerkt(stukken: Stuk[], tekst: string, bewerk: string | null): number | null {
  const i = stukken.findIndex((s) => s.id !== bewerk && gelijkeTekst(s.tekst, tekst));
  return i === -1 ? null : i + 1;
}

/** Wat er naar de edge function gaat als `bestaande`: alles behalve het stuk dat opnieuw wordt verwerkt. */
export function bestaandeVoor(regels: Regel[], stukId: string) {
  return regels
    .filter((r) => r.stuk !== stukId)
    .map((r) => {
      const m = alsMaten(r);
      return { naam: r.naam, breedte: m.breedte, hoogte: m.hoogte, diepte: m.diepte, aantal: m.aantal, eenheid: r.eenheid };
    });
}

/**
 * Het antwoord van Boss op een stuk verwerken, precies zoals het dashboard
 * (MetingenBlok.jsx, VertelBoss.verwerk): samenvoegen met `voegStukToe` (niets
 * dubbel, verbeteringen op hun plek), het stuk in de lijst zetten of bijwerken,
 * en de korte melding eronder.
 *
 * `regels` zijn de regels zoals ze NU in de lijst staan (ook wat de gebruiker
 * tijdens het wachten aanpaste). Vergelijkt `voegStukToe` met getallen, dan
 * gebruikt hij `getal()`, dat een komma niet leest; daarom gaan de regels er met
 * punten in en komen ze er als tekst met komma's weer uit.
 */
export function stukVerwerkt({
  regels,
  stukken,
  stukId,
  opnieuw,
  tekst,
  metingen,
  melding,
  maakSleutel = nieuweSleutel,
}: {
  regels: Regel[];
  stukken: Stuk[];
  stukId: string;
  opnieuw: boolean;
  tekst: string;
  metingen: VoorstelMeting[];
  melding: string;
  maakSleutel?: () => string;
}): { regels: Regel[]; stukken: Stuk[]; bericht: { tekst: string; fout: boolean } } {
  const metPunten = regels.map((r) => ({ ...r, ...alsMatenRuw(r) }));
  const nieuw = metingen.map((m) => {
    const r = naarRegel(m, maakSleutel);
    return { ...r, ...alsMatenRuw(r) };
  });
  const uitkomst = voegStukToe(metPunten, stukId, nieuw, maakSleutel, { opnieuw }) as {
    regels: (Regel & { breedte: unknown; hoogte: unknown; diepte: unknown; aantal: unknown })[];
    toegevoegd: number;
    vervangen: number;
    overgeslagen: number;
  };
  const terug: Regel[] = uitkomst.regels.map((r) => ({
    ...r,
    breedte: getalTekst(r.breedte),
    hoogte: getalTekst(r.hoogte),
    diepte: getalTekst(r.diepte),
    aantal: getalTekst(r.aantal) || '1',
    nagekeken: r.nagekeken ?? !r.twijfel,
  }));
  const bestaand = stukken.findIndex((s) => s.id === stukId);
  const nr = opnieuw && bestaand >= 0 ? bestaand + 1 : stukken.length + 1;
  const nieuweStukken =
    opnieuw && bestaand >= 0
      ? stukken.map((s) => (s.id === stukId ? { ...s, tekst, aantal: metingen.length } : s))
      : [...stukken, { id: stukId, tekst, aantal: metingen.length }];
  const n = uitkomst.toegevoegd;
  const delen = [
    metingen.length === 0 ? 'geen maten gevonden' : `${n === 1 ? '1 meting' : `${n} metingen`} erbij`,
    uitkomst.vervangen ? `${uitkomst.vervangen} verbeterd` : '',
    uitkomst.overgeslagen ? `${uitkomst.overgeslagen} stond er al` : '',
  ].filter(Boolean);
  return {
    regels: terug,
    stukken: nieuweStukken,
    bericht: { tekst: `Stuk ${nr}: ${delen.join(', ')}.${melding ? ` ${melding}` : ''}`, fout: metingen.length === 0 },
  };
}

/** Maten als getal (of null) voor voegStukToe; die vergelijkt en rekent met getallen. */
function alsMatenRuw(r: Pick<MetingForm, 'breedte' | 'hoogte' | 'diepte' | 'aantal'>) {
  const aantal = leesGetal(r.aantal);
  return {
    breedte: leesGetal(r.breedte),
    hoogte: leesGetal(r.hoogte),
    diepte: leesGetal(r.diepte),
    aantal: aantal && aantal > 0 ? aantal : 1,
  };
}

/** Een stuk weghalen: het stuk en al zijn regels. */
export function haalStukWeg(regels: Regel[], stukken: Stuk[], stukId: string) {
  return { regels: regels.filter((r) => r.stuk !== stukId), stukken: stukken.filter((s) => s.id !== stukId) };
}

/** Wat moet er nog gebeuren voordat de lijst opgeslagen kan worden? null = klaar. */
export function waaromNietOpslaan(regels: Regel[]): string | null {
  if (!regels.length) return 'Er staan nog geen metingen in de lijst.';
  const open = regels.filter((r) => !r.nagekeken).length;
  if (open) return open === 1 ? '1 meting moet je nog nakijken.' : `${open} metingen moet je nog nakijken.`;
  const zonderNaam = regels.filter((r) => !r.naam.trim()).length;
  if (zonderNaam) return zonderNaam === 1 ? '1 meting heeft nog geen naam.' : `${zonderNaam} metingen hebben nog geen naam.`;
  return null;
}
