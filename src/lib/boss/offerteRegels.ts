/**
 * Regels en groepen van een offerte: opslaan via `bb_offerte_opslaan`, wat Boss
 * te zien krijgt, en een voorstel van Boss toepassen.
 *
 * Letterlijk overgenomen uit het dashboard (`src/lib/offerteRegels.js` en
 * `src/lib/bossBtw.js`), omgezet naar het regelmodel van de app: aantallen en
 * prijzen zijn hier tekstvelden ("2,5"), het btw-percentage staat in
 * `btwPct`. Wijkt deze logica af van het dashboard, dan krijgt dezelfde
 * offerte op de telefoon andere regels dan op kantoor.
 *
 * Alles hier is puur (geen React, geen database): tests/bossOfferte.test.mjs.
 */
import {
  nieuweId,
  nummerNaarVeld,
  omschrijvingVoorOpslag,
  pctVanRegime,
  regimeVanPct,
  veldNaarNummer,
  type BtwRegime,
  type EigenEenheid,
  type Groep,
  type Herkomst,
  type HerkomstBron,
  type Regel,
} from '../regels';

const leeg = (v: unknown) => v === '' || v == null || (typeof v === 'number' && !Number.isFinite(v));
/** Tekstveld naar getal; leeg blijft null (Boss onderscheidt "0" van "weet ik niet"). */
const getal = (v: string | undefined | null) => (leeg(v) ? null : veldNaarNummer(String(v)));
/** Getal van Boss naar tekstveld; null wordt leeg. */
const veld = (n: number | null | undefined) => (n == null ? '' : nummerNaarVeld(n));

// Een regel zonder omschrijving en zonder herkomst telt niet: het formulier
// begint met een lege regel waarin het uurtarief al staat.
export const isLegeRegel = (r: Regel) => !String(r?.omschrijving || '').trim() && !r?.herkomst;

// ── Herkomst ────────────────────────────────────────────────────────────────
const tekst = (v: unknown, n: number) => (v == null ? undefined : String(v).slice(0, n));
const eindig = (v: unknown) => (v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);

function bronSchoon(b: unknown): HerkomstBron | null {
  if (!b || typeof b !== 'object') return null;
  const x = b as Record<string, unknown>;
  const uit: Record<string, unknown> = {
    soort: tekst(x.soort, 30),
    toelichting: tekst(x.toelichting, 200) ?? null,
    waarde: eindig(x.waarde),
    formule: tekst(x.formule, 200),
    uitkomst: x.uitkomst == null ? undefined : eindig(x.uitkomst),
    afronding: x.afronding === 'omhoog' ? 'omhoog' : undefined,
    offerte: tekst(x.offerte, 40),
    materiaal_id: tekst(x.materiaal_id, 64),
    eigen_eenheid_id: tekst(x.eigen_eenheid_id, 64),
    invoer: Array.isArray(x.invoer)
      ? x.invoer.slice(0, 8).map((i: Record<string, unknown>) => ({
          naam: tekst(i?.naam, 60),
          waarde: leeg(i?.waarde) ? null : Number(String(i?.waarde).replace(',', '.')),
          eenheid: tekst(i?.eenheid, 10),
          bron: tekst(i?.bron, 60),
        }))
      : undefined,
  };
  Object.keys(uit).forEach((k) => uit[k] === undefined && delete uit[k]);
  return uit.soort ? (uit as HerkomstBron) : null;
}

export function schoneHerkomst(h: unknown): Herkomst | null {
  if (!h || typeof h !== 'object') return null;
  const x = h as Record<string, unknown> & { hand?: Record<string, unknown>; aanvulling?: { reden?: unknown } };
  const hand: Herkomst['hand'] = {};
  for (const k of ['omschrijving', 'aantal', 'prijs', 'naam', 'werkzaamheden'] as const) if (x.hand?.[k]) hand[k] = true;
  const uit: Record<string, unknown> = {
    aantal: bronSchoon(x.aantal),
    prijs: bronSchoon(x.prijs),
    hand: Object.keys(hand).length ? hand : undefined,
    ontbreekt: Array.isArray(x.ontbreekt) ? x.ontbreekt.filter((v) => v === 'aantal' || v === 'prijs') : undefined,
    aanvulling: x.aanvulling?.reden ? { reden: String(x.aanvulling.reden).slice(0, 200) } : undefined,
    tekst_door_boss: x.tekst_door_boss === true ? true : undefined,
  };
  Object.keys(uit).forEach((k) => (uit[k] === undefined || uit[k] === null) && delete uit[k]);
  return Object.keys(uit).length ? (uit as Herkomst) : null;
}

