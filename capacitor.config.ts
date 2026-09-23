import type { CapacitorConfig } from '@capacitor/cli';

// The Android and iOS apps are this exact Vite build inside a Capacitor shell — one codebase, three
// targets. Nothing here may diverge from what the web store ships.
//
// appId is permanent: it is the Play package name and the iOS bundle ID, and neither can ever be
// changed or reused once an app is published. Nothing is published yet (confirmed 2026-09-23).
const config: CapacitorConfig = {
    appId: 'com.tipssd.beauty',
    appName: 'TIPS Beauty',
    webDir: 'dist',

    server: {
        // Serving the bundled app from our own https origin rather than capacitor://localhost keeps
        // one storage origin across web and native, and lets Universal Links / App Links for
        // beauty.tips-sd.com resolve against the same host the links point at.
        androidScheme: 'https',
        iosScheme: 'https',
        hostname: 'beauty.tips-sd.com',
    },

    ios: {
        // Sudanese customers run older, smaller devices; let the WebView own the safe areas so the
        // RTL layout's viewport-fit=cover handling stays identical to the web.
        contentInset: 'never',
        // Deliberately NOT limitsNavigationsToAppBoundDomains: that requires a matching
        // WKAppBoundDomains list in Info.plist and, once on, restricts what the WebView may load —
        // which would break Google Fonts, the hCaptcha challenge and the Google sign-in sheet on iOS
        // only, in ways that do not reproduce on Android or the web.
    },

    android: {
        // Release builds only ever load the bundled assets; no cleartext traffic is needed.
        allowMixedContent: false,
    },

    plugins: {
        SplashScreen: {
            launchShowDuration: 1200,
            launchAutoHide: false, // hidden by the app once React has mounted, so there is no white flash
            backgroundColor: '#f8fafc', // matches manifest.webmanifest background_color
            androidScaleType: 'CENTER_CROP',
            showSpinner: false,
        },
        Keyboard: {
            // Arabic forms sit low on the page; resizing the body keeps the focused field visible.
            resize: 'body',
            resizeOnFullScreen: true,
        },
        SocialLogin: {
            // Client IDs are injected at build time from env (see src/lib/auth/nativeSocial.ts).
            // Nothing is hardcoded here: the same config serves debug and release builds.
        },
    },
};

export default config;
