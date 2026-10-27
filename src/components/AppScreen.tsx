import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewStyle,
} from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from 'expo-router';
import { useTheme } from '@/providers';
import { useTrekOmTeVerversen } from '@/lib/trekOmTeVerversen';
import { AnimatedScreen } from './AnimatedScreen';
import { VERVAGING_MARGE } from './OnderStatusbalk';
import { ScreenErrorBoundary } from './ScreenErrorBoundary';

type Props = {
  children: ReactNode;
  /**
   * Paginakop (meestal een <AppTopBar/>). Zoals in het ontwerp is dit het
   * eerste onderdeel ván de scrollende inhoud: de kop schuift mee omhoog en
   * verdwijnt onder de statusbalk, en komt terug als je weer naar boven
   * scrolt. De kop draagt zelf de veilige zone bovenaan.
   */
  header?: ReactNode;
  /** If true (default), content is wrapped in a vertical ScrollView. */
  scroll?: boolean;
  /**
   * Pull-to-refresh. Geef `onRefresh` mee en het scherm krijgt een
   * `RefreshControl` in de themakleur; `refreshing` hoort UITSLUITEND waar te
   * zijn als de gebruiker er zelf aan trekt (zie `useLaden`). Een automatische
   * verversing bij focus mag deze vlag niet zetten — dan duwt iOS de inhoud
   * omlaag en lijkt het scherm scheef te hangen.
   */
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Bottom padding to clear the floating tab bar. Default 132. */
  bottomInset?: number;
  /**
   * Set on screens that render an AppFab, so scroll content clears BOTH the
   * floating tab bar and the FAB (safe-area aware). The FAB sits at
   * ~insets.bottom+88 with height 54, so content must clear ~insets.bottom+150.
   */
  floatingAction?: boolean;
  /** Override the page background. Defaults to the active theme background. */
  background?: string;
  contentContainerStyle?: ViewStyle;
  /** Subtle entrance animation (fade + slide-up). Default true. */
  animate?: boolean;
};

/**
 * Canonical screen wrapper used by every redesigned page.
 *
 * - Sets the page background to the active theme bg (light/dark). Theming this
 *   one component flips the canvas (and overscroll) on every AppScreen page.
 * - Pads the top by the safe-area inset + 4px so headers sit just below status bar.
 * - The `header` scrolls WITH the content (one scroll container, as in the
 *   design); a soft status-bar scrim keeps the clock readable above it.
 * - Gives content a subtle entrance animation (see AnimatedScreen), so every
 *   AppScreen-based page feels native without per-screen wiring.
 * - Hides scrollbars.
 */
