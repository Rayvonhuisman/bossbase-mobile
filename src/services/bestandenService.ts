import { supabase } from '@/lib/supabase';
import { getCompanyId, isReadonly } from '@/lib/sessionContext';
import { classificeerFout, schrijf, writeFout, type WriteResult, type WriteStatus } from '@/lib/writeResult';
import { haalDocumentPdf, PdfFout } from '@/lib/pdf';
import { bytesNaarBase64 } from '@/lib/pdf/afbeelding';
import {
  bestandFout,
  bestandType,
  downloadNaam,
  naamZonderExtensie,
  veiligeNaam,
  type GekozenBestand,
} from '@/lib/bestandRegels';

export {
  BESTAND_MAX,
  BESTAND_MAX_PER_KEER,
  BESTAND_TYPES_UITLEG,
  bestandFout,
  bestandType,
  downloadNaam,
  isTeBekijken,
  naamZonderExtensie,
} from '@/lib/bestandRegels';

/**
 * Bestanden: alles wat bij een klant of project bewaard is, op één plek. Zelfde
 * database, functies en rechten als het dashboard (`bestandenService.js`).
 *
 * De lijst komt uit de databasefunctie `bestanden_overzicht` (migratie
 * 20261023160746 in ~/BossBase). Die zoekt de bestanden op waar ze al staan
 * (offertes, facturen, werkbonnen, foto's, bonnen, metingen) en voegt de eigen
 * uploads uit de tabel `bestanden` toe. Hij draait met de rechten van de
 * gebruiker: wat je niet mag zien, komt niet terug.
 *
 * Openen gaat per bron (`b.bron`):
 *   offerte_pdf, offerte_getekend, factuur_pdf, werkbon_getekend
 *                         → `haalDocumentPdf`, dezelfde weg als "Bekijken";
 *   al het andere         → tijdelijke link uit de eigen bucket.
 */

export type BestandSoort = 'offerte' | 'factuur' | 'werkbon' | 'foto' | 'bon' | 'meting' | 'eigen';

export const BESTAND_SOORTEN: { id: BestandSoort; label: string }[] = [
  { id: 'offerte', label: 'Offertes' },
  { id: 'factuur', label: 'Facturen' },
  { id: 'werkbon', label: 'Werkbonnen' },
  { id: 'foto', label: "Foto's" },
  { id: 'bon', label: 'Bonnen' },
  { id: 'meting', label: 'Metingen' },
  { id: 'eigen', label: 'Eigen bestanden' },
];

export const SOORT_LABEL: Record<BestandSoort, string> = {
  offerte: 'Offerte',
  factuur: 'Factuur',
  werkbon: 'Werkbon',
  foto: 'Foto',
  bon: 'Bon',
  meting: 'Meting',
  eigen: 'Eigen bestand',
};

export type Bestand = {
  sleutel: string;
  soort: BestandSoort;
  bron: string;
  naam: string;
  omschrijving: string;
  bucket: string | null;
  pad: string | null;
  mime: string;
  grootte: number | null;
  datum: string | null;
  customerId: string | null;
  projectId: string | null;
  projectNaam: string;
  bronId: string;
  eigen: boolean;
  magBeheren: boolean;
};

type Rij = {
  sleutel: string;
  soort: BestandSoort;
  bron: string;
  naam: string;
  omschrijving: string | null;
  bucket: string | null;
  pad: string | null;
  mime: string | null;
  grootte: number | null;
  datum: string | null;
  customer_id: string | null;
  project_id: string | null;
  project_naam: string | null;
  bron_id: string;
  eigen: boolean | null;
  mag_beheren: boolean | null;
};

const naarBestand = (r: Rij): Bestand => ({
  sleutel: r.sleutel,
  soort: r.soort,
  bron: r.bron,
  naam: r.naam,
  omschrijving: r.omschrijving || '',
  bucket: r.bucket,
  pad: r.pad,
  mime: r.mime || '',
  grootte: r.grootte ?? null,
  datum: r.datum,
  customerId: r.customer_id,
  projectId: r.project_id,
  projectNaam: r.project_naam || '',
  bronId: r.bron_id,
  eigen: !!r.eigen,
  magBeheren: !!r.mag_beheren,
});

/** Waar een bestand bij hoort: de klant zelf of één project. */
export type BestandDoel = { klantId?: string | null; projectId?: string | null };

export async function getBestanden({ klantId = null, projectId = null }: BestandDoel): Promise<Bestand[]> {
  if (!klantId && !projectId) return [];
  const { data, error } = await supabase.rpc('bestanden_overzicht', {
    p_customer_id: projectId ? null : klantId,
    p_project_id: projectId || null,
  });
  if (error) throw error;
  return ((data ?? []) as Rij[]).map(naarBestand);
}

