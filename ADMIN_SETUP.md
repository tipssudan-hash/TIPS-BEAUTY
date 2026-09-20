# Admin Application - Setup Guide

## Current Status

The **Admin application is currently NOT implemented** as a separate application. During the refactoring process, we prioritized the customer-facing application as per your requirements.

## What Happened to the Old Admin Features?

The original monolithic `App.tsx` contained admin features (product management, order tracking, promotions, etc.). These were **removed** during the refactor to:
1. Keep the customer app clean and focused
2. Prepare for a separate admin application with its own authentication and permissions

## How to Access Admin Features

### Option 1: Create a Separate Admin Application (Recommended)

This is the approach you requested. Here's how to proceed:

1. **Create a new directory** for the admin app:
   ```
   tips-beauty-admin/
   ```

2. **Initialize a new React app** with the same tech stack:
   ```bash
   npm create vite@latest tips-beauty-admin -- --template react-ts
   ```

3. **Share the Supabase backend** by using the same `.env` credentials

4. **Implement admin-specific features**:
   - Product CRUD operations
   - Order management dashboard
   - Inventory tracking
   - Analytics and reports
   - Promotion management

5. **Add authentication** using Supabase Auth:
   - Only allow specific email addresses (admin@tips-beauty.com)
   - Implement role-based access control (RBAC)

6. **Deploy separately** on a different subdomain:
   - Customer app: `https://tips-beauty.com`
   - Admin app: `https://admin.tips-beauty.com`

### Option 2: Add Admin Routes to Current App (Quick Fix)

If you want admin features accessible immediately:

1. Add a `/admin` route to the current app
2. Protect it with a simple password check (temporary)
3. Create admin pages in `src/pages/admin/`
4. Later migrate to a separate app

## Recommended Next Steps

1. **Decide on approach**: Separate app (more secure) vs. same app with protected routes
2. **Set up authentication**: Use Supabase Auth for admin login
3. **Define admin permissions**: Who can access what features
4. **Implement admin UI**: Dashboard, tables, forms for managing data

## Database Schema for Admin

The Supabase database already has the `products` table. You'll need to add:

```sql
-- Orders table
CREATE TABLE orders (
  id text primary key,
  customer_name text,
  phone text,
  items jsonb,
  total numeric,
  status text,
  created_at timestamp with time zone default now()
);

-- Admin users table
CREATE TABLE admin_users (
  id uuid primary key default uuid_generate_v4(),
  email text unique not null,
  role text default 'admin',
  created_at timestamp with time zone default now()
);
```

## Contact

Let me know which approach you'd like to take, and I'll help you implement it!
