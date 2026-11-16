import { useLocalSearchParams } from 'expo-router';
import { PermissionGate } from '@/components';
import { ProjectDetailScherm } from '@/components/project/ProjectDetailScherm';
import { tx } from '@/i18n';

/**
 * Projectdetail (`/project/<id>`) — de projectkaart van het dashboard. Zelfde
 * gate als de projectenlijst (recht `projecten`); RLS bepaalt welke projecten
 * zichtbaar zijn.
 */
export default function ProjectDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <PermissionGate permission="projecten" label={tx('Projecten')}>
      <ProjectDetailScherm key={id} projectId={id} />
    </PermissionGate>
  );
}
