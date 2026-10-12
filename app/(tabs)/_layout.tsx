import { useEffect } from 'react';
import { Redirect, Tabs } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Dialog } from '@/lib/dialog';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from "expo-router/js-tabs";
import { CalendarDays, ClipboardList, Clock, Home, Menu, Users } from 'lucide-react-native';
import { Button, LoadingScreen } from '@/components';
import { useAuth, useTheme } from '@/providers';
import { useToetsenbordOpen } from '@/lib/zichtbareViewport';
import { colors, ds, spacing, typography } from '@/theme';

/**
 * De tabbalk uit het goedgekeurde ontwerp: een donkere forest-ink pil die
 * boven de veilige zone zweeft, met één groene capsule om het actieve tabblad.
 *
 * De balk is bewust donker in BEIDE thema's. Hij is het enige vaste element op
 * elk scherm, en door hem in het merkgroen-donker te zetten heeft de app een
 * herkenbare voet in plaats van een witte balk die in lightmode wegvalt tegen
 * de kaarten erboven.
 */
const CAPSULE_BG = ds.green;
const CAPSULE_FG = ds.greenInk;
/** Inactieve iconen: wit op 72%, zoals in het ontwerp. */
const TAB_INACTIVE = 'rgba(255,255,255,0.72)';

const PROFILE_ERROR_MESSAGES: Record<string, { title: string; body: string }> = {
  profile_not_found: {
    title: 'Profiel niet gevonden',
    body: 'Je account is wel ingelogd, maar er staat nog geen profiel klaar. Neem contact op met je beheerder.',
  },
  company_not_found: {
    title: 'Bedrijf niet gevonden',
    body: 'Je profiel is niet aan een actief bedrijf gekoppeld. Neem contact op met je beheerder.',
  },
  rls_or_permission_error: {
    title: 'Toegang geweigerd',
    body: 'Je hebt geen toestemming om je profiel op te halen. Neem contact op met je beheerder.',
  },
  schema_error: {
    title: 'App is verouderd',
    body: 'De app werkt niet meer met de huidige database-versie. Werk de app bij of neem contact op met je beheerder.',
  },
  network_error: {
    title: 'Geen verbinding',
    body: 'Controleer je internetverbinding en probeer opnieuw.',
  },
  unknown_error: {
    title: 'Er ging iets mis',
    body: 'We konden je profiel niet laden. Probeer opnieuw, of meld dit bij je beheerder.',
  },
};

// ---------------------------------------------------------------------------
// Floating tab bar — rounded pill that hovers above the safe area. The active
// tab shows a green capsule behind its icon + label; inactive tabs are muted,
// icon-only (keeps 6 tabs readable on small iPhones).
// ---------------------------------------------------------------------------

