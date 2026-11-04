import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.turkuazadalar.game',
  appName: 'Turkuaz Adalar',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
  android: {
    buildOptions: {
      signingType: 'apksigner',
    },
  },
};

export default config;
