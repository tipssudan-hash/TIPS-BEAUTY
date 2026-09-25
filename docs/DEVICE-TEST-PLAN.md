# Real-device test plan

Everything in the auth and mobile work compiles, typechecks and passes its unit tests. **None of it is
proven.** OTP delivery on Sudanese networks, Google and Apple sign-in, FCM and APNs push, WhatsApp
templates and deep links cannot be verified from a desktop — only on a real handset held by a real
person on a real Sudanese network.

This is the script for that. Two testers:

| Tester | Device | Network |
| --- | --- | --- |
| A | Android phone | Zain, MTN or Sudani |
| B | iPhone | a different network from A |

Both must be **in Sudan**. Testing OTP from outside the country proves nothing: the routing that fails is
the Sudanese leg.

## Before you start

**These are not one gate.** The sections below are independent, and treating the list as atomic delays
testing by weeks for no reason. Two tracks run in parallel:

**Fast track — days, no paid account.** Sections 1, 6, 9, 10 and the password half of 11 need *no* new
external account at all: email+password is already on (`auth_password_enabled` defaults true), so a
throwaway account exercises them today. Add a free Google Cloud project and section 2 joins them —
Google sign-in works on a **debug-signed** build, using the debug SHA-1 from
`cd android && ./gradlew signingReport`, with testers added under OAuth consent screen → Test users.
Neither a release keystore nor `assetlinks.json` is required for it: Credential Manager does not use
Digital Asset Links. Requires Android Studio installed (bundles the JDK and SDK; free, no account).

**Slow track — weeks, paid or identity-verified.** Section 3 (Apple) needs enrolment *and* a Mac or a
cloud macOS builder — there is no CI in this repo, so nothing can produce an iOS build today. Sections
4 and 5 need Meta Business Verification and an alphanumeric SMS sender ID. Start that paperwork on day
one and run the fast track while it clears.

Preconditions for the *full* run, in the order they unblock things:

- [x] All 33 migrations applied (done 2026-09-24)
- [x] Edge functions deployed: `send-otp`, `send-order-whatsapp`, `order-status-push` (done
      2026-09-24; all three return their own 401 until their secrets exist — deployed is not configured)
- [ ] Google Cloud OAuth clients (web + Android + iOS) created and listed on Supabase's Google provider
- [ ] Apple: App ID with Sign in with Apple + Associated Domains, listed on Supabase's Apple provider
- [ ] Firebase project with both apps, APNs `.p8` key uploaded, `FCM_SERVICE_ACCOUNT_JSON` set
- [ ] WhatsApp: Business Verification done, dedicated number, both templates approved (authentication
      *and* utility)
- [ ] SMS: candidate provider configured, alphanumeric sender ID registered
- [ ] `.well-known/apple-app-site-association` and `assetlinks.json` live on `beauty.tips-sd.com`
      (`ANDROID_CERT_SHA256` takes comma-separated fingerprints, so a debug and a release build can
      both verify at once — section 8 does not have to wait for the release keystore)
- [ ] Flags on: `UPDATE app_settings SET auth_phone_enabled = true, auth_google_enabled = true, auth_apple_enabled = true, otp_whatsapp_enabled = true, otp_sms_enabled = true;`

**Use throwaway accounts.** Test 9 deletes an account permanently, and test 4 sends real money's worth of
SMS. Never run this script against your own or a real customer's account.

## How to record results

For each test write **pass / fail**, the device, the network, and the **wall-clock seconds** where the
test asks for timing. "It worked" is not a result; "code arrived in 6s on Zain via WhatsApp" is.

After every session, the owner checks Admin Portal → **حالة الإشعارات** and confirms the screen agrees
with what the testers saw. If a tester says no code arrived and the screen shows `sent`, that gap is
itself the finding — report it.

---

## 1. Install and first launch

Both testers.

1. Install the build (TestFlight / Play internal testing / direct APK).
2. Launch from a cold start.

- [ ] App icon is the TIPS Beauty logo, not a default robot or grey square
- [ ] Splash screen shows the logo on the light background, then the shop — **no white flash**
- [ ] App name reads **تيبس بيوتي**
- [ ] Layout is right-to-left, nothing clipped at the screen edges
- [ ] Status bar text is readable against the light background
- [ ] Catalogue loads

## 2. Google sign-in

