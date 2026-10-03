# Web deployment

Every push to `main` runs `.github/workflows/deploy.yml`:

| App | Build output | Deploy branch | Hostinger site |
|---|---|---|---|
| Storefront | `dist/` | `deploy/beauty` | `beauty.tips-sd.com` |
| Admin Portal | `admin-portal/dist/` | `deploy/admin` | `admin.tips-sd.com` |

`scripts/publish-build.sh` force-pushes each build as a single commit to its deploy branch. Hostinger Git auto-deployment pulls that branch into the site's document root on every push. The existing `.htaccess` in each app's `public/` ships with the build and handles SPA routing.

## One-time setup

1. GitHub → Settings → Secrets and variables → Actions, add:
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (required), and optionally
   `VITE_GOOGLE_WEB_CLIENT_ID`, `VITE_GOOGLE_IOS_CLIENT_ID`, `VITE_HCAPTCHA_SITE_KEY`, `APPLE_TEAM_ID`, `ANDROID_CERT_SHA256`.
2. hPanel → Websites → each subdomain → Advanced → Git: connect GitHub with access to `tipssudan-hash/TIPS-BEAUTY`, branch `deploy/beauty` or `deploy/admin`, directory empty (document root), auto-deployment on.

Run the workflow manually from the Actions tab (`workflow_dispatch`) to redeploy without a code change.
