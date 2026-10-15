/**
 * Padregels voor bonnetjes van kostenposten (bucket `kosten-bijlagen`).
 *
 * Pure functies, zonder Supabase, zodat ze in Node te testen zijn. Het doel:
 * het verwijderen of vervangen van de bon van één kostenpost mag nooit het
 * bestand van een andere post raken, en er mogen geen wezen achterblijven.
 *
 * - Een nieuwe bon krijgt een eigen pad met het id van de post erin:
 *   `{company_id}/{kost_id}-{tijd}-{willekeurig}.{ext}`. Twee segmenten,
 *   net als de paden van het dashboard (`{company_id}/{bestand}`), dus de
 *   bestaande storage-policy (bedrijfsmap) blijft gelden.
 * - Opruimen gebeurt alleen voor paden in de eigen bedrijfsmap, met precies
 *   twee nette segmenten, en die door geen andere post meer worden gebruikt.
 */

/** Opslagpaden uit `bijlage_url` (JSON-array of één pad); oude http-URL's tellen niet. */
export function bijlagePaden(stored: string | null | undefined): string[] {
  if (!stored) return [];
  let items: unknown;
  try {
    items = JSON.parse(stored);
  } catch {
    items = [stored];
  }
  return (Array.isArray(items) ? items : [items]).filter(
    (p): p is string => typeof p === 'string' && !!p && !p.startsWith('http'),
  );
}

/** Extensie zonder punt en zonder vreemde tekens; onbekend wordt `jpg`. */
function veiligeExtensie(extensie: string): string {
  const e = extensie.replace(/^\./, '').toLowerCase();
  return /^[a-z0-9]{1,5}$/.test(e) ? e : 'jpg';
}

/** Het eigen pad voor een nieuwe bon van precies deze kostenpost. */
export function bonPad(
  companyId: string,
  kostId: string,
  extensie: string,
  nu: number,
  willekeurig: string,
): string {
  const schoon = (s: string) => s.replace(/[^A-Za-z0-9-]/g, '');
  return `${schoon(companyId)}/${schoon(kostId)}-${nu}-${schoon(willekeurig)}.${veiligeExtensie(extensie)}`;
}

/** Een pad dat we zelf mogen opruimen: eigen bedrijfsmap, twee nette segmenten. */
export function isEigenBonPad(pad: string, companyId: string): boolean {
  if (!companyId) return false;
  const delen = pad.split('/');
  if (delen.length !== 2) return false;
  const [map, bestand] = delen;
  if (map !== companyId) return false;
  if (!bestand || bestand === '.' || bestand === '..' || bestand.startsWith('.')) return false;
  return /^[A-Za-z0-9._-]+$/.test(bestand);
}

/**
 * Welke bestanden weg mogen bij het verwijderen of vervangen van een bon:
 * alleen eigen paden die geen andere kostenpost meer gebruikt.
 *
 * @param paden       de paden die deze post kwijtraakt
 * @param companyId   het bedrijf van de gebruiker
 * @param gedeeld     paden die (ook) bij een andere post staan
 * @param behouden    paden die deze post na de wijziging nog heeft
 */
export function teVerwijderenBonPaden(
  paden: readonly string[],
  companyId: string,
  gedeeld: Iterable<string> = [],
  behouden: Iterable<string> = [],
): string[] {
  const blijft = new Set<string>([...gedeeld, ...behouden]);
  const uit = new Set<string>();
  for (const pad of paden) {
    if (blijft.has(pad)) continue;
    if (!isEigenBonPad(pad, companyId)) continue;
    uit.add(pad);
  }
  return [...uit];
}
