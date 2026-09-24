# 💄 TIPS Beauty — Unified Multi-Platform E-Commerce Platform

> **TIPS Beauty** is a comprehensive, production-ready cosmetics and skincare e-commerce ecosystem specifically tailored for the Sudanese market (RTL / Arabic first, Sudanese States & Localities shipping, SDG currency, Mycashi & COD payment handling).

---

## 🏗️ Repository Architecture

```
TIPS-BEAUTY/
├── src/                    # Customer Storefront & Driver Web App (Vite + React 19 + Tailwind CSS)
├── admin-portal/           # Staff Admin Management Portal (Vite + React 19 + Tailwind CSS)
├── mobile-app/             # Customer Mobile Application (React Native / Expo SDK 54 / Expo Router)
├── supabase/               # Complete Backend & Database Migrations
│   ├── migrations/         # 31 incremental SQL migrations (run in filename order)
│   ├── functions/          # Deno Edge Functions (beauty-advice, order-status-push, send-order-emails, send-otp, send-order-whatsapp)
│   ├── storage-current.sql # Storage bucket definitions and RLS policies
│   └── full_schema_setup.sql # 1-Click consolidated init script (GENERATED — scripts/generate-full-schema.mjs)
├── tests/                  # Backend and Unit Test Suites (Vitest)
│   ├── backend/            # Supabase RPC and database behavior tests
│   └── unit/               # Frontend utility and pricing calculation tests
├── docs/                   # Full Technical Specs, Architecture, and QA Audits
├── public/                 # Static assets, logos, and PWA manifest
└── scripts/                # Parity checkers and build scripts
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: v20+ recommended
- **npm** or **pnpm**

### Environment Configuration
Create a `.env` file in the root directory (and in `admin-portal/` / `mobile-app/` if running standalone):

```env
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

---

## 💻 Running the Applications

### Customer Storefront & Driver Portal (Web)
```bash
npm install
npm run dev
```
- **Storefront**: `http://localhost:5173/`
- **Driver Surface**: `http://localhost:5173/driver`

### Staff Admin Portal
```bash
cd admin-portal
npm install
npm run dev
```

### Customer Mobile App (Expo / React Native)
```bash
cd mobile-app
pnpm install
npm run dev:metro
```

---

## 🗄️ Database Setup (Supabase)

### Option A: 1-Click Setup
1. Open [Supabase Dashboard](https://supabase.com/dashboard) → **SQL Editor**.
2. Paste contents of `supabase/full_schema_setup.sql` and run.
3. Run `supabase/storage-current.sql` for storage buckets.

> `full_schema_setup.sql` is generated from `supabase/migrations` by
> `node scripts/generate-full-schema.mjs`. Never edit it by hand, and re-run the script after adding a
> migration — `npm run lint` fails when it is out of date. A stale copy is worse than none: it produces a
> database that looks complete while silently missing whatever was added after it was last generated.

### Option B: Supabase CLI
```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

---

## 🧪 Testing
```bash
npm run test           # All tests
npm run test:backend   # Backend RPC tests only
npm run typecheck      # TypeScript validation
npm run lint           # ESLint + parity checks
```

---

## 📚 Documentation
- [Domain & Glossary (CONTEXT.md)](CONTEXT.md)
- [Product Scope (PRODUCT.md)](PRODUCT.md)
- [Design System (DESIGN.md)](DESIGN.md)
- [Admin Setup Guide (ADMIN_SETUP.md)](ADMIN_SETUP.md)
- [Architectural Analysis (docs/PROJECT_ANALYSIS.md)](docs/PROJECT_ANALYSIS.md)