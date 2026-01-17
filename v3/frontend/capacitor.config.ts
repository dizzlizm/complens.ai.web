import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ai.complens.app',
  appName: 'Complens',
  webDir: 'dist',
  server: {
    // For development, connect to local server
    // url: 'http://192.168.x.x:3000',
    // cleartext: true,
    androidScheme: 'https'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#2563eb',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#2563eb',
    },
    GoogleAuth: {
      scopes: [
        'profile',
        'email',
        'https://www.googleapis.com/auth/drive.appdata',
        'https://www.googleapis.com/auth/drive.metadata.readonly'
      ],
      // Android client ID from Google Cloud Console (its-complens project)
      serverClientId: '459546029929-ds73q0s6q7ebnjkjr0r7msam60nlksb7.apps.googleusercontent.com',
      // Set to true to get refresh token
      forceCodeForRefreshToken: true,
    },
    CapacitorSQLite: {
      iosDatabaseLocation: 'Library/CapacitorDatabase',
      iosIsEncryption: false,
      iosKeychainPrefix: 'complens',
      iosBiometric: {
        biometricAuth: false,
        biometricTitle: 'Biometric login for Complens'
      },
      androidIsEncryption: false,
      androidBiometric: {
        biometricAuth: false,
        biometricTitle: 'Biometric login for Complens',
        biometricSubTitle: 'Log in using your biometric'
      },
    },
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: true, // Enable for development
  },
};

export default config;
