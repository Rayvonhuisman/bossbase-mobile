# BossBase Mobile

React Native + Expo companion app voor BossBase. Hergebruikt de bestaande Supabase backend van de web-app.

## Stack

- Expo SDK 52
- TypeScript
- Expo Router (file-based routing)
- Supabase (`@supabase/supabase-js` + AsyncStorage adapter)
- `lucide-react-native` voor icons

## Setup

```bash
# 1. Installeer dependencies
npm install

# 2. Configureer environment variables
cp .env.example .env
# Vul EXPO_PUBLIC_SUPABASE_URL en EXPO_PUBLIC_SUPABASE_ANON_KEY in

# 3. Start de dev server
npm start
```

Open de app in:
- iOS Simulator: `npm run ios`
- Android Emulator: `npm run android`
- Fysiek toestel: scan de QR-code met de Expo Go-app

## Folder structuur

```
bossbase-mobile/
├─ app/                       Expo Router routes
│  ├─ _layout.tsx             Root: providers + stack
│  ├─ index.tsx               Auth-gated redirect
│  ├─ +not-found.tsx
│  ├─ (auth)/
│  │  ├─ _layout.tsx          Redirect naar tabs als al ingelogd
│  │  └─ login.tsx
│  └─ (tabs)/
│     ├─ _layout.tsx          Bottom tab navigator
│     ├─ today.tsx
│     ├─ planning.tsx
│     ├─ jobs.tsx
│     ├─ customers.tsx
│     ├─ hours.tsx
│     └─ profile.tsx
├─ src/
│  ├─ components/             UI-primitieven (Button, ScreenContainer)
│  ├─ lib/                    supabase client + env loader
│  ├─ providers/              AuthProvider + useAuth hook
│  └─ theme/                  Colors, spacing, typography
├─ app.config.ts              Dynamische Expo config
├─ eas.json                   EAS Build profiles
└─ package.json
```

## App identity

- Naam: **BossBase**
- iOS bundle ID: `nl.bossbase.app`
- Android package: `nl.bossbase.app`
- Deep link scheme: `bossbase://`
- Universal link host: `app.bossbase.nl`

## Auth flow

1. App start → `app/_layout.tsx` mount `AuthProvider`.
2. `AuthProvider` haalt sessie op via `supabase.auth.getSession()` en subscribet op `onAuthStateChange`.
3. `app/index.tsx` redirect naar `/(tabs)/today` (ingelogd) of `/(auth)/login` (niet).
4. `(auth)/_layout.tsx` redirect terug naar tabs zodra er een sessie is.
5. `(tabs)/_layout.tsx` redirect naar login als de sessie verdwijnt.

Sessies worden gepersisteerd via `AsyncStorage` (Supabase default). Auto-refresh staat aan.

## Volgende stappen

Zie `../BossBase website/MOBILE_IMPLEMENTATION_PLAN.md` voor de complete sprint-roadmap (push notifications, photo upload, offline queue, EAS Build, store submission).

Onmiddellijke vervolgstappen:
1. App-icon en splash-image toevoegen in `assets/`
2. `expo-secure-store` migratie voor token storage (huidig: AsyncStorage)
3. Profiel + company laden via een service-laag
4. `register-push-token` Edge Function aanroepen na login
5. Werkbon-, klant- en uren-services schrijven tegen het bestaande Supabase schema
