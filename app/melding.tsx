import { useEffect } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { LoadingScreen } from '@/components';
import { useAuth } from '@/providers';
import { routeVoorLink } from '@/lib/meldingLink';
import { markeerGelezen } from '@/services/meldingService';

/**
 * /melding?id=<melding>&link=<link> — hier komt een tik op een pushmelding
 * binnen (public/sw.js). Markeert de melding als gelezen en opent dezelfde
 * pagina als in de bel (`routeVoorLink`); zonder bekende link het beginscherm.
 */
export default function MeldingOpenen() {
  const router = useRouter();
  const { status, session } = useAuth();
  const { id, link } = useLocalSearchParams<{ id?: string; link?: string }>();

  useEffect(() => {
    if (!session) return;
    if (typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)) void markeerGelezen(id).catch(() => {});
    router.replace((routeVoorLink(typeof link === 'string' ? link : null) ?? '/') as never);
  }, [session, id, link, router]);

  if (status !== 'restoring' && !session) return <Redirect href="/(auth)/login" />;
  return <LoadingScreen />;
}