/**
 * De gebruiker past een veld aan van een regel die Boss maakte: vanaf nu is dat
 * veld van de gebruiker en wijzigt Boss het niet meer zonder expliciet verzoek.
 */
export function markeerHandmatig(r: Regel, veldNaam: 'omschrijving' | 'aantal' | 'prijs'): Regel {
  if (!r.herkomst) return r;
  return {
    ...r,
    herkomst: {
      ...r.herkomst,
      hand: { ...(r.herkomst.hand || {}), [veldNaam]: true },
      ontbreekt: (r.herkomst.ontbreekt || []).filter((x) => x !== veldNaam),
      ...(veldNaam === 'omschrijving' ? { tekst_door_boss: undefined } : {}),
    },
  };
}

/** Wat er nog ontbreekt: een hoeveelheid of prijs die Boss niet kon vinden en die nog leeg is. */
export function ontbreektIn(r: Regel): ('aantal' | 'prijs')[] {
  const uit: ('aantal' | 'prijs')[] = [];
  if ((r.herkomst?.ontbreekt || []).includes('aantal') && leeg(r.aantal)) uit.push('aantal');
  if ((r.herkomst?.ontbreekt || []).includes('prijs') && leeg(r.prijs)) uit.push('prijs');
  return uit;
}

// ── Btw van een voorgestelde regel (dashboard `bossBtw.js`) ─────────────────
// Het regime komt van Boss, anders van de bestaande regel, anders uit het
// percentage. Alleen een percentage zetten liet het regime op "normaal" staan,
// zodat een 9%-regel als 21% werd geboekt (audit 2026-10-25, G-04).
export type VoorstelBtw = { btw_regime?: string | null; btw_pct?: number | null };
export function btwVoorVoorstel(b: VoorstelBtw, oud: Regel | null, standaardPct = 21): Pick<Regel, 'btwPct' | 'btwRegime'> {
  const regimeVanBoss = b.btw_regime && ['normaal', 'verlaagd', 'vrijgesteld', 'verlegd'].includes(b.btw_regime)
    ? (b.btw_regime as BtwRegime)
    : null;
  const pct = regimeVanBoss ? pctVanRegime(regimeVanBoss) : Number(b.btw_pct ?? (oud ? oud.btwPct : standaardPct));
  const regime = regimeVanBoss || (b.btw_pct == null && oud ? oud.btwRegime : null) || regimeVanPct(pct);
  return { btwPct: pct, btwRegime: regime };
}

// ── Laden en opslaan ────────────────────────────────────────────────────────
export type GroepRij = { id: string; naam: string | null; werkzaamheden: string | null; herkomst?: unknown };
export function groepUitRij(g: GroepRij): Groep {
  return { id: g.id, naam: g.naam || '', werkzaamheden: g.werkzaamheden || '', herkomst: schoneHerkomst(g.herkomst) };
}

/** De extra velden van een opgeslagen regel (id, groep, eenheid, sleutel, herkomst). */
export function offerteVeldenUitItem(
  item: { id: string; groep_id?: string | null; eenheid?: string | null; sleutel?: string | null; herkomst?: unknown; aantal: number; prijs_per: number },
  basis: Regel,
): Regel {
  const herkomst = schoneHerkomst(item.herkomst);
  const ontbreekt = herkomst?.ontbreekt || [];
  return {
    ...basis,
    id: item.id,
    groepId: item.groep_id || null,
    eenheid: item.eenheid || '',
    bronSleutel: item.sleutel || null,
    herkomst,
    // Opgeslagen als 0 omdat de database een getal wil; in het formulier weer leeg.
    aantal: ontbreekt.includes('aantal') && Number(item.aantal) === 0 ? '' : basis.aantal,
    prijs: ontbreekt.includes('prijs') && Number(item.prijs_per) === 0 ? '' : basis.prijs,
  };
}

