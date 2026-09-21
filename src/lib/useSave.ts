import { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useToast } from '@/providers';
import type { WriteResult } from './writeResult';

/**
 * Eén opslagactie uitvoeren, precies één keer.
 *
 * Twee problemen die dit oplost:
 *
 * 1. **Dubbel opslaan.** De knop uitzetten met React-state helpt niet: de
 *    tweede tik komt in dezelfde frame binnen, vóór de re-render. Daarom een
 *    ref als slot — die is meteen na de eerste aanroep dicht.
 * 2. **Stille mislukking.** `run` geeft een `WriteResult` terug, en alleen bij
 *    `ok` roepen we `onSuccess` aan. Een RLS-weigering komt dus nooit als
 *    "opgeslagen" op het scherm, ook niet als de aanroeper dat vergeet te
 *    controleren.
 */
export function useSave<T>() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const slot = useRef(false);
  const { toonResultaat } = useToast();

  const save = useCallback(
    async (
      run: () => Promise<WriteResult<T>>,
      opties?: {
        /**
         * `extra` draagt de losse velden mee die een schrijfactie naast `data`
         * teruggeeft — bijvoorbeeld de waarschuwing dat de prullenbak van de
         * boekhoudkoppeling niet is bijgewerkt. Zonder dat kanaal zou zo'n
         * mededeling verdwijnen terwijl de actie zelf wél is gelukt.
         */
        onSuccess?: (data: T, extra?: Record<string, unknown>) => void | Promise<void>;
        /** Bevestigingsmelding na afloop. Weglaten = stil doorgaan. */
        succesMelding?: string;
      },
    ): Promise<WriteResult<T> | null> => {
      if (slot.current) return null;
      slot.current = true;
      setSaving(true);
      setError(null);

      try {
        const res = await run();
        if (res.ok) {
          const { ok: _ok, data: _data, ...extra } = res as Record<string, unknown> & {
            ok: true;
            data: T;
          };
          await opties?.onSuccess?.(res.data, extra);
          // Alleen hier kan een succesmelding komen: de server heeft een rij
          // teruggegeven. Een stille RLS-weigering valt in de `else` hieronder.
          if (opties?.succesMelding) toonResultaat(res, opties.succesMelding);
        } else {
          // De melding blijft in het formulier staan tot de volgende poging.
          // De toast is er alleen bij, voor als het formulier al dicht is —
          // informatie die vanzelf verdwijnt mag nooit de enige plek zijn waar
          // een fout te lezen is.
          setError(res.melding);
          toonResultaat(res, '');
        }
        return res;
      } finally {
        slot.current = false;
        setSaving(false);
      }
    },
    [toonResultaat],
  );

  const reset = useCallback(() => setError(null), []);

  return { save, saving, error, setError, reset };
}

/**
 * Bevestiging vóór een onomkeerbare actie. Losse helper omdat verwijderen op
 * vijf plekken zit en de tekst overal hetzelfde hoort te zijn.
 */
export function bevestigVerwijderen(
  wat: string,
  onBevestig: () => void,
  uitleg = 'Dit kan niet ongedaan worden gemaakt.',
): void {
  Alert.alert(`${wat} verwijderen?`, uitleg, [
    { text: 'Annuleren', style: 'cancel' },
    { text: 'Verwijderen', style: 'destructive', onPress: onBevestig },
  ]);
}