/**
 * Mag deze gebruiker hier eigen bestanden toevoegen? Dezelfde functie als de
 * database toetst, zodat er geen knop staat die toch geweigerd wordt.
 */
export async function magBestandenToevoegen({ klantId = null, projectId = null }: BestandDoel): Promise<boolean> {
  if ((!klantId && !projectId) || isReadonly()) return false;
  const { data, error } = await supabase.rpc('bb_mag_bestanden_beheren', {
    p_customer: projectId ? null : klantId,
    p_project: projectId || null,
  });
  return !error && data === true;
}

/** UUID v4; niet geheim, alleen uniek (het pad bevat de id van de rij). */
function nieuweId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40;
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// ── Opslag van het bedrijf ──────────────────────────────────────────────────
// Limiet per pakket (migratie 20261023163939). De database houdt een upload
// tegen als de opslag vol is; hier komt de begrijpelijke melding vandaan.
export const OPSLAG_WAARSCHUWING = 0.8;
export const OPSLAG_VOL_TEKST =
  'Je opslag is vol. Verwijder bestanden die je niet meer nodig hebt, of kies een groter pakket voor meer opslag.';

export type OpslagStand = { gebruikt: number; max: number | null; vol: boolean; deel: number };

export async function getOpslagStand(): Promise<OpslagStand | null> {
  const { data, error } = await supabase.rpc('opslag_stand');
  if (error || !data) return null;
  const d = data as { gebruikt?: number; max?: number | null; pakketMax?: number | null; vol?: boolean };
  const gebruikt = Number(d.gebruikt || 0);
  const grens = d.max ?? d.pakketMax ?? null;
  return { gebruikt, max: d.max ?? null, vol: d.vol === true, deel: grens ? gebruikt / grens : 0 };
}

