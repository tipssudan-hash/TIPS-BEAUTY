# قائمة النشر — خطة المستودعات والمشتريات والكتالوج

المراحل السبع في `docs/ADMIN_WAREHOUSES_PURCHASES_CATALOG_PLAN.md` منفّذة في الكود، لكن **لم يُنشر منها شيء بعد**: لا قاعدة البيانات، ولا الدوال، ولا المتجر، ولا لوحة الإدارة، ولا تطبيق الجوال. نفّذ الأقسام بالترتيب. لا تنتقل إلى قسم قبل أن تُنهي الذي قبله.

> ⚠️ أي دفع (push) إلى فرع `main` يشغّل `.github/workflows/deploy.yml`، وهذا ينشر المتجر ولوحة الإدارة مباشرة. **لا تدفع إلى `main` قبل أن تُطبَّق الترحيلات على قاعدة الإنتاج (القسم 1)**، فالواجهات الجديدة تستدعي دوال غير موجودة في القاعدة الحالية.

في الأوامر ضع معرّف مشروعك في Supabase مكان `<PROJECT_REF>`، وضع كلمة مرور قاعدة البيانات مكان `<DB_PASSWORD>`.

---

## 0. قبل البدء

- [ ] **حدّد المشروع الحقيقي (الإنتاج).** في الكود عنوانان مختلفان:
  - الـ triggers في `supabase/migrations/20260920000000_baseline.sql` وفي `20261022000500_staff_push_tokens_assignment_push.sql` تستدعي `https://eaomyiihsuikinkdhwzy.supabase.co/functions/v1/...`.
  - تطبيق الجوال يرجع افتراضياً إلى `https://luqrrjhvaremronfcvaf.supabase.co` (في `mobile-app/lib/tips-api.ts` و`mobile-app/docker-compose.yml`).
  
  افتح لوحة Supabase واعرف أيّهما يخدم عملاءك الآن. بعد ذلك:
  - اضبط `EXPO_PUBLIC_SUPABASE_URL` و`EXPO_PUBLIC_SUPABASE_ANON_KEY` في بناء الجوال على المشروع الصحيح (القسم 6).
  - إذا لم يكن المشروع الحقيقي `eaomyiihsuikinkdhwzy`، فإشعارات الشحن وإسناد السائق لن تصل. ستحتاج ترحيلاً لاحقاً يعيد إنشاء `trigger_order_status_push` و`trigger_driver_assignment_push` بالعنوان الصحيح. اطلبه من المطوّر.
- [ ] **خذ نسخة احتياطية** من قاعدة الإنتاج. أنشئ نسخة يدوية من Dashboard → Database → Backups، أو استخدم `pg_dump` (احفظ الملف خارج مجلد المشروع):

```bash
pg_dump "postgresql://postgres:<DB_PASSWORD>@db.<PROJECT_REF>.supabase.co:5432/postgres" -Fc -f ~/tips-backup-before-phases.dump
```

- [ ] **جهّز مشروع تجربة (staging)**: Supabase Branch أو مشروع منفصل يحمل نسخة من بيانات الإنتاج. طبّق كل شيء عليه أولاً.
- [ ] **اعرف السبب:** الترحيلات الجديدة جُرّبت فقط على PGlite (Postgres 18) مع stubs وفحص صياغة بـ libpg-query، ولم تُشغَّل قط على قاعدة Supabase حقيقية.
- [ ] تأكد أن آخر ترحيل مطبّق على الإنتاج هو `20261017000100_fix_revenue_affiliate_and_refund_scams.sql`:

```sql
SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 5;
```

  (إذا كانت الترحيلات السابقة قد طُبّقت بلصقها في SQL Editor فقد يكون هذا الجدول ناقصاً. تحقّق عندها من وجود الجداول والدوال بنفسك.)
- [ ] **للبيئات الجديدة فقط:** إذا بنيت قاعدة فارغة من كل الترحيلات (أو من `supabase/full_schema_setup.sql` الذي يدمج 83 ترحيلاً) فستفشل عند `20261008000100_supervisor_driver_workflow.sql`. السبب أنه ينفّذ `CREATE OR REPLACE FUNCTION get_my_deliveries` بنوع إرجاع مختلف. القاعدة الحالية لا تتأثر لأن هذا الترحيل مطبّق عليها من قبل.

