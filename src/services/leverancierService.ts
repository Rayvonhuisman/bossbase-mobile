import { supabase } from '@/lib/supabase';
import { getCompanyId, getUserId, isReadonly, withCompanyId } from '@/lib/sessionContext';
import { schrijf, writeFout, type WriteResult, type WriteStatus } from '@/lib/writeResult';
import { haalInStukken } from '@/lib/inStukken';
import { alsHtml, alsTekst } from '@/lib/notitieTekst';
import { eersteRelatieFout } from '@/lib/relatieValidatie';
import { kostenPerLeverancier, verwijderBlokkade, type LeverancierKosten } from '@/lib/relaties';

/**
 * Leveranciers — tabel `leveranciers`, zoals `leverancierService.js` van het
 * dashboard. Alleen `naam` is verplicht (SnelStart stelt bij een relatie geen
 * enkel veld verplicht); KvK, btw en IBAN worden vóór elke schrijfactie
 * gecontroleerd, met dezelfde meldingen als het dashboard.
 *
 * RLS (`20260824140000_leveranciers.sql`): lezen en toevoegen binnen het eigen
 * bedrijf (toevoegen ook met de read-onlygate), wijzigen vraagt
 * `klanten_bewerken` en verwijderen `klanten_verwijderen`.
 * `job_costs.leverancier_id` staat op ON DELETE RESTRICT: een leverancier met
 * kosten kan niet weg.
 */

const COLUMNS = `
  id, company_id, naam, contactpersoon, email, telefoon, mobiel, website,
  address, postcode, city, kvk_number, btw_number, iban, betaaltermijn_dagen,
  notities, actief, snelstart_id, moneybird_id, created_at
`;

export type Leverancier = {
  id: string;
  company_id: string;
  naam: string;
  contactpersoon: string | null;
  email: string | null;
  telefoon: string | null;
  mobiel: string | null;
  website: string | null;
  address: string | null;
  postcode: string | null;
  city: string | null;
  kvk_number: string | null;
  btw_number: string | null;
  iban: string | null;
  betaaltermijn_dagen: number | null;
  notities: string | null;
  actief: boolean | null;
  snelstart_id: string | null;
  moneybird_id: string | null;
  created_at: string;
};

/** Leeg betekent "Naamloos", net als de mapper van het dashboard. */
export const leverancierNaam = (l: Pick<Leverancier, 'naam'> | null | undefined): string =>
  (l?.naam ?? '').trim() || 'Naamloos';

export const isActief = (l: Pick<Leverancier, 'actief'>): boolean => l.actief !== false;

export async function listLeveranciersVolledig(): Promise<{ data: Leverancier[]; error: string | null }> {
  const { data, error } = await haalInStukken((van, tot) =>
    supabase
      .from('leveranciers')
      .select(COLUMNS)
      .order('naam', { ascending: true })
      .order('id', { ascending: true })
      .range(van, tot),
  );
  if (error) {
    console.warn('[leverancierService.listLeveranciersVolledig]', error.message);
    return { data: [], error: 'Leveranciers konden niet worden geladen.' };
  }
  return { data: (data as unknown as Leverancier[]) ?? [], error: null };
}

export async function getLeverancier(
  id: string,
): Promise<{ data: Leverancier | null; error: string | null }> {
  const { data, error } = await supabase.from('leveranciers').select(COLUMNS).eq('id', id).maybeSingle();
  if (error) {
    console.warn('[leverancierService.getLeverancier]', error.message);
    return { data: null, error: 'Leverancier kon niet worden geladen.' };
  }
  return { data: (data as unknown as Leverancier | null) ?? null, error: null };
}

/**
 * Kosten per leverancier (`job_costs`), voor de kolom "Kosten" en de
 * verwijderblokkade. Faalt stil: zonder kostenrecht geeft RLS niets terug, en
 * dan is er gewoon niets te tonen.
 */
export async function listLeverancierKostenTotalen(): Promise<Record<string, LeverancierKosten>> {
  const { data, error } = await haalInStukken((van, tot) =>
    supabase
      .from('job_costs')
      .select('id, leverancier_id, amount')
      .not('leverancier_id', 'is', null)
      .order('id', { ascending: true })
      .range(van, tot),
  );
  if (error) return {};
  return kostenPerLeverancier(
    (data as unknown as { leverancier_id: string | null; amount: number | null }[]) ?? [],
  );
}

