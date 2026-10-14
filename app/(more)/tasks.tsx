import { Redirect } from 'expo-router';

/**
 * Taken is opgegaan in Activiteiten. In het dashboard zijn "taken" werkbontaken
 * (die staan op de werkbon zelf); een activiteit van het type Taak staat gewoon
 * tussen de andere activiteiten. Oude links en bladwijzers naar `/tasks`
 * komen daarom op `/activities` uit.
 */
export default function TasksScreen() {
  return <Redirect href="/activities" />;
}
