import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.tidelark.game',
  appName: 'Tidelark',
  webDir: 'dist',
  server: {
    // Serve the bundled game from https://localhost. Cleartext (http) traffic
    // stays disabled: the game loads nothing from the network.
    androidScheme: 'https',
  },
  android: {
    // Release signing lives in android/keystore.properties (see RELEASE.md).
    allowMixedContent: false,
    // Left unset on purpose: Capacitor enables WebView debugging for debug
    // builds only, and never for release builds.
  },
  ios: {
    contentInset: 'never',
  },
  plugins: {
    SplashScreen: {
      // Hidden from src/main.ts as soon as the game's loading screen (which
      // looks the same) is painted. The long auto-hide is only a safety net
      // in case the web bundle never starts.
      launchAutoHide: true,
      launchShowDuration: 10000,
      launchFadeOutDuration: 250,
      backgroundColor: '#062c36',
      showSpinner: false,
    },
  },
}

export default config