---

## 1. قاعدة البيانات (33 ترحيلاً)

طبّق الترحيلات بهذا الترتيب بالضبط، على staging أولاً ثم على الإنتاج:

```text
20261018000100_warehouse_manager_access.sql
20261018000200_close_supervisor_security_holes.sql
20261018000300_scoped_inventory_rpcs.sql
20261018000400_driver_cash_ledger.sql
20261018000500_delivery_code_verification.sql
20261018000600_affiliate_commission_lifecycle_payouts.sql
20261018000700_refund_cap_by_returned_items.sql
20261018000800_admin_verify_payment_atomic.sql
20261018000900_checkout_idempotency_payload_hash.sql
20261019000100_categories_brands_schema.sql
20261019000200_categories_brands_backfill_sync.sql
20261019000300_categories_brands_readers.sql
20261020000100_suppliers_purchase_invoices.sql
20261020000200_purchase_approval_average_cost.sql
20261020000300_supplier_returns_and_void.sql
20261020000400_order_line_costs_profit_report.sql
20261020000500_mobile_checkout_gps.sql
20261020000600_affiliate_minimum_payout_default.sql
20261021000100_promotion_types_schema.sql
20261021000200_cart_promotions_pricing.sql
20261022000100_order_eta_needs_action.sql
20261022000200_packing_handover_proof.sql
20261022000300_staff_notifications_low_stock.sql
20261022000400_staff_ops_reads.sql
20261022000500_staff_push_tokens_assignment_push.sql
20261022000600_driver_availability_guard.sql
20261023000100_customer_addresses.sql
20261023000200_paginated_product_reviews.sql
20261023000300_checkout_location_fallback.sql
20261024000100_admin_audit_log.sql
20261024000200_admin_paginated_lists_bulk_actions.sql
20261025000100_deployment_decisions.sql
20261028000100_accountant_role.sql
```

- [ ] **قبل `20261019000200`:** راجع أسماء الأقسام والعلامات التجارية المكررة التي تختلف فقط في الأحرف الكبيرة والصغيرة أو في المسافات. الترحيل سيدمجها تلقائياً في صف واحد ويختار التهجئة الأكثر استخداماً. تأكد أن هذا الدمج مقبول:

```sql
SELECT lower(btrim(category)) AS k, array_agg(DISTINCT category) AS spellings
FROM public.products WHERE btrim(coalesce(category, '')) <> ''
GROUP BY 1 HAVING count(DISTINCT category) > 1;

SELECT lower(btrim(brand)) AS k, array_agg(DISTINCT brand) AS spellings
FROM public.products WHERE btrim(coalesce(brand, '')) <> ''
GROUP BY 1 HAVING count(DISTINCT brand) > 1;
```

- [ ] **طريقة التطبيق (اختر واحدة):**
  - **أ) CLI:**

```bash
npx supabase link --project-ref <PROJECT_REF>
npx supabase db push
```

  `docs/AUDIT-REPORT.md` يذكر مشكلة سابقة في login-role عند `supabase db push` على هذا المشروع. إذا فشل الأمر فانتقل إلى الطريقة (ب).
  - **ب) SQL Editor:** افتح كل ملف من القائمة أعلاه بالترتيب، والصق محتواه كاملاً، وشغّله، ولا تنتقل إلى الملف التالي قبل أن ينجح الحالي. بعد الانتهاء سجّل الترحيلات كمطبّقة حتى لا يحاول `db push` تطبيقها مرة أخرى في المستقبل:

```bash
npx supabase migration repair --status applied 20261018000100 --project-ref <PROJECT_REF>
# كرّر الأمر لكل رقم من الأرقام الـ 33
```

- [ ] **بعد `20261018000400` (دفتر نقد السائقين):** اقرأ رسائل `NOTICE`، فهي تخبرك بعدد تسويات السائقين المكررة التي رُفضت تلقائياً وعدد السائقين الذين يختلف رصيدهم عن المعادلة القديمة. لن ترى هذه الرسائل في SQL Editor، فاستخرج النتيجة بهذين الاستعلامين:

```sql
SELECT id, driver_id, amount, supervisor_notes
FROM public.driver_cash_remittances
WHERE supervisor_notes LIKE '%20261018000400%';

SELECT d.id,
       COALESCE((SELECT SUM(o.total) FROM public.orders o WHERE o.driver_id = d.id AND o.payment_method = 'COD' AND o.status = 'delivered'), 0)
     - COALESCE((SELECT SUM(r.amount) FROM public.driver_cash_remittances r WHERE r.driver_id = d.id AND r.status = 'confirmed'), 0) AS legacy,
       COALESCE((SELECT SUM(l.amount) FROM public.driver_cash_ledger l WHERE l.driver_id = d.id), 0) AS ledger
FROM public.drivers d;
```

  إذا اختلف `legacy` عن `ledger` لأي سائق، فراجع حسابه قبل أن تعتمد أرصدة السائقين الجديدة.
- [ ] بعد نجاح كل شيء على staging وإنهاء القسمين 4 و5 عليه، كرّر هذا القسم على الإنتاج.

---

## 2. التخزين (Storage)

الترحيلات تحاول إنشاء حاويتين للملفات. إذا لم تكن لدور الترحيل صلاحية على `storage.buckets` فأنشئهما يدوياً من Dashboard → Storage:

| الحاوية | عامة؟ | الحد | الأنواع |
|---|---|---|---|
| `purchase-invoices` | لا (private) | 10MB | `image/jpeg`, `image/png`, `image/webp`, `application/pdf` |
| `delivery-proofs` | لا (private) | 5MB | `image/jpeg`, `image/png`, `image/webp` |

- [ ] تأكد أن الحاويتين موجودتان بالإعدادات المذكورة.
- [ ] تأكد من وجود سياسات الوصول:

```sql
SELECT policyname FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname IN ('Managers upload purchase invoice files', 'Managers read purchase invoice files',
                     'Admins delete purchase invoice files', 'Assigned drivers upload delivery proofs',
                     'Staff read delivery proofs');
```

  يجب أن يُرجع الاستعلام 5 صفوف. إذا نقص صف فأعد تشغيل الجزء الخاص بالحاويات من `20261020000100` و`20261022000200`.

---

## 3. الدوال (Edge Functions)

- [ ] تأكد أن إضافة `pg_net` مفعّلة (Dashboard → Database → Extensions). الـ triggers تستخدمها لاستدعاء الدوال.
- [ ] اضبط سر Firebase (إن لم يكن مضبوطاً من قبل):

```bash
npx supabase secrets set FCM_SERVICE_ACCOUNT_JSON="$(cat service-account.json)" --project-ref <PROJECT_REF>
```

- [ ] انشر الدالتين. الأولى `order-status-push` تغيّرت: صارت تتحقق من صلاحية المدير وتفلتر الأجهزة لتصل للعملاء فقط. الثانية `driver-assignment-push` جديدة:

```bash
npx supabase functions deploy order-status-push --project-ref <PROJECT_REF>
npx supabase functions deploy driver-assignment-push --project-ref <PROJECT_REF>
```

  في `supabase/config.toml` الإعداد `verify_jwt = true` للدالتين. لا تعطّله.

---

## 4. الأنواع والفحوص

ملفات الأنواع الحالية معدّلة يدوياً. بعد تطبيق الترحيلات ولّدها من القاعدة الحقيقية:

- [ ] ولّد الأنواع:

```bash
npx supabase gen types typescript --project-id <PROJECT_REF> > src/infrastructure/supabase/database.types.ts
npx supabase gen types typescript --project-id <PROJECT_REF> > admin-portal/src/lib/database.types.ts
```

- [ ] شغّل الفحوص وأصلح أي اختلاف يظهر (أو اطلب ذلك من المطوّر):

```bash
npm run typecheck
npm --prefix admin-portal run typecheck
```

---

## 5. الاختبارات

- [ ] أنشئ الملف `.env.test.local` في جذر المشروع (لا تضفه إلى git). الأسماء مأخوذة من `tests/backend/helpers.ts`، وهو يقرأ `.env` أولاً ثم يطبّق هذا الملف فوقه. وجّه `VITE_SUPABASE_URL` إلى staging:

