import { supabase } from '@/lib/supabase';

/**
 * De meldingenbel — dezelfde tabel als het dashboard: `notifications`.
 *
 * Soorten (`type`): `mention` (getagd in een notitie), `toewijzing_activiteit`,
 * `toewijzing_werkbon`, `toewijzing_project`, `verantwoordelijke_werkbon`,
 * `planning_wijziging` en `website_aanvraag`. RLS laat alleen je eigen rijen
 * zien en bijwerken (`user_id = auth.uid()`); aanmaken voor collega's gebeurt
 * server-side (Edge Function `create-notification`), niet hier.
 */

export type Melding = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  related_type: string | null;
  related_id: string | null;
  read_at: string | null;
  created_at: string;
  maker: string | null;
};

const KOLOMMEN = 'id, type, title, body, link, related_type, related_id, read_at, created_at, creator:created_by ( full_name )';

export async function listMeldingen(userId: string): Promise<{ data: Melding[]; error: string | null }> {
  const { data, error } = await supabase
    .from('notifications')
    .select(KOLOMMEN)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return { data: [], error: 'Meldingen konden niet worden geladen.' };
  return {
    data: ((data ?? []) as unknown as (Omit<Melding, 'maker'> & { creator: { full_name: string | null } | null })[]).map(
      (r) => ({ ...r, maker: r.creator?.full_name ?? null }),
    ),
    error: null,
  };
}

export async function aantalOngelezen(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null);
  return error ? 0 : (count ?? 0);
}

export async function markeerGelezen(id: string): Promise<void> {
  await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
}

export async function markeerAllesGelezen(userId: string): Promise<void> {
  await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null);
}

// Van link naar scherm: zie lib/meldingLink (puur, getest).
export { routeVoorLink } from '@/lib/meldingLink';

/** "zojuist", "5 min geleden", "3 uur geleden", "2 dagen geleden" — als het dashboard. */
export function relatieveTijd(iso: string, nu = Date.now()): string {
  const sec = Math.max(0, Math.round((nu - new Date(iso).getTime()) / 1000));
  if (sec < 60) return 'zojuist';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min geleden`;
  const uur = Math.round(min / 60);
  if (uur < 24) return `${uur} uur geleden`;
  const dagen = Math.round(uur / 24);
  return `${dagen} ${dagen === 1 ? 'dag' : 'dagen'} geleden`;
}
