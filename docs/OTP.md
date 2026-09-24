# Phone sign-in (OTP)

The lowest-friction door into the Storefront, and the only one that works for a customer with no email.
Supabase generates and verifies the code; **we only deliver it**, through the `send-otp` Edge Function
registered as Supabase's Send SMS hook. The app itself just calls `supabase.auth.signInWithOtp()`.

That seam is the whole design: **no production provider is committed.** Delivery to Zain / MTN / Sudani
has to be proven on real handsets before any contract is signed, so the channel and the vendor are
configuration, and changing either touches no application code.

```
app  →  supabase.auth.signInWithOtp({ phone })
             │  Supabase makes the code, calls the hook
             ▼
        send-otp  →  record_otp_attempt()      ← rate limit, in SQL, atomically
                  →  get_otp_settings()        ← which channels are live
                  →  WhatsApp (primary)  ─┐
                  →  SMS (fallback)       ─┴→  log_otp_delivery()
```

## Why two channels

| | WhatsApp Cloud API | SMS |
| --- | --- | --- |
| Cost to Sudan | ~$0.0225 / message | ~$0.4749 / segment (Twilio list) |
| Needs | Meta Business Verification (days–weeks) | Alphanumeric sender ID registration (~3 weeks) |
| Survives a data outage | **No** | **Yes** |

Sudan has had nationwide internet shutdowns every year since 2023, plus MTN suspensions during exam
season. WhatsApp is ~20x cheaper; SMS is the one that still arrives when the data network is off. Hence
WhatsApp primary, SMS fallback — `app_settings.otp_primary_channel` flips the order without a release.

## Enabling it

1. **Supabase → Authentication → Providers → Phone**: enable phone sign-in. Do *not* fill in a Twilio
   provider — the hook replaces it.
2. **Supabase → Authentication → Hooks → Send SMS**: point at the deployed `send-otp` function and copy
   the generated secret into `SEND_SMS_HOOK_SECRET`.
3. Deploy and set secrets:

   ```bash
   npx supabase functions deploy send-otp
   npx supabase secrets set SEND_SMS_HOOK_SECRET=v1,whsec_...
   ```

4. Configure at least one channel (below), then switch it on in `app_settings`:

   ```sql
   UPDATE app_settings SET auth_phone_enabled = true, otp_whatsapp_enabled = true;
   ```

   Until `auth_phone_enabled` is true the login screen does not show the phone form at all.

### WhatsApp Cloud API

```bash
npx supabase secrets set \
  WHATSAPP_PHONE_NUMBER_ID=... \
  WHATSAPP_ACCESS_TOKEN=... \
  WHATSAPP_OTP_TEMPLATE=tips_beauty_otp \
  WHATSAPP_OTP_LANGUAGE=ar
```

- Needs a **fresh, dedicated phone number**. Registering a number to the Cloud API removes it from the
  normal WhatsApp app permanently — it must not be the number staff use for customer service.
- The template must be an **authentication-category** template, approved in Meta's console, with one
  body variable (the code) and the one-tap copy button. Approval is per template, which is why its name
  and language are configuration.
- Meta Business Verification is the long lead time here. Start it early; it is calendar time, not work.

### SMS

Two implementations, chosen by `SMS_PROVIDER` (or inferred from whichever secrets exist):

**Twilio** — the reference implementation, because it publishes Sudan coverage:

```bash
npx supabase secrets set SMS_PROVIDER=twilio \
  TWILIO_ACCOUNT_SID=... TWILIO_AUTH_TOKEN=... TWILIO_SENDER_ID=TIPSBEAUTY
```

**Generic HTTP** — for a Sudanese aggregator with a plain REST endpoint, which is the likely outcome
once delivery and price are measured. No code change needed:

```bash
npx supabase secrets set SMS_PROVIDER=generic \
  SMS_HTTP_URL=https://gateway.example/send \
  SMS_HTTP_AUTH_HEADER="Bearer ..." \
  SMS_SENDER_ID=TIPSBEAUTY \
  SMS_HTTP_BODY='{"to":"{{phone}}","from":"{{sender}}","text":"{{message}}"}'
```

`{{phone}}`, `{{sender}}` and `{{message}}` are substituted; the message is JSON-escaped, since it is
Arabic.

Sudan-specific constraints that apply to every vendor: **numeric sender IDs are dropped by MTN Sudan and
Sudani**, so an alphanumeric sender ID must be pre-registered (~3 weeks, transactional content only),
and there is no inbound SMS — the flow is strictly one-way.

## Rate limiting

