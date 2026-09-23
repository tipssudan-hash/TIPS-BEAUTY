# Mobile apps (Android + iOS)

The Storefront ships to the app stores as the **same Vite build** the web store serves, wrapped in
Capacitor. One codebase, three targets: web, Android, iOS. There is no separate mobile app to keep in
step — that was the failure mode of the old, unmaintained Expo wrapper this replaces.

- **App ID / package name / bundle ID:** `com.tipssd.beauty` — permanent. Nothing is published yet,
  so nothing constrains it; once it is published it can never be changed or reused.
- **Display name:** "TIPS Beauty", "تيبس بيوتي" in Arabic locales.
- **Customer surfaces only.** `/driver` stays on the web for launch: live location needs background
  tracking, an "always" permission, and a justification to App Review that would put the customer
  app's first review at risk. A dedicated driver app is a later phase.

## Everyday workflow

```bash
npm run cap:sync      # build the web app and copy it into android/ and ios/
npm run android:run   # build, sync, run on a connected Android device or emulator
npm run ios:run       # same for iOS (macOS only)
npm run android:open  # open the project in Android Studio
npm run ios:open      # open the workspace in Xcode
```

`android/` and `ios/` are committed. The copied web assets inside them are not — Capacitor's own
`.gitignore` excludes them, so `cap sync` is required after every pull.

Capacitor 8 uses **Swift Package Manager**, not CocoaPods, so the iOS project scaffolds and syncs on
Windows. Compiling and signing it still needs macOS or a cloud build service.

## What the shell adds on top of the web app

| Concern | Where | Why |
| --- | --- | --- |
| Session storage | `src/lib/storage/sessionStorage.ts` | iOS evicts WKWebView localStorage under disk pressure, logging customers out at random. Preferences writes to UserDefaults instead. |
| Sign-in | `src/lib/auth/nativeSocial.ts` | Google refuses OAuth inside embedded WebViews (`disallowed_useragent`), so native uses the platform SDK and `signInWithIdToken` instead of a redirect. |
| Deep links | `src/lib/native/deepLinks.ts`, `NativeBridge.tsx` | An order link in a WhatsApp message opens the app when installed, the website when not. |
| Offline | `OfflineBanner.tsx`, `public/sw.js` | Sudan has nationwide internet shutdowns every year since 2023. Without this the app looks broken on those days. |
| Android back button | `NativeBridge.tsx` | Back must walk history, not kill the app mid-checkout. |

## One-time setup, in the order it unblocks things

### 1. Google Cloud project → three OAuth clients

One project, three clients — this is the part that is easy to get subtly wrong:

| Client type | Needs | Used by |
| --- | --- | --- |
| Web application | Authorised redirect URI: the Supabase callback URL | Web sign-in, **and** Android verification |
| Android | Package `com.tipssd.beauty` + release keystore **SHA-1** | The Android app |
| iOS | Bundle ID `com.tipssd.beauty` | The iOS app |

Then, in Supabase → Authentication → Providers → Google, enable it and list **all three client IDs**
as authorised audiences. Put the web and iOS client IDs into `VITE_GOOGLE_WEB_CLIENT_ID` and
`VITE_GOOGLE_IOS_CLIENT_ID`. Android needs no env value — it verifies through the web client ID.

The Android client cannot be created until a release keystore exists, so do web and iOS first.

### 2. Release keystore (Android)

```bash
keytool -genkey -v -keystore tips-beauty-release.keystore \
  -alias tipsbeauty -keyalg RSA -keysize 2048 -validity 10000
keytool -list -v -keystore tips-beauty-release.keystore   # read SHA-1 and SHA-256
```

**Back this file up somewhere you will still have in five years.** Lose it and you cannot ship an
update to your own app — Play requires the same signing key forever. (If you enrol in Play App
Signing, use the fingerprints Google shows in the console instead of the local ones.)

SHA-1 goes into the Google Android OAuth client. SHA-256 goes into `ANDROID_CERT_SHA256`.

### 3. Apple Developer account

- Enrol (paid). Create the App ID for `com.tipssd.beauty`.
- Enable the **Sign in with Apple** and **Associated Domains** capabilities on it.
- In Supabase → Authentication → Providers → Apple, add `com.tipssd.beauty` as an authorised client ID.
- Team ID (Membership page) goes into `APPLE_TEAM_ID`.
- Register the Resend sending domain under **Sign in with Apple → Email Sources**, or order emails to
  `@privaterelay.appleid.com` customers bounce.

### 4. Deep-link verification files

`npm run build` writes them into `dist/.well-known/` from env, and warns instead of failing when the
values are missing:

- `apple-app-site-association` — from `APPLE_TEAM_ID`. Must be served as `application/json`,
  with **no** file extension, over HTTPS, no redirects.
- `assetlinks.json` — from `ANDROID_CERT_SHA256`.

They are generated rather than committed on purpose: a placeholder value makes both platforms fail
link verification *silently*, and you would spend a day debugging "links open the browser."

Verify after deploying:
- Android: `https://developers.google.com/digital-asset-links/tools/generator`
- iOS: install the app and long-press a `https://beauty.tips-sd.com/orders/...` link

### 5. Supabase redirect allow-list

Add `https://beauty.tips-sd.com/auth/callback` (web OAuth) under Authentication → URL Configuration.
Native sign-in needs no redirect URL at all.

## Store submission blockers

Both are separate workstreams, both are hard blockers, neither is optional:

- **In-app account deletion** (Apple Guideline 5.1.1(v)) — soft-delete that anonymises the profile and
  keeps order records. Does not exist yet.
- **Privacy policy** at a public URL. Does not exist yet.

Apple also rejects apps that are "just a website" (Guideline 4.2). What earns this one its place is
native sign-in, push notifications, camera capture for payment proof, and offline handling — mention
them in the review notes.

## Known gaps

- **Push is not wired.** The backend still speaks Expo: `customer_push_tokens.expo_push_token` has a
  check constraint requiring `ExponentPushToken[...]`, and `order-status-push` posts to `exp.host`.
  Capacitor produces FCM/APNs tokens, which that RPC rejects. That is the push workstream.
- **No app icons or splash assets generated yet.** `public/icons/` has the 192/512 PWA icons to
  derive them from (`@capacitor/assets`).
- **Not yet run on a real device.** Nothing here is proven until it runs on real Sudanese handsets —
  one Android, one iPhone, per the test plan.