/** "1,2 GB", "350 MB", "12 kB". */
export function fmtOpslag(bytes: number): string {
  const b = Number(bytes || 0);
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} GB`;
  if (b >= 1024 ** 2) return `${Math.round(b / 1024 ** 2).toLocaleString('nl-NL')} MB`;
  if (b > 0) return `${Math.max(1, Math.round(b / 1024))} kB`;
  return '0 MB';
}

const opslagVol = () => writeFout('plan-limiet', OPSLAG_VOL_TEKST, 'opslag_vol');
export const isOpslagVol = (r: WriteStatus | WriteResult<unknown>) => !r.ok && r.technisch === 'opslag_vol';

// ── Schrijven ───────────────────────────────────────────────────────────────

/**
 * Eén eigen bestand uploaden: eerst de rij (de opslag toetst die), dan het
 * bestand. Lukt het bestand niet, dan gaat de rij weer weg.
 */
export async function uploadBestand(input: {
  bestand: GekozenBestand;
  doel: BestandDoel;
  naam: string;
  omschrijving?: string;
}): Promise<WriteResult<string>> {
  const { bestand, doel } = input;
  const fout = bestandFout({ naam: bestand.naam, mime: bestand.mime, grootte: bestand.bytes.byteLength });
  if (fout) return writeFout('validatie', fout);
  const companyId = getCompanyId();
  if (!companyId) return writeFout('onbekend', 'Je bedrijfsgegevens zijn nog niet geladen.');
  if (isReadonly()) return writeFout('readonly');
  const id = nieuweId();
  const mime = bestandType(bestand) as string;
  const pad = `${companyId}/${id}/${veiligeNaam(bestand.naam)}`;
  const rij = {
    id,
    company_id: companyId,
    customer_id: doel.projectId ? null : doel.klantId,
    project_id: doel.projectId || null,
    naam: (input.naam || naamZonderExtensie(bestand.naam) || 'Bestand').trim().slice(0, 200),
    omschrijving: (input.omschrijving ?? '').trim().slice(0, 2000) || null,
    pad,
    mime,
    grootte: bestand.bytes.byteLength,
  };

  // Is de opslag vol, dan weigert de database de rij al (hint opslag_vol).
  const { data, error } = await supabase.from('bestanden').insert(rij).select('id');
  if (error) {
    if ((error as { hint?: string }).hint === 'opslag_vol') return opslagVol();
    return classificeerFout(error, 'bestandenService.uploadBestand', isReadonly());
  }
  if (!data?.length) return writeFout('geen-rechten', 'Je mag hier geen bestanden toevoegen.');

  const { error: opslagFout } = await supabase.storage
    .from('bestanden')
    .upload(pad, bestand.bytes, { contentType: mime, upsert: false });
  if (opslagFout) {
    await supabase.from('bestanden').delete().eq('id', id);
    // De opslag geeft bij een volle opslag alleen een weigering; vraag de stand na.
    const stand = await getOpslagStand().catch(() => null);
    if (stand?.vol) return opslagVol();
    if (__DEV__) console.warn('[bestandenService.uploadBestand]', opslagFout.message);
    return writeFout('onbekend', 'Het bestand is niet opgeslagen. Probeer het opnieuw.', opslagFout.message);
  }
  return { ok: true, data: id };
}

/** Alleen naam en omschrijving zijn na het uploaden te wijzigen. */
export async function updateBestand(id: string, wijziging: { naam: string; omschrijving: string }): Promise<WriteStatus> {
  const res = await schrijf<{ id: string }>(
    () =>
      supabase
        .from('bestanden')
        .update({
          naam: wijziging.naam.trim().slice(0, 200),
          omschrijving: wijziging.omschrijving.trim().slice(0, 2000) || null,
        })
        .eq('id', id)
        .select('id'),
    {
      context: 'bestandenService.updateBestand',
      bedrijfReadonly: isReadonly(),
      leegMelding: 'Je mag dit bestand niet wijzigen.',
    },
  );
  return res.ok ? { ok: true, data: null } : res;
}

/**
 * Alleen eigen uploads. Eerst het bestand (de opslag toetst de rij), dan de rij.
 * Een geweigerde verwijdering geeft bij de opslag geen fout maar een lege lijst.
 */
export async function verwijderBestand(b: Bestand): Promise<WriteStatus> {
  if (!b.eigen || !b.pad) {
    return writeFout('op-slot', 'Dit bestand hoort bij een offerte, factuur of werkbon en blijft daar bewaard.');
  }
  const { data: weg, error } = await supabase.storage.from('bestanden').remove([b.pad]);
  if (error) return classificeerFout({ message: error.message }, 'bestandenService.verwijderBestand', isReadonly());
  if (!weg?.length) return writeFout('geen-rechten', 'Je mag dit bestand niet verwijderen.');
  const res = await schrijf<{ id: string }>(
    () => supabase.from('bestanden').delete().eq('id', b.bronId).select('id'),
    { context: 'bestandenService.verwijderBestand', bedrijfReadonly: isReadonly() },
  );
  return res.ok ? { ok: true, data: null } : res;
}

// ── Openen ──────────────────────────────────────────────────────────────────

/** Een bestand zoals het in de app getoond, gedeeld of bewaard wordt. */
export type GeladenBestand = { base64: string; bestandsnaam: string; mime: string };

export class BestandFout extends Error {}
const NIET_TE_OPENEN = 'Dit bestand is niet (meer) te openen.';

async function base64Van(url: string): Promise<string> {
  const antwoord = await fetch(url);
  if (!antwoord.ok) throw new BestandFout(NIET_TE_OPENEN);
  return bytesNaarBase64(new Uint8Array(await antwoord.arrayBuffer()));
}

/** Het bestand binnenhalen, om te bekijken, te delen of te bewaren. */
export async function haalBestand(b: Bestand): Promise<GeladenBestand> {
  const documentSoort =
    b.bron === 'offerte_pdf' || b.bron === 'offerte_getekend'
      ? 'offerte'
      : b.bron === 'werkbon_getekend'
        ? 'werkbon'
        : b.bron === 'factuur_pdf' && !b.pad
          ? 'factuur'
          : null;
  if (documentSoort) {
    try {
      // Ondertekende offerte en werkbon: het bewaarde exemplaar. Gewone offerte
      // en factuur zonder bewaarde PDF (dat weet de lijst al): opbouwen zoals het
      // dashboard, zonder eerst naar een opgeslagen exemplaar te zoeken.
      const r = await haalDocumentPdf({
        soort: documentSoort,
        id: b.bronId,
        opgeslagenEerst: b.bron === 'offerte_getekend' || b.bron === 'werkbon_getekend',
      });
      const naam = downloadNaam({ ...b, mime: 'application/pdf' });
      if (r.bron === 'gemaakt') return { base64: r.base64, bestandsnaam: naam, mime: 'application/pdf' };
      return { base64: await base64Van(r.url), bestandsnaam: naam, mime: 'application/pdf' };
    } catch (e) {
      if (e instanceof PdfFout) throw new BestandFout(e.message);
      throw e;
    }
  }
  if (!b.bucket || !b.pad) throw new BestandFout(NIET_TE_OPENEN);
  const { data, error } = await supabase.storage.from(b.bucket).createSignedUrl(b.pad, 600);
  if (error || !data?.signedUrl) throw new BestandFout(NIET_TE_OPENEN);
  return {
    base64: await base64Van(data.signedUrl),
    bestandsnaam: downloadNaam(b),
    mime: b.mime || 'application/octet-stream',
  };
}
