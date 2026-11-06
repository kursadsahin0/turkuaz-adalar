import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.turkuazadalar.game',
  appName: 'Turkuaz Adalar',
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
}

export default config
