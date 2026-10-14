import { Redirect } from 'expo-router';

/**
 * "Vrije notities" bestaan niet in het dashboard: notities horen bij een
 * relatie en staan op de klantkaart. Oude links naar `/notes` gaan daarom naar
 * Relaties.
 */
export default function NotesRedirect() {
  return <Redirect href="/customers" />;
}
