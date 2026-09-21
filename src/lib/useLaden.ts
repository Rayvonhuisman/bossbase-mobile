import { useCallback, useEffect, useRef, useState } from 'react';
import { useIsFocused } from 'expo-router/react-navigation';

/**
 * Laden, verversen en pull-to-refresh — met drie toestanden in plaats van twee.
 *
 * Het probleem dat dit oplost: elk scherm had één `refreshing`-vlag die zowel
 * bij een handmatige pull als bij een automatische verversing werd gezet. Die
 * vlag hangt aan de `RefreshControl`, en die duwt op iOS de inhoud omlaag zodra
 * hij waar is. Gevolg: je wisselde van tab en het nieuwe scherm stond een stuk
 * naar beneden, alsof je er zelf aan getrokken had. Bij een fout tijdens het
 * laden bleef hij daar zelfs staan, want `setRefreshing(false)` stond ná de
 * `await` en niet in een `finally`.
 *
 * Daarom drie duidelijk gescheiden toestanden:
 *
 *   loading     de eerste keer — het scherm heeft nog niets te tonen
 *   verversen   stil op de achtergrond (bij focus, of na een opslagactie);
 *               de bestaande inhoud blijft staan, zonder indicator
 *   refreshing  ALLEEN als de gebruiker zelf naar beneden trekt
 *
 * Verder bewaakt deze hook drie dingen die anders per scherm opnieuw misgaan:
 *
 * 1. **Eén laadactie tegelijk.** Een focusverversing tijdens een lopende pull
 *    wordt overgeslagen in plaats van de vlaggen door elkaar te gooien.
 * 2. **Altijd terug naar false.** De vlaggen gaan in een `finally` uit, dus een
 *    mislukte of vastgelopen fetch laat het scherm niet omlaag hangen.
 * 3. **Een uitzondering blijft zichtbaar.** Loopt het verwerken ná een
 *    geslaagde query stuk, dan komt dat via `onFout` op het scherm terecht en
 *    niet als een lege lijst.
 */

export type LaadBron = 'eerste' | 'focus' | 'pull';

export type LadenOpties = {
  /**
   * Krijgt een uitzondering die uit `laad` ontsnapt. Zonder deze haak zou een
   * fout in het verwerken van een geslaagde query (een mapping die op een lege
   * relatie stukloopt, een datum die niet te formatteren is) eindigen als een
   * leeg scherm: "geen werkbonnen" terwijl er iets mis is. Het scherm geeft
   * hier zijn eigen `setError` aan mee.
   */
  onFout?: (melding: string) => void;
  /**
   * Opnieuw ophalen zodra het scherm weer focus krijgt. Standaard aan: terug
   * uit een detailscherm hoort de lijst bij te werken. De eerste focus telt
   * niet mee — dat is de eerste load zelf.
   */
  bijFocus?: boolean;
  /** Niets laden zolang dit onwaar is (bijvoorbeeld: rechten nog onderweg). */
  klaarOmTeLaden?: boolean;
};

export type LadenStatus = {
  /** Eerste keer laden: toon het laadscherm. */
  loading: boolean;
  /** Stille achtergrondverversing — géén pull-to-refresh-indicator. */
  verversen: boolean;
  /** Uitsluitend een door de gebruiker gestarte pull-to-refresh. */
  refreshing: boolean;
  /** Voor `AppScreen`/`RefreshControl`: de gebruiker trekt eraan. */
  onRefresh: () => void;
  /** Stil opnieuw ophalen, bijvoorbeeld na opslaan. */
  herlaad: () => Promise<void>;
  /** Opnieuw proberen na een fout: toont wél het laadscherm. */
  opnieuw: () => Promise<void>;
};

export function useLaden(
  laad: (bron: LaadBron) => Promise<void>,
  opties: LadenOpties = {},
): LadenStatus {
  const { bijFocus = true, klaarOmTeLaden = true, onFout } = opties;

  const [loading, setLoading] = useState(true);
  const [verversen, setVerversen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const bezig = useRef(false);
  const eersteGedaan = useRef(false);
  // De foutmelder in een ref, zodat `voerUit` niet bij elke render een nieuwe
  // identiteit krijgt. Bijwerken gebeurt in een effect — een ref schrijven
  // tijdens de render mag niet.
  const foutHaak = useRef(onFout);
  useEffect(() => {
    foutHaak.current = onFout;
  }, [onFout]);

  const voerUit = useCallback(
    async (bron: LaadBron) => {
      // Eén tegelijk. Een tweede verzoek hoeft niet te wachten: de eerste haalt
      // dezelfde gegevens op en zet dezelfde state.
      if (bezig.current) return;
      bezig.current = true;
      if (bron === 'pull') setRefreshing(true);
      else if (bron === 'focus') setVerversen(true);
      else setLoading(true);
      try {
        await laad(bron);
      } catch (e) {
        // Een uitzondering ná een geslaagde query (mapping, sortering,
        // datumformattering) mag niet als "niets gevonden" eindigen.
        const melding =
          e instanceof Error ? e.message : 'Er ging iets mis bij het verwerken van de gegevens.';
        if (__DEV__) console.log('[useLaden] uitzondering tijdens laden:', melding, e);
        foutHaak.current?.(melding);
      } finally {
        // Onvoorwaardelijk: welke vlag ook aanstond, het scherm mag nooit in
        // een laad- of refreshstand blijven hangen. Een state-update na
        // unmount is sinds React 18 een no-op, dus daar hoeft geen vlag meer
        // omheen — en zo'n vlag wás juist het risico op een spinner die
        // blijft draaien.
        bezig.current = false;
        setLoading(false);
        setVerversen(false);
        setRefreshing(false);
      }
    },
    [laad],
  );

  // Eerste load, zodra het scherm er klaar voor is.
  useEffect(() => {
    if (!klaarOmTeLaden || eersteGedaan.current) return;
    eersteGedaan.current = true;
    voerUit('eerste');
  }, [klaarOmTeLaden, voerUit]);

  // Terug op het scherm: stil bijwerken. De eerste focus is de mount zelf.
  const isFocused = useIsFocused();
  const focusGezien = useRef(false);
  useEffect(() => {
    if (!bijFocus || !klaarOmTeLaden) return;
    if (!isFocused) return;
    if (!focusGezien.current) {
      focusGezien.current = true;
      return;
    }
    voerUit('focus');
  }, [isFocused, bijFocus, klaarOmTeLaden, voerUit]);

  const onRefresh = useCallback(() => {
    voerUit('pull');
  }, [voerUit]);

  const herlaad = useCallback(() => voerUit('focus'), [voerUit]);
  const opnieuw = useCallback(() => voerUit('eerste'), [voerUit]);

  return { loading, verversen, refreshing, onRefresh, herlaad, opnieuw };
}
