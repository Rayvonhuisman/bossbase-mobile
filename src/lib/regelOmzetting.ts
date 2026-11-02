import { regelVeldenUitOfferteItem } from './documentLogica';
import {
  nieuweSleutel,
  nummerNaarVeld,
  omschrijvingVoorOpslag,
  veldNaarNummer,
  type BtwRegime,
  type EigenEenheid,
  type Regel,
} from './regels';

/**
 * Van de database naar het regelformulier en terug, voor offertes.
 * Het regelformulier (`RegelEditor`) werkt met tekstvelden; de database met
 * `offerte_items`. Dezelfde omzetting als `reconstructRegel` en de opslag in
 * de offertemodal van het dashboard.
 */

type OfferteItemVelden = Parameters<typeof regelVeldenUitOfferteItem>[0];

/** Een opgeslagen offerteregel als regel in het formulier. */
export function regelUitOfferteItem(
  item: OfferteItemVelden,
  kop: { totaal_excl: number | null; totaal_incl: number | null },
): Regel {
  const v = regelVeldenUitOfferteItem(item, kop);
  return {
    sleutel: nieuweSleutel(),
    omschrijving: v.omschrijving,
    type: v.type,
    aantal: nummerNaarVeld(v.aantal),
    prijs: nummerNaarVeld(v.prijs),
    btwRegime: v.btwRegime as BtwRegime,
    btwPct: v.btwPct,
  };
}

/** Een formulierregel klaar voor `offerte_items`. */
export function offerteRegelVoorOpslag(r: Regel, eenheden: EigenEenheid[] = []) {
  return {
    omschrijving: omschrijvingVoorOpslag(r, eenheden),
    type: r.type,
    aantal: veldNaarNummer(r.aantal),
    prijs_per: veldNaarNummer(r.prijs),
    btw_pct: r.btwPct,
    btw_regime: r.btwRegime,
  };
}

/**
 * Een formulierregel klaar voor `factuur_regels` (via `bb_factuur_aanmaken` of
 * `bb_factuur_regels_vervangen`). De groep gaat mee: de database maakt per
 * sleutel één factuurgroep, zoals `regelsVoorRpc` in het dashboard.
 */
export function factuurRegelVoorOpslag(r: Regel, eenheden: EigenEenheid[] = []) {
  return {
    omschrijving: omschrijvingVoorOpslag(r, eenheden),
    type: r.type,
    aantal: veldNaarNummer(r.aantal),
    eenheidsprijs: veldNaarNummer(r.prijs),
    btw_pct: r.btwPct,
    btw_regime: r.btwRegime,
    ...(r.groep?.naam
      ? { groep: { sleutel: String(r.groep.sleutel || r.groep.naam), naam: r.groep.naam, werkzaamheden: r.groep.werkzaamheden || null } }
      : {}),
  };
}

/**
 * Een opgeslagen factuurregel als regel in het formulier (`reconstructRegel`
 * in het dashboard). De id van de databaseregel blijft staan: Boss verwijst
 * ermee naar bestaande regels, zodat toepassen ze aanpast in plaats van ze te
 * verdubbelen.
 */
export function regelUitFactuurRegel(
  r: {
    id: string;
    omschrijving: string | null;
    type: string | null;
    aantal: number | null;
    eenheidsprijs: number | null;
    btw_pct: number | null;
    btw_regime: string | null;
    groep?: { id: string; naam: string; werkzaamheden: string | null } | null;
  },
  kop: { totaal_excl: number | null; totaal_incl: number | null },
): Regel {
  const v = regelVeldenUitOfferteItem({ ...r, prijs_per: r.eenheidsprijs }, kop);
  return {
    id: r.id,
    sleutel: nieuweSleutel(),
    omschrijving: v.omschrijving,
    type: v.type,
    aantal: nummerNaarVeld(v.aantal),
    prijs: nummerNaarVeld(v.prijs),
    btwRegime: v.btwRegime as BtwRegime,
    btwPct: v.btwPct,
    groep: r.groep?.naam ? { sleutel: r.groep.id, naam: r.groep.naam, werkzaamheden: r.groep.werkzaamheden } : null,
  };
}

/**
 * Offerteregels voor een factuur, met de groep (naam en werkzaamheden) erbij,
 * zoals "Maak factuur" in het dashboard.
 */
export function factuurRegelsUitOfferte(
  items: (OfferteItemVelden & { groep_id?: string | null })[],
  kop: { totaal_excl: number | null; totaal_incl: number | null },
  groepen: { id: string; naam: string | null; werkzaamheden: string | null }[],
): Regel[] {
  const perId = new Map(groepen.map((g) => [g.id, g]));
  return items.map((it) => {
    const g = it.groep_id ? perId.get(it.groep_id) : undefined;
    // Een groep zonder naam heet op de offerte "Groep"; zo ook op de factuur.
    return { ...regelUitOfferteItem(it, kop), groep: g ? { sleutel: g.id, naam: g.naam || 'Groep', werkzaamheden: g.werkzaamheden } : null };
  });
}
