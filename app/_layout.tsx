import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  AuthProvider,
  FontProvider,
  OnboardingProvider,
  PermissionsProvider,
  ThemeProvider,
  ToastProvider,
  useTheme,
} from '@/providers';

function ThemedStatusBar() {
  const { colorMode } = useTheme();
  return <StatusBar style={colorMode === 'dark' ? 'light' : 'dark'} />;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          {/* Sora wordt hier geladen, binnen ThemeProvider zodat het
              wachtscherm de themakleuren gebruikt en niet wit is. */}
          <FontProvider>
            <AuthProvider>
            <PermissionsProvider>
              <OnboardingProvider>
                <ToastProvider>
                <ThemedStatusBar />
                <Stack screenOptions={{ headerShown: false }}>
                  <Stack.Screen name="index" />
                  {/* Top-level group switches (login ↔ app, onboarding) cross-fade,
                      so logout/login never shows a sideways slide. */}
                  <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
                  <Stack.Screen name="(onboarding)" options={{ animation: 'fade' }} />
                  <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
                  {/* Detail / hub pages pushed over the tabs slide in from the right
                      (native iOS feel) and back out naturally. */}
                  <Stack.Screen name="work-orders" options={{ animation: 'slide_from_right' }} />
                  <Stack.Screen name="customers" options={{ animation: 'slide_from_right' }} />
                  <Stack.Screen name="hours" options={{ animation: 'slide_from_right' }} />
                  <Stack.Screen name="profile" options={{ animation: 'slide_from_right' }} />
                  <Stack.Screen name="(more)" options={{ animation: 'slide_from_right' }} />
                  <Stack.Screen name="+not-found" />
                </Stack>
                </ToastProvider>
              </OnboardingProvider>
            </PermissionsProvider>
            </AuthProvider>
          </FontProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