export type OfferteOpslagGroep = { id: string; naam: string; werkzaamheden: string | null; herkomst: Herkomst | null };
export type OfferteOpslagRegel = {
  id: string;
  groep_id: string | null;
  type: string | null;
  omschrijving: string;
  eenheid: string | null;
  aantal: number;
  prijs_per: number;
  btw_pct: number;
  btw_regime: BtwRegime;
  sleutel: string | null;
  herkomst: Herkomst | null;
};

/**
 * Payload voor `bb_offerte_opslaan`. Elke regel en groep krijgt een uuid; een
 * regel van Boss zonder hoeveelheid of prijs gaat als 0 de database in en blijft
 * gemarkeerd via `herkomst.ontbreekt`.
 */
export function naarOpslag(
  { regels, groepen }: { regels: Regel[]; groepen: Groep[] },
  eenheden: EigenEenheid[] = [],
): { groepen: OfferteOpslagGroep[]; regels: OfferteOpslagRegel[] } {
  const groepIds = new Set(groepen.map((g) => g.id));
  return {
    groepen: groepen.map((g) => ({
      id: g.id,
      naam: String(g.naam || '').trim() || 'Groep',
      werkzaamheden: String(g.werkzaamheden || '').trim() || null,
      herkomst: schoneHerkomst(g.herkomst),
    })),
    regels: regels.map((r) => {
      const herkomst = schoneHerkomst(r.herkomst);
      const ontbreekt = ontbreektIn(r);
      const aantal = leeg(r.aantal) ? (ontbreekt.includes('aantal') ? 0 : 1) : veldNaarNummer(r.aantal);
      return {
        id: r.id || nieuweId(),
        groep_id: r.groepId && groepIds.has(r.groepId) ? r.groepId : null,
        type: r.type || null,
        omschrijving: omschrijvingVoorOpslag(r, eenheden),
        eenheid: r.eenheid || null,
        aantal,
        prijs_per: leeg(r.prijs) ? 0 : veldNaarNummer(r.prijs),
        btw_pct: r.btwPct,
        btw_regime: r.btwRegime,
        sleutel: r.bronSleutel || null,
        herkomst: herkomst ? { ...herkomst, ontbreekt } : null,
      };
    }),
  };
}

/** Wat Boss van de offerte te zien krijgt: alleen echte regels. */
export function regelsVoorBoss({ regels, groepen }: { regels: Regel[]; groepen: Groep[] }) {
  return {
    groepen: groepen.map((g) => ({ id: g.id, naam: g.naam, werkzaamheden: g.werkzaamheden || null, herkomst: g.herkomst || null })),
    regels: regels.filter((r) => !isLegeRegel(r)).map((r) => ({
      id: r.id,
      groep_id: r.groepId || null,
      type: r.type,
      omschrijving: r.omschrijving,
      eenheid: r.eenheid || '',
      aantal: getal(r.aantal),
      prijs_per: getal(r.prijs),
      btw_pct: r.btwPct,
      btw_regime: r.btwRegime,
      sleutel: r.bronSleutel || null,
      herkomst: r.herkomst || null,
    })),
  };
}

/** Elke regel en groep heeft een id nodig voordat Boss ernaar kan verwijzen. */
export function metIds(stand: { regels: Regel[]; groepen: Groep[] }) {
  return {
    regels: stand.regels.map((r) => (r.id ? r : { ...r, id: nieuweId() })),
    groepen: stand.groepen.map((g) => (g.id ? g : { ...g, id: nieuweId() })),
  };
}

