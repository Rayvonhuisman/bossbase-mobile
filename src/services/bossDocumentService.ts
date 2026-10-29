/**
 * Boss bij offertes en facturen: praat met de edge functions `boss-offerte` en
 * `boss-factuur`, dezelfde als het dashboard (`bossOfferteService.js` en
 * `bossFactuurService.js`). De functies halen zelf de gegevens op en
 * controleren de prijzen; de app stuurt alleen de opdracht, de gekozen bronnen
 * en hoe het document er nu uitziet.
 *
 * `bossStatus()` bepaalt of "Maak met Boss" en "Help met schrijven"
 * verschijnen. Zolang de functie niet bereikbaar is, de gebruiker het recht niet
 * heeft of het bedrijf op alleen-lezen staat, blijft alles zoals het was.
 */
import { supabase } from '@/lib/supabase';
import { bytesNaarBase64 } from '@/lib/base64';

export type BossFunctie = 'boss-offerte' | 'boss-factuur';
export type BossStatus = { beschikbaar: boolean; mag: boolean; zeker: boolean };
export type BossBestand = { naam: string; type: string; data: string };
export type BossAntwoord<T> = { resultaat: T; waarschuwingen: string[] };

const NIET_BEREIKBAAR = 'Boss is even niet bereikbaar. Probeer het zo nog eens.';
const statussen = new Map<BossFunctie, Promise<BossStatus>>();

export function bossStatus(functie: BossFunctie): Promise<BossStatus> {
  let belofte = statussen.get(functie);
  if (!belofte) {
    belofte = supabase.functions
      .invoke(functie, { body: { taak: 'status' } })
      .then(({ data, error }): BossStatus => {
        if (error || !data?.success) return { beschikbaar: false, mag: false, zeker: false };
        return { beschikbaar: Boolean(data.beschikbaar), mag: Boolean(data.mag), zeker: true };
      })
      .catch((): BossStatus => ({ beschikbaar: false, mag: false, zeker: false }));
    statussen.set(functie, belofte);
    // Een mislukte controle niet de hele sessie onthouden.
    void belofte.then((s) => {
      if (!s.beschikbaar) setTimeout(() => statussen.delete(functie), 60_000);
    });
  }
  return belofte;
}

async function foutTekst(error: unknown): Promise<string> {
  try {
    const j = await (error as { context?: { json?: () => Promise<{ error?: string }> } })?.context?.json?.();
    if (j?.error) return j.error;
  } catch {
    /* geen JSON */
  }
  return NIET_BEREIKBAAR;
}

export async function vraagBoss<T>(functie: BossFunctie, body: Record<string, unknown>): Promise<BossAntwoord<T>> {
  let res;
  try {
    res = await supabase.functions.invoke(functie, { body });
  } catch {
    throw new Error(NIET_BEREIKBAAR);
  }
  const { data, error } = res;
  if (error) throw new Error(await foutTekst(error));
  if (!data?.success) throw new Error(data?.error || NIET_BEREIKBAAR);
  return { resultaat: data.resultaat as T, waarschuwingen: (data.waarschuwingen as string[]) || [] };
}

// ── Een bestand of foto voor Boss ──────────────────────────────────────────
// Alleen pdf, png en jpg tot 4 MB, net als in het dashboard.
export const BOSS_BESTAND_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];
export const BOSS_BESTAND_MAX = 4 * 1024 * 1024;

/** Controleert type en grootte en zet de inhoud om naar base64. Gooit een fout met een uitleg. */
export function bestandVoorBoss(naam: string, type: string | null, bytes: ArrayBuffer): BossBestand {
  const ext = (naam.split('.').pop() || '').toLowerCase();
  const mime = type || (ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : '');
  if (!bytes.byteLength) throw new Error('Het bestand is leeg.');
  if (!BOSS_BESTAND_TYPES.includes(mime)) {
    throw new Error(
      ext === 'heic'
        ? 'Dit is een HEIC-foto van een iPhone. Die kan Boss nog niet lezen. Maak een foto met de camera-knop of kies een pdf.'
        : `Een .${ext || 'onbekend'}-bestand kan Boss niet lezen. Kies een pdf, jpg of png.`,
    );
  }
  if (bytes.byteLength > BOSS_BESTAND_MAX) throw new Error('Dit bestand is groter dan 4 MB. Kies een kleiner bestand.');
  return { naam, type: mime, data: bytesNaarBase64(new Uint8Array(bytes)) };
}
