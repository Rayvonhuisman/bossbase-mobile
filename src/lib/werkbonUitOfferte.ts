/**
 * Werkbon vullen vanuit de offerte: welke offerteregel wordt wat.
 *
 * Letterlijk naar `src/lib/werkbonUitOfferte.js` van het dashboard. De regels
 * komen uit `bb_werkbon_offerte_regels` (migratie 20261107170000), die per
 * regel al een soort meegeeft: taak, uren, materiaal, km of leeg.
 *
 *   taak       wordt een taak; standaard aangevinkt, behalve kostenposten
 *              (voorrijkosten, "materiaal volgens opname", transport, stort)
 *   uren       arbeid; kan een taak worden, staat standaard uit
 *   materiaal  geen taak: een keuzelijst bij Materialen. Pas op de werkbon als
 *              het gebruikt is, want werkbonmateriaal telt meteen als werkelijke
 *              kosten en staat op de PDF die de klant tekent
 *   km, leeg   nooit
 *
 * Wat al op de werkbon staat wordt gemarkeerd en niet nog eens toegevoegd; de
 * database controleert dat ook. Puur: tests/offerteCalculatie.test.mjs.
 */

export type OfferteRegelRij = {
  offerte_id: string;
  offerte_nummer: string | null;
  offerte_omschrijving: string | null;
  offerte_status: string | null;
  regel_id: string;
  volgorde: number | null;
  soort: 'taak' | 'uren' | 'materiaal' | 'km' | 'leeg' | string;
  omschrijving: string | null;
  eenheid: string | null;
  aantal: number | string | null;
  materiaal_id: string | null;
};

export type OfferteTaak = {
  id: string;
  omschrijving: string;
  soort: string;
  aantal: number | null;
  eenheid: string;
  alAanwezig: boolean;
  standaard: boolean;
};

export type OfferteMateriaal = {
  id: string;
  omschrijving: string;
  materiaalId: string | null;
  aantal: number | null;
  eenheid: string;
  alAanwezig: boolean;
};

export type OfferteBron = {
  id: string;
  nummer: string;
  omschrijving: string;
  status: string;
  taken: OfferteTaak[];
  materialen: OfferteMateriaal[];
};

const norm = (t: unknown) => String(t || '').trim().toLowerCase().replace(/\s+/g, ' ');

// Kostenposten die als regel in een offerte staan maar geen werk zijn.
const GEEN_WERK =
  /^(voorrij|reiskosten|reistijd|transport|stort|afvoer(kosten)?\b|container|materiaal\b|materialen\b|kleinmateriaal|klein materiaal|parkeer|administratie|btw\b|korting)/i;

/** Staat deze regel standaard aangevinkt als taak? */
export function standaardAlsTaak(regel: Pick<OfferteRegelRij, 'soort' | 'omschrijving'> | null | undefined): boolean {
  if (regel?.soort === 'taak') return !GEEN_WERK.test(String(regel.omschrijving || '').trim());
  return false;
}

/** Deelt de regels van bb_werkbon_offerte_regels per offerte in. */
export function deelOfferteRegelsIn(
  regels: OfferteRegelRij[] = [],
  {
    taken = [],
    materialen = [],
  }: { taken?: { omschrijving: string | null }[]; materialen?: { materiaal_id?: string | null }[] } = {},
): OfferteBron[] {
  const bestaand = new Set(taken.map((t) => norm(t.omschrijving)));
  const opBon = new Set(materialen.map((m) => m.materiaal_id).filter(Boolean));
  const per = new Map<string, OfferteBron>();
  for (const r of regels) {
    let o = per.get(r.offerte_id);
    if (!o) {
      o = {
        id: r.offerte_id,
        nummer: r.offerte_nummer || '',
        omschrijving: r.offerte_omschrijving || '',
        status: r.offerte_status || '',
        taken: [],
        materialen: [],
      };
      per.set(r.offerte_id, o);
    }
    if (r.soort === 'taak' || r.soort === 'uren') {
      // Twee regels met dezelfde tekst worden één taak, net als in de database.
      if (o.taken.some((t) => norm(t.omschrijving) === norm(r.omschrijving))) continue;
      const alAanwezig = bestaand.has(norm(r.omschrijving));
      o.taken.push({
        id: r.regel_id,
        omschrijving: r.omschrijving || '',
        soort: r.soort,
        aantal: r.aantal == null ? null : Number(r.aantal),
        eenheid: r.eenheid || '',
        alAanwezig,
        standaard: !alAanwezig && standaardAlsTaak(r),
      });
    } else if (r.soort === 'materiaal') {
      o.materialen.push({
        id: r.regel_id,
        omschrijving: r.omschrijving || '',
        materiaalId: r.materiaal_id,
        aantal: r.aantal == null ? null : Number(r.aantal),
        eenheid: r.eenheid || '',
        alAanwezig: opBon.has(r.materiaal_id),
      });
    }
  }
  return [...per.values()].filter((o) => o.taken.length || o.materialen.length);
}

/** De regels die standaard worden overgenomen. */
export const standaardTaakIds = (offerte: OfferteBron | null | undefined) =>
  (offerte?.taken || []).filter((t) => t.standaard).map((t) => t.id);

export const offerteLabel = (o: Pick<OfferteBron, 'nummer' | 'omschrijving'>) =>
  [o.nummer, o.omschrijving].filter(Boolean).join(' · ') || 'Offerte';