```bash
VITE_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
VITE_SUPABASE_ANON_KEY=<ANON_KEY>
TEST_CUSTOMER_EMAIL=
TEST_CUSTOMER_PASSWORD=
TEST_ADMIN_EMAIL=
TEST_ADMIN_PASSWORD=
```

  لإنشاء الحسابات التجريبية وأدوارها: `scripts/create-test-users.mjs` ثم `scripts/assign-test-roles.sql` (انظر `docs/ADMIN_SETUP.md`).
- [ ] شغّل اختبارات الخادم. هذه أول مرة يُشغَّل فيها SQL الجديد فعلاً، فـ 208 اختباراً كانت تُتخطّى لعدم وجود بيانات الدخول:

```bash
npm run test:backend
```

- [ ] شغّل اختبارات الوحدة (156 اختباراً كانت تنجح محلياً):

```bash
npm test
```

- [ ] اختبارات الجوال الحيّة (اختيارية) تعمل فقط مع `RUN_LIVE_TESTS=1`. تذكّر أن `mobile-app/tests/auth-e2e.test.ts` ينشئ مستخدماً حقيقياً في كل تشغيل.

---

## 6. البناء والنشر

### المتغيرات الجديدة
- [ ] `SITE_URL`: الأصل العام للمتجر (مثل `https://beauty.tips-sd.com`). يستخدمه `scripts/generate-sitemap.mjs` لإنتاج `dist/sitemap.xml`. إذا لم تضبطه فالبناء لا يفشل، لكن ملف sitemap لا يُكتب.
- [ ] `VITE_ADMIN_PORTAL_URL` (اختياري): عنوان لوحة الإدارة الذي يظهر لمديري المستودعات في `/supervisor`.
- [ ] أضف المتغيرين إلى GitHub Variables (أو Secrets). `.github/workflows/deploy.yml` صار يمرّرهما إلى `npm run build`.

### المتجر (الويب)
- [ ] تحقّق محلياً:

```bash
npm run build
```

- [ ] بعد اكتمال القسمين 1 و3 على الإنتاج، ادفع إلى `main` لينشر الـ workflow المتجر ولوحة الإدارة، أو شغّله يدوياً من تبويب Actions (`workflow_dispatch`).
- [ ] تطبيقات Capacitor (`capacitor.config.ts`، ومنها واجهة السائق `/driver`) تحمل نسخة المتجر داخلها. إذا كانت موزّعة على أجهزة فأعد بناءها عبر `npm run cap:sync` ثم انشرها.

### لوحة الإدارة
- [ ] شغّل البناء في طرفية عادية. على جهاز التطوير لم يكتمل البناء بسبب خطأ صلاحيات في ملف مؤقت لـ esbuild:

```bash
npm --prefix admin-portal run build
```

### تطبيق الجوال (Expo)
- [ ] أُضيفت مكتبة `expo-location`، وهي مكتبة أصلية (native)، فلا يكفي تحديث OTA. يلزم بناء أصلي جديد عبر EAS. لا يوجد `eas.json` في المستودع، فابدأ بإعداده:

```bash
cd mobile-app
npx eas-cli build:configure
npx eas-cli build --platform all
```

- [ ] اضبط `EXPO_PUBLIC_SUPABASE_URL` و`EXPO_PUBLIC_SUPABASE_ANON_KEY` في بيئة البناء على المشروع الحقيقي (القسم 0). إن لم تفعل فسيستخدم التطبيق المشروع الافتراضي المكتوب في الكود.

---

## 7. الإعدادات والأعلام (Feature flags)

الأعلام الثلاثة في `app_settings` مطفأة افتراضياً. **لا تفعّل أيّاً منها قبل نشر الواجهات وتدريب الموظفين.**

- [ ] `require_packing_check` (التحقق من التعبئة) و`require_delivery_proof` (صورة إثبات التسليم): فعّلهما من صفحة الإعدادات في لوحة الإدارة.
- [ ] `require_delivery_code` (رمز التسليم): ليس له مفتاح في اللوحة. لا تفعّله إلا بعد نشر واجهة العميل (المتجر، حيث يظهر الرمز) وواجهة السائق:

```sql
UPDATE public.app_settings SET require_delivery_code = true WHERE id = true;
-- للإيقاف:
UPDATE public.app_settings SET require_delivery_code = false WHERE id = true;
```

