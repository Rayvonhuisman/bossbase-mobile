import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'BossBase',
  slug: 'bossbase',
  owner: 'bossbase',
  scheme: 'bossbase',
  version: '0.1.0',

  updates: {
    url: 'https://u.expo.dev/4e4f5d3e-9633-441a-a520-a32df9cc05e2',
  },

  runtimeVersion: {
    policy: 'appVersion',
  },

  extra: {
    eas: {
      projectId: '4e4f5d3e-9633-441a-a520-a32df9cc05e2',
    },
  },

  /**
   * Oriëntatie: telefoons blijven staand (zo is de telefoonindeling ontworpen).
   * De iPad mag alle kanten op — liggend, staand en in Split View/Stage
   * Manager, wat op iPad alle vier de oriëntaties vraagt. Dat regelt
   * `ios.infoPlist` hieronder (UISupportedInterfaceOrientations~ipad).
   */
  orientation: 'portrait',
  /**
   * 'automatic': zonder eigen keuze volgt de app het systeem (licht/donker).
   * De keuze in de app (zon/maan-knop) wint altijd; zie ThemeProvider.
   */
  userInterfaceStyle: 'automatic',

  /**
   * Het appicoon komt uit `assets/bossbase-logo-source.jpeg`, het goedgekeurde
   * merkbestand. De bron heeft afgeronde hoeken met wit eromheen; in
   * `assets/icon.png` is dat weggehaald: zwart (#0D0D0D) tot aan elke rand,
   * geen alpha, geen afgeronde hoeken. iOS rondt zelf af — zou het bestand dat
   * ook doen, dan krijg je witte driehoekjes in de hoeken op het homescreen.
   */
  icon: './assets/icon.png',

  ios: {
    bundleIdentifier: 'nl.bossbase.app',
    // Een echte iPad-app (geen vergrote iPhone-weergave): de layout schakelt
    // vanaf 700 punten naar de tabletindeling, net als de webapp.
    supportsTablet: true,
    associatedDomains: ['applinks:app.bossbase.nl'],
    config: {
      // Exportcompliance. BossBase gebruikt uitsluitend standaard- en daarmee
      // vrijgestelde beveiliging: HTTPS/TLS naar Supabase en de ingebouwde
      // voorzieningen van iOS (Keychain via expo-secure-store). Er zit geen
      // eigen cryptografie, VPN, eigen algoritme of zelfgebouwde
      // end-to-end-encryptie in.
      //
      // Zonder deze verklaring vraagt App Store Connect er bij elke build
      // opnieuw naar, en blijft de build zolang bij de testers vandaan.
      usesNonExemptEncryption: false,
    },
    infoPlist: {
      // De route-knop vraagt of Google Maps erop staat (canOpenURL) om dan de
      // keuze Apple Kaarten / Google Maps te geven. Zonder deze regel antwoordt
      // iOS altijd "nee".
      LSApplicationQueriesSchemes: ['comgooglemaps'],
      UISupportedInterfaceOrientations: ['UIInterfaceOrientationPortrait'],
      'UISupportedInterfaceOrientations~ipad': [
        'UIInterfaceOrientationPortrait',
        'UIInterfaceOrientationPortraitUpsideDown',
        'UIInterfaceOrientationLandscapeLeft',
        'UIInterfaceOrientationLandscapeRight',
      ],
    },
  },

  android: {
    package: 'nl.bossbase.app',
    adaptiveIcon: {
      // Android snijdt zelf uit (cirkel, squircle of afgerond vierkant), dus
      // staat hier alleen het beeldmerk op transparant, ruim binnen de veilige
      // zone. De achtergrond is dezelfde zwarttint als het iOS-icoon.
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#0D0D0D',
    },
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [
          {
            scheme: 'https',
            host: 'app.bossbase.nl',
          },
        ],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },

  /**
   * Webversie (PWA-traject): dezelfde Expo Router-app, gebundeld door Metro
   * als single-page app. Eén `index.html`, routering in de browser — er is
   * niets om vooraf te renderen achter een login, en zo raakt geen enkel
   * scherm `localStorage` of de sessie aan tijdens een build.
   */
  web: {
    bundler: 'metro',
    output: 'single',
    favicon: './assets/icon.png',
  },

  plugins: [
    'expo-router',
    'expo-asset',
    'expo-secure-store',
    'expo-font',
    '@react-native-community/datetimepicker',
    [
      'expo-image-picker',
      {
        photosPermission:
          'BossBase gebruikt je fotobibliotheek om foto\'s aan een werkbon toe te voegen.',
        cameraPermission:
          'BossBase gebruikt je camera om foto\'s bij een werkbon vast te leggen.',
      },
    ],
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 190,
        resizeMode: 'contain',
        backgroundColor: '#0D0D0D',
      },
    ],
  ],

  experiments: {
    typedRoutes: true,
  },
};

export default config;