// ---------------------------------------------------------------------------
// Schrijven
// ---------------------------------------------------------------------------

export type LeverancierInput = {
  naam: string;
  contactpersoon?: string | null;
  email?: string | null;
  telefoon?: string | null;
  mobiel?: string | null;
  website?: string | null;
  address?: string | null;
  postcode?: string | null;
  city?: string | null;
  kvk_number?: string | null;
  btw_number?: string | null;
  iban?: string | null;
  /** Tekst uit het formulier; leeg = geen termijn. */
  betaaltermijn_dagen?: string | number | null;
  notities?: string | null;
};

const tekst = (v: string | null | undefined): string | null => {
  const s = typeof v === 'string' ? v.trim() : v;
  return s ? s : null;
};

/** Formulier → kolommen. Lege strings worden null, zoals in het dashboard. */
function naarPayload(input: LeverancierInput): Record<string, unknown> | string {
  const naam = input.naam.trim();
  if (!naam) return 'Naam is verplicht.';
  if (input.email && !/^\S+@\S+\.\S+$/.test(input.email.trim())) return 'Ongeldig e-mailadres.';
  const fout = eersteRelatieFout(input);
  if (fout) return fout;

  let termijn: number | null = null;
  const ruw = input.betaaltermijn_dagen;
  if (ruw !== null && ruw !== undefined && String(ruw).trim() !== '') {
    termijn = Number(String(ruw).trim());
    if (!Number.isInteger(termijn) || termijn < 0 || termijn > 365) {
      return 'De betaaltermijn is een aantal dagen (0 tot 365).';
    }
  }

  return {
    naam,
    contactpersoon: tekst(input.contactpersoon),
    email: tekst(input.email),
    telefoon: tekst(input.telefoon),
    mobiel: tekst(input.mobiel),
    website: tekst(input.website),
    address: tekst(input.address),
    postcode: tekst(input.postcode),
    city: tekst(input.city),
    kvk_number: tekst(input.kvk_number),
    btw_number: tekst(input.btw_number),
    iban: tekst(input.iban),
    betaaltermijn_dagen: termijn,
    // Notities staan in het formulier als platte tekst; het dashboard bewaart HTML.
    notities: input.notities === undefined ? undefined : input.notities?.trim() ? alsHtml(input.notities) : null,
  };
}

export async function createLeverancier(input: LeverancierInput): Promise<WriteResult<Leverancier>> {
  const basis = naarPayload(input);
  if (typeof basis === 'string') return writeFout('validatie', basis);
  if (basis.notities === undefined) delete basis.notities;
  const payload = withCompanyId({ ...basis, actief: true });
  if (!payload) {
    return writeFout('onbekend', 'Je bedrijfsgegevens zijn nog niet geladen. Probeer het zo opnieuw.');
  }
  return schrijf<Leverancier>(
    () => supabase.from('leveranciers').insert(payload).select(COLUMNS),
    { context: 'leverancierService.createLeverancier', bedrijfReadonly: isReadonly() },
  );
}

export async function updateLeverancier(
  id: string,
  input: LeverancierInput,
): Promise<WriteResult<Leverancier>> {
  const updates = naarPayload(input);
  if (typeof updates === 'string') return writeFout('validatie', updates);
  if (updates.notities === undefined) delete updates.notities;
  return schrijf<Leverancier>(
    () => supabase.from('leveranciers').update(updates).eq('id', id).select(COLUMNS),
    {
      context: 'leverancierService.updateLeverancier',
      bedrijfReadonly: isReadonly(),
      leegSoort: 'geen-rechten',
      leegMelding:
        'De leverancier is niet gewijzigd. Je hebt het recht Klanten bewerken nodig, of de ' +
        'leverancier bestaat niet meer.',
    },
  );
}