Both testers. The one that matters most on Android.

1. Settings → sign out if already signed in. Open تسجيل الدخول.
2. Tap **المتابعة باستخدام Google**.

- [ ] A **native** account sheet appears — not a browser tab, not a page inside the app
- [ ] Choosing an account returns straight to the shop, signed in
- [ ] `حسابي` shows the Google account's name and email
- [ ] **No `disallowed_useragent` error.** If you see it, the app fell back to the web flow — stop and report
- [ ] Sign out, sign in again: same account, order history intact (no duplicate account)

Then, with the same email, the linking case:

3. Sign out. Sign in with **email + password** using an account created earlier with that same address.

- [ ] It is the **same account** — same orders, same points — not a second empty one

## 3. Apple sign-in

Tester B only (iPhone).

1. Tap **المتابعة باستخدام Apple**.

- [ ] Apple's native sheet appears, and the button follows Apple's styling (black, Apple logo)
- [ ] Choose **Hide My Email**. Sign-in completes
- [ ] `حسابي` shows a name — **this is the critical one.** Apple sends the name only on the first
      authorisation; if it is blank now it is gone forever
- [ ] Sign out and back in: still signed in fine, name still present
- [ ] Place a test order and confirm the confirmation email arrives at the real inbox behind the
      `@privaterelay.appleid.com` address (needs the Resend domain registered with Apple)

## 4. Phone OTP — the test that decides the provider

Both testers, **and repeat on all three networks** (Zain, MTN, Sudani) even if that means borrowing SIMs.
This is the most important section in this document.

For each network:

1. Login screen → enter the number as `0912345678` (local format, with the leading zero).
2. Tap **إرسال رمز التحقق**. **Start a stopwatch.**

- [ ] Code arrives. Record **which channel** (WhatsApp message or SMS) and **how many seconds**
- [ ] Code is 6 digits and the message is in Arabic
- [ ] Entering it signs you in and creates the account
- [ ] The number shows as `+249…` on the profile, whichever way it was typed
- [ ] A code that takes **longer than 60s is a failure**, even if it arrives — report the time, not just "worked"

Then the format and limit cases, once per tester:

3. Enter the same number as `+249912345678`, then as `249912345678`.
   - [ ] Both are accepted and reach the **same account** — not a second one
4. Enter `0812345678` (not a Sudanese mobile prefix).
   - [ ] Refused in the app, with an Arabic message, **before** any code is sent
5. Request a code, then immediately tap **إعادة إرسال الرمز**.
   - [ ] A visible countdown blocks it for 60 seconds — no silent dead button
6. Request 6 codes for one number within an hour.
   - [ ] The 6th is refused with an Arabic "try again later"
   - [ ] Owner: Admin Portal shows those as **محجوب** (amber), not as failures
7. Turn **mobile data off** (leave the SIM active) and request a code.
   - [ ] The SMS fallback still delivers it. This is the shutdown scenario — if it fails, WhatsApp-only
         means customers are locked out during an outage

## 5. Ordering as a phone-only customer

Tester A, using the phone-only account from test 4 (no email on it).

1. Add products, go to checkout.

- [ ] Checkout is **not blocked** by "أكّدي بريدك الإلكتروني" — a verified phone is enough
- [ ] Place a COD order

- [ ] A **WhatsApp order confirmation** arrives with the correct order number
- [ ] Owner: exactly **one** confirmation was queued — a phone-only customer must not get email too
- [ ] Owner: `حالة الإشعارات` shows it as sent under واتساب

Then the email case, for contrast, on an account that *has* an email:

2. Place an order on the Google account from test 2.
   - [ ] Email confirmation arrives
   - [ ] **No** WhatsApp message — sending both would bill twice for one message

## 6. Mycashi payment proof (camera and photo permissions)

Both testers. This is where iOS kills apps that lack permission strings.

1. Checkout → choose Mycashi → enter a reference number → attach a proof image.

- [ ] The picker opens and the app **does not crash or freeze**
- [ ] The Arabic permission prompt mentions إثبات الدفع
- [ ] Try the camera **and** the photo library; both work
- [ ] Order submits and the proof is visible to staff in the Admin Portal

## 7. Push notifications

Both testers, signed in.

1. Accept the notification permission prompt when it appears.

