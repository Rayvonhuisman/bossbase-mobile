/**
 * Waarden die Nederlands in de database staan maar wel op het scherm komen:
 * branche, klantsoort, kostencategorie, standaard verliesredenen. De waarde
 * zelf blijft Nederlands (filters, rapportages en het dashboard rekenen erop);
 * alleen het label vertaalt, met toonWaarde(). Eigen waarden van een bedrijf
 * (een zelfgemaakte categorie of reden) hebben geen vertaling en blijven zoals
 * ze zijn.
 *
 * De txm()-regels hieronder zetten deze woorden in bron.json.
 */
import { tx, txm } from './index';

export const DATABASE_WAARDEN = [
  // Branches (lib/registratie BRANCHES)
  txm('Schilder'), txm('Hovenier'), txm('Aannemer'), txm('Kozijnen'), txm('Installateur'),
  txm('Dakdekker'), txm('Loodgieter'), txm('Elektricien'), txm('Schoonmaak'), txm('Anders'),
  // Klantsoorten (KLANT_TYPES)
  txm('Particulier'), txm('Zakelijk'), txm('VvE'),
  // Kostencategorieën (jobCostService KOSTEN_CATEGORIEEN)
  txm('Materiaal'), txm('Arbeid'), txm('Reiskosten'), txm('Inkoopfactuur'), txm('Algemene kosten'), txm('Overig'),
  // Standaard verliesredenen (dealService STANDAARD_VERLIESREDENEN)
  txm('Te duur'), txm('Gekozen voor concurrent'), txm('Geen reactie'), txm('Timing niet goed'),
];

/** Label voor een databasewaarde: vertaald als het een vaste waarde is, anders ongewijzigd. */
export const toonWaarde = (waarde: string | null | undefined): string => (waarde ? tx(waarde) : '');
