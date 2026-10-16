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

/** Een formulierregel klaar voor `factuur_regels` (via `bb_factuur_aanmaken`). */
export function factuurRegelVoorOpslag(r: Regel, eenheden: EigenEenheid[] = []) {
  return {
    omschrijving: omschrijvingVoorOpslag(r, eenheden),
    type: r.type,
    aantal: veldNaarNummer(r.aantal),
    eenheidsprijs: veldNaarNummer(r.prijs),
    btw_pct: r.btwPct,
    btw_regime: r.btwRegime,
  };
}
