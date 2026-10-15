/**
 * Adres zoeken via de PDOK Locatieserver van het Kadaster: gratis, open CORS,
 * geen API-sleutel. Zelfde bron en dezelfde regels als `AdresZoeker.jsx` in het
 * dashboard, zodat een adres op beide plekken precies hetzelfde wordt ingevuld.
 *
 * Bewust zonder imports: dit bestand draait ook in de node-tests.
 */

export const PDOK_SUGGEST = 'https://api.pdok.nl/bzk/locatieserver/search/v3_1/suggest';
export const PDOK_LOOKUP = 'https://api.pdok.nl/bzk/locatieserver/search/v3_1/lookup';

/** Pas vanaf zoveel tekens zoeken; daaronder is elke uitkomst ruis. */
export const MIN_ZOEKTEKENS = 3;
/** Zoveel ms na de laatste toetsaanslag pas zoeken. */
export const ZOEK_VERTRAGING_MS = 300;

export type AdresSuggestie = { id: string; weergavenaam: string };

/** De losse adresvelden zoals de formulieren ze kennen. */
export type AdresVelden = { address: string; postcode: string; city: string };

/** Een document uit de lookup; alleen de velden die we gebruiken. */
export type PdokAdresDoc = {
  straatnaam?: string | null;
  huis_nlt?: string | null;
  postcode?: string | null;
  woonplaatsnaam?: string | null;
};

/** URL voor de suggesties, of null als de zoektekst te kort is. */
export function suggestieUrl(zoek: string | null | undefined): string | null {
  const q = (zoek ?? '').trim();
  if (q.length < MIN_ZOEKTEKENS) return null;
  return `${PDOK_SUGGEST}?q=${encodeURIComponent(q)}&fq=type:adres&rows=8`;
}

export function lookupUrl(id: string): string {
  return `${PDOK_LOOKUP}?id=${encodeURIComponent(id)}`;
}

/** De suggesties uit een PDOK-antwoord; alles wat geen id of naam heeft valt af. */
export function suggestiesUitAntwoord(json: unknown): AdresSuggestie[] {
  const docs = (json as { response?: { docs?: unknown } } | null)?.response?.docs;
  if (!Array.isArray(docs)) return [];
  const uit: AdresSuggestie[] = [];
  for (const d of docs) {
    const id = (d as { id?: unknown })?.id;
    const naam = (d as { weergavenaam?: unknown })?.weergavenaam;
    if (typeof id === 'string' && id && typeof naam === 'string' && naam) {
      uit.push({ id, weergavenaam: naam });
    }
  }
  return uit;
}

/** Het eerste document uit een lookup-antwoord, of null. */
export function lookupDoc(json: unknown): PdokAdresDoc | null {
  const docs = (json as { response?: { docs?: unknown } } | null)?.response?.docs;
  if (!Array.isArray(docs) || !docs.length) return null;
  const d = docs[0];
  return d && typeof d === 'object' ? (d as PdokAdresDoc) : null;
}

/** PDOK levert "1012JS"; de formulieren tonen "1012 JS". Iets anders blijft staan. */
export function formatPostcode(pc: string | null | undefined): string {
  const raw = (pc ?? '').replace(/\s+/g, '').toUpperCase();
  return /^\d{4}[A-Z]{2}$/.test(raw) ? `${raw.slice(0, 4)} ${raw.slice(4)}` : (pc ?? '');
}

/**
 * De tabellen hebben geen aparte straat- en huisnummerkolom: beide gaan samen
 * in `address`. `huis_nlt` is het complete huisnummer met toevoeging ("12A").
 */
export function adresVelden(doc: PdokAdresDoc): AdresVelden {
  return {
    address: [doc.straatnaam, doc.huis_nlt].filter(Boolean).join(' ').trim(),
    postcode: formatPostcode(doc.postcode),
    city: (doc.woonplaatsnaam ?? '').trim(),
  };
}

/**
 * Eén adresregel uit losse velden: "Industrieweg 88, 3542 AD Utrecht". Leeg
 * als er geen straat en geen plaats is.
 */
export function adresRegel(velden: Partial<AdresVelden> | null | undefined): string {
  const straat = (velden?.address ?? '').trim();
  const stad = (velden?.city ?? '').trim();
  if (!straat && !stad) return '';
  const plaats = [formatPostcode(velden?.postcode).trim(), stad].filter(Boolean).join(' ');
  return [straat, plaats].filter(Boolean).join(', ');
}

/** Pijltjes door de lijst: rondlopend, -1 betekent "niets gekozen". */
export function volgendeIndex(huidig: number, aantal: number, richting: 1 | -1): number {
  if (aantal <= 0) return -1;
  if (richting === 1) return (huidig + 1) % aantal;
  return (huidig <= 0 ? aantal : huidig) - 1;
}
