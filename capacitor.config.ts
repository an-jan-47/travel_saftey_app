import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.travelsafe.app',
  appName: 'TravelSafe',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    Geolocation: {
      permissions: {
        location: "always"
      }
    },
    Device: {},
    Network: {}
  }
};

export default config;
