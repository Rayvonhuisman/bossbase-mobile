import { Platform, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { bepaalSchermklasse } from '@/lib/schermklasseRegels';

/**
 * Statusbalk tijdens een formuliervel (`Modal` met pageSheet/formSheet).
 *
 * Op een iPhone schuift iOS de app dan naar achteren en wordt de strook achter
 * de statusbalk zwart. In het lichte thema zou de klok daar donker op zwart
 * staan; daarom licht zolang het vel open is. Plaats dit ín de Modal: bij
 * sluiten valt de statusbalk vanzelf terug op die van het thema.
 *
 * iPad (gecentreerd vel, de app blijft erachter zichtbaar), Android en web:
 * niets — daar volgt de statusbalk gewoon het thema.
 */
export function VelStatusbalk() {
  const { width } = useWindowDimensions();
  if (Platform.OS !== 'ios' || bepaalSchermklasse(width) === 'tablet') return null;
  return <StatusBar style="light" />;
}