export function AppScreen({
  children,
  header,
  scroll = true,
  onRefresh,
  refreshing = false,
  bottomInset = 132,
  floatingAction = false,
  background,
  contentContainerStyle,
  animate = true,
}: Props) {
  const insets = useSafeAreaInsets();
  const { colors: t, colorMode } = useTheme();
  const bg = background ?? t.bg;
  const barStyle = colorMode === 'dark' ? 'light' : 'dark';
  // When a FAB is present, clear both the floating tab bar and the FAB.
  const scrollPaddingBottom = floatingAction ? insets.bottom + 150 : bottomInset;
  // The header owns the safe-area inset (it pads itself below the status bar).
  // Without one, the content clears the status bar itself.
  const contentPaddingTop = header ? 0 : 4;

  // Een tabwissel mag geen scherm achterlaten dat nog omlaag hangt van een
  // pull-to-refresh of een overscroll. Komt het scherm terug in beeld terwijl
  // de inhoud boven de nul staat en er niet ververst wordt, zet hem dan terug.
  const scrollRef = useRef<ScrollView>(null);
  const offsetY = useRef(0);
  const refreshingRef = useRef(refreshing);
  useEffect(() => {
    refreshingRef.current = refreshing;
  }, [refreshing]);
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    offsetY.current = e.nativeEvent.contentOffset.y;
  }, []);
  useFocusEffect(
    useCallback(() => {
      if (offsetY.current < 0 && !refreshingRef.current) {
        scrollRef.current?.scrollTo({ y: 0, animated: false });
      }
    }, []),
  );

  // Web: `RefreshControl` bestaat daar niet; trekken bovenaan ververst toch.
  // Native: geeft niets terug, daar doet `RefreshControl` het.
  const bovenaan = useCallback(() => offsetY.current <= 0, []);
  const trek = useTrekOmTeVerversen(onRefresh, bovenaan);
  const toonTrek = trek.eigenIndicator && (trek.voortgang > 0 || refreshing);

  if (!scroll) {
    return (
      <View style={[styles.root, { backgroundColor: bg }]}>
        <StatusBar style={barStyle} />
        {header}
        <AnimatedScreen
          disabled={!animate}
          // Zonder ScrollView is er niets om mee te scrollen: de kop staat
          // gewoon bovenaan, met de gebruikelijke ruimte eronder.
          style={[{ paddingTop: header ? 12 : insets.top + 4, flex: 1 }, contentContainerStyle]}
        >
          <ScreenErrorBoundary>{children}</ScreenErrorBoundary>
        </AnimatedScreen>
      </View>
    );
  }
  // De iPhone legt onder het Dynamic Island een eigen vervaging over webinhoud
  // die eronder door scrolt (iOS, niet van ons; daar kan niets bovenop). Daarom
  // begint het scrollende deel pas ónder de veilige zone, met een vaste strook
  // in de paginakleur erboven die iets hoger is dan die zone. De vervaging valt
  // dan alleen over die lege strook. De kop hoeft de veilige zone dan zelf niet
  // meer te dragen: binnen de scroll geven we hem top 0 door.
  const strook = insets.top > 0 ? insets.top + VERVAGING_MARGE : 0;
  const binnenInsets = { ...insets, top: 0 };
  return (
    <View style={[styles.root, { backgroundColor: bg, paddingTop: strook }]}>
      <StatusBar style={barStyle} />
      <SafeAreaInsetsContext.Provider value={binnenInsets}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[
          { paddingTop: contentPaddingTop, paddingBottom: scrollPaddingBottom },
          contentContainerStyle,
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        // Wij bepalen de insets zelf: de kop draagt de veilige zone bovenaan en
        // de onderruimte staat hierboven. Laat iOS er niets bij optellen, anders
        // begint de inhoud een stuk lager dan bedoeld.
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        // iOS: velden in de pagina zelf (instellingen, filters) schuiven boven
        // het toetsenbord; iOS rekent in venstercoördinaten, dus dit klopt ook
        // in de gecentreerde iPad-kolom.
        automaticallyAdjustKeyboardInsets
        onScroll={onScroll}
        scrollEventThrottle={32}
        {...trek.handlers}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={t.green}
              colors={[t.green]}
              // De ScrollView begint bovenaan het scherm; zet de spinner onder
              // de statusbalk in plaats van erachter.
              progressViewOffset={0}
            />
          ) : undefined
        }
      >
        {header}
        <AnimatedScreen disabled={!animate}>
          <ScreenErrorBoundary>{children}</ScreenErrorBoundary>
        </AnimatedScreen>
      </ScrollView>
      </SafeAreaInsetsContext.Provider>
      {toonTrek ? (
        <View
          pointerEvents="none"
          style={[
            styles.trek,
            {
              top: (insets.top > 0 ? insets.top + VERVAGING_MARGE : 0) + 8,
              opacity: refreshing ? 1 : trek.voortgang,
              transform: [{ translateY: refreshing ? 24 : trek.voortgang * 24 }],
              backgroundColor: t.card,
              borderColor: t.line,
            },
          ]}
        >
          <ActivityIndicator size="small" color={t.green} animating={refreshing || trek.voortgang >= 1} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  // react-native-web geeft elke ScrollView `transform: translateZ(0)` om een
  // eigen compositielaag af te dwingen. Moderne browsers scrollen zonder die
  // truc soepel, en in een geïnstalleerde iPad-app hield die laag de tegels
  // van de eerste weergave vast: de vaste kop bovenaan bleef onscherp tot je
  // weg- en terugnavigeerde. Zonder geforceerde laag tekent de kop gewoon mee.
  scroll: Platform.OS === 'web' ? ({ flex: 1, transform: 'none' } as unknown as ViewStyle) : { flex: 1 },
  trek: {
    position: 'absolute',
    alignSelf: 'center',
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
