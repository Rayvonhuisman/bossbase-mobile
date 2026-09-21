import { useEffect, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ShieldAlert } from 'lucide-react-native';
import { usePermissions, useTheme } from '@/providers';
import type { Feature, Permission } from '@/lib/permissions';
import type { ThemeColors } from '@/theme';
import { LoadingScreen } from './LoadingScreen';

type Props = {
  children: ReactNode;
  /** Vereist recht uit `user_permissions` (of admin). */
  permission?: Permission | string;
  /** Vereiste feature uit het abonnement. */
  feature?: Feature;
  /** Naam van de pagina, voor de melding. */
  label?: string;
  /**
   * Waar de gebruiker heen gaat als hij geen toegang heeft. Standaard terug;
   * bij een deeplink zonder geschiedenis valt hij terug op de tabs.
   */
  fallback?: string;
};

/**
 * Poortwachter rond een scherm. Doet drie dingen, in deze volgorde:
 *
 *   1. Zolang de rechten laden wordt er NIETS van het scherm gerenderd. Dat is
 *      de kern: een beschermde pagina die eerst een fractie zichtbaar is en dan
 *      pas verdwijnt, heeft zijn inhoud al prijsgegeven.
 *   2. Zonder toegang volgt een melding en een terugsprong, ook wanneer het
 *      scherm via een deeplink is geopend in plaats van via het menu.
 *   3. Dit is uitsluitend een UI-slot. Wat de gebruiker werkelijk mag, bepaalt
 *      RLS; elke schrijfactie in de app wordt daarnaast aan het serverantwoord
 *      getoetst.
 */
export function PermissionGate({ children, permission, feature, label, fallback }: Props) {
  const router = useRouter();
  const { loaded, can, hasFeature } = usePermissions();
  const { colors: t } = useTheme();

  const allowed = loaded && (!permission || can(permission)) && (!feature || hasFeature(feature));

  useEffect(() => {
    if (!loaded || allowed) return;
    // Kort laten staan zodat de gebruiker de reden leest, dan weg.
    const timer = setTimeout(() => {
      if (fallback) router.replace(fallback as never);
      else if (router.canGoBack()) router.back();
      else router.replace('/(tabs)/today');
    }, 1400);
    return () => clearTimeout(timer);
  }, [loaded, allowed, router, fallback]);

  if (!loaded) return <LoadingScreen label="Rechten controleren..." />;

  if (!allowed) {
    const styles = makeStyles(t);
    const reden = permission && !can(permission)
      ? 'Je hebt hier geen toegang toe.'
      : `${label ?? 'Deze functie'} zit niet in je abonnement.`;
    return (
      <View style={styles.root}>
        <View style={styles.icon}>
          <ShieldAlert size={26} color={t.muted} strokeWidth={1.9} />
        </View>
        <Text style={styles.title}>{label ?? 'Geen toegang'}</Text>
        <Text style={styles.body}>{reden}</Text>
      </View>
    );
  }

  return <>{children}</>;
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    root: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
      backgroundColor: t.bg,
    },
    icon: {
      width: 64,
      height: 64,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.bgAlt,
      marginBottom: 14,
    },
    title: {
      fontSize: 17,
      fontWeight: '800',
      color: t.ink,
    },
    body: {
      marginTop: 6,
      fontSize: 13.5,
      lineHeight: 20,
      color: t.muted,
      textAlign: 'center',
    },
  });