/**
 * Verwijderen. Eerst de kosten tellen: met kosten blokkeert de database het
 * toch (RESTRICT), en zo krijgt de gebruiker de uitleg van het dashboard in
 * plaats van een kale fout. Na het verwijderen gaat een SnelStart-relatie op de
 * negeerlijst, anders haalt de volgende import hem terug. Lukt dat laatste
 * niet, dan is de leverancier wél weg en komt er een waarschuwing mee.
 */
export async function deleteLeverancier(
  id: string,
): Promise<WriteStatus & { waarschuwing?: string }> {
  const { data: bestaand } = await supabase
    .from('leveranciers')
    .select('id, naam, snelstart_id')
    .eq('id', id)
    .maybeSingle();

  const { count } = await supabase
    .from('job_costs')
    .select('id', { count: 'exact', head: true })
    .eq('leverancier_id', id);
  const blokkade = verwijderBlokkade(leverancierNaam(bestaand as { naam: string } | null), count ?? 0);
  if (blokkade) return writeFout('conflict', blokkade);

  const res = await schrijf<{ id: string }>(
    () => supabase.from('leveranciers').delete().eq('id', id).select('id'),
    {
      context: 'leverancierService.deleteLeverancier',
      bedrijfReadonly: isReadonly(),
      leegSoort: 'geen-rechten',
      leegMelding: 'De leverancier is niet verwijderd. Je hebt het recht Klanten verwijderen nodig.',
    },
  );
  if (!res.ok) {
    if (res.soort === 'conflict') {
      return writeFout(
        'conflict',
        'Deze leverancier kan niet verwijderd worden: er hangen nog kosten of materialen aan.',
      );
    }
    return res;
  }

  const snelstartId = (bestaand as { snelstart_id?: string | null } | null)?.snelstart_id ?? null;
  const waarschuwing = await negeerRelatieBijImport('leverancier', snelstartId);
  return waarschuwing ? { ok: true, data: null, waarschuwing } : { ok: true, data: null };
}

/**
 * Zet een verwijderde SnelStart-relatie op de negeerlijst (`import_genegeerd`),
 * zoals `negeerBijImport` in het dashboard. Null = gelukt of niet nodig.
 */
