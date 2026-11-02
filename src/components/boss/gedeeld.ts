/**
 * Hooks en acties die offerte- en factuurgesprek delen: voortgang tijdens een
 * vraag, en een foto of bestand klaarmaken voor Boss.
 */
import { useRef, useState } from 'react';
import { maakOfKiesFoto } from '@/lib/kiesFoto';
import { kiesBestanden } from '@/lib/kiesBestand';
import { bestandVoorBoss, type BossBestand } from '@/services/bossDocumentService';
import type { Stap } from './BossGesprek';

/** Voortgang: echte aanroep, met stappen die laten zien wat er gebeurt. */
export function useVoortgang(): [Stap[], (labels: string[]) => void, () => void] {
  const [stappen, setStappen] = useState<Stap[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const start = (labels: string[]) => {
    timers.current.forEach(clearTimeout);
    setStappen(labels.map((l, i) => ({ l, s: i === 0 ? 'bezig' : 'wacht' })));
    timers.current = labels.slice(1).map((_, i) =>
      setTimeout(
        () => setStappen((st) => st.map((x, j) => (j === i ? { ...x, s: 'klaar' } : j === i + 1 ? { ...x, s: 'bezig' } : x))),
        1400 * (i + 1),
      ),
    );
  };
  const stop = () => {
    timers.current.forEach(clearTimeout);
    setStappen([]);
  };
  return [stappen, start, stop];
}

/**
 * Een foto (camera of bibliotheek) of bestand voor Boss. Null bij annuleren;
 * een fout gooit met een uitleg die het gesprek als kaart toont.
 */
export async function bronVoorBoss(bron: 'camera' | 'foto' | 'bestand'): Promise<BossBestand | null> {
  if (bron === 'bestand') {
    const lijst = await kiesBestanden();
    const b = lijst?.[0];
    if (!b) return null;
    return bestandVoorBoss(b.naam, b.mime, await b.lees());
  }
  const foto = await maakOfKiesFoto(bron === 'camera' ? 'camera' : 'bibliotheek');
  if (!foto) return null;
  return bestandVoorBoss(`foto.${foto.extensie}`, foto.contentType, foto.bytes);
}
