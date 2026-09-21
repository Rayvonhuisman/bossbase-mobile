import { Alert } from 'react-native';

/**
 * Standardised "Not yet available" alert.
 *
 * Usage:
 *   onPress={() => notAvailableAlert('Nieuwe werkbon')}
 *
 * One canonical Dutch wording across the app so users never see
 * "Wordt nog gebouwd" on one screen and "Binnenkort beschikbaar" on another.
 */
export function notAvailableAlert(
  feature: string,
  detail = 'Deze functie is nog niet beschikbaar in de mobiele app.',
): void {
  Alert.alert(feature, detail);
}