function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { colors: t } = useTheme();
  // Met een open toetsenbord (web) zou de balk erboven gaan zweven en ruimte
  // van het zoekveld afsnoepen. Native: altijd false, de balk blijft zoals hij was.
  const toetsenbordOpen = useToetsenbordOpen();
  if (toetsenbordOpen) return null;

  return (
    <View style={[ftStyles.wrap, { bottom: insets.bottom + 12 }]} pointerEvents="box-none">
      <View style={[ftStyles.bar, { backgroundColor: t.barBg, borderColor: t.barBorder }]}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key]!;
          const label =
            typeof options.title === 'string' ? options.title : route.name;
          const focused = state.index === index;
          const iconColor = focused ? CAPSULE_FG : TAB_INACTIVE;
          const icon = options.tabBarIcon?.({ focused, color: iconColor, size: 22 }) ?? null;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };
          const onLongPress = () => {
            navigation.emit({ type: 'tabLongPress', target: route.key });
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={label}
              onPress={onPress}
              onLongPress={onLongPress}
              hitSlop={6}
              style={({ pressed }) => [ftStyles.item, pressed && { opacity: 0.6 }]}
            >
              <View style={[ftStyles.inner, focused && ftStyles.innerActive]}>
                {icon}
                {focused ? (
                  <Text style={ftStyles.labelActive} numberOfLines={1}>
                    {label}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const { status, session, profileError, refreshProfile, signOut } = useAuth();
  const { colors: t } = useTheme();

  // Dev-only diagnostic dump so a developer sees the full picture in the
  // Metro logs while the user sees only a friendly Dutch message.
  useEffect(() => {
    if (__DEV__ && status === 'profile-error' && profileError) {
      console.log('[TabsLayout] profile-error', {
        kind: profileError.kind,
        message: profileError.message,
        details: profileError.details,
      });
    }
  }, [status, profileError]);

  if (status === 'restoring') {
    return <LoadingScreen />;
  }
  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }
  if (status === 'loading-profile') {
    return <LoadingScreen label="Profiel laden..." />;
  }
  if (status === 'profile-error') {
    const copy =
      PROFILE_ERROR_MESSAGES[profileError?.kind ?? 'unknown_error'] ??
      PROFILE_ERROR_MESSAGES.unknown_error!;

    return (
      <View style={[styles.errorContainer, { backgroundColor: t.bg }]}>
        <Text style={[styles.errorTitle, { color: t.ink }]}>{copy.title}</Text>
        <Text style={[styles.errorBody, { color: t.muted }]}>{copy.body}</Text>
        <View style={styles.errorActions}>
          <Button label="Opnieuw proberen" onPress={refreshProfile} />
          <Pressable
            onPress={() =>
              Dialog.alert('Uitloggen?', undefined, [
                { text: 'Annuleren', style: 'cancel' },
                { text: 'Uitloggen', style: 'destructive', onPress: signOut },
              ])
            }
          >
            <Text style={styles.logoutLink}>Uitloggen</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      // Instant tab swap for reliability — the per-screen AnimatedScreen entrance
      // gives the smooth feel without the native tab transition occasionally
      // leaving a screen detached/blank on fast switching.
      screenOptions={{ headerShown: false, animation: 'none' }}
    >
      <Tabs.Screen
        name="today"
        options={{
          title: 'Vandaag',
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="planning"
        options={{
          // UI label is "Agenda"; route remains `planning` for compatibility.
          title: 'Agenda',
          tabBarIcon: ({ color, size }) => <CalendarDays color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="work-orders"
        options={{
          title: 'Werkbonnen',
          tabBarIcon: ({ color, size }) => <ClipboardList color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="customers"
        options={{
          title: 'Klanten',
          tabBarIcon: ({ color, size }) => <Users color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="hours"
        options={{
          title: 'Uren',
          tabBarIcon: ({ color, size }) => <Clock color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="menu"
        options={{
          title: 'Menu',
          tabBarIcon: ({ color, size }) => <Menu color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}

const ftStyles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    // `bottom` is set inline = safe-area inset + 12 so it floats above the home indicator.
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    height: 64,
    borderRadius: 32,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 7,
    // Zwevende schaduw uit het ontwerp: 0 10px 30px rgba(10,46,31,.18).
    shadowColor: '#0A2E1F',
    shadowOpacity: 0.18,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  item: {
    flexShrink: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
    height: 50,
    paddingHorizontal: 10,
    borderRadius: 25,
  },
  innerActive: {
    backgroundColor: CAPSULE_BG,
    // Zes tabbladen plus een woord als "Werkbonnen" passen krap. De capsule
    // mag daarom krimpen en het label afbreken in plaats van de balk te laten
    // uitlopen; het icoon blijft altijd heel.
    flexShrink: 1,
    paddingHorizontal: 12,
    gap: 6,
  },
  labelActive: {
    flexShrink: 1,
    color: CAPSULE_FG,
    fontSize: 12.5,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
});

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  errorTitle: {
    ...typography.heading,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  errorBody: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  errorActions: {
    width: '100%',
    gap: spacing.md,
    alignItems: 'center',
  },
  logoutLink: {
    color: colors.textMuted,
    fontSize: 15,
    textDecorationLine: 'underline',
  },
});
