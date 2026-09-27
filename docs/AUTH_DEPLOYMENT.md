# Supabase Auth — Production Deployment Checklist

All authentication flows (OAuth, email confirmation, password recovery) rely on redirect URLs
that must be configured in the **Supabase Dashboard** for production. The `config.toml` only
controls local development.

## 1. Dashboard → Authentication → URL Configuration

| Setting                  | Value                                                        |
|--------------------------|--------------------------------------------------------------|
| **Site URL**             | `https://beauty.tips-sd.com`                                 |
| **Redirect URLs** (add all) | `https://beauty.tips-sd.com/auth/callback`                |
|                          | `https://beauty.tips-sd.com/reset-password`                  |

### Why each URL is needed

- **`/auth/callback`** — OAuth (Google/Apple) sign-in returns here. Also used as `emailRedirectTo`
  for signup confirmation emails. The `AuthCallbackPage` component exchanges the code for a session.

- **`/reset-password`** — Password recovery emails redirect here. Supabase Auth server verifies the
  token and redirects with `#access_token=...&type=recovery` in the hash fragment. The
  `ResetPasswordPage` component listens for the `PASSWORD_RECOVERY` auth state change event.

## 2. Dashboard → Authentication → Email Templates

If using custom email templates, ensure the `{{ .ConfirmationURL }}` placeholder is used
(Supabase generates the full URL including the redirect). The `redirectTo` / `emailRedirectTo`
from the client-side call is appended as a query parameter to the confirmation URL.

**Password Recovery template** should contain a link like:
```html
<a href="{{ .ConfirmationURL }}">إعادة تعيين كلمة المرور</a>
```

**Email Confirmation template** (signup) should contain:
```html
<a href="{{ .ConfirmationURL }}">تأكيد البريد الإلكتروني</a>
```

## 3. Dashboard → Authentication → Providers

### Email
- **Confirm email**: `enabled` — Users must confirm email before signing in
- **Secure email change**: `enabled` — Require confirmation on both old and new email
- **Minimum password length**: `6`

### Google OAuth
- Ensure the **Web Client ID** and **Client Secret** are set
- The callback URL Supabase provides must be registered in Google Cloud Console

### Apple Sign-In (iOS only)
- Configure in Dashboard if Apple sign-in is enabled

## 4. Flow Walkthrough

### Forgot Password Flow
```
LoginPage (/login)
  └─ "نسيت كلمة المرور؟" link
      └─ ForgotPasswordPage (/forgot-password)
          └─ supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${origin}/reset-password`
             })
          └─ Supabase sends email with link:
              https://<project>.supabase.co/auth/v1/verify?token=xxx&type=recovery&redirect_to=https://beauty.tips-sd.com/reset-password
          └─ User clicks link → Supabase verifies token → redirects to:
              https://beauty.tips-sd.com/reset-password#access_token=xxx&refresh_token=yyy&type=recovery
          └─ ResetPasswordPage (/reset-password)
              └─ supabase-js detects hash fragment, fires PASSWORD_RECOVERY event
              └─ Page shows new password form
              └─ supabase.auth.updateUser({ password })
              └─ Success → navigate to /login
```

### Email Confirmation Flow (Signup)
```
SignupPage (/signup)
  └─ supabase.auth.signUp({
        email, password,
        options: { emailRedirectTo: `${origin}/auth/callback` }
     })
  └─ If email confirmation is required:
      └─ Shows "check your email" screen
      └─ User clicks confirmation link in email
      └─ Supabase verifies → redirects to:
          https://beauty.tips-sd.com/auth/callback#access_token=xxx&type=signup
      └─ AuthCallbackPage (/auth/callback)
          └─ supabase-js exchanges token, fires SIGNED_IN event
          └─ Navigates to resolvePostLoginPath() (/ or /driver)
```

### OAuth Sign-In Flow
```
LoginPage (/login) or SignupPage (/signup)
  └─ SocialAuthButtons → signInWithSocial('google')
      └─ Web: supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: `${origin}/auth/callback?next=${from}` }
         })
      └─ Google consent screen → redirect back to:
          https://beauty.tips-sd.com/auth/callback?code=xxx
      └─ AuthCallbackPage (/auth/callback)
          └─ supabase-js exchanges code for session
          └─ Navigates to resolvePostLoginPath()
```

## 5. Common Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| Reset password email link shows "invalid/expired" | Production URL not in redirect allowlist | Add to Dashboard → URL Configuration |
| OAuth sign-in fails with redirect error | `/auth/callback` not in redirect allowlist | Add to Dashboard → URL Configuration |
| Email confirmation link doesn't work | `emailRedirectTo` URL not in allowlist | Add to Dashboard → URL Configuration |
| Flash of "link expired" on reset-password page | Race condition: getSession() resolves before hash is parsed | Fixed: timeout-based fallback (10s) |
| Native app can't sign in with Google | `detectSessionInUrl` must be `false` for native | Already configured in `client.ts` |
