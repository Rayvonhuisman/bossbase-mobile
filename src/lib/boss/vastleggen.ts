/**
 * Boss legt vast (november 2026): pure regels voor de kaartjes in de Boss-chat.
 *
 * De server (boss-chat in de dashboard-repo, `versie: 2`) zet een notitie, taak
 * of metingen klaar en stuurt per ding een kaartje (event `acties`). Er is dan
 * nog niets opgeslagen: dat doet de app pas na Opslaan, met de gewone services
 * (RLS en rechten gelden vanzelf). Zelfde vorm als het dashboard
 * (`src/components/BossKaart.jsx`).
 */

export type BossKaart = {
  id: string;
  soort: 'notitie' | 'taak' | 'metingen';
  klant: { id: string; naam: string } | null;
  project: { id: string; naam: string; klant_id: string | null; klant_naam: string | null } | null;
  keuzes: { id: string; naam: string; sub: string; klant_id?: string | null; klant_naam?: string | null }[];
  keuze_soort: 'klant' | 'project' | null;
  gezocht: string;
  niet_gevonden: boolean;
  tekst: string;
  taak_soort: string;
  datum: string;
  tijd: string;
  datum_onzeker: boolean;
  geweigerd: string | null;
  /** Alleen in de app: open, opgeslagen, doorgezet (metingen) of weg. */
  stand?: 'open' | 'opgeslagen' | 'doorgezet' | 'weg';
};

const TAAK_LABEL: Record<string, string> = { call: 'Bellen', email: 'E-mail', visit: 'Bezoek', task: 'Taak', follow: 'Opvolgen' };
const WEEKDAG = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
const MAAND = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

/** "do 12 nov" */
export function datumTekst(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return '';
  const [j, mnd, dag] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(j, mnd - 1, dag, 12));
  return `${WEEKDAG[d.getUTCDay()]} ${dag} ${MAAND[mnd - 1]}`;
}

/** Kop van het kaartje: "Notitie bij Jan Jansen", "Bellen · Jan Jansen", "Metingen voor …". */
export function kopVan(k: BossKaart): string {
  const bij = k.project ? `project ${k.project.naam}` : k.klant?.naam || '';
  if (k.soort === 'notitie') return bij ? `Notitie bij ${bij}` : 'Notitie';
  if (k.soort === 'taak') return `${TAAK_LABEL[k.taak_soort] || 'Taak'}${k.klant ? ` · ${k.klant.naam}` : ''}`;
  return k.project ? `Metingen voor ${k.project.naam}` : 'Metingen';
}

/** De gebruiker kiest een van de klanten of projecten op het kaartje. */
export function kiesKeuze(k: BossKaart, id: string): BossKaart {
  const x = k.keuzes.find((y) => y.id === id);
  if (!x) return k;
  if (k.keuze_soort === 'project') {
    return {
      ...k,
      project: { id: x.id, naam: x.naam, klant_id: x.klant_id ?? null, klant_naam: x.klant_naam ?? null },
      klant: x.klant_id ? { id: x.klant_id, naam: x.klant_naam || '' } : k.klant,
      keuzes: [],
      keuze_soort: null,
    };
  }
  return { ...k, klant: { id: x.id, naam: x.naam }, keuzes: [], keuze_soort: null };
}

/** Waarom er (nog) niet opgeslagen kan worden; null = het kan. */
export function waaromNiet(k: BossKaart): string | null {
  if (k.geweigerd) return k.geweigerd;
  if (k.keuzes.length) return `Welke ${k.keuze_soort === 'project' ? 'project' : 'klant'} bedoel je${k.gezocht ? ` met "${k.gezocht}"` : ''}?`;
  if (k.soort !== 'taak' && !k.klant && !k.project) {
    return k.gezocht
      ? `Ik vind geen ${k.soort === 'metingen' || k.project ? 'project' : 'klant'} bij "${k.gezocht}" die jij kunt zien. Controleer de naam en vraag het opnieuw.`
      : 'Bij welke klant hoort dit? Noem de naam erbij, of open eerst de klant.';
  }
  if (!k.tekst.trim()) return 'Er staat nog niets in.';
  return null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Waar de gebruiker staat, uit het pad van expo-router: een klantscherm
 * (`/customers/<id>`) of een project (`/project/<id>`). Dat is "deze klant"
 * voor Boss. Andere schermen: geen context.
 */
export function contextUitPad(pad: string | null | undefined): { klant_id?: string; project_id?: string } | null {
  const [soort, id, ...rest] = String(pad || '').split('?')[0]?.split('/').filter(Boolean) ?? [];
  if (!id || rest.length || !UUID.test(id)) return null;
  if (soort === 'customers') return { klant_id: id };
  if (soort === 'project') return { project_id: id };
  return null;
}

// ── Metingen: van de chat naar Vertel het Boss op het project ──────────────
// De chat zet de tekst hier neer en opent het project; het metingenblok pakt
// hem op en opent Vertel het Boss met die tekst. Alleen in het geheugen.
let wacht: { projectId: string; tekst: string; op: number } | null = null;

export function zetBossMeting(projectId: string, tekst: string) {
  wacht = projectId && tekst ? { projectId, tekst, op: Date.now() } : null;
}

/** De wachtende tekst voor dit project (en weg), of null. Ouder dan tien minuten telt niet. */
export function pakBossMeting(projectId: string): string | null {
  if (!wacht || wacht.projectId !== projectId || Date.now() - wacht.op > 10 * 60 * 1000) return null;
  const { tekst } = wacht;
  wacht = null;
  return tekst;
}