- [ ] The prompt appears **after** sign-in, not on first launch
2. Owner: mark the tester's order **shipped** in the Admin Portal.
   - [ ] Notification arrives with Arabic text, app in background — record seconds
   - [ ] Tapping it opens the app **on the order**, not just the home screen
3. Repeat with the app fully closed (swiped away).
   - [ ] Still arrives (this is the case that fails when the APNs key is missing on iOS)
4. Owner: mark it **delivered**.
   - [ ] Both the delivered and the review-request notifications arrive, and **no duplicates**
5. Sign out on the device, then have the owner mark another order shipped.
   - [ ] **Nothing arrives.** A shared phone must not leak the previous customer's orders

## 8. Deep links

Both testers.

1. Owner sends `https://beauty.tips-sd.com/orders/<id>` by WhatsApp to the tester.
2. Tap it.

- [ ] The **app** opens on that order — not the browser
- [ ] Uninstall the app, tap again: the **website** opens on that page
- [ ] Reinstall, then tap `https://beauty.tips-sd.com/product/<id>`: app opens on the product

If it opens the browser with the app installed, App Links / Universal Links verification failed — check
the `.well-known` files are served over HTTPS with no redirect, and `assetlinks.json` carries the
fingerprint of the key that actually signed the build.

## 9. Account deletion — run this LAST

Both testers, on a throwaway account. **Irreversible.**

1. Place an order and let it sit as `new`. Go to حسابي → حذف الحساب.
   - [ ] It **refuses**, saying there is an order in progress
2. Owner: cancel that order. Try again.
   - [ ] The confirmation lists what will happen and the real order/review/points counts
   - [ ] It will not proceed until you type **حذف**
3. Confirm.
   - [ ] You are signed out immediately
   - [ ] Signing in with the same phone or Google account **does not restore** the old account
   - [ ] Owner: the order still exists in the Admin Portal with its number and total, but the customer
         name reads **حساب محذوف** and the phone and address are gone
   - [ ] Owner: the payment-proof image is gone from storage
   - [ ] Owner: any review the account left is still published, with no name on it

## 10. Offline behaviour

Both testers.

1. Turn on aeroplane mode with the app open.
   - [ ] An Arabic **لا يوجد اتصال بالإنترنت** banner appears with a retry action
   - [ ] The app does not go blank white
2. Force-close and reopen while still offline.
   - [ ] The app shell still renders — not a browser error page
3. Turn the network back on and tap retry.
   - [ ] Everything loads, and you are **still signed in**
4. iOS specifically: leave the app unused for a day, then reopen.
   - [ ] **Still signed in.** A logout here means the session storage fix is not working

## 11. Staff accounts stay on password

Owner, on either device.

1. On the login screen, tap **المتابعة باستخدام Google** using a **driver or admin** work email.

- [ ] It is refused with the Arabic staff message
- [ ] No second customer-role account was created for that email
- [ ] The driver can still sign in with email + password and reach `/driver`

---

## Results template

Copy this per session:

```
Date:            Build:            Tester:  A / B
Device / OS:                       Network:

 1 Install & launch        pass / fail   notes:
 2 Google sign-in          pass / fail   notes:
 3 Apple sign-in           pass / fail   notes:            (iPhone only)
 4 OTP  Zain               pass / fail   channel:      seconds:
   OTP  MTN                pass / fail   channel:      seconds:
   OTP  Sudani             pass / fail   channel:      seconds:
   OTP  data off (SMS)     pass / fail   seconds:
 5 Phone-only ordering     pass / fail   notes:
 6 Mycashi proof           pass / fail   notes:
 7 Push (bg / closed)      pass / fail   seconds:
 8 Deep links              pass / fail   notes:
 9 Account deletion        pass / fail   notes:
10 Offline                 pass / fail   notes:
11 Staff refusal           pass / fail   notes:
```

## What this plan exists to catch

Two pieces of logic have **no automated test** and are verified only here:

1. **The OTP rate limiter's counting** (tests 4.5 and 4.6). The RPCs are service-role only, and putting a
   service key into a test environment is a worse trade than the coverage. If the limiter is broken, the
   first sign is a bill.
2. **The WhatsApp trigger's positive path** (test 5). It needs a customer with a phone and no email,
   which means a real code to a real handset.

And the provider decision itself: **test 4's numbers choose your SMS vendor.** Verified delivery first,
then reliability, then cost — not the other way round.