// ── Een voorstel van Boss toepassen ─────────────────────────────────────────
export type VoorstelGroep = { ref?: string | null; sleutel?: string; naam: string; werkzaamheden?: string | null; tekst_door_boss?: boolean };
export type VoorstelRegel = {
  ref?: string | null;
  groep?: string | null;
  groep_nieuw?: boolean;
  type: string;
  omschrijving: string;
  eenheid?: string | null;
  aantal: number | null;
  eenheidsprijs: number | null;
  btw_regime?: string | null;
  btw_pct?: number | null;
  sleutel?: string | null;
  herkomst?: { aantal?: unknown; prijs?: unknown } | null;
  aanvulling?: { reden: string } | null;
  tekst_door_boss?: boolean;
};
export type OfferteVoorstel = {
  samenvatting?: string;
  onderbouwing?: string[];
  groepen: VoorstelGroep[];
  regels: VoorstelRegel[];
  verwijderen?: string[];
  dubbel?: { tekst: string }[];
  beschermd?: { tekst: string }[];
};

/**
 * `voorstel` komt van boss-offerte (al gecontroleerd), `voor` is de stand toen
 * de vraag werd gesteld, `keuze` per index van voorstel.regels: aanvullingen
 * gaan alleen mee als ze aangevinkt zijn. Wat de gebruiker intussen zelf aan
 * een regel veranderde, blijft staan: dat veld wordt overgeslagen en gemeld.
 */
