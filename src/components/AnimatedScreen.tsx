import { useEffect, useRef, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';
import { useIsFocused } from "expo-router/react-navigation";

type Props = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Skip the animation (renders a plain Animated.View at rest). */
  disabled?: boolean;
};

/**
 * Subtle, native-feeling entrance animation for screen content.
 *
 * - Pure React Native Animated API (works in Expo Go, no Reanimated worklets).
 * - Runs EVERY TIME the screen gains focus (not only first mount), so switching
 *   between (already-mounted) bottom tabs visibly flows content into place
 *   instead of an instant static swap.
 * - opacity 0.9 → 1 + translateY 8 → 0 over ~200ms, native driver. The opacity
 *   FLOOR is 0.9 (never 0), so content can never end up blank/white even if the
 *   animation is interrupted by a fast re-focus.
 * - Respects the OS "reduce motion" setting.
 *
 * Lightweight by design — one transform on the page container, never per-item.
 */
export function AnimatedScreen({ children, style, disabled }: Props) {
  const isFocused = useIsFocused();
  const progress = useRef(new Animated.Value(disabled ? 1 : 0)).current;

  useEffect(() => {
    if (disabled) {
      progress.setValue(1);
      return;
    }
    if (!isFocused) return; // animate only for the active screen

    let cancelled = false;
    // Restart the entrance from the floor each time the screen becomes focused.
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();

    // Non-blocking reduce-motion check — jump to the end if enabled.
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduceMotion) => {
        if (!cancelled && reduceMotion) {
          animation.stop();
          progress.setValue(1);
        }
      })
      .catch(() => {
        /* content is already visible (opacity floor 0.9) */
      });

    return () => {
      cancelled = true;
      animation.stop();
    };
  }, [disabled, isFocused, progress]);

  // Opacity never drops below 0.9 → content is always visible (no blank frame).
  const opacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 1],
  });
  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [8, 0],
  });

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}
