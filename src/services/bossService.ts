import { supabase } from '@/lib/supabase';
import { env } from '@/lib/env';

/**
 * Boss — dezelfde helpagent als in het dashboard: Edge Function `boss-chat`.
 *
 * Zelfde aanroep als het dashboard (`BossChat.jsx`): een gewone `fetch` met de
 * anon-sleutel en het toegangstoken van de gebruiker, en het antwoord als
 * Server-Sent Events. De server bewaakt alles (ingelogd, actief account,
 * 30 berichten per uur, opslaan van het gesprek); de app stuurt alleen de
 * berichten, het gesprek-id en `bron: 'app'`. Die bron laat Boss naar de app
 * verwijzen in plaats van naar het dashboard; rol, rechten en pakket bepaalt de
 * server zelf.
 *
 * Kan de omgeving het antwoord niet als stroom lezen (native fetch zonder
 * streams), dan lezen we het in één keer en verwerken we dezelfde events.
 */

/**
 * Nieuwere functies in deze app-versie die Boss mag uitleggen. Komt er een
 * functie bij die Boss in de app beschrijft, zet hem dan hier én in
 * `APP_FUNCTIES` in boss-chat (dashboard-repo).
 */
export const APP_FUNCTIES = ['boss_werkruimte'] as const;

export type BossBericht = { rol: 'gebruiker' | 'boss'; tekst: string };

export type BossUitkomst =
  | { ok: true; gesprekId: string | null }
  | { ok: false; melding: string };

type Event = { soort: string; data: Record<string, unknown> };

/** Losse SSE-regels → events. Exporteerbaar voor tests. */
export function leesEvents(blok: string): Event[] {
  const uit: Event[] = [];
  for (const deel of blok.split(/\n\n+/)) {
    let soort = 'message';
    const dataRegels: string[] = [];
    for (const regel of deel.split('\n')) {
      if (regel.startsWith('event:')) soort = regel.slice(6).trim();
      else if (regel.startsWith('data:')) dataRegels.push(regel.slice(5).trim());
    }
    if (!dataRegels.length) continue;
    try {
      uit.push({ soort, data: JSON.parse(dataRegels.join('\n')) as Record<string, unknown> });
    } catch {
      // Onvolledige of kapotte regel: overslaan, de rest gaat door.
    }
  }
  return uit;
}

export async function vraagBoss({
  berichten,
  gesprekId,
  onTekst,
  onBezig,
  signal,
}: {
  berichten: BossBericht[];
  gesprekId: string | null;
  /** Elk binnenkomend stukje antwoord. */
  onTekst: (stukje: string) => void;
  /** Boss zet de vraag door naar het team. */
  onBezig?: (wat: string) => void;
  signal?: AbortSignal;
}): Promise<BossUitkomst> {
  const { data: sessie } = await supabase.auth.getSession();
  const token = sessie.session?.access_token;
  if (!token) return { ok: false, melding: 'Je bent niet ingelogd. Log opnieuw in.' };

  let antwoord: Response;
  try {
    antwoord = await fetch(`${env.SUPABASE_URL}/functions/v1/boss-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        messages: berichten,
        bron: 'app',
        // Wat deze app-versie kan (whitelist in boss-chat, _shared/bossGebruiker.ts).
        // Een oudere app stuurt dit niet; dan vertelt Boss dat het met een update komt.
        app_functies: APP_FUNCTIES,
        ...(gesprekId ? { conversation_id: gesprekId } : {}),
      }),
      signal,
    });
  } catch {
    return { ok: false, melding: 'Boss is even niet bereikbaar. Controleer je internet en probeer het opnieuw.' };
  }

  if (!antwoord.ok) {
    // De server geeft bij een limiet of weigering `{ error }` terug.
    try {
      const fout = (await antwoord.json()) as { error?: string };
      if (fout?.error) return { ok: false, melding: fout.error };
    } catch {
      // geen JSON
    }
    return { ok: false, melding: 'Boss is even niet bereikbaar. Probeer het zo nog eens.' };
  }

  let nieuwGesprekId: string | null = gesprekId;
  let fout: string | null = null;
  let tekens = 0;
  const verwerk = (events: Event[]) => {
    for (const e of events) {
      if (e.soort === 'gesprek' && typeof e.data.id === 'string') nieuwGesprekId = e.data.id;
      else if (e.soort === 'tekst' && typeof e.data.tekst === 'string') {
        tekens += e.data.tekst.length;
        onTekst(e.data.tekst);
      } else if (e.soort === 'bezig' && typeof e.data.wat === 'string') onBezig?.(e.data.wat);
      else if (e.soort === 'fout') fout = typeof e.data.bericht === 'string' ? e.data.bericht : 'Er ging iets mis.';
    }
  };

  const lezer = (antwoord.body as ReadableStream<Uint8Array> | null)?.getReader?.();
  if (lezer) {
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { value, done } = await lezer.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const grens = buffer.lastIndexOf('\n\n');
      if (grens >= 0) {
        verwerk(leesEvents(buffer.slice(0, grens)));
        buffer = buffer.slice(grens + 2);
      }
    }
    if (buffer.trim()) verwerk(leesEvents(buffer));
  } else {
    verwerk(leesEvents(await antwoord.text()));
  }

  if (fout) return { ok: false, melding: fout };
  if (!tekens) return { ok: false, melding: 'Boss gaf geen antwoord. Probeer het zo nog eens.' };
  return { ok: true, gesprekId: nieuwGesprekId };
}
