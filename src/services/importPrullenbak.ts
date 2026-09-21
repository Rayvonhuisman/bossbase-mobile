import { supabase } from '@/lib/supabase';
import { getCompanyId } from '@/lib/sessionContext';

/**
 * De prullenbak van de boekhoudkoppeling — `negeerBijImport` uit het dashboard.
 *
 * Waarom dit bestaat: een factuur of kostenpost die uit SnelStart is
 * geïmporteerd komt bij de volgende synchronisatie gewoon terug, tenzij hij hier
 * op de negeerlijst staat. Verwijderen zónder deze stap ziet er dus uit alsof
 * het gelukt is, en een dag later staat de rij er weer — de vervelendste soort
 * "geslaagde" actie die er is.
 *
 * De policy op `import_genegeerd` vraagt voor INSERT alleen het eigen bedrijf,
 * dus de app kan dit gewoon zelf. Eerder blokkeerde de app het verwijderen van
 * geïmporteerde rijen omdat dit pad ontbrak; dat is nu niet meer nodig.
 *
 * LET OP: één inkoopfactuur kan als meerdere kostenregels zijn binnengekomen
 * (referentie `snelstart_<factuur>_<n>`). De prullenbak werkt op het
 * FACTUURnummer, dus één regel weggooien onderdrukt de hele factuur. Dat is
 * bedoeld: anders zou de verwijderde regel bij de volgende sync tóch terugkomen,
 * samen met een dubbele van de regels die je liet staan.
 */

const LABEL: Record<string, string> = {
  factuur: 'De factuur',
  kost: 'De kostenpost',
};

/**
 * Zet een geïmporteerd record op de negeerlijst.
 *
 * Geeft `null` terug als het gelukt is, en anders een melding voor de
 * gebruiker. Het record zelf is op dat moment al verwijderd — dit is een
 * waarschuwing, geen mislukte verwijdering.
 */
export async function negeerBijImport(
  soort: 'factuur' | 'kost',
  externeReferentie: string | null,
  reden = 'verwijderd in BossBase',
): Promise<string | null> {
  if (!externeReferentie) return null;

  // `snelstart_<factuurnr>_<regel>` → `<factuurnr>`. Zelfde afleiding als het
  // dashboard, zodat beide kanten dezelfde sleutel op de lijst zetten.
  const externeId = String(externeReferentie).replace(/^snelstart_/, '').split('_')[0];
  if (!externeId) return null;

  const melding =
    `${LABEL[soort] ?? 'Het record'} is verwijderd, maar kon niet in de prullenbak worden ` +
    'gezet. Bij de volgende synchronisatie met de boekhouding komt hij terug.';

  const companyId = getCompanyId();
  if (!companyId) return melding;

  const { error } = await supabase.from('import_genegeerd').upsert(
    { company_id: companyId, provider: 'snelstart', soort, externe_id: externeId, reden },
    { onConflict: 'company_id,provider,soort,externe_id' },
  );

  if (error) {
    if (__DEV__) console.warn('[importPrullenbak] niet bijgewerkt', error.message);
    return melding;
  }
  return null;
}