export function pasVoorstelToe(
  huidig: { regels: Regel[]; groepen: Groep[] },
  voorstel: OfferteVoorstel,
  {
    voor = null,
    keuze = {},
    maakRegel,
    standaardPct = 21,
  }: { voor?: { regels: Regel[] } | null; keuze?: Record<number, boolean>; maakRegel?: () => Regel; standaardPct?: number } = {},
): { regels: Regel[]; groepen: Groep[]; gewijzigd: string[]; overgeslagen: string[] } {
  let groepen = huidig.groepen.map((g) => ({ ...g }));
  let regels = huidig.regels.map((r) => ({ ...r }));
  const gewijzigd: string[] = [];
  const overgeslagen: string[] = [];
  const voorMap = new Map((voor?.regels || []).map((r) => [r.id, r]));

  // Groepen
  const nieuweIds = new Map<string, string>();
  for (const g of voorstel.groepen || []) {
    if (g.ref) {
      const i = groepen.findIndex((x) => x.id === g.ref);
      if (i < 0) continue;
      const oud = groepen[i]!;
      groepen[i] = {
        ...oud,
        naam: g.naam ?? oud.naam,
        werkzaamheden: g.werkzaamheden ?? '',
        herkomst: schoneHerkomst({ ...(oud.herkomst || {}), tekst_door_boss: g.tekst_door_boss || undefined }),
      };
      gewijzigd.push(g.ref);
    } else {
      const id = nieuweId();
      if (g.sleutel) nieuweIds.set(g.sleutel, id);
      groepen.push({ id, naam: g.naam, werkzaamheden: g.werkzaamheden || '', herkomst: schoneHerkomst({ tekst_door_boss: g.tekst_door_boss || undefined }) });
      gewijzigd.push(id);
    }
  }
  const bestaandeGroep = (id: string) => (groepen.some((g) => g.id === id) ? id : null);
  // groep_nieuw zegt waar de sleutel naar wijst; ontbreekt die vlag, dan eerst een bestaande groep, dan een nieuwe.
  const groepVan = (r: VoorstelRegel): string | null =>
    !r.groep ? null : r.groep_nieuw ? nieuweIds.get(r.groep) || null : bestaandeGroep(r.groep) || nieuweIds.get(r.groep) || null;

  (voorstel.regels || []).forEach((b, i) => {
    if (b.aanvulling && keuze[i] !== true) return;
    const ontbreekt: ('aantal' | 'prijs')[] = [];
    if (b.aantal == null) ontbreekt.push('aantal');
    if (b.eenheidsprijs == null) ontbreekt.push('prijs');
    if (b.ref) {
      const j = regels.findIndex((r) => r.id === b.ref);
      if (j < 0) {
        overgeslagen.push(`${b.omschrijving}: deze regel is intussen verwijderd.`);
        return;
      }
      const oud = regels[j]!;
      const was = voorMap.get(b.ref);
      // Intussen zelf gewijzigd? Dan dat veld niet overschrijven.
      const zelf = (k: 'omschrijving' | 'aantal' | 'prijs') => Boolean(was) && String(was![k] ?? '') !== String(oud[k] ?? '');
      const nieuw: Regel = { ...oud };
      const veranderd = { omschrijving: false, aantal: false, prijs: false };
      if (b.omschrijving !== oud.omschrijving) {
        if (zelf('omschrijving')) overgeslagen.push(`${oud.omschrijving}: je had de omschrijving intussen zelf aangepast.`);
        else { nieuw.omschrijving = b.omschrijving; veranderd.omschrijving = true; }
      }
      if (getal(oud.aantal) !== (b.aantal ?? null)) {
        if (zelf('aantal')) overgeslagen.push(`${oud.omschrijving}: je had de hoeveelheid intussen zelf aangepast.`);
        else { nieuw.aantal = veld(b.aantal); veranderd.aantal = true; }
      }
      if (getal(oud.prijs) !== (b.eenheidsprijs ?? null)) {
        if (zelf('prijs')) overgeslagen.push(`${oud.omschrijving}: je had de prijs intussen zelf aangepast.`);
        else { nieuw.prijs = veld(b.eenheidsprijs); veranderd.prijs = true; }
      }
      nieuw.type = b.type || oud.type;
      nieuw.eenheid = b.eenheid ?? oud.eenheid;
      nieuw.groepId = b.groep === null ? null : (groepVan(b) ?? oud.groepId ?? null);
      Object.assign(nieuw, btwVoorVoorstel(b, oud, standaardPct));
      // Was de regel van de gebruiker, dan blijven de niet gewijzigde velden van hem.
      const handOud: Herkomst['hand'] = oud.herkomst ? { ...(oud.herkomst.hand || {}) } : { omschrijving: true, aantal: true, prijs: true };
      for (const k of Object.keys(veranderd) as (keyof typeof veranderd)[]) if (veranderd[k]) delete handOud[k];
      nieuw.herkomst = schoneHerkomst({
        ...(oud.herkomst || {}),
        aantal: veranderd.aantal ? b.herkomst?.aantal : (oud.herkomst?.aantal || null),
        prijs: veranderd.prijs ? b.herkomst?.prijs : (oud.herkomst?.prijs || null),
        hand: handOud,
        ontbreekt: ontbreekt.filter((x) => (x === 'aantal' ? veranderd.aantal : veranderd.prijs)),
        tekst_door_boss: veranderd.omschrijving ? b.tekst_door_boss : oud.herkomst?.tekst_door_boss,
      });
      nieuw.bronSleutel = oud.bronSleutel || b.sleutel || null;
      regels[j] = nieuw;
      gewijzigd.push(nieuw.id!);
      return;
    }
    const basis = maakRegel ? maakRegel() : ({} as Regel);
    const groepId = groepVan(b);
    const r: Regel = {
      ...basis,
      id: nieuweId(),
      type: b.type,
      omschrijving: b.omschrijving,
      eenheid: b.eenheid || '',
      aantal: veld(b.aantal),
      prijs: veld(b.eenheidsprijs),
      ...btwVoorVoorstel(b, null, standaardPct),
      groepId,
      bronSleutel: b.sleutel || null,
      herkomst: schoneHerkomst({
        aantal: b.herkomst?.aantal,
        prijs: b.herkomst?.prijs,
        ontbreekt,
        aanvulling: b.aanvulling,
        tekst_door_boss: b.tekst_door_boss,
      }),
    };
    // Achter de laatste regel van dezelfde groep, anders achteraan.
    let plek = -1;
    regels.forEach((x, k) => {
      if ((x.groepId || null) === (groepId || null) && !isLegeRegel(x)) plek = k;
    });
    if (plek < 0) regels.push(r);
    else regels.splice(plek + 1, 0, r);
    gewijzigd.push(r.id!);
  });

  const weg = new Set(voorstel.verwijderen || []);
  regels = regels.filter((r) => !(r.id && weg.has(r.id)) && !isLegeRegel(r));
  if (!regels.length && maakRegel) regels = [{ ...maakRegel(), id: nieuweId() }];
  groepen = groepen.filter((g) => g.id);
  return { regels, groepen, gewijzigd, overgeslagen };
}
