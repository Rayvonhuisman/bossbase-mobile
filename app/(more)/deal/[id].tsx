import { useLocalSearchParams } from 'expo-router';
import { PermissionGate } from '@/components';
import { ProjectDetailScherm } from '@/components/project/ProjectDetailScherm';
import { tx } from '@/i18n';

/**
 * Aanvraag openen vanaf de pipeline (`/deal/<id>`). Net als `openDeal` in het
 * dashboard opent dit het projectdetail van het (oudste) project bij deze deal;
 * zonder project staat alleen de aanvraag erin. Gate = recht `verkoop`.
 */
export default function DealDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <PermissionGate permission="verkoop" label={tx('Pipeline')}>
      <ProjectDetailScherm key={id} dealId={id} />
    </PermissionGate>
  );
}
