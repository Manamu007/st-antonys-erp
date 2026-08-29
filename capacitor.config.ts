import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.schoolerp.app',
  appName: 'School ERP',
  webDir: 'dist',
  server: {
    // This points the mobile webview directly to your live hosted website URL.
    // When you update the website, the mobile app updates instantly automatically!
    url: 'https://ais-pre-pvxglqkpw2savi34fl2oj2-284180028463.asia-southeast1.run.app',
    cleartext: true
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#4f46e5',
      showSpinner: true,
      androidSpinnerStyle: 'large',
      iosSpinnerStyle: 'small',
      spinnerColor: '#ffffff'
    }
  }
};

export default config;