export async function negeerRelatieBijImport(
  soort: 'klant' | 'leverancier',
  snelstartId: string | null,
): Promise<string | null> {
  if (!snelstartId) return null;
  const externeId = String(snelstartId).replace(/^snelstart_/, '').split('_')[0];
  if (!externeId) return null;
  const melding =
    `${soort === 'klant' ? 'De klant' : 'De leverancier'} is verwijderd, maar kon niet in de ` +
    'prullenbak worden gezet. Bij de volgende synchronisatie met de boekhouding komt hij terug.';
  const companyId = getCompanyId();
  if (!companyId) return melding;
  const { error } = await supabase.from('import_genegeerd').upsert(
    { company_id: companyId, provider: 'snelstart', soort, externe_id: externeId, reden: 'verwijderd in BossBase' },
    { onConflict: 'company_id,provider,soort,externe_id' },
  );
  if (error) {
    console.warn('[leverancierService.negeerRelatieBijImport]', error.message);
    return melding;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tijdlijn en notities (`leverancier_tijdlijn`, type 'notitie_toegevoegd')
// ---------------------------------------------------------------------------

export type LeverancierTijdlijnRegel = {
  id: string;
  type: string;
  /** Platte tekst; in de database staat HTML (met @-vermeldingen). */
  tekst: string;
  aangemaakt_op: string;
  auteurNaam: string;
};

type TijdlijnDbRij = {
  id: string;
  type: string;
  omschrijving: string | null;
  aangemaakt_op: string;
  auteur: { full_name: string | null } | null;
};

const naarRegel = (r: TijdlijnDbRij): LeverancierTijdlijnRegel => ({
  id: r.id,
  type: r.type,
  tekst: alsTekst(r.omschrijving),
  aangemaakt_op: r.aangemaakt_op,
  auteurNaam: r.auteur?.full_name ?? '',
});

const TIJDLIJN_COLUMNS = 'id, type, omschrijving, aangemaakt_op, auteur:profiles ( full_name )';

export async function listLeverancierTijdlijn(
  leverancierId: string,
): Promise<{ data: LeverancierTijdlijnRegel[]; error: string | null }> {
  const eerste = await supabase
    .from('leverancier_tijdlijn')
    .select(TIJDLIJN_COLUMNS)
    .eq('leverancier_id', leverancierId)
    .order('aangemaakt_op', { ascending: false })
    .limit(200);
  let data: unknown = eerste.data;
  let error = eerste.error;
  if (error) {
    // Zonder FK naar profiles valt de auteur weg; de regels blijven leesbaar.
    ({ data, error } = await supabase
      .from('leverancier_tijdlijn')
      .select('id, type, omschrijving, aangemaakt_op')
      .eq('leverancier_id', leverancierId)
      .order('aangemaakt_op', { ascending: false })
      .limit(200));
  }
  if (error) {
    console.warn('[leverancierService.listLeverancierTijdlijn]', error.message);
    return { data: [], error: 'De tijdlijn kon niet worden geladen.' };
  }
  return {
    data: ((data as unknown as TijdlijnDbRij[]) ?? []).map((r) => naarRegel({ ...r, auteur: r.auteur ?? null })),
    error: null,
  };
}

export async function addLeverancierNotitie(
  leverancierId: string,
  tekstInvoer: string,
): Promise<WriteResult<{ id: string }>> {
  if (!tekstInvoer.trim()) return writeFout('validatie', 'Een notitie mag niet leeg zijn.');
  const userId = getUserId();
  const payload = withCompanyId({
    leverancier_id: leverancierId,
    type: 'notitie_toegevoegd',
    omschrijving: alsHtml(tekstInvoer),
    aangemaakt_op: new Date().toISOString(),
    ...(userId ? { created_by: userId } : {}),
  });
  if (!payload) {
    return writeFout('onbekend', 'Je bedrijfsgegevens zijn nog niet geladen. Probeer het zo opnieuw.');
  }
  return schrijf<{ id: string }>(
    () => supabase.from('leverancier_tijdlijn').insert(payload).select('id'),
    { context: 'leverancierService.addLeverancierNotitie', bedrijfReadonly: isReadonly() },
  );
}

// ---------------------------------------------------------------------------
// Materialen van deze leverancier
// ---------------------------------------------------------------------------

export type LeverancierMateriaal = {
  id: string;
  naam: string;
  eenheid: string;
  verkoopprijs: number | null;
  /** Alleen met het recht `inkoopprijzen`; anders geeft RLS hem niet terug. */
  inkoopprijs: number | null;
};

type MateriaalDbRij = {
  id: string;
  naam: string | null;
  eenheid: string | null;
  verkoopprijs: number | string | null;
  materiaal_inkoop: { inkoopprijs: number | string | null } | { inkoopprijs: number | string | null }[] | null;
};

export async function listLeverancierMaterialen(
  leverancierId: string,
): Promise<{ data: LeverancierMateriaal[]; error: string | null }> {
  const eerste = await supabase
    .from('materialen')
    .select('id, naam, eenheid, verkoopprijs, materiaal_inkoop ( inkoopprijs )')
    .eq('leverancier_id', leverancierId)
    .order('naam', { ascending: true })
    .limit(1000);
  let data: unknown = eerste.data;
  let error = eerste.error;
  if (error) {
    ({ data, error } = await supabase
      .from('materialen')
      .select('id, naam, eenheid, verkoopprijs')
      .eq('leverancier_id', leverancierId)
      .order('naam', { ascending: true })
      .limit(1000));
  }
  if (error) {
    console.warn('[leverancierService.listLeverancierMaterialen]', error.message);
    return { data: [], error: 'Materialen konden niet worden geladen.' };
  }
  const rijen = (data as unknown as MateriaalDbRij[]) ?? [];
  return {
    data: rijen.map((r) => {
      const k = Array.isArray(r.materiaal_inkoop) ? r.materiaal_inkoop[0] : r.materiaal_inkoop;
      return {
        id: r.id,
        naam: r.naam ?? '',
        eenheid: r.eenheid || 'stuk',
        verkoopprijs: r.verkoopprijs != null ? Number(r.verkoopprijs) : null,
        inkoopprijs: k?.inkoopprijs != null ? Number(k.inkoopprijs) : null,
      };
    }),
    error: null,
  };
}
