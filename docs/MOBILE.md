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


### 6. Firebase, for push notifications

One Firebase project serves both apps: Android natively, iOS through the APNs key you upload to
Firebase. There is no second APNs integration to run.

1. Create a Firebase project and add **both** apps to it: Android package `com.tipssd.beauty`,
   iOS bundle `com.tipssd.beauty`.
2. Download the config files. **Neither is committed** (both are gitignored):
   - `android/app/google-services.json` — without it the Gradle plugin is skipped and push silently
     does nothing. The build does not fail; it logs and carries on.
   - `ios/App/App/GoogleService-Info.plist` — add it to the Xcode project.
3. iOS only: create an **APNs authentication key** (.p8) in the Apple Developer portal and upload it
   under Firebase → Project settings → Cloud Messaging. Without this, iOS push fails at delivery with
   no error visible in the app.
4. Generate a service account key (Firebase → Project settings → Service accounts → Generate new
   private key) and store the **entire JSON** as a Supabase secret:

   ```bash
   npx supabase secrets set FCM_SERVICE_ACCOUNT_JSON="$(cat service-account.json)"
   ```

   The dispatcher signs a JWT with it and exchanges it for an access token (FCM HTTP v1 no longer
   accepts the old static server key). If the secret is missing, sends are logged as failed and orders
   are never blocked — the same posture as the email pipeline.
5. Enable push capability on the iOS App ID, and add the **Push Notifications** capability in Xcode.

Android 13+ shows a runtime permission prompt. The app asks lazily — after sign-in, not at first
launch — because iOS only ever prompts once and a customer with no orders has no reason to say yes.

#### Migration posture

Nothing Expo is removed yet. `customer_push_tokens` carries a `provider` column, old rows keep their
`ExponentPushToken[...]` values and validation, `register_customer_push_token()` still exists with its
original signature, and `order-status-push` dispatches per row — Expo batched, FCM one request per
device. Once FCM is verified on real Sudanese handsets, the Expo path and its column can be dropped in
a follow-up migration.

## Store submission blockers

Both are now implemented (migration 20260924000100):

- **In-app account deletion** (Apple Guideline 5.1.1(v)) — حسابي → حذف الحساب. Anonymising soft delete:
  personal data and payment-proof images go, order records keep their numbers and amounts, sessions are
  destroyed, social identities unlinked and the auth user banned. Blocked while an order is in flight,
  because a delivery in progress still needs the name and phone it is going to.
- **Privacy policy** at `https://beauty.tips-sd.com/privacy` — public, no account needed, linked from
  the settings screen. Give this URL to both stores. **It has not had legal review**; the owner is
  arranging that before launch.

The deletion page also answers Play's Data Safety form and Apple's privacy questionnaire: what is
collected, why, who it is shared with, and how it is deleted.

Apple also rejects apps that are "just a website" (Guideline 4.2). What earns this one its place is
native sign-in, push notifications, camera capture for payment proof, and offline handling — mention
them in the review notes.

## Known gaps

- **Push is code-complete but unproven.** It cannot be verified from a desktop: it needs a Firebase
  project, the config files above, and a real handset on each platform.
- **Nothing has run on a real device.** Everything here compiles and syncs; none of it is proven until
  it runs on real Sudanese handsets — one Android, one iPhone, per the test plan.
- **App icons and splashes are generated from `public/logo.PNG`** via
  `node scripts/generate-app-assets.mjs`. Re-run it whenever the logo changes. If the brand ever gets a
  dedicated app mark, replace the files in `assets/` and re-run.