---

## 8. الصلاحيات والمستخدمين

- [ ] عيّن مديري المستودعات من لوحة الإدارة: صفحة المخازن أو صفحة العملاء ← اختر المستودعات (يمكن للمدير أن يدير أكثر من مستودع) وحدّد المستودع الأساسي.
- [ ] قيمة الدور المخزنة تبقى `warehouse_supervisor` (اسمها في الواجهة «مدير مستودع»). لا تغيّرها.
- [ ] أبلغ المديرين أن `/supervisor` في المتجر صار يعرض فقط رسالة توجّههم إلى لوحة الإدارة، وأن عملهم كله صار هناك.

---

## 9. التنظيف

- [ ] احذف من Supabase → Authentication → Users الحسابين التجريبيين اللذين أُنشئا بالخطأ على المشروع الحي، بالصيغة `beauty_user_<timestamp>@tips-sd.com`. أنشأهما `mobile-app/tests/auth-e2e.test.ts` في تشغيل سابق.
- [ ] (اختياري) تنظيف وسوم الموعد المتوقع القديمة من `orders.notes`. الاستعلامات موجودة كتعليقات في آخر `20261022000100_order_eta_needs_action.sql` ولا تُنفَّذ تلقائياً. شغّل استعلامَي العدّ والعيّنة أولاً، ولا تشغّل `UPDATE` إلا بعد المراجعة.

---

## 10. اختبار يدوي بعد النشر

- [ ] مدير المستودع يرى طلبات مستودعه فقط.
- [ ] فاتورة شراء: مسودة ← إرفاق صورة ← اعتماد ← يزيد المخزون.
- [ ] إنشاء مرتجع إلى مورّد.
- [ ] صفحات الأقسام والعلامات التجارية تعمل.
- [ ] أنواع العروض: الخصم في معاينة السلة يطابق المبلغ المحصّل فعلاً.
- [ ] درج نقد السائق والتسوية (remittance).
- [ ] رمز التسليم من البداية إلى النهاية (بعد تفعيله).
- [ ] إتمام الطلب مع رفض إذن الموقع (GPS)، باختيار الولاية والمحلية.
- [ ] ملف CSV المصدَّر يفتح بشكل صحيح في Excel.
- [ ] سجل التدقيق (audit log) يُظهر تعديلاً على كوبون.

---

## 11. القرارات (اتُّخذت — التفاصيل في `docs/DEPLOYMENT_DECISIONS.md`)

- [x] **تكلفة البضاعة المباعة (COGS):** تُخصم تكلفة القطع المعادة إلى المخزون من COGS في تقرير الأرباح (`cogs_reversed`).
- [x] **الطلبات القديمة:** تُعبَّأ بأثر رجعي بمتوسط التكلفة الحالي مع `is_estimated = true`.
- [x] **التقييمات:** 50 افتراضياً عند `p_limit` فارغة، و100 حداً أقصى.
- [x] **وسوم الموعد المتوقع:** يُنفَّذ التنظيف تلقائياً بعد حفظ النص الأصلي في `orders_notes_eta_backup` (لا حاجة لتشغيله يدوياً في القسم 9).
- [x] **مسار الإدارة:** `admin_update_order_operation` صار يطبّق قيد التعبئة قبل الشحن وقيد تأكيد الإرجاع قبل إلغاء طلب فشل توصيله.

---

## لو حصلت مشكلة

- [ ] أوقف النشر فوراً، ولا تدفع إلى `main` حتى تُحلّ المشكلة.
- [ ] لكل ترحيل قسم `-- DOWN (manual):` في آخر ملفه يشرح كيف تتراجع عنه. تراجع بالترتيب العكسي، من آخر ترحيل طُبّق إلى أوله.
- [ ] إذا كان الضرر واسعاً فاستعد النسخة الاحتياطية من القسم 0 (Dashboard → Backups، أو `pg_restore` من ملف `pg_dump`). لاحظ أن الاستعادة تمحو كل ما كُتب في القاعدة بعد وقت النسخة.
- [ ] الدوال (Edge Functions): أعد نشر النسخة السابقة من git للدالة `order-status-push`.
