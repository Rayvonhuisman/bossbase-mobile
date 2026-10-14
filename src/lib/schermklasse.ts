import { Platform, useWindowDimensions } from 'react-native';
import { bepaalSchermklasse, kolomBreedte, type Schermklasse } from './schermklasseRegels';

export type { Schermklasse } from './schermklasseRegels';

/**
 * Telefoon of tablet, en hoe breed de app-kolom is. Volgt het venster: draaien,
 * Split View en een ander formaat in Stage Manager worden meteen meegenomen
 * (`useWindowDimensions` luistert zelf naar resize). Op iOS en Android altijd
 * de telefoonindeling.
 */
export function useSchermklasse(): { klasse: Schermklasse; kolomBreedte: number } {
  const { width } = useWindowDimensions();
  const klasse = bepaalSchermklasse(width, Platform.OS);
  return { klasse, kolomBreedte: kolomBreedte(width, klasse) };
}
