import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useAuth } from '@/providers';
import { filterSleutel, leesBewaard, type Toegestaan } from './onthoudenRegels';

/**
 * `useState` dat de keuze onthoudt, per gebruiker: het laatst gekozen filter of
 * tabblad op een lijstpagina staat de volgende keer weer zo, tot hij iets
 * anders kiest. Alleen filters en tabbladen — zoektekst niet.
 *
 * Op het toestel (AsyncStorage; op web is dat localStorage). Op web wordt het
 * meteen gelezen, zodat de lijst niet eerst met het standaardfilter verschijnt;
 * in de app komt de keuze een tel later binnen.
 *
 * `toegestaan`: de geldige waarden (of een toets). Een bewaarde waarde die er
 * niet (meer) in zit, telt niet.
 */
export function useOnthouden<T>(
  naam: string,
  standaard: T,
  toegestaan?: Toegestaan<T>,
): [T, (waarde: T | ((oud: T) => T)) => void] {
  const { user } = useAuth();
  const uid = user?.id ?? null;
  // De lijst met geldige waarden is per render een nieuwe array; via een ref,
  // zodat het lezen hieronder niet bij elke render opnieuw loopt.
  const toegestaanRef = useRef(toegestaan);
  useEffect(() => {
    toegestaanRef.current = toegestaan;
  });

  const [waarde, setWaarde] = useState<T>(() => {
    if (!uid || Platform.OS !== 'web') return standaard;
    try {
      return leesBewaard<T>(window.localStorage.getItem(filterSleutel(uid, naam)), toegestaan) ?? standaard;
    } catch {
      return standaard;
    }
  });

  // Het toestel (en een gebruiker die later bekend wordt): asynchroon lezen.
  // Een keuze die al gemaakt is voor het antwoord binnen is, wint.
  const gekozen = useRef(false);
  useEffect(() => {
    if (!uid) return;
    let actief = true;
    AsyncStorage.getItem(filterSleutel(uid, naam))
      .then((ruw) => {
        const bewaard = leesBewaard<T>(ruw, toegestaanRef.current);
        if (actief && !gekozen.current && bewaard !== null) setWaarde(bewaard);
      })
      .catch(() => {});
    return () => {
      actief = false;
    };
  }, [uid, naam]);

  const zet = useCallback(
    (nieuw: T | ((oud: T) => T)) => {
      gekozen.current = true;
      setWaarde((oud) => {
        const volgende = typeof nieuw === 'function' ? (nieuw as (o: T) => T)(oud) : nieuw;
        if (uid) AsyncStorage.setItem(filterSleutel(uid, naam), JSON.stringify(volgende)).catch(() => {});
        return volgende;
      });
    },
    [uid, naam],
  );

  return [waarde, zet];
}
