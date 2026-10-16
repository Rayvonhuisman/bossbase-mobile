import { useEffect } from 'react';
import { AppState } from 'react-native';
import { supabase } from '@/lib/supabase';

// ── Gebruik melden voor de superadmin ───────────────────────────────────────
// Wie in de app ingelogd blijft, logt nooit opnieuw in. "Laatst gebruikt" en
// de activiteit in de superadmin hangen daarom niet aan inloggen maar aan
// deze melding: bij openen, bij terugkeren naar de app en daarna hooguit eens
// per vijf minuten (bb_gebruik_melden, één rij per gebruiker per dag). Het
// dashboard doet hetzelfde met bron 'dashboard'.
const INTERVAL = 5 * 60 * 1000;
let laatst = 0;

function meld() {
  if (Date.now() - laatst < INTERVAL) return;
  laatst = Date.now();
  supabase.rpc('bb_gebruik_melden', { p_bron: 'app' }).then(
    () => {},
    () => {},
  );
}

export function useGebruikMelden(actief: boolean) {
  useEffect(() => {
    if (!actief) return;
    meld();
    const sub = AppState.addEventListener('change', (stand) => {
      if (stand === 'active') meld();
    });
    const klok = setInterval(() => {
      if (AppState.currentState === 'active') meld();
    }, INTERVAL);
    return () => {
      sub.remove();
      clearInterval(klok);
    };
  }, [actief]);
}