Enforced in `record_otp_attempt()`, in SQL, under an advisory lock per number, because only the database
can count attempts atomically across concurrent requests. Defaults, all editable in `app_settings`:

| Limit | Default | Why |
| --- | --- | --- |
| `otp_cooldown_seconds` | 60 | Two taps on "resend" must not both send |
| `otp_max_per_phone_hour` | 5 | Caps what one number can cost |
| `otp_max_per_ip_hour` | 20 | Caps a script; nullable IP never blocks a real customer |

A blocked request is logged with `status = 'blocked'` and returns 429 with `Retry-After`. The login form
shows the same countdown, so a refusal never looks like a broken button.

**CAPTCHA** is off by default and held in reserve: friction is the problem this project exists to solve,
so it goes on the first time someone actually abuses the endpoint. Flip
`app_settings.auth_captcha_enabled`, set `VITE_HCAPTCHA_SITE_KEY`, and enable CAPTCHA protection in
Supabase → Authentication → Settings. No release needed for the flag itself.

## Monitoring

`otp_delivery_log` records every attempt: number, channel, provider, status, provider message id, error,
and which attempt it was for that number. Admin-only, because it is full of phone numbers.

```sql
select created_at, phone, channel, provider, status, error_message
from otp_delivery_log order by created_at desc limit 50;
```

"The code never arrived" is unanswerable without this. `otp_request_attempts` is rate-limiting state
rather than history and is pruned daily by pg_cron (`prune-otp-attempts`) — they are phone numbers we
have no reason to keep.

## Before launch — the test that actually decides the provider

Nothing above proves delivery. On real handsets, one per network:

1. Request a code on **Zain**, **MTN** and **Sudani**, and confirm arrival by looking at the phone.
   Delivery receipts from Sudan are unreliable; a DLR is not evidence.
2. Time it. A code that arrives in four minutes is a failed login.
3. Test with WhatsApp only, then SMS only (`otp_primary_channel`), then with data off to prove the SMS
   leg works during a shutdown.
4. Confirm the cooldown and the hourly cap behave, and read them back from `otp_delivery_log`.

Choose the production provider from those numbers — verified delivery, reliability, then cost.

---

## Order confirmations on WhatsApp

Phone sign-in creates customers with **no email address**, and the email pipeline sends confirmations to
`profiles.email` — so those customers would hear nothing about an order they just placed. That hole is
what the WhatsApp order notification closes.

Scope is **one message**: the order confirmation, matching exactly what email customers get. Every extra
template is a separate Meta approval in Arabic, and utility messages outside the 24-hour window are
billed individually.

- `queue_order_whatsapp_notification()` is a **second trigger** on `orders`, not an edit to the email
  one, so a fault here cannot break the channel that already works. It queues only when the profile has
  no email and a Sudanese phone can be resolved (profile first, then the order's own phone).
- `dispatch_whatsapp_queue()` mirrors `dispatch_email_queue()` — same vault-secret pattern, same "do
  nothing until the secrets exist" posture — and `send-order-whatsapp` drains the queue.
- A number with no WhatsApp account (Meta error 131026/131051) is **cancelled rather than retried**:
  retrying cannot fix it and each attempt is billable.

Setup, once Meta Business Verification is through:

```bash
npx supabase functions deploy send-order-whatsapp --no-verify-jwt
npx supabase secrets set WHATSAPP_ORDER_TEMPLATE=tips_beauty_order_created WHATSAPP_ORDER_LANGUAGE=ar
```

Then store the dispatcher's credentials in the vault, the same way the email pipeline does:

```sql
select vault.create_secret('<CRON_SECRET>', 'send_order_whatsapp_key');
select vault.create_secret('https://<ref>.supabase.co/functions/v1/send-order-whatsapp', 'send_order_whatsapp_url');
```

The template must be a **utility**-category template with one body variable (the order number) —
separate from the authentication template used for login codes, and approved separately.

## Monitoring: حالة الإشعارات

Admin Portal → **حالة الإشعارات** (`/delivery-health`) is the one screen that answers "did our messages
actually go out?". It reads `admin_delivery_summary()` and `admin_delivery_failures()`, which union the
three pipelines that used to fail in three separate tables:

| Source | What it holds |
| --- | --- |
| `notification_queue` | Order confirmations, email and WhatsApp |
| `otp_delivery_log` | Login codes, including rate-limiter refusals |
| `push_notification_deliveries` | Push rejected by Expo or FCM |

Rate-limiter refusals show as **محجوب** (amber), not as failures — that is the limiter working, and
colouring it red would train staff to ignore the screen.
