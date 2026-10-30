# خطة تنفيذ: صلاحيات مديري المستودعات، فواتير الشراء، التصنيفات والعلامات التجارية، وتوسيع العروض

> خطة فقط. لا تُعدّل هذه الوثيقة أي كود. كل مرجع أدناه مأخوذ من قراءة الملفات الحالية؛ أي نقطة تحتاج تحققاً على قاعدة البيانات الحية موسومة بـ **(تحقق)**.

## خريطة ملاحظات التحسين (1–31)

> طلب المالك تنفيذ ملاحظات التحسين مع هذه الخطة. تحققنا من كل ملاحظة في الكود قبل تخطيطها. **مؤكدة** تعني صحيحة كما وردت، و**جزئية** تعني صحيحة مع تصحيح مذكور، و**مغطاة** تعني أن الخطة كانت تشملها أصلاً. لم تُسقَط أي ملاحظة، إذ لم نجد ملاحظة خاطئة كلياً أو مُصلحة مسبقاً. الأدلة التفصيلية (ملف:سطر) موجودة في القسم المذكور.

| # | الملاحظة | نتيجة التحقق | المرحلة | القسم |
|---|---|---|---|---|
| 1 | `admin_record_affiliate_payout` يعلّم كل العمولات مدفوعة، بلا فحص رصيد أو `minimum_payout` | مؤكدة | 1b | §4b.3 |
| 2 | لا واجهة لمراجعة العمولات، وتُنشأ `approved` عند التسليم | مؤكدة، وإعادة التسليم تعيد العمولة `paid`/`reversed` إلى `approved` | 1b | §4b.3 |
| 3 | الاسترداد مُعبّأ ومسقوف بإجمالي الطلب | جزئية: الخادم يحسب قيمة البنود، لكن `p_refund_amount` يتجاوزها | 1b | §4b.4 |
| 4 | لا شاشة تسويات نقدية للأدمن، و`get_warehouse_settlement_summary` غير مستخدمة | مؤكدة، ومغطاة جزئياً بـ `WarehouseCashPage` | 1 | §4.4، §4.6 |
| 5 | فحوص `adminApi.ts` تفشل مفتوحة، ومجاميع العميل تتجاهل الأخطاء | مؤكدة | 1b | §4b.5 |
| 6 | فشل تحميل الإعدادات ثم الحفظ يمسح المستلمين | مؤكدة | 1b | §4b.6 |
| 7 | `verifyAndAdvanceOrder` استدعاءان غير ذريين | مؤكدة | 1b | §4b.5 |
| 8 | قوائم بلا ترقيم، ولا CSV ولا إجراءات جماعية ولا سجل تدقيق، ولوحة بـ 30 يوماً ثابتة، و`as any` | مؤكدة | 7 | §7d |
| 9 | `delivery_failed` مخفية عن المشرف | مؤكدة | 5 | §7b.1 |
| 10 | لا تحديث حي، والقائمة مقصوصة عند 50 | مؤكدة في `/supervisor`؛ بوابة الإدارة لديها اشتراك حي | 1 | §4.6 |
| 11 | واجهة التسويات تعرض المرفوض مؤكداً، بلا رفض ولا حالة انشغال | جزئية: الـ RPC تدعم الرفض والنقص في الواجهة | 1 | §4.6 |
| 12 | قائمة التعبئة محلية، ولا توقيع تسليم | مؤكدة | 5 | §7b.2 |
| 13 | الموعد المتوقع يُلصق في `notes` ويتراكم | مؤكدة | 5 | §7b.1 |
| 14 | مخزون وهمي ومستودع ثابت عند الفشل | مؤكدة؛ المستودع الثابت مغطى أصلاً | 1 | §4.7 |
| 15 | تنبيهات نقص المخزون، وتفصيل التجزئة، وخريطة المناديب | مؤكدة (العرض موجود، والتنبيه غائب) | 5 | §7b.3، §7b.4 |
| 16 | تغييرات المدير لا تُرسل إشعاراً للعميل | مؤكدة | 1 | §4.7 |
| 17 | رمز التسليم حتمي ولا يتحقق منه الخادم | مؤكدة | 1b | §4b.2 |
| 18 | مبلغ COD يختفي بعد التسليم، والدرج نافذة 24 ساعة | مؤكدة، والمجموع صفر دائماً | 1b | §4b.1 |
| 19 | `driver_submit_cash_remittance` بلا سقف ويقبل التكرار | مؤكدة | 1b | §4b.1 |
| 20 | لا مفتاح توفّر، وحالة الموقع غير ظاهرة | مؤكدة | 5 | §7b.6 |
| 21 | إثبات التسليم، وإشعار الإسناد، والطابور دون اتصال، وترتيب المسار، والقائمة الدائمة، والعودة للمستودع، والأرباح | مؤكدة (القائمة موجودة في الحالة فقط) | 5 | §7b.2، §7b.4–7b.6 |
| 22 | بيانات وهمية صامتة عند أي خطأ | مؤكدة، وتُخزَّن مؤقتاً | 1b | §4b.8 |
| 23 | TTL خمسون دقيقة بتعليق «10 minutes» | مؤكدة | 6 | §7c.1 |
| 24 | إعادة استخدام مفتاح عدم التكرار بعد الإلغاء | جزئية: رسالة L261 صحيحة، والمضللة في L293 | 1b | §4b.7 |
| 25 | السلة لا تراعي المخزون، والمفضلة بلا انتظار | مؤكدة | 6 | §7c.2 |
| 26 | GPS شرط صارم، والكوبون يُزال بصمت | مؤكدة، والخادم يشترط GPS أيضاً | 6 | §7c.3 |
| 27 | SEO | مؤكدة | 6 | §7c.4 |
| 28 | نقاط الولاء والإحالات والتنبيه بالتوفر والمفضلة | مؤكدة | 6 | §7c.5 |
| 29 | العناوين وإعادة الطلب والترقيم و`StoreProvider` والصور وإمكانية الوصول و`confirm` والكمية | جزئية: إعادة الطلب موجودة في صفحة التفاصيل | 6 | §7c.6 |
| 30 | انحراف الوثائق | مؤكدة | 7 | §7d.6 |
| 31 | `describe.skip` في اختبار المشرف | مؤكدة ومغطاة | 1 | §4.10 |

## 0. الأهداف

1. **الصلاحيات والأمان:** تحويل `warehouse_supervisor` إلى «مدير مستودع» بصلاحيات أوسع ومقيّدة بمستودع أو أكثر عبر جدول وصول. يرى `admin` ويدير كل المستودعات. التطبيق يكون في قاعدة البيانات (RLS + فحوص RPC) وليس في الواجهة فقط، مع إغلاق الثغرات الحالية.
2. **التصنيفات والعلامات التجارية:** جدولا `categories` (مستويان) و`brands` (مع شعار)، والانتقال من النص الحر مع إبقاء `products.category` و`products.brand` متزامنين حتى لا يتعطل `src/` ولا `mobile-app`.
3. **فواتير الشراء:** موردون، وفاتورة (رأس + بنود + مرفق صورة)، ومسار `draft → approved`. يعتمدها مدير المستودع، ويراجعها الأدمن ويلغيها. الاعتماد ذرّي يزيد المخزون ويكتب `inventory_movements`. الفاتورة المعتمدة غير قابلة للتعديل، والتصحيح يتم بمستند «مرتجع مورد». حساب متوسط التكلفة المرجّح لتقارير الربح.
4. **توسيع العروض:** «اشترِ X واحصل على Y»، وخصم الكمية المتدرج، والحزم، متوافقةً مع `effective_price` و`checkout_order_safe` دون كسر الكوبونات ونقاط الولاء.
5. **ملاحظات التحسين (1–31):** تُغلق الثغرات المالية والأمنية أولاً في المرحلة 1b، ثم تأتي الميزات في المراحل 5 (المندوب والتوصيل وأدوات المدير)، و6 (موقع العميل)، و7 (جودة الإدارة والوثائق). كل مرحلة قابلة للنشر وحدها.

## 1. حقائق مُتحقق منها (ومصححة) من الكود

- **الأدوار:** قيد `profiles_role_check` في [gps06_warehouse_supervisor.sql](<../supabase/migrations/20261001000800_gps06_warehouse_supervisor.sql>) (L9–13) يسمح بـ `customer`, `admin`, `driver`, `warehouse_supervisor`. ربط المشرف بمستودع واحد يتم عبر `profiles.assigned_warehouse_id` (L16). الدالتان `is_warehouse_supervisor()` و`my_warehouse_id()` (L55–74).
- **بوابة الإدارة:** `isAdmin` يعني `profiles.role === 'admin'` ([AuthContext.tsx](<../admin-portal/src/context/AuthContext.tsx>) L22–40)، والبوابة في [AdminLayout.tsx](<../admin-portal/src/layouts/AdminLayout.tsx>) L42، والقائمة مصفوفة `menuItems` في L46–65. [AdminLoginPage.tsx](<../admin-portal/src/pages/AdminLoginPage.tsx>) يرفض غير الأدمن عبر `checkAdminRole`.
- **ثغرات مؤكدة** في [full_cash_cycle.sql](<../supabase/migrations/20261008000300_full_cash_cycle.sql>):
  - `GRANT UPDATE ON public.orders TO authenticated;` و`GRANT UPDATE ON public.driver_cash_remittances TO authenticated;` (L379–380). مع سياسة UPDATE التي أنشأها gps06 (L91–101) صار المشرف قادراً على كتابة **أي عمود** (`total`, `payment_status`…) في طلبات مستودعه، وهذا بعكس التحذير المكتوب في gps06 نفسه (L86–89).
  - `supervisor_update_order` (L266–289) لا يقيّد بالمستودع، ويقبل أي `p_status` نصي بلا مصفوفة انتقالات ولا حارس دفع. والإلغاء عبره **لا يستدعي** `release_order_resources`، فيضيع المخزون والكوبون والنقاط.
  - `supervisor_assign_driver` (L232–258) بلا تقييد للطلب أو للمندوب، ولا يتحقق من وجود المندوب أو حالته.
  - `supervisor_confirm_cash_remittance` (L172–205) بلا تقييد بالمستودع، وهو `SECURITY DEFINER` فيتجاوز RLS.
  - السياسات والـ RPC تقبل `warehouse_id IS NULL` للمشرف في `driver_cash_remittances` (L42، L50) وفي `supervisor_get_warehouse_drivers` (L221).
  - **ثغرة إضافية:** سياسة `"Drivers insert own remittances"` (L31–35) مع `GRANT SELECT, INSERT` (L63) تسمح للمندوب بإدخال صف مباشرةً بأي `status`، بما في ذلك `'confirmed'`، وبأي `warehouse_id`.
- **سياسة UPDATE مباشرة للمشرف** على `warehouse_inventory` في gps06 (L111–121). لـ `authenticated` أيضاً `SELECT, INSERT, DELETE, UPDATE` على `warehouses` و`warehouse_inventory` و`stock_transfers` في baseline، وRLS تقصرها على الأدمن.
- **بدائل كتابة مباشرة في العميل** تعمل عند فشل RPC:
  - [supervisorRepository.ts](<../src/infrastructure/repositories/supervisorRepository.ts>) L371–375 (`orders.update`)، وL398–402 (`orders.update`)، وL446–453 (`driver_cash_remittances.update`).
  - مستودع افتراضي ثابت عند الفشل في L108–113.
  - **إضافي:** [driverRepository.ts](<../src/infrastructure/repositories/driverRepository.ts>) L232–244 ينفّذ `driver_cash_remittances.insert` مباشرة.
- **المخزون:** `warehouse_inventory` مفتاحها `(warehouse_id, product_id)` و**لا يوجد `variant_id`**.
  - **تصحيح:** لا يوجد جدول `product_variants`. المتغيرات مصفوفة jsonb في `products.variants` بالشكل `[{id, name_ar, name_en?, price?}]` ([variants.sql](<../supabase/migrations/20260920001700_variants.sql>) L46–48)، والمخزون لكل منتج وليس لكل متغير ([ADR 0001](<adr/0001-variant-stock-per-product.md>)).
  - `adjust_warehouse_inventory(p_warehouse_id uuid, p_product_id uuid, p_quantity_delta integer, p_note text DEFAULT NULL, p_reorder_level integer DEFAULT NULL) RETURNS integer` و`transfer_warehouse_stock(p_from_warehouse_id uuid, p_to_warehouse_id uuid, p_product_id uuid, p_quantity integer, p_note text DEFAULT NULL) RETURNS uuid` كلتاهما `is_admin()` فقط.
  - قيد `movement_type` معرّف في [release_order_resources.sql](<../supabase/migrations/20260920000200_release_order_resources.sql>) L12–14 بالقيم: `adjustment`, `transfer_in`, `transfer_out`, `order_reservation`, `order_release`.
  - المشغّل `sync_product_stock_from_warehouses` (SECURITY DEFINER) يجعل `products.stock = SUM(warehouse_inventory.quantity)`، والمشغّل `ensure_warehouse_inventory_rows` (SECURITY DEFINER) ينشئ صفوفاً صفرية.
- **التكلفة:** الحقل الوحيد هو `products.cost_price`، مخفي عن العملاء بمنحة أعمدة في [lockdown.sql](<../supabase/migrations/20260920000100_lockdown.sql>) L51–57 ويُقرأ عبر `get_admin_products()`. لا يوجد جدول تدقيق عام.
- **التخزين:** لا توجد migration تنشئ buckets. السياسات موجودة في `supabase/storage-current.sql` فقط (bucket `products` بقراءة عامة وإدارة للأدمن). الرفع عبر `uploadPublicImage` في [catalogApi.ts](<../admin-portal/src/lib/catalogApi.ts>) L155.
- **التصنيف والعلامة نص حر** بلا فهارس ولا FK:
  - `storefront_banners.action_type` يتضمن `'category'`، والقيمة في `action_value` اسم نصي.
  - `storefront_collections.rule_type='category'` يطابق `rule_config->>'category'` نصياً ([collections.sql](<../supabase/migrations/20260920001400_collections.sql>) L56–58).
  - `promotions.target_kind` يطابق `target_value` نصياً مع `p_category`/`p_brand` داخل `effective_price`.
  - قوائم ثابتة في `mobile-app/app/(tabs)/index.tsx:21` و`mobile-app/app/categories.tsx:7`.
  - في الإدارة: حقل نصي مع `datalist` في [ProductFormPage.tsx](<../admin-portal/src/pages/products/ProductFormPage.tsx>) L148–151.
- **التسعير:**
  - `effective_price(...)` يختار أكبر تخفيض منفرد (خصم المنتج أو أفضل عرض)، **بلا تراكم**.
  - `evaluate_coupon(..., p_line_reductions, ...)` يرفض الكوبون بالسبب `not_best` إن لم يتفوق على مجموع تخفيضات البنود. وعند قبوله يُصفّر `checkout_order_safe` تسعير العروض في لقطة البنود (L221–226).
  - النقاط تُطبّق بعد الكوبون (L229–235)، والكسب عند `delivered` على `total - shipping_fee`.
  - لقطة الأسعار داخل `orders.items` (jsonb) وتحوي `promotion_id` لكل بند، ولا يوجد جدول `order_items`.
- **مسار دفع ثانٍ:** تطبيق الجوال يستدعي `checkout_order_with_growth` ([tips-api.ts](<../mobile-app/lib/tips-api.ts>) L310)، وهذه تستدعي النسخة ذات **10 معاملات** من `checkout_order_safe` (baseline L319–322)، وليس نسخة GPS ذات 12 معاملاً التي يستخدمها الويب (**تحقق** من بقائها في `pg_proc`). كل تغيير في التسعير يجب أن يغطي المسارين.
- **الاختبارات والأوامر:** `vitest` يشمل `tests/**/*.test.ts` بلا تنفيذ متوازٍ للملفات. [helpers.ts](<../tests/backend/helpers.ts>) يوفّر `creds.customer` و`creds.admin` فقط. نمط «ترقية حساب العميل مؤقتاً إلى مشرف» موجود في [warehouse-supervisor.test.ts](<../tests/backend/warehouse-supervisor.test.ts>) L58–66، وكتلة الرؤية فيه متوقفة (`describe.skip`، L7). `npm run lint` يشغّل `scripts/generate-full-schema.mjs --check`، فيجب إعادة توليد `supabase/full_schema_setup.sql` بعد كل migration.

## 2. قرارات تصميم عامة

### 2.1 دمج الدور: نُبقي القيمة المخزّنة `warehouse_supervisor` (قرار معتمد، §9)
- نُبقي القيمة `warehouse_supervisor` في `profiles.role` ونغيّر معناها وتسميتها في الواجهات إلى «مدير المستودع». السبب أن إعادة تسمية القيمة تمس 10 مواضع على الأقل في العملاء والسكربتات والاختبارات (`src/App.tsx:65`، `postLogin.ts:11`، `SupervisorLayout.tsx:13`، `CustomersPage.tsx`، `adminApi.ts:247`، `scripts/*`، الاختبارات) وتكسر النسخ المنشورة دون أي مكسب وظيفي.
- نضيف دوال بأسماء المفهوم الجديد (`is_warehouse_manager()`، `can_manage_warehouse()`)، ويصبح `is_warehouse_supervisor()` اسماً مرادفاً.
- إن أراد المالك إعادة التسمية لاحقاً فهي migration مستقلة تُجيز القيمتين مؤقتاً، ثم تنقل الصفوف، ثم تحذف القديمة.

### 2.2 واجهة مديري المستودعات: **بوابة الإدارة** (`admin-portal`) بقوائم مفلترة
التوصية: يعمل مدير المستودع داخل `admin-portal` بقائمة وصفحات مفلترة حسب الدور. أما شاشة `src/` `/supervisor` فتُجمّد (مع إصلاحها أمنياً) ثم تُلغى بعد التكافؤ. الأسباب:
- **ملاءمة الصفحات:** الفواتير متعددة البنود والموردون والمرفقات والمرتجعات وسجل الحركات صفحات مكتبية كثيفة، وبوابة الإدارة فيها نظيراتها (`InventoryPage`، `WarehousesPage`، نماذج المنتجات، `uploadPublicImage`/`downscaleImage`).
- **صفحة واحدة لا اثنتان:** الأدمن يحتاج الصفحات نفسها لمراجعة كل الفواتير وإلغائها، فبناؤها مرة واحدة مع فلترة بالنطاق يمنع التكرار.
- **حال شاشة `src/`:** صفحة واحدة (`SupervisorHomePage.tsx`) مبنية على مستودع مليء بالبدائل الخطرة والبيانات الاحتياطية الثابتة، وتطبيق `src/` مخصص أصلاً للعملاء والمناديب.
- **الأمان لا يتأثر:** كل صفحات الأدمن الأخرى تستدعي RPC تفحص `is_admin()` أو جداول بسياسات RLS للأدمن، فمدير المستودع الذي يكتب مساراً يدوياً سيرى خطأ صلاحية. الحماية في قاعدة البيانات، والفلترة في الواجهة للتجربة فقط.

### 2.3 أعراف migrations (مطابقة للحالي)
- **أعراف الدوال:**
  - `LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'`.
  - `REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon;` ثم `GRANT EXECUTE ... TO authenticated, service_role;`.
  - الدوال الداخلية تُمنح لـ `service_role` فقط (مثل `effective_price`).
- **تغيير التوقيع:** يتطلب `DROP FUNCTION` قبل `CREATE` لتجنب التحميل الزائد الملتبس (السابقة: `20261001000500_fix_admin_save_coupon_overload.sql`). المعاملات الجديدة تُضاف في النهاية بقيم افتراضية حتى تظل الاستدعاءات بالأسماء القديمة صالحة.
- **ملحقات كل migration:** تعليق `-- DOWN (manual):` في آخر الملف، ثم تشغيل `node scripts/generate-full-schema.mjs`، ثم إعادة توليد `admin-portal/src/lib/database.types.ts` و`src/infrastructure/supabase/database.types.ts` بـ `supabase gen types typescript`.
- **سياسات RLS:** تستخدم `= ANY ((SELECT public.my_warehouse_ids())::uuid[])` (initplan؛ بدون `::uuid[]` يُفسَّر كاستعلام فرعي ويفشل بـ `uuid = uuid[]`) بدل استدعاء دالة لكل صف.

## 3. تسلسل ملفات الـ migrations

| # | الملف | المرحلة | الملاحظات |
|---|---|---|---|
| 1 | `20261018000100_warehouse_manager_access.sql` | 1 | — |
| 2 | `20261018000200_close_supervisor_security_holes.sql` | 1 | 4، 11 |
| 3 | `20261018000300_scoped_inventory_rpcs.sql` | 1 | — |
| 4 | `20261018000400_driver_cash_ledger.sql` | 1b | 18، 19 |
| 5 | `20261018000500_delivery_code_verification.sql` | 1b | 17 |
| 6 | `20261018000600_affiliate_commission_lifecycle_payouts.sql` | 1b | 1، 2 |
| 7 | `20261018000700_refund_cap_by_returned_items.sql` | 1b | 3 |
| 8 | `20261018000800_admin_verify_payment_atomic.sql` | 1b | 5، 7 |
| 9 | `20261018000900_checkout_idempotency_payload_hash.sql` | 1b | 24 |
| 10 | `20261019000100_categories_brands_schema.sql` | 2 | — |
| 11 | `20261019000200_categories_brands_backfill_sync.sql` | 2 | — |
| 12 | `20261019000300_categories_brands_readers.sql` | 2 | — |
| 13 | `20261020000100_suppliers_purchase_invoices.sql` | 3 | — |
| 14 | `20261020000200_purchase_approval_average_cost.sql` | 3 | — |
| 15 | `20261020000300_supplier_returns_and_void.sql` | 3 | — |
| 16 | `20261020000400_order_line_costs_profit_report.sql` | 3 | — |
| 17 | `20261021000100_promotion_types_schema.sql` | 4 | — |
| 18 | `20261021000200_cart_promotions_pricing.sql` | 4 | — |
| 19 | `20261022000100_order_eta_needs_action.sql` | 5 | 9، 13 |
| 20 | `20261022000200_packing_handover_proof.sql` | 5 | 12، 21 |
| 21 | `20261022000300_staff_notifications_low_stock.sql` | 5 | 15 |
| 22 | `20261022000400_staff_ops_reads.sql` | 5 | 15، 21 |
| 23 | `20261022000500_staff_push_tokens_assignment_push.sql` | 5 | 21 |
| 24 | `20261023000100_customer_addresses.sql` | 6 | 29 |
| 25 | `20261023000200_paginated_product_reviews.sql` | 6 | 29 |
| 26 | `20261023000300_checkout_location_fallback.sql` | 6 | 26 (مشروطة بقرار §9.2) |
| 27 | `20261024000100_admin_audit_log.sql` | 7 | 8 |
| 28 | `20261024000200_admin_paginated_lists_bulk_actions.sql` | 7 | 8 |

- تُطبَّق الـ migrations بترتيب أسمائها. إن قُدّمت مرحلة على أخرى، مثل نشر المرحلة 5 قبل 2، تُعاد تسمية ملفاتها بطابع زمني يحفظ ترتيب النشر الفعلي، ولا يُعاد استخدام رقم سابق.
- الدوال التي تُعاد كتابتها في أكثر من مرحلة يجب أن تحمل كل منطق المراحل السابقة:
  - `update_driver_order_status`: 1b ثم 5.
  - `checkout_order_safe`: 1b ثم 4 ثم 6.
  - `get_my_deliveries`: 1b ثم 5.
  - `supervisor_update_order`: 1 ثم 5.
  - `review_order_return`: 1b فقط.

---

## 4. المرحلة 1 — الصلاحيات وإغلاق الثغرات

### 4.1 نموذج البيانات
```sql
CREATE TABLE public.warehouse_manager_access (
  user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  is_primary   boolean NOT NULL DEFAULT false,
  granted_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at   timestamptz NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (user_id, warehouse_id)
);
CREATE UNIQUE INDEX warehouse_manager_access_one_primary ON public.warehouse_manager_access (user_id) WHERE is_primary;
CREATE INDEX warehouse_manager_access_warehouse_idx ON public.warehouse_manager_access (warehouse_id);
```
- **تعبئة أولية:** `INSERT ... SELECT id, assigned_warehouse_id, true FROM profiles WHERE role='warehouse_supervisor' AND assigned_warehouse_id IS NOT NULL`.
- **توافق خلفي:** يبقى `profiles.assigned_warehouse_id` معبّراً عن المستودع الأساسي (`is_primary`) ويُحدَّث من RPC الإسناد، فتظل `my_warehouse_id()` وشاشة `/supervisor` تعملان.
- **RLS:** `SELECT` للأدمن، وللمستخدم على صفوفه (`user_id = auth.uid()`). لا منح كتابة لـ `authenticated`، والكتابة عبر RPC فقط.

### 4.2 الدوال المساعدة
- `public.is_warehouse_manager() RETURNS boolean`: STABLE SECURITY DEFINER، وتعني `role = 'warehouse_supervisor'`. وتُعاد كتابة `is_warehouse_supervisor()` لتستدعيها.
- `public.my_warehouse_ids() RETURNS uuid[]`: مصفوفة مستودعات المدير، وفارغة لغيره.
- `public.can_manage_warehouse(p_warehouse_id uuid) RETURNS boolean`: تعطي `p_warehouse_id IS NOT NULL AND (is_admin() OR (is_warehouse_manager() AND p_warehouse_id = ANY(my_warehouse_ids())))`. القيمة `NULL` لا تطابق أبداً لغير الأدمن.
- `public.my_warehouse_id()`: تبقى للتوافق وتُرجع المستودع الأساسي.
- `public.get_my_staff_context() RETURNS jsonb`: تُرجع `{role, is_admin, is_warehouse_manager, warehouses:[{id,name,code,is_primary}]}`، والأدمن يحصل على كل المستودعات النشطة.
- `public.driver_outstanding_cod(p_driver_id uuid) RETURNS numeric`: داخلية لـ `service_role`. تجمع `total` لطلبات `COD` المسلّمة للمندوب ناقص مجموع التسويات `confirmed`. تُعاد كتابتها في المرحلة 1b لتقرأ من دفتر النقد (§4b.1)، والتوقيع لا يتغير.

### 4.3 RPCs الإسناد (أدمن فقط)
- **`public.admin_set_warehouse_manager_access(p_user_id uuid, p_warehouse_ids uuid[], p_primary_warehouse_id uuid DEFAULT NULL) RETURNS void`**
  - **الحراسة:** `is_admin()`. تُرفض الحسابات بدور `admin` أو `driver`، وكذلك المستخدم غير الموجود، وأي مستودع غير موجود أو غير نشط، وأي `p_primary_warehouse_id` ليس ضمن المصفوفة.
  - **الأثر:** المصفوفة الفارغة تحذف الصفوف وتعيد الدور إلى `customer` مع `assigned_warehouse_id = NULL`. غير ذلك يضبط الدور على `warehouse_supervisor` ويستبدل الصفوف ويحدّث `assigned_warehouse_id`.
- **`public.admin_set_warehouse_supervisor(p_user_id uuid, p_warehouse_id uuid)`:** يُعاد تنفيذها كغلاف حول الدالة السابقة (`ARRAY[p_warehouse_id]` أو `'{}'`)، فتبقى اختبارات [warehouse-supervisor.test.ts](<../tests/backend/warehouse-supervisor.test.ts>) L42–72 صالحة.
- **`public.admin_list_warehouse_managers() RETURNS TABLE(user_id uuid, full_name text, email text, phone text, warehouse_ids uuid[], primary_warehouse_id uuid)`:** تحل محل القراءة المباشرة في `fetchWarehouseSupervisors` ([adminApi.ts](<../admin-portal/src/lib/adminApi.ts>) L243).

### 4.4 إغلاق الثغرات (`20261018000200_close_supervisor_security_holes.sql`)
- **سحب المنح:**
  ```sql
  REVOKE UPDATE ON public.orders FROM authenticated;
  REVOKE INSERT, UPDATE ON public.driver_cash_remittances FROM authenticated;
  REVOKE INSERT, UPDATE, DELETE ON public.warehouse_inventory, public.stock_transfers FROM authenticated;
  ```
  لا يوجد كود عميل يكتب `warehouse_inventory` أو `stock_transfers` مباشرة؛ `catalogApi.ts` يقرأ فقط ويعدّل عبر RPC. مشغّلات الإدراج والمزامنة `SECURITY DEFINER` فلا تتأثر.
- **حذف السياسات:**
  - `"Warehouse supervisors update own warehouse orders"`
  - `"Warehouse supervisors update own warehouse inventory"`
  - `"Supervisors update warehouse remittances"`
  - `"Drivers insert own remittances"`: الإدخال يتم فقط عبر `driver_submit_cash_remittance`، وهي SECURITY DEFINER.
- **إعادة كتابة سياسات SELECT بالنطاق المتعدد ودون `IS NULL`:**
  - `orders`: `is_warehouse_manager() AND fulfillment_warehouse_id = ANY ((SELECT public.my_warehouse_ids()))`.
  - `warehouse_inventory`: الشرط نفسه على `warehouse_id`.
  - `driver_cash_remittances`: الشرط نفسه على `warehouse_id`. التسويات ذات المستودع `NULL` للأدمن فقط.
  - جديدة: `inventory_movements` و`stock_transfers` (المصدر أو الوجهة ضمن النطاق) للقراءة.
  - `warehouses`: قراءة المدير لمستودعاته (**تحقق** من سياسة القراءة الحالية لـ `warehouses` قبل الإضافة).
- **`supervisor_update_order`:** `DROP FUNCTION public.supervisor_update_order(uuid, text, text);` ثم إنشاء:
  `public.supervisor_update_order(p_order_id uuid, p_status text DEFAULT NULL, p_notes text DEFAULT NULL, p_expected_status text DEFAULT NULL) RETURNS void`
  - **قفل وتقييد:** `SELECT ... FOR UPDATE`، ثم `can_manage_warehouse(v_order.fulfillment_warehouse_id)`، ثم `p_expected_status` (قفل تفاؤلي مثل `admin_update_order_operation`).
  - **مصفوفة انتقالات المدير** (مجموعة جزئية من [payment_guard.sql](<../supabase/migrations/20260924000600_payment_guard.sql>) L89–95):
    - `new→confirmed|cancelled`
    - `confirmed→preparing|cancelled`
    - `preparing→shipped|cancelled`
    - `delivery_failed→confirmed|cancelled`
  - **محظور على المدير:** `delivered` (يحددها المندوب عبر `update_driver_order_status` أو الأدمن)، وأي تعديل على `payment_status` أو `financial_status`.
  - **الشحن والإلغاء:** `shipped` يتطلب `driver_id`. الإلغاء يرفضه المدير إن كان `payment_status='paid'` والطريقة ليست `COD` (يحتاج استرداداً، فهو للأدمن)، ويستدعي `release_order_resources(p_order_id)`.
  - **الملاحظات:** تُكتب في `orders.notes` فقط قبل `shipped`، وتُسجَّل دائماً في `order_status_history`. في المرحلة 5 تنتقل إلى `orders.staff_note` حتى لا تُمس ملاحظة العميل (§7b.1).
- **`supervisor_assign_driver(p_order_id uuid, p_driver_id uuid)`** بالتوقيع نفسه:
  - قفل الطلب، ثم `can_manage_warehouse(order.fulfillment_warehouse_id)`.
  - المندوب موجود وحالته `active` أو `busy` (`FOR UPDATE`)، و`drivers.warehouse_id = order.fulfillment_warehouse_id`. المندوب بلا مستودع للأدمن فقط.
  - الحالة ضمن `new|confirmed|preparing|delivery_failed`، والانتقال وفق المصفوفة السابقة.
- **`supervisor_confirm_cash_remittance`** بالتوقيع نفسه:
  - قفل التسوية، ثم `can_manage_warehouse(remittance.warehouse_id)`.
  - رفض التأكيد إن تجاوز `amount` قيمة `driver_outstanding_cod(driver_id)` (الأدمن يتجاوز بملاحظة إلزامية).
  - ضبط `confirmed_by` و`confirmed_at` للتأكيد والرفض معاً.
- **`supervisor_get_warehouse_drivers`:** `DROP` ثم `(p_warehouse_id uuid DEFAULT NULL)`. يُستبعد `warehouse_id IS NULL` لغير الأدمن، ويُرفض أي `p_warehouse_id` خارج النطاق. الاستدعاء بلا معاملات يظل صالحاً.
- **`get_warehouse_settlement_summary`:** `DROP` ثم `(p_start date DEFAULT ..., p_end date DEFAULT ..., p_warehouse_id uuid DEFAULT NULL)` مع `can_manage_warehouse`. المدير بلا معامل يحصل على مجموع مستودعاته.
  - **الملاحظة 4:** الدالة غير مستدعاة اليوم في `admin-portal/src` ولا في `src/`. الأدمن يضبط `v_warehouse_id := NULL` بمعنى «كل المستودعات» ([full_cash_cycle.sql](<../supabase/migrations/20261008000300_full_cash_cycle.sql>) L309–315، والفلاتر `v_warehouse_id IS NULL OR ...` في L338 وL360 وL367)، وهذا ما زال صحيحاً للأدمن وحده. أما المدير الذي يُرجع له `my_warehouse_id()` القيمة `NULL` فيرى كل المستودعات اليوم، والصيغة الجديدة تمنع ذلك.
  - **الملاحظة 11:** يضاف لكل مندوب في المخرجات `outstanding_cod` من `driver_outstanding_cod`، أي النقد المتوقع تسليمه.

### 4.5 RPCs المخزون بالنطاق (`20261018000300_scoped_inventory_rpcs.sql`)
- **`adjust_warehouse_inventory`** بالتوقيع نفسه، والحارس `can_manage_warehouse(p_warehouse_id)`. `p_note` إلزامي لغير الأدمن. المدير لا يغيّر `p_reorder_level` لمستودع خارج نطاقه.
- **`transfer_warehouse_stock`** بالتوقيع نفسه، والحارس `can_manage_warehouse(p_from_warehouse_id)`. الوجهة يجب أن تكون نشطة.

### 4.6 بوابة الإدارة
- **[AuthContext.tsx](<../admin-portal/src/context/AuthContext.tsx>):** يُستبدل `checkAdminRole` بـ `checkStaffAccess` الذي يستدعي `get_my_staff_context`، ويعرض `role` و`isAdmin` و`isWarehouseManager` و`managedWarehouses`. ويُحدَّث [AdminLoginPage.tsx](<../admin-portal/src/pages/AdminLoginPage.tsx>) L10–26 ليقبل الدورين.
- **[AdminLayout.tsx](<../admin-portal/src/layouts/AdminLayout.tsx>):**
  - البوابة تصبح `!user || !(isAdmin || isWarehouseManager)`.
  - كل عنصر في `menuItems` يأخذ حقل `access: 'admin' | 'staff'` ويُفلتر.
  - التسمية «مدير المستودع» في الشريط العلوي، مع اسم المستودع أو المستودعات.
- **[App.tsx](<../admin-portal/src/App.tsx>):**
  - مكوّن `RequireAdmin` يغلف المسارات الإدارية فقط ويعيد المدير إلى `/inventory`.
  - مسار الفهرس يتحول حسب الدور.
  - مسار جديد `warehouse-cash`.
- **قائمة المدير:** `/orders`، `/inventory`، `/warehouse-cash`، ثم في المرحلة 3: `/purchases`، `/suppliers`، `/supplier-returns`.
- **الصفحات:**
  - [OrderListPage.tsx](<../admin-portal/src/pages/orders/OrderListPage.tsx>): القراءة تعمل عبر سياسة SELECT المقيّدة. **تحقق** أن `ORDER_LIST_COLUMNS` و`ORDER_DETAIL_COLUMNS` لا تضم علاقات لا يقرؤها المدير.
    - **الملاحظة 10:** شاشة `/supervisor` تجلب مرة واحدة ([SupervisorHomePage.tsx](<../src/presentation/pages/supervisor/SupervisorHomePage.tsx>) L115–117) وتقص عند 50 ([supervisorRepository.ts](<../src/infrastructure/repositories/supervisorRepository.ts>) L130) بلا Realtime ولا استطلاع. لا نصلحها لأنها ستُلغى.
    - بوابة الإدارة لديها أصلاً اشتراك حي على `orders` ([adminApi.ts](<../admin-portal/src/lib/adminApi.ts>) L309) وترقيم، فيرثهما المدير. **تحقق** أن أحداث `postgres_changes` تصل المدير بعد سياسة SELECT الجديدة، لأن Realtime يطبّق RLS.
  - [OrderDetailPage.tsx](<../admin-portal/src/pages/orders/OrderDetailPage.tsx>): للمدير، تُوجَّه الأزرار إلى `supervisor_update_order` و`supervisor_assign_driver`، وتُخفى أزرار الدفع والاسترداد والحذف.
  - [InventoryPage.tsx](<../admin-portal/src/pages/InventoryPage.tsx>): محدد المستودع يقتصر على `managedWarehouses`، ويضاف تبويب «سجل الحركات» من `inventory_movements`.
  - صفحة جديدة `admin-portal/src/pages/WarehouseCashPage.tsx` (`access: 'staff'`): التسويات وتأكيدها أو رفضها، وملخص `get_warehouse_settlement_summary`. تُنقل وظائفها من `SupervisorHomePage.tsx`. وهي أيضاً شاشة التسويات المفقودة للأدمن (الملاحظة 4)، إذ لا توجد في `admin-portal/src/pages` أي شاشة تسويات اليوم.
    - **الفلاتر:** الحالة والمستودع والمندوب. للأدمن خيار إضافي «بلا مستودع» للتسويات ذات `warehouse_id IS NULL`.
    - **شارات حالة صحيحة (الملاحظة 11):** `submitted` = «بانتظار التأكيد»، و`confirmed` = «مؤكدة»، و`rejected` = «مرفوضة». السبب أن `SupervisorHomePage.tsx` L909 وL923–925 تعرض كل ما ليس `submitted`، ومنه المرفوض، بعبارة «تم التأكيد ✓».
    - **زرا «تأكيد» و«رفض»:** الرفض بملاحظة إلزامية. الـ RPC تقبل `p_action='rejected'` أصلاً (`full_cash_cycle.sql` L172–205)، والنقص في العميل وحده، فـ `supervisorRepository.ts` L432–454 لا ينفّذ إلا التأكيد. يُعطَّل الزر أثناء الطلب، بخلاف `handleConfirmRemittance` (L227–237) الذي لا يملك حالة انشغال.
    - **عمود «النقد المتوقع» لكل مندوب** من `outstanding_cod`، مع تنبيه حين تتجاوز التسوية القيمة المتوقعة. البطاقة الحالية تعرض المبلغ المُرسل فقط (L918–944).
    - **التحديث:** Realtime على `driver_cash_remittances` إن كانت ضمن publication `supabase_realtime` **(تحقق)**، وإلا استطلاع كل 30 ثانية ما دامت الصفحة ظاهرة.
  - [WarehousesPage.tsx](<../admin-portal/src/pages/WarehousesPage.tsx>) و[CustomersPage.tsx](<../admin-portal/src/pages/CustomersPage.tsx>): إسناد متعدد المستودعات عبر `admin_set_warehouse_manager_access`، والتسمية «مدير مستودع» (`CustomersPage.tsx:41`، `:216`).
- **[adminApi.ts](<../admin-portal/src/lib/adminApi.ts>):** إضافة `fetchStaffContext`، و`setWarehouseManagerAccess`، و`fetchWarehouseManagers`، و`supervisorUpdateOrder`، و`supervisorAssignDriver`، و`fetchWarehouseRemittances`، و`confirmRemittance`، و`fetchSettlementSummary`.

### 4.7 تغييرات `src/` و`mobile-app`
- **[supervisorRepository.ts](<../src/infrastructure/repositories/supervisorRepository.ts>):** حذف البدائل في L367–375 وL390–402 وL442–453، وحذف المستودع الثابت في L108–113، مع رمي الخطأ المترجم عبر `src/application/errors`.
  - **إضافي (الملاحظة 14):** حذف بديل المخزون الوهمي في L294–305. حين لا توجد صفوف للمستودع، يملأ هذا البديل المخزون العام من `get_public_products` بقيمة ثابتة `reorderLevel: 5`.
  - حذف الافتراضي `?? 5` في L288–289 أيضاً، لأن الافتراضي في القاعدة 0 (baseline L1759).
  - النتيجة الفارغة تُعرض «لا مخزون مسجّل لهذا المستودع».
- **إشعار العميل عند تغيير المدير للحالة (الملاحظة 16):**
  - [order-status-push/index.ts](<../supabase/functions/order-status-push/index.ts>) L128–129 تقبل `role === 'admin'` أو المندوب المسند فقط، وتُرجع 403 لغيرهما.
  - الإشعار يأتي من المشغّل `on_order_delivery_status_push` (baseline L2164، والدالة L1114)، الذي يمرّر JWT المستدعي عند `shipped`/`delivered`.
  - النتيجة: حين ينقل المدير الطلب إلى `shipped` (مسموح له في §4.4) لا يصل الإشعار للعميل.
  - **الإصلاح:** تقبل الدالة أيضاً المستدعي الذي يُرجع له `supabase.rpc('can_manage_warehouse', { p_warehouse_id: order.fulfillment_warehouse_id })` القيمة `true` بـ JWT الخاص به. ثم النشر بـ `supabase functions deploy order-status-push`.
  - **تحقق** أن المشغّل ما زال موجوداً على القاعدة الحية، وأن الدالة المنشورة تطابق المستودع.
- **[driverRepository.ts](<../src/infrastructure/repositories/driverRepository.ts>):** حذف بديل الإدراج في L228–244.
- **`/supervisor`:** تبقى بعد إصلاحها حتى نهاية المرحلة 3. بعدها تعرض [SupervisorLayout.tsx](<../src/presentation/pages/supervisor/SupervisorLayout.tsx>) رسالة تحويل إلى بوابة الإدارة، ثم تُحذف الصفحتان والمستودع (مهمة تنظيف في §8).
- **`mobile-app`:** لا توجد شاشات مشرف أو مندوب، فلا تغيير.

### 4.8 المهام
- [ ] كتابة `20261018000100_warehouse_manager_access.sql`: الجدول، والتعبئة، والدوال المساعدة، و`get_my_staff_context`، و`admin_set_warehouse_manager_access`، والغلاف، و`admin_list_warehouse_managers`.
- [ ] كتابة `20261018000200_close_supervisor_security_holes.sql`: REVOKE، وحذف السياسات، وسياسات SELECT الجديدة، و`driver_outstanding_cod`، وإعادة كتابة الدوال الخمس.
- [ ] كتابة `20261018000300_scoped_inventory_rpcs.sql`.
- [ ] **تحقق** على القاعدة الحية بعد التطبيق: `SELECT grantee, privilege_type FROM information_schema.role_table_grants WHERE table_name IN ('orders','driver_cash_remittances','warehouse_inventory','stock_transfers') AND grantee='authenticated';`.
- [ ] إزالة بدائل الكتابة في `supervisorRepository.ts` و`driverRepository.ts`، وبديل المخزون الوهمي (L288–305).
- [ ] تنفيذ AuthContext وAdminLayout وApp وصفحات المدير و`WarehouseCashPage.tsx` (للأدمن والمدير، بالشارات والرفض وحالة الانشغال والنقد المتوقع).
- [ ] توسيع تفويض `supabase/functions/order-status-push/index.ts` ليشمل المدير بالنطاق، ثم نشر الدالة.
- [ ] تحديث `WarehousesPage.tsx` و`CustomersPage.tsx` للإسناد المتعدد.
- [ ] تحديث `scripts/assign-test-roles.sql` و`scripts/create-test-users.mjs` لإدراج صف في `warehouse_manager_access`.
- [ ] إعادة توليد `supabase/full_schema_setup.sql` وملفات `database.types.ts`.

### 4.9 المخاطر
- إزالة البدائل تُظهر أخطاء كانت مخفية. إن كانت دوال `supervisor_*` غير مطبّقة على بيئة ما فستفشل الشاشة صراحة، وهذا هو المطلوب، مع رسالة واضحة.
- `driver_outstanding_cod` قد يرفض تسويات صحيحة إن كانت بيانات `COD` التاريخية ناقصة. التخفيف: تجاوز الأدمن بملاحظة، وتشغيل استعلام فحص قبل النشر.
- سياسات SELECT الجديدة على `orders` تُقيَّم في كل استعلام. صيغة `ANY ((SELECT ...))` تمنع التقييم لكل صف.

### 4.10 معايير القبول
- [ ] **توسيع [warehouse-supervisor.test.ts](<../tests/backend/warehouse-supervisor.test.ts>) (الملاحظة 31):** يُرقّى `creds.customer` مؤقتاً إلى مدير `KRT` بنمط L58–66 ويُعاد في `afterAll`. السطر L7 فيه `const supervisorSuite = describe.skip;` دون أي شرط، فيُستبدل بالشرط `haveCreds ? describe : describe.skip` المستخدم في L5. الحالات:
  - المدير لا يرى طلبات أو مخزون `PZU`.
  - `supervisor_update_order` على طلب `PZU` يُرفض، وكذلك `p_status='delivered'` أو قيمة عشوائية.
  - الإلغاء يعيد المخزون (مقارنة `warehouse_inventory`).
  - `supervisor_assign_driver` بمندوب من مستودع آخر أو غير نشط يُرفض.
  - `.from('orders').update(...)` و`.from('warehouse_inventory').update(...)` تفشلان بخطأ صلاحية.
  - `adjust_warehouse_inventory` على `PZU` يُرفض.
  - الإسناد المتعدد عبر `admin_set_warehouse_manager_access` يوسّع الرؤية.
- [ ] **توسيع [full-cash-cycle.test.ts](<../tests/backend/full-cash-cycle.test.ts>):** إدراج المندوب مباشرة في `driver_cash_remittances` بالحالة `status='confirmed'` يُرفض، وتأكيد تسوية تتجاوز الرصيد يُرفض. وتبقى الخطوات 1–8 ناجحة.
- [ ] `tests/backend/orders.test.ts` و`driver-flow.test.ts` و`stale-orders.test.ts` تبقى ناجحة.
- [ ] **يدوي:**
  - المدير يؤكد تسوية ويرفض أخرى، فتظهر المرفوضة «مرفوضة»، والنقر المزدوج لا يرسل طلبين.
  - نقل المدير طلباً إلى `shipped` يوصل إشعاراً للعميل، أو يظهر 200 في سجل الدالة.
  - الأدمن يرى تسويات كل المستودعات وتسويات «بلا مستودع».
- [ ] الأوامر: `npm run typecheck`، `npm run lint`، `npm test`، `npm run test:backend`، `npm --prefix admin-portal run typecheck`، `npm --prefix admin-portal run build`.

---

## 4b. المرحلة 1b — إصلاحات مالية وأمنية عاجلة (الملاحظات 1–3، 5–7، 17–19، 22، 24)

> تُنشر بعد المرحلة 1 مباشرة وقبل المرحلة 2، لأنها تعتمد على `can_manage_warehouse` و`driver_outstanding_cod`. كل migration فيها مستقلة وقابلة للنشر وحدها مع تغييرات العميل المرافقة لها. الأقسام 4b.5 (جزء العميل) و4b.6 و4b.8 تغييرات عميل فقط.

### 4b.1 دفتر نقد المندوب (`20261018000400_driver_cash_ledger.sql`) — الملاحظتان 18 و19
- **التحقق من الكود:**
  - `update_driver_order_status` يضبط `payment_status='paid'` و`financial_status='paid'` لطلب COD عند التسليم ([full_cash_cycle.sql](<../supabase/migrations/20261008000300_full_cash_cycle.sql>) L104–108).
  - `get_my_deliveries` يُرجع `cod_amount` فقط حين `payment_status='pending'` ([driver_rpc_product_ids.sql](<../supabase/migrations/20261008000200_driver_rpc_product_ids.sql>) L35)، ويعرض المسلَّم والمتعذر لآخر 24 ساعة متحركة فقط (L45–46).
  - درج النقد في [DriverHomePage.tsx](<../src/presentation/pages/driver/DriverHomePage.tsx>) L128–130 يجمع `codAmount` للطلبات المسلّمة، لكنها تصل دائماً بقيمة `null`، فيكون **المجموع صفراً دائماً**.
  - `driver_submit_cash_remittance` لا يفحص إلا `p_amount <= 0` (L152)، والجدول (L7–19) بلا فهرس يمنع تسويتين `submitted` للمندوب نفسه.
- **نموذج البيانات:**
  ```sql
  CREATE TABLE public.driver_cash_ledger (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id     uuid NOT NULL REFERENCES public.drivers(id) ON DELETE RESTRICT,
    warehouse_id  uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
    entry_type    text NOT NULL CHECK (entry_type IN ('cod_collected','remittance_confirmed','adjustment')),
    amount        numeric(14,2) NOT NULL CHECK (amount <> 0),
    order_id      uuid REFERENCES public.orders(id) ON DELETE RESTRICT,
    remittance_id uuid REFERENCES public.driver_cash_remittances(id) ON DELETE RESTRICT,
    business_date date NOT NULL,
    note          text,
    created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at    timestamptz NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT driver_cash_ledger_shape CHECK (
      (entry_type = 'cod_collected' AND order_id IS NOT NULL AND amount > 0)
      OR (entry_type = 'remittance_confirmed' AND remittance_id IS NOT NULL AND amount < 0)
      OR (entry_type = 'adjustment' AND note IS NOT NULL))
  );
  CREATE UNIQUE INDEX driver_cash_ledger_order_unique ON public.driver_cash_ledger (order_id) WHERE entry_type = 'cod_collected';
  CREATE UNIQUE INDEX driver_cash_ledger_remittance_unique ON public.driver_cash_ledger (remittance_id) WHERE entry_type = 'remittance_confirmed';
  CREATE INDEX driver_cash_ledger_driver_day_idx ON public.driver_cash_ledger (driver_id, business_date);
  CREATE UNIQUE INDEX driver_cash_remittances_one_submitted ON public.driver_cash_remittances (driver_id) WHERE status = 'submitted';
  ```
  - **يوم العمل:** `public.business_date(p_ts timestamptz) RETURNS date` (STABLE) = `(p_ts AT TIME ZONE 'Africa/Khartoum')::date`. المنطقة **(تحقق)**، انظر §9.2.
  - **RLS:**
    - `SELECT` للأدمن، وللمدير بنطاق `warehouse_id`، وللمندوب على صفوفه.
    - لا منح كتابة لـ `authenticated`.
  - **قبل الفهرس الفريد:** **تحقق** بالاستعلام `SELECT driver_id, count(*) FROM driver_cash_remittances WHERE status='submitted' GROUP BY 1 HAVING count(*) > 1;`، ويُعالَج المكرر يدوياً.
- **الكتابة في الدفتر عبر الدوال فقط:**
  - `update_driver_order_status`: عند `delivered` لطلب COD يُدرج `cod_collected` بقيمة `orders.total` مع `ON CONFLICT DO NOTHING`. تبقى `payment_status='paid'` كما هي لأن العميل دفع فعلاً، أما عهدة النقد فتُتتبع في الدفتر.
  - `supervisor_confirm_cash_remittance` (بصيغة المرحلة 1): عند `confirmed` يُدرج `remittance_confirmed` بقيمة سالبة.
  - `public.admin_adjust_driver_cash(p_driver_id uuid, p_amount numeric, p_note text) RETURNS uuid`: للأدمن فقط، والملاحظة إلزامية.
- **`driver_outstanding_cod`:** تُعاد كتابتها لتصبح `SUM(amount)` من الدفتر.
- **التعبئة الأولية:**
  - `cod_collected` لكل طلب COD `delivered` له `driver_id`، ويوم العمل من أول صف `delivered` في `order_status_history`.
  - `remittance_confirmed` لكل تسوية `confirmed`.
  - استعلام مطابقة مع المعادلة القديمة قبل النشر، وتقرير بالفروق.
- **`driver_submit_cash_remittance`** بالتوقيع نفسه:
  - قفل صف المندوب `FOR UPDATE`.
  - رفض إن وُجدت له تسوية `submitted`.
  - رفض إن تجاوز `p_amount` قيمة `driver_outstanding_cod(v_driver_id)`.
- **قراءة المندوب:** `public.get_my_cash_position(p_business_date date DEFAULT NULL) RETURNS jsonb`، وتُرجع `{business_date, opening_balance, collected, remitted_confirmed, pending_submitted, closing_balance, entries:[{order_number, entry_type, amount, created_at}]}`.
- **`get_my_deliveries`:** `DROP` ثم `CREATE`:
  - `cod_amount` = `o.total` لكل طلب COD أياً كانت `payment_status`.
  - عمود جديد `cod_collected boolean` في **نهاية** `RETURNS TABLE`.
  - نافذة المسلَّم والمتعذر تصبح يوم العمل الحالي بدل 24 ساعة متحركة.
- **الواجهات:**
  - `DriverHomePage.tsx` L128–130 يقرأ `get_my_cash_position` عبر دالة جديدة `fetchMyCashPosition` في `driverRepository.ts` بدل الجمع المحلي.
  - نموذج التسوية يقترح `closing_balance` ويمنع الإرسال إن وُجدت تسوية معلّقة.
  - `get_warehouse_settlement_summary` و`WarehouseCashPage` (المرحلة 1) تقرآن الدفتر، والأدمن يرى قيود كل مندوب وزر «تعديل الدفتر».

### 4b.2 رمز التسليم المُتحقق منه في الخادم (`20261018000500_delivery_code_verification.sql`) — الملاحظة 17
- **التحقق من الكود:**
  - `generate12DigitDeliveryCode` في [OrderDeliveryQRCode.tsx](<../src/presentation/components/orders/OrderDeliveryQRCode.tsx>) L17–36 تجزئة حتمية لـ `orderId:orderNumber:tips-beauty` بملح ثابت.
  - [BarcodeScannerModal.tsx](<../src/presentation/components/driver/BarcodeScannerModal.tsx>) يستوردها (L5) ويتحقق محلياً (`validateDeliveryCode`، L20–31)، فيستطيع المندوب توليد رمز أي طلب.
  - البوابة الوحيدة علم الواجهة `barcodeVerified` ([DriverOrderPage.tsx](<../src/presentation/pages/driver/DriverOrderPage.tsx>) L505–508).
  - `update_driver_order_status` (`full_cash_cycle.sql` L69–134) لا يستقبل أي رمز.
- **نموذج البيانات:**
  ```sql
  CREATE TABLE public.order_delivery_codes (
    order_id        uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
    code_hash       text NOT NULL,
    issued_at       timestamptz NOT NULL DEFAULT timezone('utc', now()),
    failed_attempts integer NOT NULL DEFAULT 0,
    verified_at     timestamptz,
    override_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    override_reason text
  );
  ALTER TABLE public.order_delivery_codes ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.app_settings ADD COLUMN require_delivery_code boolean NOT NULL DEFAULT false;
  ```
  - لا سياسات ولا منح لـ `authenticated`، والوصول عبر دوال SECURITY DEFINER فقط.
  - التجزئة بـ `crypt(code, gen_salt('bf'))`. **تحقق** من وجود `pgcrypto` ومن الـ schema الذي يحويها (`extensions` غالباً).
- **إصدار الرمز:** 12 رقماً عشوائياً من `gen_random_bytes`، فتبقى صيغة الماسح الحالية صالحة. يُخزَّن الـ hash فقط، والنص الصريح لا يصل إلا للعميل:
  - عند انتقال الطلب إلى `shipped`، داخل `update_driver_order_status`، يُصدَر الرمز ويُرسل في `create_customer_notification`، وهو صف يملكه العميل.
  - `public.customer_issue_delivery_code(p_order_id uuid) RETURNS text`:
    - لصاحب الطلب فقط (`orders.customer_id = auth.uid()`، **تحقق** اسم العمود)، والحالة ضمن `confirmed|preparing|shipped`.
    - يستبدل `code_hash` ويصفّر `failed_attempts` ويُرجع النص الصريح مرة واحدة.
    - حد معدل: إصدار كل 60 ثانية، والإصدار الجديد يُبطل السابق.
- **التحقق عند التسليم:** `update_driver_order_status`: `DROP` ثم `CREATE` بإضافة `p_delivery_code text DEFAULT NULL` في النهاية:
  - عند `delivered` مع تفعيل `require_delivery_code`: يُشترط رمز مطابق أو `override_by` مضبوط.
  - الرمز الخاطئ يزيد `failed_attempts`، وعند 5 محاولات يُقفل ويُطلب تجاوز.
  - النجاح يضبط `verified_at` ويُسجَّل في `order_status_history`.
- **التجاوز:** `public.staff_override_delivery_code(p_order_id uuid, p_reason text) RETURNS void`، للأدمن أو لمن تُرجع له `can_manage_warehouse(order.fulfillment_warehouse_id)` القيمة `true`. السبب إلزامي، ويُسجَّل التجاوز في `order_status_history`.
- **الواجهات:**
  - `OrderDeliveryQRCode.tsx`: حذف `generate12DigitDeliveryCode`، وعرض الرمز من `customer_issue_delivery_code` عبر دالة في `orderRepository.ts`، مع حفظه في `sessionStorage` لكل طلب حتى لا يتغير بإعادة الرسم.
  - `BarcodeScannerModal.tsx`: حذف `validateDeliveryCode` والاستيراد، وتمرير الرمز الممسوح أو المكتوب إلى `updateDriverOrderStatus` ([driverRepository.ts](<../src/infrastructure/repositories/driverRepository.ts>) L121)، ورسالة الخطأ تأتي من الخادم.
  - بوابة الإدارة: زر «تجاوز رمز التسليم» بسبب في `OrderDetailPage.tsx`.
  - `mobile-app` لا يعرض رمز تسليم اليوم (لا مطابقة لـ `DeliveryQR` فيه)، فعملاؤه يعتمدون على الإشعار أو تجاوز المدير.
- **النشر:** العلم `false` افتراضياً، ويُفعَّل بعد نشر واجهتي المندوب والعميل (§9.2).

### 4b.3 دورة عمولات المسوقين والدفعات (`20261018000600_affiliate_commission_lifecycle_payouts.sql`) — الملاحظتان 1 و2
- **التحقق من الكود:**
  - `admin_record_affiliate_payout` ([coupons_affiliate_hub.sql](<../supabase/migrations/20260930000100_coupons_affiliate_hub.sql>) L493–531) يفحص فقط أن المبلغ > 0 والطريقة والمسوق، ثم يعلّم **كل** العمولات `approved` مدفوعة (L524–527) أياً كان المبلغ.
  - لا migration لاحقة تعيد تعريف هذه الدالة. أما `20261017000100` فيحسب `pending_balance` للعرض فقط (L189).
  - `affiliate_profiles.minimum_payout` موجود بافتراضي 5000 (baseline L894)، و`admin_save_affiliate` يقبل `p_minimum_payout`. لكن نموذج [AffiliatesPage.tsx](<../admin-portal/src/pages/AffiliatesPage.tsx>) بلا حقل له، فالافتراضي 0 للمسوق الجديد (L40).
  - نافذة الدفع تحذّر بصرياً فقط عند تجاوز الرصيد (L1124–1125).
  - مشغّل التسليم يُدرج العمولة `approved` مباشرة (`coupons_affiliate_hub.sql` L321–322).
  - `ON CONFLICT (order_id) DO UPDATE SET status='approved'` (L323–326) يعيد عمولة `paid` أو `reversed` إلى `approved` إن سُلّم الطلب ثانيةً بعد `delivery_failed → confirmed`.
  - `review_affiliate_commission` (baseline L804–807) موجودة بلا مصفوفة انتقالات، فتسمح بتعليم `paid` خارج أي دفعة. ولا واجهة لها: تبويب العمولات جدول قراءة فقط (`AffiliatesPage.tsx` L809–814).
  - ولا شيء يعكس العمولة عند استرداد الطلب.
- **نموذج البيانات:**
  ```sql
  ALTER TABLE public.affiliate_commissions
    ADD COLUMN eligible_at timestamptz,
    ADD COLUMN paid_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
    ADD COLUMN review_note text,
    ADD CONSTRAINT affiliate_commissions_paid_le_amount CHECK (paid_amount <= commission_amount);
  CREATE TABLE public.affiliate_payout_allocations (
    payout_id     uuid NOT NULL REFERENCES public.affiliate_payouts(id) ON DELETE RESTRICT,
    commission_id uuid NOT NULL REFERENCES public.affiliate_commissions(id) ON DELETE RESTRICT,
    amount        numeric(14,2) NOT NULL CHECK (amount > 0),
    PRIMARY KEY (payout_id, commission_id)
  );
  ALTER TABLE public.app_settings ADD COLUMN affiliate_hold_days integer NOT NULL DEFAULT 14 CHECK (affiliate_hold_days BETWEEN 0 AND 90);
  ```
  - التعبئة: `paid_amount = commission_amount` للعمولات `paid` الحالية.
  - RLS على `affiliate_payout_allocations`: قراءة للأدمن فقط.
- **إنشاء العمولة:** تُعاد كتابة دالة مشغّل التسليم (**تحقق** اسمها في `coupons_affiliate_hub.sql` قبل L300):
  - الإدراج بـ `status='pending'` و`eligible_at = now() + affiliate_hold_days`.
  - `ON CONFLICT (order_id) DO UPDATE ... WHERE affiliate_commissions.status = 'pending'`، فلا تتغير عمولة معتمدة أو مدفوعة أو معكوسة.
- **`public.admin_release_eligible_commissions(p_affiliate_id uuid DEFAULT NULL) RETURNS integer`:** تعتمد عمولات `pending` التي حلّ `eligible_at` وما زال طلبها `delivered` بلا مرتجع مفتوح. تستدعيها دالة الدفع تلقائياً، ولها زر في الواجهة، فلا اعتماد على `pg_cron`.
- **`review_affiliate_commission`:** `DROP` ثم `CREATE (p_commission_id uuid, p_status text, p_note text DEFAULT NULL)`:
  - المصفوفة: `pending→approved|reversed`، و`approved→reversed`.
  - `paid` محظور هنا لأنه يأتي من الدفعة فقط، والعمولة ذات `paid_amount > 0` لا تُعكس.
- **العكس عند الاسترداد:** داخل `review_order_return` (§4b.4)، عند `refunded`، تُخفَّض العمولة غير المدفوعة بنسبة `refund_amount / (total − shipping_fee)`، وتصبح `reversed` إن بلغت صفراً. العمولة المدفوعة تُعلَّم بملاحظة للمراجعة اليدوية.
- **`admin_record_affiliate_payout`** بالتوقيع نفسه:
  1. استدعاء `admin_release_eligible_commissions(p_affiliate_id)`، ثم قفل عمولات `approved` للمسوق `FOR UPDATE` بترتيب `eligible_at, created_at`.
  2. `v_available = Σ(commission_amount − paid_amount)`، ورفض الدفعة إن تجاوز `p_amount` المتاح، أو كان أقل من `minimum_payout` ولم يساوِ كامل المتاح.
  3. توزيع المبلغ FIFO في `affiliate_payout_allocations` وزيادة `paid_amount`، و`status='paid'` و`paid_at` فقط للعمولة المغطاة بالكامل.
- **`admin_get_affiliate_details`** (`20261017000100` L78–189): `DROP` ثم `CREATE`، ويصبح `pending_balance` = `Σ(commission_amount − paid_amount)` للمعتمدة، مع `on_hold_balance` للمعلّقة في نهاية المخرجات.
- **الواجهة:**
  - **`AffiliatesPage.tsx`:**
    - حقل `minimum_payout` في النموذج، بافتراضي يأتي من الخادم لا 0 (L40، L682).
    - نافذة الدفع تمنع تجاوز المتاح وتعرض الحد الأدنى (L1124–1125).
    - تبويب العمولات (L809–814): فلتر بالحالة، وأزرار «اعتماد» و«عكس» بملاحظة، وزر «اعتماد المستحق».
  - **`catalogApi.ts`:** إضافة `reviewAffiliateCommission` و`releaseEligibleCommissions`.

### 4b.4 الاسترداد بقيمة البنود المرتجعة (`20261018000700_refund_cap_by_returned_items.sql`) — الملاحظة 3
- **التحقق من الكود (جزئية):**
  - الخادم يحسب قيمة البنود فعلاً ([20261017000100](<../supabase/migrations/20261017000100_fix_revenue_affiliate_and_refund_scams.sql>) L354–366). لكن أي `p_refund_amount` يستبدل هذه القيمة ولا يُقارن إلا بـ `v_order.total` (L369–377).
  - الواجهة ترسل دائماً مبلغاً مُعبّأً بـ `order_total` ومسقوفاً به ([ReturnsPage.tsx](<../admin-portal/src/pages/ReturnsPage.tsx>) L67، L93–95).
  - إضافةً لذلك، L357 يأخذ `line_total` للبند كاملاً ولو أُرجع جزء من الكمية، ولا يوجد سقف تراكمي حين تتعدد المرتجعات لطلب واحد.
  - `order_returns.items` من نوع jsonb (baseline L1439).
- **`review_order_return`** بالتوقيع نفسه:
  - قيمة البند = `round(line_total / line_quantity * returned_quantity, 2)`، وعند غياب `line_total` تكون `effective_unit_price * returned_quantity`.
  - `v_cap = LEAST(قيمة البنود + shipping_fee عند إرجاع كامل الطلب, v_order.total − Σ refund_amount للمرتجعات المستردة سابقاً)`.
  - `p_refund_amount > v_cap` يُرفض. لا تجاوز فوق المتبقي التراكمي من `v_order.total` أبداً.
- **`admin_list_order_returns()`** (`20261017000100` L430): `DROP` ثم `CREATE` مع `returned_items_value` و`refundable_cap` في نهاية `RETURNS TABLE`.
- **الواجهة:** `ReturnsPage.tsx` يعبّئ الحقل بـ `returned_items_value` ويسقفه بـ `refundable_cap`.

### 4b.5 تأكيد الدفع الذري والفحوص المغلقة عند الفشل (`20261018000800_admin_verify_payment_atomic.sql`) — الملاحظتان 5 و7
- **التحقق من الكود:**
  - `verifyAndAdvanceOrder` ([adminApi.ts](<../admin-portal/src/lib/adminApi.ts>) L481–500) يستدعي `review_payment_proof` (L489→L189) ثم `admin_update_order_operation` (L493→L152) استدعاءين منفصلين، ففشل الثاني يترك الإثبات `verified` والطلب في مكانه.
  - `checkCreditCustomer` (L198–202) يُرجع `false` عند الخطأ.
  - `checkDuplicatePaymentReference` (L460–479) يُرجع `{found:false}` عند الخطأ.
  - مجاميع العملاء (L379–382) لا تقرأ `error`.
  - `fetchCustomerDetail` يفحص `profileRes.error` فقط (L414–418)، فيحسب أرقاماً خاطئة بصمت (L432).
- **`public.admin_verify_payment_and_advance(p_proof_id uuid, p_expected_status text, p_target_status text DEFAULT NULL, p_review_note text DEFAULT NULL, p_allow_duplicate_reference boolean DEFAULT false) RETURNS void`:**
  - للأدمن فقط، ويقفل الطلب والإثبات.
  - يرفض إن وُجد إثبات `verified` آخر بالقيمة نفسها لـ `transaction_reference` على طلب آخر، إلا مع `p_allow_duplicate_reference` وملاحظة إلزامية. بهذا يصبح فحص التكرار في الخادم لا في العميل وحده.
  - ينفّذ منطق `review_payment_proof` ثم انتقال `admin_update_order_operation` في المعاملة نفسها، عبر استخراج المنطق المشترك إلى دوال داخلية لـ `service_role`.
- **العميل:**
  - `verifyAndAdvanceOrder` يستدعي الدالة الجديدة فقط.
  - `checkCreditCustomer` و`checkDuplicatePaymentReference` ترميان الخطأ، والواجهة تعرض «تعذر التحقق» وتعطّل زر التأكيد.
  - دوال مجاميع العميل وتفاصيله ترمي الخطأ عند فشل أي استعلام فرعي.
  - `confirm_cod_payment` مُستدعاة بـ `as any` (L194). **تحقق** من وجودها في `pg_proc`، وإن لم توجد يُحذف الزر.

### 4b.6 حماية إعدادات الإشعارات (`admin-portal` فقط) — الملاحظة 6
- **التحقق من الكود:** [SettingsPage.tsx](<../admin-portal/src/pages/SettingsPage.tsx>) L10 يبدأ بـ `emails = []`. عند فشل التحميل (L20) يبقى النموذج وزر الحفظ ظاهرين، فيرسل `save()` (L38) مصفوفة فارغة، ويكتبها `saveNotificationEmails` ([catalogApi.ts](<../admin-portal/src/lib/catalogApi.ts>) L590–592) في `app_settings`.
- **الإصلاح:** حالة `loaded` تمنع الحفظ حتى ينجح التحميل، مع زر «إعادة المحاولة» وتأكيد صريح عند حفظ قائمة فارغة.

### 4b.7 عدم تكرار الدفع بمقارنة الحمولة (`20261018000900_checkout_idempotency_payload_hash.sql`) — الملاحظة 24
- **التحقق من الكود (جزئية):**
  - المفتاح محفوظ في `sessionStorage` ([CheckoutPage.tsx](<../src/presentation/pages/customer/CheckoutPage.tsx>) L20–27)، ولا يُمسح إلا بعد النجاح (L299). فيبقى بعد تعديل السلة أو الكوبون، وبعد إلغاء الطلب عند فشل الإثبات (L289–295).
  - الخادم عند تعارض المفتاح يُرجع الطلب السابق دون مقارنة الحمولة ([store_customer_gps_in_order.sql](<../supabase/migrations/20261001001200_store_customer_gps_in_order.sql>) L114–139)، فقد تنتهي المحاولة الجديدة بالانتقال إلى طلب ملغى.
  - رسالة L293 تقول «لم يتم إنشاء الطلب» مع أنه أُنشئ ثم أُلغي، والإلغاء نفسه قد يفشل بصمت (L290–291). أما رسالة فشل الرفع في L261 فدقيقة.
- **الخادم:**
  - `ALTER TABLE public.checkout_idempotency ADD COLUMN request_hash text;`
  - `checkout_order_safe` ذات 12 معاملاً، بالتوقيع نفسه، تحسب `md5` لحمولة قانونية: البنود مرتبة، والكوبون، والنقاط، والإحداثيات مقرّبة إلى 4 منازل، وطريقة الدفع. ثم تخزّنها.
  - عند تعارض المفتاح:
    - تجزئة مختلفة → الخطأ `IDEMPOTENCY_KEY_REUSED`.
    - الطلب السابق `cancelled` → الخطأ `IDEMPOTENCY_ORDER_CANCELLED`.
    - غير ذلك → يُرجَع الطلب نفسه كما الآن.
  - **تحقق** إن كان مسار الجوال `checkout_order_with_growth` يمرّر مفتاحاً، وإن كان يُطبَّق عليه المنطق نفسه.
- **العميل:**
  - `CheckoutPage.tsx` يجدد المفتاح عند تغير `cartSignature` أو الكوبون أو العنوان أو طريقة الدفع، وبعد أي إلغاء.
  - تصحيح رسالة L293 إلى «أُنشئ الطلب ثم أُلغي لتعذّر إرفاق الإثبات»، ويظهر خطأ صريح مع رابط الطلب إن فشل الإلغاء.
  - `src/application/errors` تترجم الرمزين الجديدين.
- **أثر على المرحلة 4:** إعادة تعريف `checkout_order_safe` في §7.3 يجب أن تحمل منطق التجزئة هذا.

### 4b.8 إزالة البيانات الوهمية الصامتة (`src/` فقط) — الملاحظة 22
- **التحقق من الكود:**
  - [productRepository.ts](<../src/infrastructure/repositories/productRepository.ts>) L116–134 وL140–158 تُرجع `MOCK_PRODUCTS` عند الخطأ أو الاستثناء أو المصفوفة الفارغة.
  - [catalogRepository.ts](<../src/infrastructure/repositories/catalogRepository.ts>) يفعل الشيء نفسه للعروض (L27)، والبانرات (L53)، والتشكيلات (L75)، **وطرق الدفع (L95)، والمناطق (L109)**.
  - لا شرط `import.meta.env.DEV` في أي منها.
  - الاستدعاءات ملفوفة بـ `cachedFetch`، فتُخزَّن البيانات الوهمية في `localStorage` طوال مدة الصلاحية.
  - **الخطر:** قد يُعرض على العملاء **حساب دفع وهمي** ومناطق توصيل غير حقيقية.
- **الإصلاح:**
  - البيانات الوهمية فقط خلف `import.meta.env.DEV && import.meta.env.VITE_USE_MOCKS === 'true'`، باستيراد ديناميكي حتى تخرج من حزمة الإنتاج.
  - الخطأ يُرمى عبر `src/application/errors` ولا يُخزَّن مؤقتاً، والنتيجة الفارغة الحقيقية تُعرض «لا منتجات».
  - حالات خطأ مرئية مع «إعادة المحاولة» في `HomePage` و`SearchPage` و`ProductDetailsPage` و`CheckoutPage`. طرق الدفع والمناطق إلزامية، فيتوقف الدفع إن فشل تحميلها.
  - رفع رقم إصدار مفاتيح الكاش في [cache.ts](<../src/infrastructure/cache.ts>) لمسح البيانات الوهمية المخزّنة لدى العملاء.

### 4b.9 المهام
- [ ] كتابة `20261018000400_driver_cash_ledger.sql` مع التعبئة واستعلام المطابقة، وفحص التسويات المكررة قبل الفهرس.
- [ ] كتابة `20261018000500_delivery_code_verification.sql` (العلم معطّل).
- [ ] كتابة `20261018000600_affiliate_commission_lifecycle_payouts.sql`.
- [ ] كتابة `20261018000700_refund_cap_by_returned_items.sql`.
- [ ] كتابة `20261018000800_admin_verify_payment_atomic.sql`.
- [ ] كتابة `20261018000900_checkout_idempotency_payload_hash.sql`.
- [ ] **المندوب:** درج النقد، ونموذج التسوية، والماسح الذي يرسل الرمز للخادم.
- [ ] **العميل:** عرض رمز التسليم من الخادم، وتجديد مفتاح الدفع، وإزالة البيانات الوهمية، وحالات الخطأ.
- [ ] **بوابة الإدارة:** `AffiliatesPage` و`ReturnsPage` و`SettingsPage` و`adminApi.ts` (الفحوص المغلقة والدالة الذرية)، وزر تجاوز رمز التسليم، وتعديل دفتر النقد.
- [ ] تفعيل `require_delivery_code` بعد نشر الواجهات واختبار يدوي على طلب حقيقي.
- [ ] إعادة توليد `supabase/full_schema_setup.sql` وملفات `database.types.ts`.

### 4b.10 المخاطر
- **تعبئة الدفتر:** طلبات COD التاريخية التي بلا `driver_id` أو بلا سجل `delivered` تُستبعد. يُعرض تقرير الفروق للأدمن، والتصحيح بـ `admin_adjust_driver_cash`.
- **سقف التسوية:** قد يمنع مندوباً معه نقد فعلي لم يُسجَّل. التصحيح بتعديل الدفتر بملاحظة.
- **رمز التسليم:** العميل الذي لا يفتح الإشعار أو الصفحة لن يملك الرمز. التخفيف: الإرسال عند `shipped`، وإعادة الإصدار، وتجاوز المدير بسبب، وبقاء العلم معطّلاً حتى الجاهزية.
- **تأخير العمولات:** الانتقال من `approved` الفوري إلى `pending` يؤخر أرصدة المسوقين، فيُبلَّغون مسبقاً. العمولات الحالية تبقى كما هي.
- **تجزئة الحمولة:** يجب أن تكون حتمية (ترتيب البنود ثابت)، وإلا رُفض إعادة الإرسال المشروع.

### 4b.11 معايير القبول
- [ ] **[full-cash-cycle.test.ts](<../tests/backend/full-cash-cycle.test.ts>):**
  - التسليم يُنشئ `cod_collected` مرة واحدة.
  - `get_my_deliveries` يُرجع `cod_amount` بعد التسليم.
  - تسوية تتجاوز الرصيد تُرفض، وتسوية `submitted` ثانية تُرفض.
  - التأكيد يُنشئ قيداً سالباً، و`driver_outstanding_cod` يطابق الحساب.
- [ ] **`driver-flow.test.ts`** مع تفعيل العلم:
  - `delivered` بلا رمز أو برمز خاطئ يُرفض، وبالرمز الصادر ينجح.
  - 5 محاولات خاطئة تقفل الرمز.
  - تجاوز مدير خارج النطاق يُرفض.
- [ ] **اختبار جديد `tests/backend/affiliate-payouts.test.ts`:**
  - العمولة `pending` عند التسليم.
  - الدفعة الجزئية توزَّع FIFO ولا تعلّم كل العمولات.
  - تجاوز المتاح يُرفض، وكذلك المبلغ الأقل من الحد الأدنى.
  - إعادة التسليم لا تغيّر عمولة مدفوعة.
  - الاسترداد يخفّض العمولة غير المدفوعة.
- [ ] **[returns.test.ts](<../tests/backend/returns.test.ts>):** استرداد يتجاوز قيمة البنود أو المتبقي التراكمي يُرفض، والمرتجع الجزئي يُحسب بالكمية.
- [ ] **`orders.test.ts`:** المفتاح نفسه بحمولة مختلفة يُرفض، ويُرفض أيضاً بعد الإلغاء، والحمولة نفسها تُعيد الطلب نفسه.
- [ ] **اختبار وحدة في `tests/unit/`:** المستودعات لا تُرجع بيانات وهمية خارج وضع التطوير عند محاكاة خطأ Supabase.
- [ ] **يدوي:** فشل تحميل الإعدادات يمنع الحفظ، وفشل فحص المرجع المكرر يعطّل التأكيد.
- [ ] الأوامر: كما في المرحلة 1.

---

## 5. المرحلة 2 — التصنيفات والعلامات التجارية

### 5.1 نموذج البيانات (`20261019000100_categories_brands_schema.sql`)
```sql
CREATE TABLE public.categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id  uuid REFERENCES public.categories(id) ON DELETE RESTRICT,
  name_ar    text NOT NULL CHECK (btrim(name_ar) <> ''),
  name_en    text,
  slug       text UNIQUE,
  image_url  text,
  icon       text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT categories_not_self_parent CHECK (parent_id IS DISTINCT FROM id)
);
CREATE UNIQUE INDEX categories_name_ar_unique ON public.categories (lower(btrim(name_ar)));
CREATE INDEX categories_parent_sort_idx ON public.categories (parent_id, sort_order);

CREATE TABLE public.brands (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar    text NOT NULL CHECK (btrim(name_ar) <> ''),
  name_en    text,
  slug       text UNIQUE,
  logo_url   text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);
CREATE UNIQUE INDEX brands_name_ar_unique ON public.brands (lower(btrim(name_ar)));

ALTER TABLE public.products
  ADD COLUMN category_id uuid REFERENCES public.categories(id) ON DELETE RESTRICT,
  ADD COLUMN brand_id    uuid REFERENCES public.brands(id) ON DELETE RESTRICT;
CREATE INDEX products_category_id_idx ON public.products (category_id);
CREATE INDEX products_brand_id_idx ON public.products (brand_id);
```
- **تفرّد الاسم عام** وليس داخل الأب فقط، لأن المزامنة من النص إلى المعرّف تعتمد على أن الاسم يحدد صفاً واحداً.
- **مستويان فقط:** المشغّل `categories_enforce_two_levels()` (BEFORE INSERT/UPDATE) يرفض أباً له أب، ويرفض إسناد أب لتصنيف لديه أبناء.
- **تحديث `updated_at`:** مشغّل `set_updated_at` على الجدولين.
- **RLS:**
  - `SELECT` لـ `anon` و`authenticated` بشرط `USING (is_active OR public.is_admin())`.
  - `GRANT SELECT ON public.categories, public.brands TO anon, authenticated;` بلا منح كتابة.
- **منحة أعمدة المنتجات:** `GRANT SELECT (category_id, brand_id) ON public.products TO authenticated;`، امتداداً لقائمة [lockdown.sql](<../supabase/migrations/20260920000100_lockdown.sql>) L54–57. **تحقق** إن كانت لـ `anon` منحة أعمدة مماثلة.

### 5.2 التعبئة والمزامنة (`20261019000200_categories_brands_backfill_sync.sql`)
- **التعبئة:**
  - تصنيف رئيسي (`parent_id` = NULL) لكل قيمة مميزة من `btrim(products.category)` غير الفارغة، مع `sort_order` حسب عدد المنتجات تنازلياً.
  - الشيء نفسه للعلامات من `products.brand`.
  - ثم `UPDATE products SET category_id/brand_id` بالمطابقة على `lower(btrim(...))`.
  - التسلسل الهرمي يبنيه الأدمن لاحقاً بإعادة الإسناد.
- **مزامنة المنتج:** `products_sync_taxonomy_text()`، مشغّل BEFORE INSERT OR UPDATE OF `category`, `brand`, `category_id`, `brand_id` على `products`:
  - إن تغيّر `category_id` يُضبط `NEW.category := categories.name_ar`.
  - وإلا، إن تغيّر النص وحده (عميل قديم)، يُحلّ المعرّف بالاسم، وإن لم يوجد يُنشأ تصنيف رئيسي نشط بهذا الاسم.
  - المنطق نفسه للعلامة، والنص الفارغ يعني `brand_id = NULL`.
- **انتشار إعادة التسمية:** `categories_propagate_rename()`، مشغّل AFTER UPDATE OF `name_ar`، يحدّث:
  - `products.category` حيث `category_id = NEW.id`.
  - `storefront_banners.action_value` حيث `action_type='category' AND action_value = OLD.name_ar`.
  - `storefront_collections.rule_config` حيث `rule_type='category' AND rule_config->>'category' = OLD.name_ar`.
  - `promotions.target_value` حيث `target_kind='category' AND target_value = OLD.name_ar`.

  و`brands_propagate_rename()` يحدّث `products.brand` و`promotions` (`target_kind='brand'`). بهذا تبقى المطابقات النصية الحالية في `effective_price` و`get_storefront_collections` صحيحة بلا تعديل.

### 5.3 RPCs
- **الأدمن** (كلها تفحص `is_admin()`):
  - `public.admin_get_categories() RETURNS TABLE(id uuid, parent_id uuid, name_ar text, name_en text, slug text, image_url text, icon text, sort_order integer, is_active boolean, product_count bigint)`
  - `public.admin_save_category(p_name_ar text, p_id uuid DEFAULT NULL, p_parent_id uuid DEFAULT NULL, p_name_en text DEFAULT NULL, p_slug text DEFAULT NULL, p_image_url text DEFAULT NULL, p_icon text DEFAULT NULL, p_sort_order integer DEFAULT 0, p_is_active boolean DEFAULT true) RETURNS uuid`
  - `public.admin_reorder_categories(p_ids uuid[]) RETURNS void`: يضبط `sort_order` حسب الموضع، وكل المعرّفات يجب أن تشترك في الأب نفسه.
  - `public.admin_delete_category(p_id uuid) RETURNS void`: يُرفض إن وُجد أبناء، أو منتجات، أو مرجع في بانر أو تشكيلة أو عرض. البديل هو `is_active=false`.
  - المقابلات للعلامات: `admin_get_brands()`، و`admin_save_brand(p_name_ar text, p_id uuid DEFAULT NULL, p_name_en text DEFAULT NULL, p_slug text DEFAULT NULL, p_logo_url text DEFAULT NULL, p_sort_order integer DEFAULT 0, p_is_active boolean DEFAULT true) RETURNS uuid`، و`admin_reorder_brands(p_ids uuid[])`، و`admin_delete_brand(p_id uuid)`.
- **العامة** (`anon`, `authenticated`):
  - `public.get_public_categories() RETURNS TABLE(id uuid, parent_id uuid, name_ar text, name_en text, slug text, image_url text, icon text, sort_order integer, product_count bigint)`: النشطة فقط، والعدد يشمل منتجات الأبناء النشطة.
  - `public.get_public_brands() RETURNS TABLE(id uuid, name_ar text, name_en text, slug text, logo_url text, sort_order integer, product_count bigint)`.
- **القارئون** (`20261019000300_categories_brands_readers.sql`):
  - `DROP` ثم إعادة إنشاء `get_public_products()` و`get_public_product(uuid)` من آخر تعريف في [variants.sql](<../supabase/migrations/20260920001700_variants.sql>) L100–132، مع إضافة `category_id uuid, brand_id uuid` في **نهاية** `RETURNS TABLE`. المنطق كما هو.
  - `get_storefront_collections()` والدالة `admin_save_collection(...)`: قبول `rule_config.category_id`، الذي يطابق `category_id` المنتج أو أبا تصنيفه، مع إبقاء `rule_config.category` النصي بديلاً.

### 5.4 بوابة الإدارة
- **صفحات ومسارات:**
  - `admin-portal/src/pages/CategoriesPage.tsx` على `/categories`: شجرة بمستويين، وسحب لإعادة الترتيب، وصورة أو أيقونة، ومفتاح التفعيل.
  - `admin-portal/src/pages/BrandsPage.tsx` على `/brands`: شبكة شعارات، وترتيب، وتفعيل.
- **القائمة:** «التصنيفات» (أيقونة `FolderTree`) و«العلامات التجارية» (أيقونة `Tag`) بعد «المنتجات»، بقيمة `access: 'admin'`.
- **[catalogApi.ts](<../admin-portal/src/lib/catalogApi.ts>):** إضافة `fetchCategories`، و`saveCategory`، و`reorderCategories`، و`deleteCategory`، ومقابلاتها للعلامات. رفع الصور بـ `uploadPublicImage` في المجلدين `categories/` و`brands/` من bucket `products`، مع `validateImage` و`downscaleImage`. سياسة «Administrators manage product images» تغطي ذلك.
- **[ProductFormPage.tsx](<../admin-portal/src/pages/products/ProductFormPage.tsx>):** استبدال الحقلين في L148–151 بـ `<select>` للتصنيف مقسّم بـ `optgroup` لكل أب، و`<select>` للعلامة. يرسل `createProduct` و`updateProduct` (L86–87، L107–116) القيمتين `category_id` و`brand_id`، ويملأ المشغّل النص.
- **مصادر القوائم:** [BannersPage.tsx](<../admin-portal/src/pages/BannersPage.tsx>) L144 و[CollectionFormPage.tsx](<../admin-portal/src/pages/collections/CollectionFormPage.tsx>) L170–172 و[PromotionsPage.tsx](<../admin-portal/src/pages/PromotionsPage.tsx>) L151–163 تأخذ قوائمها من `fetchCategories` و`fetchBrands` بدل اشتقاقها من المنتجات.
- **[ProductListPage.tsx](<../admin-portal/src/pages/products/ProductListPage.tsx>):** فلتر بالتصنيف أو العلامة.

### 5.5 `src/` و`mobile-app` (2c — تحويل القارئين بعد استقرار 2a و2b)
- **`src/`:**
  - كيانان جديدان `src/domain/entities/category.ts` و`brand.ts`، وإضافة `categoryId?` و`brandId?` إلى [product.ts](<../src/domain/entities/product.ts>) L28–29.
  - [catalogRepository.ts](<../src/infrastructure/repositories/catalogRepository.ts>): `fetchCategories` و`fetchBrands`، مع بديل الاشتقاق من المنتجات الحالي عند الفشل.
  - [productRepository.ts](<../src/infrastructure/repositories/productRepository.ts>) L96–97: ربط المعرّفات.
  - [productSearch.ts](<../src/application/services/productSearch.ts>): الفلترة بـ `categoryId` شاملةً الأبناء، والقوائم مرتبة حسب `sort_order`.
  - [HomePage.tsx](<../src/presentation/pages/customer/HomePage.tsx>) L146–160: رقائق تصنيفات بالصور، وقائمة علامات مرتبة.
  - [SearchPage.tsx](<../src/presentation/pages/customer/SearchPage.tsx>): يُبقى `?category=` بالاسم للتوافق مع الروابط الحالية.
- **`mobile-app`:**
  - [tips-api.ts](<../mobile-app/lib/tips-api.ts>) L39–40: أنواع و`fetchCategories`/`fetchBrands` عبر `/rest/v1/rpc/get_public_categories`.
  - استبدال `CATEGORIES` في `app/(tabs)/index.tsx:21` و`categories` في `app/categories.tsx:7` بالقائمة المجلوبة، مع إبقاء الثابتة بديلاً دون اتصال.
  - `app/category/[name].tsx` يبقي معامل الاسم ويضم منتجات الأبناء.
  - `lib/catalog-filters.ts` يأخذ العلامات من القائمة.
  - `setup-profile.tsx` («الاهتمامات») خارج النطاق.
- **المرحلة اللاحقة:** إيقاف الاعتماد على النص في القراءة لا يعني حذف العمودين. الحذف قرار لاحق خارج هذه الخطة.

### 5.6 المهام
- [ ] كتابة migrations ‎2a (`...000100`, `...000200`) والتحقق من التعبئة بالاستعلام: `SELECT count(*) FROM products WHERE category IS NOT NULL AND btrim(category) <> '' AND category_id IS NULL` = 0.
- [ ] كتابة `...000300` (القارئون) والتأكد من بقاء `effective_price` و`pricing_rule_*` في المخرجات.
- [ ] بناء `CategoriesPage` و`BrandsPage` ودوال الـ API، وتعديل `ProductFormPage` و`ProductListPage` والبانرات والتشكيلات والعروض.
- [ ] تحويل قارئي `src/` و`mobile-app` (2c).
- [ ] إعادة توليد الأنواع و`full_schema_setup.sql`.

### 5.7 المخاطر
- **الأسماء المتقاربة:** الأسماء المكررة بفروق مسافات أو حالة أحرف تُدمج بسبب `lower(btrim())`. يُعرض للأدمن تقرير الدمج قبل التطبيق، كاستعلام `GROUP BY lower(btrim(category))`.
- **الإنشاء التلقائي من النص الحر** قد يولّد تصنيفات عشوائية من عملاء قدامى. التخفيف: بعد نشر 2b لا يرسل `admin-portal` النص.
- **تغيير `RETURNS TABLE`** لـ `get_public_products` يكسر أي SQL يعتمد على ترتيب الأعمدة؛ عملاء PostgREST لا يتأثرون.

### 5.8 معايير القبول
- [ ] اختبار جديد `tests/backend/categories-brands.test.ts`:
  - الكتابة للأدمن فقط.
  - رفض المستوى الثالث.
  - تحديث `category_id` يملأ `products.category`.
  - تحديث النص وحده يحل المعرّف.
  - إعادة التسمية تنتشر إلى البانر والتشكيلة والعرض.
  - الحذف يُرفض مع وجود منتجات.
  - `get_public_categories` يُخفي غير النشطة.
- [ ] توسيع [collections.test.ts](<../tests/backend/collections.test.ts>) بقاعدة `category_id` تشمل الأبناء، و[promotions.test.ts](<../tests/backend/promotions.test.ts>) L91–119 بحيث يبقى استهداف التصنيف والعلامة صحيحاً بعد إعادة التسمية.
- [ ] `tests/unit/productRemovalFavorites.test.ts` و`tests/unit/offers.test.ts` ناجحة، وكذلك `mobile-app/tests/favorites-catalog.test.ts` و`cart-utils.test.ts`.
- [ ] الأوامر: كما في المرحلة 1، إضافةً إلى `pnpm --dir mobile-app check` و`pnpm --dir mobile-app test`.

---

## 6. المرحلة 3 — فواتير الشراء والموردون والمرتجعات ومتوسط التكلفة

### 6.1 نموذج البيانات (`20261020000100_suppliers_purchase_invoices.sql`)
```sql
CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (btrim(name) <> ''),
  phone text, email text, address text, tax_number text, notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);
CREATE UNIQUE INDEX suppliers_name_unique ON public.suppliers (lower(btrim(name)));

CREATE SEQUENCE public.purchase_invoice_number_seq;
CREATE TABLE public.purchase_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL UNIQUE DEFAULT ('PI-' || to_char(timezone('utc', now()), 'YYYY') || '-' || lpad(nextval('public.purchase_invoice_number_seq')::text, 6, '0')),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  supplier_invoice_ref text,
  invoice_date date NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','voided')),
  subtotal numeric(14,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  discount_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  extra_costs numeric(14,2) NOT NULL DEFAULT 0 CHECK (extra_costs >= 0),
  total numeric(14,2) GENERATED ALWAYS AS (subtotal - discount_amount + extra_costs) STORED,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  approved_by uuid REFERENCES auth.users(id), approved_at timestamptz,
  voided_by uuid REFERENCES auth.users(id), voided_at timestamptz, void_reason text,
  CONSTRAINT purchase_invoices_discount_le_subtotal CHECK (discount_amount <= subtotal + extra_costs),
  CONSTRAINT purchase_invoices_approved_shape CHECK (status <> 'approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
  CONSTRAINT purchase_invoices_voided_shape CHECK (status <> 'voided' OR (voided_at IS NOT NULL AND void_reason IS NOT NULL))
);
CREATE UNIQUE INDEX purchase_invoices_supplier_ref_unique ON public.purchase_invoices (supplier_id, lower(supplier_invoice_ref)) WHERE supplier_invoice_ref IS NOT NULL AND status <> 'voided';
CREATE INDEX purchase_invoices_warehouse_status_idx ON public.purchase_invoices (warehouse_id, status, invoice_date DESC);
CREATE INDEX purchase_invoices_supplier_idx ON public.purchase_invoices (supplier_id, invoice_date DESC);

CREATE TABLE public.purchase_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.purchase_invoices(id) ON DELETE CASCADE,
  line_no integer NOT NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  variant_id text,
  variant_name text,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_cost numeric(14,4) NOT NULL CHECK (unit_cost >= 0),
  line_total numeric(14,2) GENERATED ALWAYS AS (round(quantity * unit_cost, 2)) STORED,
  landed_unit_cost numeric(14,4),
  expiry_date date,
  batch_number text,
  UNIQUE (invoice_id, line_no)
);
CREATE INDEX purchase_invoice_items_product_idx ON public.purchase_invoice_items (product_id);

CREATE TABLE public.purchase_invoice_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.purchase_invoices(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);
```
- **المتغير:** `variant_id` نصي لأن المتغيرات في jsonb. يُتحقق منه بـ `public.product_variant(products.variants, variant_id)`، ويُلتقط `variant_name` وقت الحفظ. بما أن المخزون لكل منتج (ADR 0001)، يزيد الاستلام `warehouse_inventory` للمنتج، ويبقى المتغير للتتبع فقط.
- **التكلفة على مستوى المنتج:** تُضاف `products.average_cost numeric(14,4)` و`products.average_cost_updated_at timestamptz`، **دون** إضافتهما إلى منحة الأعمدة للعملاء، فتظلان مخفيتين مثل `cost_price`.
  - متوسط التكلفة المرجّح **لكل منتج** وليس لكل متغير، لأن الكمية المتاحة غير معروفة لكل متغير (قرار معتمد، §9).
  - هذا انحراف واعٍ عن عبارة «product/variant»: يصبح متوسط المتغير ممكناً فقط بعد تغيير نموذج المخزون الذي يقرره ADR 0001.
  - `variant_id` مسجّل في البنود ليبقى ذلك ممكناً لاحقاً.
- **سجل التكلفة:**
  ```sql
  CREATE TABLE public.product_cost_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    source_type text NOT NULL CHECK (source_type IN ('purchase_invoice','supplier_return')),
    source_id uuid NOT NULL,
    quantity_on_hand_before integer NOT NULL,
    quantity_delta integer NOT NULL,
    unit_cost numeric(14,4) NOT NULL,
    previous_average_cost numeric(14,4),
    new_average_cost numeric(14,4) NOT NULL,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
  );
  CREATE INDEX product_cost_history_product_idx ON public.product_cost_history (product_id, created_at DESC);
  ```
- **الحركات:** يُعاد تعريف قيد `inventory_movements_movement_type_check` بالقيم الخمس الحالية مضافاً إليها `'purchase_receipt'` و`'supplier_return'`. ويضاف `inventory_movements.unit_cost numeric(14,4)`.
- **عدم القابلية للتعديل:** المشغّل `purchase_documents_guard()` (BEFORE UPDATE OR DELETE على `purchase_invoices` و`purchase_invoice_items` و`supplier_returns` و`supplier_return_items`) يرفض أي تغيير حين `OLD.status <> 'draft'`، إلا إذا كانت `current_setting('app.purchase_rpc', true) = 'on'`. هذا الإعداد تضبطه دوال الاعتماد والإلغاء محلياً بـ `set_config(..., true)`. النتيجة: لا تعديل على المعتمد حتى من `service_role` بكتابة مباشرة.
- **RLS ومنح الجداول:**
  - `SELECT` للأدمن، وللمدير حيث `warehouse_id = ANY ((SELECT public.my_warehouse_ids()))`.
  - البنود والمرفقات عبر `EXISTS` على الرأس.
  - `suppliers`: `SELECT` للأدمن والمدير.
  - `product_cost_history`: للأدمن فقط.
  - لا `INSERT`/`UPDATE`/`DELETE` لـ `authenticated` على أي من هذه الجداول.
- **التخزين:** bucket خاص `purchase-invoices` ينشأ في الـ migration:
  ```sql
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('purchase-invoices', 'purchase-invoices', false, 10485760, ARRAY['image/jpeg','image/png','image/webp','application/pdf'])
  ON CONFLICT (id) DO NOTHING;
  ```
  - **المسار:** `{warehouse_id}/{invoice_id}/{timestamp}.{ext}`.
  - **سياسات `storage.objects`:** `INSERT` و`SELECT` حين `bucket_id='purchase-invoices' AND public.can_manage_warehouse(((storage.foldername(name))[1])::uuid)`، و`DELETE` للأدمن فقط.
  - **العرض:** بروابط موقّعة `createSignedUrl`.
  - **تحقق** أن الـ migration تملك صلاحية الكتابة على `storage.buckets` في المشروع المستضاف؛ إن لم تكن، يُنشأ الـ bucket يدوياً وتُوثَّق السياسات في `supabase/storage-current.sql`.

### 6.2 مرتجعات الموردين (`20261020000300_supplier_returns_and_void.sql`)
```sql
CREATE SEQUENCE public.supplier_return_number_seq;
CREATE TABLE public.supplier_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_number text NOT NULL UNIQUE DEFAULT ('SR-' || to_char(timezone('utc', now()), 'YYYY') || '-' || lpad(nextval('public.supplier_return_number_seq')::text, 6, '0')),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  purchase_invoice_id uuid REFERENCES public.purchase_invoices(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','cancelled')),
  reason text NOT NULL,
  is_void_reversal boolean NOT NULL DEFAULT false,
  notes text,
  created_by uuid REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  approved_by uuid REFERENCES auth.users(id), approved_at timestamptz
);
CREATE TABLE public.supplier_return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES public.supplier_returns(id) ON DELETE CASCADE,
  purchase_invoice_item_id uuid REFERENCES public.purchase_invoice_items(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  variant_id text,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_cost numeric(14,4) NOT NULL CHECK (unit_cost >= 0)
);
CREATE INDEX supplier_return_items_invoice_item_idx ON public.supplier_return_items (purchase_invoice_item_id);
```

### 6.3 RPCs
كلها `SECURITY DEFINER`، وكل تغيير حالة يبدأ بـ `SELECT ... FOR UPDATE` على الرأس.

- **`public.staff_save_supplier(p_name text, p_id uuid DEFAULT NULL, p_phone text DEFAULT NULL, p_email text DEFAULT NULL, p_address text DEFAULT NULL, p_tax_number text DEFAULT NULL, p_notes text DEFAULT NULL, p_is_active boolean DEFAULT true) RETURNS uuid`**
  - **الحراسة:** أدمن أو أي مدير. `p_is_active=false` للأدمن فقط.
- **`public.staff_search_products(p_query text DEFAULT NULL, p_limit integer DEFAULT 30) RETURNS TABLE(id uuid, name_ar text, brand text, image text, variants jsonb, is_active boolean)`**
  - **الحراسة:** أدمن أو مدير.
  - **السبب:** `get_admin_products()` للأدمن فقط، و`get_public_products()` يُخفي غير النشط. لا تُرجع `average_cost` و`cost_price`.
- **`public.save_purchase_invoice_draft(p_supplier_id uuid, p_warehouse_id uuid, p_invoice_date date, p_items jsonb, p_id uuid DEFAULT NULL, p_supplier_invoice_ref text DEFAULT NULL, p_discount_amount numeric DEFAULT 0, p_extra_costs numeric DEFAULT 0, p_notes text DEFAULT NULL) RETURNS uuid`**
  - **شكل البنود:** `p_items` = `[{product_id, variant_id?, quantity, unit_cost, expiry_date?, batch_number?}]`.
  - **الحراسة:**
    - `can_manage_warehouse(p_warehouse_id)`، وعند التعديل أيضاً `can_manage_warehouse(old.warehouse_id)`.
    - الحالة `draft`، والمورد نشط، والمستودع نشط.
    - 1–200 بند، و`quantity` عدد صحيح موجب، و`unit_cost ≥ 0`.
    - `variant_id` صالح إن وُجد، وإلزامي إن كان للمنتج متغيرات.
    - `invoice_date` لا يتجاوز اليوم.
  - **الأثر:** يستبدل البنود كلها ذرياً، ويحسب `subtotal`.
- **`public.add_purchase_invoice_attachment(p_invoice_id uuid, p_storage_path text) RETURNS uuid`**
  - **الحراسة:** `can_manage_warehouse(invoice.warehouse_id)`، وبادئة المسار = `{warehouse_id}/{invoice_id}/`، والحالة `draft`. الأدمن يضيف في أي حالة لأغراض التدقيق.
- **`public.approve_purchase_invoice(p_invoice_id uuid) RETURNS void`**
  - **من يعتمد:** المدير الذي يدير `invoice.warehouse_id` (`is_warehouse_manager() AND warehouse_id = ANY(my_warehouse_ids())`). الأدمن يعتمد فقط إذا لم يكن للمستودع مدير في `warehouse_manager_access` (قرار معتمد، §9).
  - **شروط الاعتماد:** الحالة `draft`، وبند واحد على الأقل، ومرفق واحد على الأقل كضابط تدقيق (قرار معتمد، §9).
  - **الخطوات بالترتيب:**
    1. حساب التكلفة المحمّلة: `landed_unit_cost = unit_cost + ((extra_costs - discount_amount) * line_total / subtotal) / quantity`، مقرّبة إلى 4 منازل. إن كان `subtotal = 0` فالقيمة `unit_cost`.
    2. لكل منتج مجمّع، بترتيب `product_id` لتجنب الجمود:
       - `SELECT stock, average_cost, cost_price FROM products ... FOR UPDATE` لقراءة الكمية **قبل** تحديث المخزون، لأن المشغّل يعيد حساب `stock`.
       - المتوسط الجديد: `q_old = GREATEST(stock, 0)`، و`c_old = COALESCE(average_cost, cost_price, c_new)`، و`new_avg = (q_old*c_old + Σq*c) / (q_old + Σq)`.
       - كتابة `product_cost_history`.
    3. `INSERT ... ON CONFLICT (warehouse_id, product_id) DO UPDATE SET quantity = quantity + EXCLUDED.quantity` على `warehouse_inventory`.
    4. `inventory_movements` بالنوع `'purchase_receipt'` و`reference_id = invoice_id` و`unit_cost = landed_unit_cost`.
    5. `status='approved'`، و`approved_by = auth.uid()`، و`approved_at = now()`.
  - **ملاحظة:** زيادة المخزون تفعّل مشغّل `warehouse_inventory_notify_restock_subscribers` الحالي، وهذا أثر مرغوب.
- **`public.save_supplier_return_draft(p_supplier_id uuid, p_warehouse_id uuid, p_reason text, p_items jsonb, p_id uuid DEFAULT NULL, p_purchase_invoice_id uuid DEFAULT NULL, p_notes text DEFAULT NULL) RETURNS uuid`**
  - **شكل البنود:** `p_items` = `[{purchase_invoice_item_id?, product_id, variant_id?, quantity, unit_cost?}]`.
  - **تكلفة الإرجاع الافتراضية:** `landed_unit_cost` لبند الفاتورة، وإلا `products.average_cost`.
  - **الحراسة:** `can_manage_warehouse(p_warehouse_id)`. والفاتورة المرتبطة يجب أن تكون `approved` ومن المورد والمستودع نفسيهما.
- **`public.approve_supplier_return(p_return_id uuid) RETURNS void`**
  - **الحراسة:**
    - المدير الذي يدير المستودع، أو الأدمن.
    - الحالة `draft`.
    - لكل بند مرتبط: مجموع المُرجع المعتمد + الحالي ≤ `purchase_invoice_items.quantity`.
  - **الخصم من المخزون:** `UPDATE warehouse_inventory SET quantity = quantity - q WHERE ... AND quantity >= q`، وإن لم يجد صفاً فخطأ «المخزون غير كافٍ».
  - **الحركات:** `'supplier_return'` بقيمة سالبة.
  - **المتوسط:** `new_avg = (q_old*avg - q*cost)/(q_old - q)` إذا كان `q_old - q > 0`، وإلا يبقى `avg` كما هو. مع `product_cost_history`.
- **`public.cancel_supplier_return(p_return_id uuid, p_reason text) RETURNS void`:** للمسودات فقط.
- **`public.void_purchase_invoice(p_invoice_id uuid, p_reason text) RETURNS void`**
  - **المسودة:** المدير أو الأدمن، وتتحول إلى `voided`.
  - **المعتمدة:** الأدمن فقط. تنشئ وتعتمد داخلياً `supplier_returns` كاملاً (`is_void_reversal = true`) لكل البنود غير المُرجعة سابقاً، ثم `status='voided'`. تفشل كلها إن لم يكفِ المخزون.
  - **الأثر:** مسار عكس واحد للمخزون والتكلفة، بلا تعديل للبنود المعتمدة.
- **القراءة:** مباشرة عبر RLS مع تضمين PostgREST، مثل `purchase_invoices?select=*,suppliers(name),warehouses(name),purchase_invoice_items(*)`.

### 6.4 تكلفة المبيعات وتقرير الربح (`20261020000400_order_line_costs_profit_report.sql`)
- **تكلفة البنود:**
  ```sql
  CREATE TABLE public.order_line_costs (
    order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    line_no integer NOT NULL,
    product_id uuid NOT NULL,
    variant_id text,
    quantity integer NOT NULL,
    unit_cost numeric(14,4),
    PRIMARY KEY (order_id, line_no)
  );
  ```
  يملؤه مشغّل AFTER INSERT على `orders` (`record_order_line_costs()`، SECURITY DEFINER) من `orders.items` و`COALESCE(products.average_cost, products.cost_price)`.
  - **لماذا جدول منفصل:** `orders.items` مقروء للعميل، فلا تُوضع التكلفة فيه.
  - **لماذا مشغّل:** يغطي مسارَي الدفع (الويب والجوال) دون تعديل `checkout_order_safe`.
  - RLS للأدمن، وللمدير بنطاق `orders.fulfillment_warehouse_id`.
- **تقرير الربح:** `public.admin_profit_report(p_start date, p_end date, p_warehouse_id uuid DEFAULT NULL) RETURNS jsonb`
  - **الحارس:** `is_admin()`، أو `can_manage_warehouse(p_warehouse_id)` لتقرير مستودع.
  - **المخرجات:** `revenue`، و`cogs`، و`gross_profit`، و`margin_pct`، و`by_product[]`، و`missing_cost_lines`.
  - **استبعادات الإيراد:** يطابق `admin_business_report` في [20261017000100](<../supabase/migrations/20261017000100_fix_revenue_affiliate_and_refund_scams.sql>) (استبعاد `cancelled` و`delivery_failed`)، ويطرح `order_returns.refund_amount` المسترد.

### 6.5 بوابة الإدارة
- **المسارات:** `/suppliers`، و`/purchases`، و`/purchases/new`، و`/purchases/:id`، و`/supplier-returns`، و`/supplier-returns/new`، و`/supplier-returns/:id` (كلها `access: 'staff'`)، و`/reports/profit` (`access: 'admin'`).
- **الصفحات** في `admin-portal/src/pages/purchases/`:
  - `SuppliersPage.tsx`
  - `PurchaseInvoiceListPage.tsx`: فلاتر الحالة والمستودع والمورد والتاريخ. الأدمن يرى الكل، والمدير يرى نطاقه.
  - `PurchaseInvoiceFormPage.tsx`: تحرير المسودة، والبحث عن المنتجات بـ `staff_search_products`، واختيار المتغير، والمرفقات. للمعتمدة عرض فقط، مع زر «اعتماد» للمدير و«إلغاء» حسب الدور.
  - `SupplierReturnListPage.tsx` و`SupplierReturnFormPage.tsx`.
  - `admin-portal/src/pages/ProfitReportPage.tsx`.
- **القائمة:** «فواتير الشراء» (`FileText`)، و«الموردون» (`Building2`)، و«مرتجعات الموردين» (`PackageX`)، و«تقرير الأرباح» (`TrendingUp`، للأدمن).
- **API:** ملف جديد `admin-portal/src/lib/purchasesApi.ts`:
  - `fetchSuppliers` و`saveSupplier`.
  - `fetchPurchaseInvoices` و`fetchPurchaseInvoice` و`savePurchaseInvoiceDraft` و`approvePurchaseInvoice` و`voidPurchaseInvoice`.
  - `uploadPurchaseAttachment`: `supabase.storage.from('purchase-invoices').upload` ثم `add_purchase_invoice_attachment`، مع إعادة استخدام `validateImage` و`downscaleImage` للصور.
  - `getAttachmentUrl`: `createSignedUrl(path, 300)`.
  - دوال المرتجعات، و`fetchProfitReport`.
  - الأنواع في [types.ts](<../admin-portal/src/types.ts>).
- **المنتجات:** [ProductFormPage.tsx](<../admin-portal/src/pages/products/ProductFormPage.tsx>) L202 تعرض `average_cost` للقراءة بجانب `cost_price`. وهامش [ProductListPage.tsx](<../admin-portal/src/pages/products/ProductListPage.tsx>) L104 يستخدم `COALESCE(average_cost, cost_price)`.
- **المخزون:** `InventoryPage` تربط حركات `purchase_receipt` و`supplier_return` بمستنداتها.
- **`src/` و`mobile-app`:** لا تغيير. المخزون العام يتحدث تلقائياً عبر المشغّل الحالي.

### 6.6 المهام
- [ ] كتابة migrations `20261020000100` إلى `20261020000400` بالترتيب.
- [ ] إنشاء bucket `purchase-invoices` وسياساته، أو توثيق الإنشاء اليدوي إن مُنع.
- [ ] بناء `purchasesApi.ts` والصفحات والمسارات وعناصر القائمة.
- [ ] عرض `average_cost` في صفحات المنتجات.
- [ ] إعادة توليد الأنواع و`full_schema_setup.sql`.

### 6.7 المخاطر
- **الجمود:** `checkout_order_safe` يقفل `products` بترتيب السلة، والاعتماد يقفل بترتيب `product_id`. الجمود ممكن لكن Postgres يكتشفه ويُلغي أحدهما؛ تعرض الواجهة «أعد المحاولة».
- **المخزون السالب أو الصفري قبل الاستلام:** `q_old ≤ 0` يجعل المتوسط تكلفة الاستلام، وهو موثّق في `product_cost_history`.
- **إلغاء فاتورة معتمدة بعد بيع جزء من الكمية** يفشل لعدم كفاية المخزون. البديل مرتجع جزئي، والأدمن يرى رسالة واضحة.
- **إنشاء bucket عبر migration** قد يحتاج صلاحيات (انظر §6.1).

### 6.8 معايير القبول
- [ ] اختبار جديد `tests/backend/purchase-invoices.test.ts`، بنمط ترقية العميل إلى مدير `KRT`:
  - المدير ينشئ مسودة ويعتمدها، فيزيد `warehouse_inventory` و`products.stock` وتُكتب حركة `purchase_receipt`.
  - `average_cost` يطابق الحساب اليدوي لاستلامين بتكلفتين مختلفتين.
  - اعتماد فاتورة `PZU` يُرفض.
  - تعديل فاتورة معتمدة (بالـ RPC أو بالجدول مباشرة) يُرفض.
  - الاعتماد مرتين يُرفض.
  - المتغير غير الصالح يُرفض.
  - المرجع المكرر لنفس المورد يُرفض.
  - المرتجع لا يتجاوز الكمية المستلمة ويخفض المخزون.
  - إلغاء المعتمدة للأدمن فقط ويعكس المخزون.
  - الطلب الجديد يُنشئ صفوف `order_line_costs`.
  - العميل لا يقرأ `average_cost` (`select('average_cost')` يفشل).
- [ ] اختبارات [returns.test.ts](<../tests/backend/returns.test.ts>) و[orders.test.ts](<../tests/backend/orders.test.ts>) و[variants.test.ts](<../tests/backend/variants.test.ts>) تبقى ناجحة.
- [ ] الأوامر كما في المرحلة 1.

---

## 7. المرحلة 4 — توسيع العروض

### 7.1 النطاق المقترح
- **ضمن النطاق:**
  1. `item_discount`: الحالي، ويبقى سلوكه كما هو.
  2. `buy_x_get_y`: اشترِ X واحصل على Y بخصم `get_discount_percent` (100 = مجاناً) ضمن مجموعة الاستهداف نفسها، والوحدات الأرخص هي المخفّضة.
  3. `quantity_tier`: شرائح كمية بالنسبة المئوية على كامل الكمية المؤهلة.
  4. `bundle`: حزمة منتجات بكميات محددة بسعر ثابت للحزمة.
- **خارج النطاق:**
  - حدود الاستخدام لكل عميل.
  - العروض المشروطة بقيمة السلة (الكوبونات تغطيها عبر `min_order_amount`).
  - «اشترِ X من A واحصل على B».
  - تراكب العروض.

### 7.2 نموذج البيانات (`20261021000100_promotion_types_schema.sql`)
```sql
ALTER TABLE public.promotions
  ADD COLUMN promotion_type text NOT NULL DEFAULT 'item_discount'
    CHECK (promotion_type IN ('item_discount','buy_x_get_y','quantity_tier','bundle')),
  ADD COLUMN buy_quantity integer CHECK (buy_quantity > 0),
  ADD COLUMN get_quantity integer CHECK (get_quantity > 0),
  ADD COLUMN get_discount_percent numeric(5,2) CHECK (get_discount_percent > 0 AND get_discount_percent <= 100),
  ADD COLUMN tiers jsonb,
  ADD COLUMN bundle_price numeric(12,2) CHECK (bundle_price > 0),
  ADD COLUMN max_applications_per_order integer CHECK (max_applications_per_order > 0),
  ADD COLUMN target_category_id uuid REFERENCES public.categories(id) ON DELETE RESTRICT,
  ADD COLUMN target_brand_id uuid REFERENCES public.brands(id) ON DELETE RESTRICT;
ALTER TABLE public.promotions ALTER COLUMN discount_type DROP NOT NULL, ALTER COLUMN discount_value DROP NOT NULL;

CREATE TABLE public.promotion_bundle_items (
  promotion_id uuid NOT NULL REFERENCES public.promotions(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (promotion_id, product_id)
);
```
- **القيد `promotions_type_shape`:**
  - `item_discount`: يتطلب `discount_type` و`discount_value`، والحقول الجديدة `NULL`.
  - `buy_x_get_y`: يتطلب `buy_quantity` و`get_quantity` و`get_discount_percent`.
  - `quantity_tier`: يتطلب `public.promotion_tiers_valid(tiers)`، أي مصفوفة `[{min_quantity int ≥ 2, percent 0<..≤100}]` تصاعدية بلا تكرار.
  - `bundle`: يتطلب `bundle_price` و`target_kind='products'`، و`target_product_ids` يساوي منتجات `promotion_bundle_items`. هذا يُبقي القيد الحالي `promotions_target_shape` في [promotions.sql](<../supabase/migrations/20260920001900_promotions.sql>) L25–33 صالحاً.
- **الاستهداف الهرمي:** `target_category_id` يطابق منتجاً `category_id` الخاص به = المعرّف أو أبوه = المعرّف. يُعبَّأ من `target_value` النصي بعد المرحلة 2. وتُضاف دالة `public.promotion_matches_product(p_promotion_id uuid, p_product_id uuid) RETURNS boolean` (STABLE، لـ `service_role`) تجمع المطابقة بالمعرّف والنص.

### 7.3 محرك التسعير (`20261021000200_cart_promotions_pricing.sql`)
- **`effective_price(...)`:** التوقيع **كما هو**. يضاف شرط `pr.promotion_type = 'item_discount'`، ويستخدم `promotion_matches_product` لاستهداف المعرّفات. المعرّفات تُقرأ داخلياً من `p_product_id`، فلا يتغير أي مستدعٍ.
- **دالة داخلية جديدة:** `public.evaluate_cart_promotions(p_lines jsonb) RETURNS TABLE(line_index integer, promotion_id uuid, rule_label text, reduction numeric)`، STABLE SECURITY DEFINER، لـ `service_role` فقط.
  - **المدخلات:** `[{line_index, product_id, quantity, unit_price, line_reduction}]`، حيث `unit_price` السعر الأساسي بعد حل المتغير، و`line_reduction` تخفيض البند من `effective_price` × الكمية.
  - **الحساب لكل عرض نشط من الأنواع 2–4:**
    - `buy_x_get_y`: الوحدات المؤهلة مرتبة تنازلياً بالسعر. `sets = floor(n/(X+Y))` مقيداً بـ `max_applications_per_order`، والتخفيض = مجموع أسعار أرخص `sets*Y` وحدة × النسبة.
    - `quantity_tier`: أعلى شريحة `min_quantity ≤ Q`، والتخفيض = Σ(`unit_price*quantity`) للمؤهل × النسبة.
    - `bundle`: `k = min(floor(qty_i/required_i))` مقيداً. والتخفيض = `k*(Σ unit_price_i*required_i − bundle_price)` إن كان موجباً، وإلا لا يُطبق.
  - **عدم التراكم:** يتسق مع فلسفة `effective_price` الحالية.
    1. صافي ربح كل عرض = تخفيضه − مجموع `line_reduction` للبنود التي يستهلكها.
    2. يُطبق بشكل جشع العرض ذو أعلى صافٍ موجب، وتُعلَّم بنوده مستهلكة بالكامل، ويُكرر.
    3. التعادل يُحسم بالأقدم `created_at`، كما في `effective_price`.
    4. البند لا يحمل إلا قاعدة واحدة.
  - **التوزيع:** يُوزَّع تخفيض العرض على بنوده تناسبياً مع `unit_price*quantity`، والفرق الناتج عن التقريب يذهب لآخر بند.
- **دالة داخلية مشتركة:** `public.price_cart_lines(p_items jsonb) RETURNS TABLE(lines jsonb, base_subtotal numeric, line_reductions numeric)`.
  - تُستخرج من حلقة `checkout_order_safe` الحالية (L154–197): `variant_line`، ثم `effective_price`، ثم `evaluate_cart_promotions`.
  - تُرجع لقطة البنود بالمفاتيح الحالية نفسها، وفي البنود المتأثرة بعرض سلة: `pricing_rule_kind='promotion'`، و`promotion_id`، و`promotion_type`، و`line_total = unit_price*quantity − allocated`، و`effective_unit_price = round(line_total/quantity, 2)`.
  - **لا تقفل الصفوف.** القفل يبقى في الدفع.
- **الدفع:**
  - إعادة تعريف `checkout_order_safe` ذات 12 معاملاً، أي توقيع [store_customer_gps_in_order.sql](<../supabase/migrations/20261001001200_store_customer_gps_in_order.sql>) L20، لتستخدم `price_cart_lines` بعد قفل المنتجات، و`v_line_reductions` = مجموع تخفيضات البنود والسلة.
  - **منطق المرحلة 1b:** إعادة التعريف تحمل تجزئة الحمولة ورموز خطأ عدم التكرار (§4b.7) كما هي.
  - **مسار الجوال:** إما إعادة تعريف النسخة ذات 10 معاملات المستدعاة من `checkout_order_with_growth` بالطريقة نفسها، أو حذفها وإعادة توجيه `checkout_order_with_growth` إلى مسار مشترك. **تحقق** أولاً عبر `SELECT oid::regprocedure FROM pg_proc WHERE proname = 'checkout_order_safe';`.
- **الكوبونات:** `evaluate_coupon(p_code, p_customer_id, p_base_subtotal, p_line_reductions, p_lock)` **بلا تغيير**. يُمرَّر لها مجموع التخفيضات التلقائية كلها، فيظل الكوبون «أفضل من كل التخفيضات التلقائية أو يُرفض بالسبب `not_best`». وعند قبوله يعمل الكود الحالي (L221–226) على تصفير `promotion_id` وتسعير البنود.
- **نقاط الولاء:** بلا تغيير. الاستبدال بعد الكوبون على `v_subtotal` (L234)، والكسب على `total − shipping_fee`.
- **حماية الحذف:** `admin_delete_promotion` يبقى صحيحاً، لأن كل بند متأثر يحمل `promotion_id` في `orders.items`.
- **المعاينة:** `public.preview_cart_pricing(p_items jsonb, p_coupon_code text DEFAULT NULL) RETURNS jsonb`، لـ `anon` و`authenticated`، ترجع `{lines[], base_subtotal, line_reductions, subtotal, applied_promotions[], coupon:{code, reduction, reason}}`. وتُعاد كتابة `preview_coupon(p_code, p_items)` (آخر تعريف [variants.sql](<../supabase/migrations/20260920001700_variants.sql>) L163) لتستخدم `price_cart_lines`؛ وإلا قالت المعاينة إن الكوبون مقبول بينما يرفضه الدفع.
- **العروض العامة:** `DROP` ثم إعادة إنشاء `get_active_promotions()` مع إضافة `promotion_type text, buy_quantity integer, get_quantity integer, get_discount_percent numeric, tiers jsonb, bundle_price numeric, bundle_items jsonb` في نهاية `RETURNS TABLE`.
- **إدارة العروض:** `DROP` للنسخة الحالية من `admin_save_promotion(...)` ([promotions.sql](<../supabase/migrations/20260920001900_promotions.sql>) L118)، وإعادة إنشائها بالمعاملات الحالية مضافاً إليها في النهاية: `p_promotion_type text DEFAULT 'item_discount', p_buy_quantity integer DEFAULT NULL, p_get_quantity integer DEFAULT NULL, p_get_discount_percent numeric DEFAULT NULL, p_tiers jsonb DEFAULT NULL, p_bundle_items jsonb DEFAULT NULL, p_bundle_price numeric DEFAULT NULL, p_max_applications_per_order integer DEFAULT NULL, p_target_category_id uuid DEFAULT NULL, p_target_brand_id uuid DEFAULT NULL`. وتكتب `promotion_bundle_items` ذرياً.

### 7.4 بوابة الإدارة
- **صفحة النموذج:** [PromotionsPage.tsx](<../admin-portal/src/pages/PromotionsPage.tsx>) تبقى قائمةً، ويُنقل النموذج إلى `admin-portal/src/pages/PromotionFormPage.tsx` على المسارين `/promotions/new` و`/promotions/edit/:id`. يتضمن محدد نوع وحقولاً شرطية:
  - X و`get_quantity` والنسبة.
  - جدول شرائح.
  - منتقي منتجات الحزمة بكمياتها وسعرها مع عرض «توفير الحزمة».
  - الحد الأقصى للتطبيقات.
- **الاستهداف:** بالتصنيف أو العلامة من جداول المرحلة 2.
- **API:** `savePromotion` في [catalogApi.ts](<../admin-portal/src/lib/catalogApi.ts>) L555–570 يرسل المعاملات الجديدة، والتسميات في L538.
- **عرض الطلب:** [pricing.ts](<../admin-portal/src/lib/pricing.ts>) `orderLineRuleLabel` يعرض نوع العرض في تفاصيل الطلب.

### 7.5 `src/` و`mobile-app`
- **`src/`:**
  - [offer.ts](<../src/domain/entities/offer.ts>) و[offers.ts](<../src/application/services/offers.ts>): أنواع وتسميات جديدة، مثل «اشترِ 2 واحصل على 1 مجاناً»، و«خصم 10% عند شراء 3+»، و«حزمة بسعر …».
  - [catalogRepository.ts](<../src/infrastructure/repositories/catalogRepository.ts>) L7–29: قبول الأنواع الجديدة.
  - [orderRepository.ts](<../src/infrastructure/repositories/orderRepository.ts>): إضافة `previewCartPricing` التي تستدعي `preview_cart_pricing`.
  - [CartPage.tsx](<../src/presentation/pages/customer/CartPage.tsx>) و[CheckoutPage.tsx](<../src/presentation/pages/customer/CheckoutPage.tsx>) L182–187: عرض المجاميع والعروض المطبقة من المعاينة بدل الحساب المحلي. ويبقى [pricing.ts](<../src/domain/valueObjects/pricing.ts>) `cartUnitPrice` لسعر البند الفردي فقط.
  - صفحة `/offers` ([OffersPage.tsx](<../src/presentation/pages/customer/OffersPage.tsx>)) تعرض الأنواع الجديدة، وشارة في صفحة المنتج.
- **`mobile-app`:**
  - [cart.tsx](<../mobile-app/app/(tabs)/cart.tsx>) L12 و[checkout.tsx](<../mobile-app/app/checkout.tsx>) L65 تستدعيان `/rest/v1/rpc/preview_cart_pricing` للمجموع بدل `getDiscountedPrice`.
  - شاشة عروض للجوال خارج النطاق.

### 7.6 المهام
- [ ] كتابة `20261021000100_promotion_types_schema.sql` وتعبئة `target_category_id` و`target_brand_id` من النص.
- [ ] كتابة `20261021000200_cart_promotions_pricing.sql`: `promotion_matches_product`، و`evaluate_cart_promotions`، و`price_cart_lines`، و`effective_price`، و`checkout_order_safe` (كل النسخ الحية)، و`preview_cart_pricing`، و`preview_coupon`، و`get_active_promotions`، و`admin_save_promotion`.
- [ ] بناء `PromotionFormPage` وتحديث `catalogApi.ts`.
- [ ] تحديث السلة والدفع وصفحة العروض في `src/`، والسلة والدفع في `mobile-app`.
- [ ] إعادة توليد الأنواع و`full_schema_setup.sql`.

### 7.7 المخاطر
- **الانحراف بين مسارات الدفع:** مسار الجوال القديم سيعطي سعراً مختلفاً إن لم يُحدَّث. لذلك المعيار: اختبار يقارن المسارين.
- **المرتجعات الجزئية:** `effective_unit_price` الموزّع يعني أن مرتجع وحدة «مجانية» يُسترد بالمتوسط. **تحقق** من صيغة الاسترداد في `request_order_return` و`review_order_return` (`20261017000100`) ووثّق القاعدة.
- **الأداء:** أداء الخوارزمية الجشعة مقبول لعدد عروض نشطة صغير. يُضاف فهرس `promotions (promotion_type, start_date, end_date)` إن لزم.

### 7.8 معايير القبول
- [ ] توسيع [promotions.test.ts](<../tests/backend/promotions.test.ts>):
  - التحقق من شكل كل نوع.
  - `buy_x_get_y` بثلاث وحدات يخفض الأرخص.
  - الشرائح تختار الأعلى المؤهل.
  - الحزمة تُطبق `k` مرات.
  - عدم التراكم مع خصم المنتج (يفوز الأكبر صافياً).
  - `promotion_id` مسجل في `orders.items`.
  - حذف عرض مستخدم يُرفض.
- [ ] توسيع [coupons.test.ts](<../tests/backend/coupons.test.ts>): كوبون أقل من عرض السلة يُرفض بالسبب `not_best` في المعاينة والدفع معاً، وكوبون أكبر يُقبل ويلغي عرض السلة. ويبقى اختبار «المعاينة = المبلغ المدفوع» ناجحاً.
- [ ] توسيع [pricing.test.ts](<../tests/backend/pricing.test.ts>) و[offers.test.ts](<../tests/backend/offers.test.ts>): `effective_price` يتجاهل الأنواع 2–4، و`get_active_promotions` يُرجع الحقول الجديدة.
- [ ] اختبار يقارن `preview_cart_pricing` مع ما يدفعه `checkout_order_safe` ومع `checkout_order_with_growth` للسلة نفسها.
- [ ] `tests/unit/pricing.test.ts` و`tests/unit/offers.test.ts` محدّثان بالتسميات الجديدة، و`npm test` ناجح.
- [ ] الأوامر: كما في المرحلة 2.

---

## 7b. المرحلة 5 — التشغيل: المندوب والتوصيل وأدوات مدير المستودع (الملاحظات 9، 12، 13، 15، 20، 21)

> واجهات المدير تُبنى في `admin-portal` (§2.2)، لا في `/supervisor` المجمّدة. واجهات المندوب تبقى في `src/presentation/pages/driver`. تعتمد هذه المرحلة على المرحلتين 1 و1b، ولا تعتمد على المراحل 2–4.

### 7b.1 قائمة «يحتاج إجراء» والموعد المتوقع (`20261022000100_order_eta_needs_action.sql`) — الملاحظتان 9 و13
- **التحقق من الكود:**
  - [supervisorRepository.ts](<../src/infrastructure/repositories/supervisorRepository.ts>) L128 يستبعد `delivery_failed`، وفلتر الحالة في [SupervisorHomePage.tsx](<../src/presentation/pages/supervisor/SupervisorHomePage.tsx>) L66 لا يتضمنها.
  - في المقابل يُقال للمندوب «تمت إعادة توجيه الطلب لإدارة المستودع» ([DriverOrderPage.tsx](<../src/presentation/pages/driver/DriverOrderPage.tsx>) L554).
  - الموعد المتوقع يُلصق بوسمَي `[الموعد المتوقع: …]` و`[تحديث: …]` فوق `order.notes` الموجودة (`SupervisorHomePage.tsx` L194–215)، فتتراكم الوسوم مع كل حفظ.
  - يرى المندوب هذه الوسوم تحت عنوان «ملاحظات العميل» (`DriverOrderPage.tsx` L289–294).
  - لا عمود موعد في `orders`؛ `eta_minutes` الموجود هو مخرجات عرض سعر التوصيل فقط.
- **نموذج البيانات:**
  ```sql
  ALTER TABLE public.orders
    ADD COLUMN estimated_delivery_at timestamptz,
    ADD COLUMN staff_note text;
  ```
  - العميل يقرأ صفوف طلباته عبر RLS، فقد يرى `staff_note`. **تحقق** من منح أعمدة `orders`. إن لزم إخفاؤها تُنقل إلى جدول `order_staff_notes` بسياسة RLS للطاقم فقط.
- **RPCs:**
  - **`public.staff_set_order_eta(p_order_id uuid, p_estimated_delivery_at timestamptz, p_note text DEFAULT NULL) RETURNS void`:**
    - الحارس `can_manage_warehouse`، والحالة قبل `delivered`.
    - يكتب `order_status_history` بالحالة الحالية وملاحظة «تحديث الموعد».
  - **`supervisor_update_order` (المرحلة 1):** المعامل `p_notes` يكتب في `staff_note` بدل `orders.notes`.
  - **`public.staff_get_orders_needing_action(p_warehouse_id uuid DEFAULT NULL) RETURNS TABLE(order_id uuid, order_number text, status text, reason text, since timestamptz, warehouse_id uuid)`:**
    - الأسباب:
      - `delivery_failed` لم يُعَد إسناده ولم يُلغَ.
      - `needs_fulfillment_review`.
      - `stale`: الطلب في `confirmed|preparing` أكثر من N ساعة. **تحقق** من منطق `stale-orders.test.ts` لإعادة استخدامه.
      - `failed_return_pending` (§7b.2).
    - النطاق `can_manage_warehouse`.
  - **`get_my_deliveries`:** `DROP` ثم `CREATE` بإضافة `estimated_delivery_at timestamptz` و`staff_note text` في النهاية، بعد `cod_collected` من 1b.
- **تنظيف البيانات:** استعلام يعدّ الطلبات التي تحوي الوسوم، ثم `UPDATE` يزيلها بتعبير منتظم بعد مراجعة عينة **(تحقق)** على القاعدة الحية. لا يُستخرج الموعد من النص.
- **الواجهات:**
  - **`admin-portal` [OrderListPage.tsx](<../admin-portal/src/pages/orders/OrderListPage.tsx>):** تبويب «يحتاج إجراء» مع عدّاد في `AdminLayout.tsx`، يتحدث مع الاشتراك الحي على `orders`.
  - **[OrderDetailPage.tsx](<../admin-portal/src/pages/orders/OrderDetailPage.tsx>):** محرر الموعد والملاحظة الداخلية.
  - **المندوب:** `DriverOrderPage.tsx` يعرض «الموعد المتوقع» و«تعليمات المستودع» منفصلين عن «ملاحظات العميل». تصبح رسالة L554 صادقة لأن الطلب يظهر الآن في قائمة المدير.
  - **العميل:** صفحة تفاصيل الطلب في `src/` تعرض الموعد المتوقع.

### 7b.2 التعبئة والتسليم للمندوب وإثبات التسليم والعودة للمستودع (`20261022000200_packing_handover_proof.sql`) — الملاحظتان 12 و21
- **التحقق من الكود:**
  - قائمة التعبئة `useState` فقط (`SupervisorHomePage.tsx` L73، L123–131)، وزر «في الطريق» لا يشترطها (L793–794)، ولا توقيع تسليم.
  - قائمة المندوب `useState` أيضاً (`DriverOrderPage.tsx` L50، L89)، فتضيع بإعادة التحميل.
  - لا صورة إثبات تسليم.
  - قيد الحالات بلا «عودة للمستودع» ([release_order_resources.sql](<../supabase/migrations/20260920000200_release_order_resources.sql>) L9–10).
  - لا شيء يتحقق أن الطلب المتعذر عاد فعلاً قبل إلغائه، مع أن الإلغاء يعيد المخزون عبر `release_order_resources` (§4.4).
- **نموذج البيانات:**
  ```sql
  CREATE TABLE public.order_item_checks (
    order_id    uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    stage       text NOT NULL CHECK (stage IN ('packing','pickup')),
    line_no     integer NOT NULL,
    checked_qty integer NOT NULL CHECK (checked_qty >= 0),
    checked_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    checked_at  timestamptz NOT NULL DEFAULT timezone('utc', now()),
    PRIMARY KEY (order_id, stage, line_no)
  );
  ALTER TABLE public.orders
    ADD COLUMN packed_at timestamptz,
    ADD COLUMN packed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN handed_over_at timestamptz,
    ADD COLUMN delivery_proof_path text,
    ADD COLUMN returned_to_warehouse_at timestamptz,
    ADD COLUMN returned_received_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  ALTER TABLE public.app_settings
    ADD COLUMN require_packing_check boolean NOT NULL DEFAULT false,
    ADD COLUMN require_delivery_proof boolean NOT NULL DEFAULT false;
  ```
  - `line_no` هو ترتيب البند في `orders.items`، وهو الترتيب الذي يستخدمه `get_my_deliveries` بـ `WITH ORDINALITY`.
  - RLS: قراءة للأدمن، وللمدير بالنطاق، وللمندوب المسند. الكتابة عبر RPC فقط.
- **«العودة للمستودع» عمود لا حالة جديدة:** إضافة قيمة إلى قيد `status` تمس مصفوفات الانتقال ([payment_guard.sql](<../supabase/migrations/20260924000600_payment_guard.sql>) L89–95، و`admin-portal/src/lib/format.ts` L1 وL61–64)، وتمس التقارير والجوال أيضاً.
- **RPCs:**
  - `public.staff_set_item_check(p_order_id uuid, p_line_no integer, p_checked_qty integer) RETURNS void`: الحارس `can_manage_warehouse`، والمرحلة `packing`، والحالة `confirmed|preparing`.
  - `public.staff_mark_packed(p_order_id uuid) RETURNS void`: يشترط فحص كل البنود بكمياتها الكاملة، ثم يضبط `packed_at` و`packed_by`، وينقل `confirmed→preparing` إن لزم.
  - `public.driver_set_pickup_check(p_order_id uuid, p_line_no integer, p_checked_qty integer) RETURNS void`: للمندوب المسند، والمرحلة `pickup`. هذه هي «القائمة الدائمة» للمندوب.
  - **`update_driver_order_status`:** `DROP` ثم `CREATE` بالمعاملات الحالية، ومنها `p_delivery_code` من 1b، مضافاً إليها `p_proof_path text DEFAULT NULL`:
    - **`shipped`:** مع تفعيل `require_packing_check` يُشترط `packed_at` واكتمال فحص `pickup` لكل البنود. ثم يُضبط `handed_over_at`، أي توقيع التسليم: عدد القطع المفحوصة = `item_count`.
    - **`delivered` و`delivery_failed`:** بادئة `p_proof_path` يجب أن تكون `{order_id}/`، والمسار إلزامي لـ `delivered` مع تفعيل `require_delivery_proof`.
    - **عدم التكرار:** إن كانت الحالة الحالية هي المطلوبة والمندوب نفسه، تُرجَع الحالة دون خطأ. هذا شرط لطابور العمل دون اتصال (§7b.6).
  - **`supervisor_update_order`:**
    - `preparing→shipped` يشترط `packed_at` عند تفعيل العلم.
    - `delivery_failed→cancelled` يشترط `returned_to_warehouse_at`، وإلا أعاد `release_order_resources` مخزوناً ما زال مع المندوب.
  - `public.staff_confirm_failed_delivery_return(p_order_id uuid, p_note text DEFAULT NULL) RETURNS void`: الحارس `can_manage_warehouse`، والحالة `delivery_failed`. يضبط `returned_to_warehouse_at` ويسجّل في التاريخ.
- **التخزين:**
  - bucket خاص `delivery-proofs` (صور فقط، 5MB)، والمسار `{order_id}/{timestamp}.jpg`.
  - `INSERT` للمندوب المسند عبر دالة مساعدة `public.is_assigned_driver(p_order_id uuid)`، و`SELECT` للأدمن ولمن يحقق `can_manage_warehouse`.
  - **تحقق** من صلاحية إنشاء الـ bucket كما في §6.1.
- **الواجهات:**
  - **`admin-portal` `OrderDetailPage.tsx`:** قائمة تعبئة محفوظة وزر «تم التجهيز»، وزر «استلام المرتجع في المستودع» للطلب المتعذر، وعرض صورة الإثبات بـ `createSignedUrl`.
  - **المندوب:** قائمة الاستلام من الخادم بدل `useState`، والتقاط صورة (Capacitor Camera أو `<input capture>`) قبل «تم التسليم».

### 7b.3 تنبيهات الطاقم ونقص المخزون (`20261022000300_staff_notifications_low_stock.sql`) — الملاحظة 15
- **التحقق من الكود:** لا توجد آلية تنبيه، والعرض فقط:
  - `low_stock` في تقرير الأدمن (`20261017000100` L46–59).
  - [InventoryPage.tsx](<../admin-portal/src/pages/InventoryPage.tsx>) L46–47.
  - فلتر `lowStockOnly` في `/supervisor`.
- **نموذج البيانات:**
  ```sql
  CREATE TABLE public.staff_notifications (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE CASCADE,
    kind         text NOT NULL CHECK (kind IN ('low_stock','delivery_failed','remittance_submitted')),
    title        text NOT NULL,
    body         text,
    ref_type     text,
    ref_id       uuid,
    read_at      timestamptz,
    created_at   timestamptz NOT NULL DEFAULT timezone('utc', now())
  );
  CREATE UNIQUE INDEX staff_notifications_unread_dedupe ON public.staff_notifications (user_id, kind, ref_id) WHERE read_at IS NULL;
  ```
  - RLS: المستخدم يقرأ صفوفه فقط، والتعليم كمقروء عبر `public.mark_staff_notifications_read(p_ids uuid[])`.
- **المشغّل `warehouse_inventory_low_stock_notify()`** (AFTER UPDATE OF `quantity`, `reorder_level`):
  - يعمل عند العبور: `OLD.quantity > NEW.reorder_level AND NEW.quantity <= NEW.reorder_level AND NEW.reorder_level > 0`.
  - يُدرج تنبيهاً لكل مدير للمستودع (من `warehouse_manager_access`) ولكل أدمن، مع `ON CONFLICT DO NOTHING`.
  - بالآلية نفسها: `delivery_failed` من `update_driver_order_status`، و`remittance_submitted` من `driver_submit_cash_remittance`.
- **بريد اختياري:** إدراج في `notification_queue` لعناوين `app_settings.notification_emails`. **تحقق** من شكل `notification_queue` (baseline L1413) ومن الجهة التي تعالجها.
- **الواجهة:** جرس في `AdminLayout.tsx` بعدد غير المقروء (Realtime أو استطلاع)، وصفحة `/notifications` (`access: 'staff'`).

### 7b.4 قراءات تشغيلية: تفصيل التجزئة، وخريطة المناديب، وملخص المندوب (`20261022000400_staff_ops_reads.sql`) — الملاحظتان 15 و21
- **تفصيل التجزئة:**
  - **التحقق:** [gps07_split_fulfillment_flag.sql](<../supabase/migrations/20261001000900_gps07_split_fulfillment_flag.sql>) يضيف فقط `orders.needs_fulfillment_review` (L4–5) ودوال القائمة والمسح (L13–41)، ولا يخزّن أي تقسيم لكل مستودع. ولا توجد واجهة تفصيل.
  - **`public.staff_get_fulfillment_breakdown(p_order_id uuid) RETURNS TABLE(line_no integer, product_id uuid, name_ar text, quantity integer, warehouse_id uuid, warehouse_name text, available integer, is_fulfillment_warehouse boolean)`:**
    - تبني النتيجة من `orders.items` و`warehouse_inventory` لكل المستودعات النشطة.
    - الحارس `can_manage_warehouse(order.fulfillment_warehouse_id)`، والمدير يرى أرقام المستودعات الأخرى أعداداً للقراءة فقط.
  - **الواجهة:** لوحة في `OrderDetailPage.tsx` تظهر حين `needs_fulfillment_review` (L186)، ويُتخذ منها قرار النقل بـ `transfer_warehouse_stock`.
- **خريطة المناديب:**
  - **التحقق:** الجدول `driver_last_locations` موجود (baseline L1312–1317: `driver_id`، و`latitude`، و`longitude`، و`accuracy_meters`، و`updated_at`)، وRLS تقصره على الأدمن (L2649)، وهو في publication (L2914). لكن لا واجهة تقرؤه.
  - **`public.staff_get_driver_locations(p_warehouse_id uuid DEFAULT NULL) RETURNS TABLE(driver_id uuid, name text, status text, latitude numeric, longitude numeric, accuracy_meters numeric, updated_at timestamptz, active_order_numbers text[])`:** المدير يرى مناديب مستودعاته فقط.
  - **الواجهة:** صفحة `admin-portal/src/pages/DriversMapPage.tsx` على `/drivers/map` (`access: 'staff'`) بمكتبة Leaflet واستطلاع كل 20 ثانية. يُضاف `leaflet` و`@types/leaflet` إلى `admin-portal/package.json`، وهما موجودان في `package.json` الجذر فقط.
- **ملخص المندوب (أولوية منخفضة):**
  - **التحقق:** لا شاشة أرباح. أرقام COD لكل مندوب موجودة فقط في `get_warehouse_settlement_summary` (`full_cash_cycle.sql` L340–363)، ولا نموذج أجر للمندوب في القاعدة (§9.2).
  - **`public.get_my_driver_summary(p_from date, p_to date) RETURNS jsonb`:** عدد الطلبات المسلّمة والمتعذرة، والنقد المحصّل والمسلَّم من دفتر 1b.

### 7b.5 إشعارات المندوب (`20261022000500_staff_push_tokens_assignment_push.sql`) — الملاحظة 21
- **التحقق من الكود:**
  - `supervisor_assign_driver` (`full_cash_cycle.sql` L232–258) لا يرسل أي إشعار.
  - `register_push_token` ([push_fcm.sql](<../supabase/migrations/20260924000000_push_fcm.sql>) L48–92) يكتب `auth.uid()` في `customer_push_tokens.customer_id` (L58، L74–77).
  - الجدول بلا عمود للجمهور (L13–14)، فرمز المندوب يُخزَّن كرمز عميل.
- **البيانات:** `ALTER TABLE public.customer_push_tokens ADD COLUMN app_audience text NOT NULL DEFAULT 'customer' CHECK (app_audience IN ('customer','driver'));`
- **`register_push_token`:** `DROP` ثم `CREATE` بإضافة `p_app_audience text DEFAULT 'customer'` في النهاية، والقيمة `driver` تتطلب `is_driver()`. تبقى `register_customer_push_token` كما هي.
- **إشعارات العملاء:** المُرسِل يرشّح `app_audience='customer'`. **تحقق** من مكان الإرسال (`push_notification_deliveries` في baseline L1617 والدالة المرسِلة).
- **إشعار الإسناد:**
  - مشغّل `on_order_driver_assigned` (AFTER UPDATE OF `driver_id` على `orders`، حين يصبح غير `NULL` ومختلفاً) يستدعي دالة Edge جديدة `supabase/functions/driver-assignment-push/index.ts`، بنمط `on_order_delivery_status_push` (baseline L1114، L2164).
  - الدالة تتحقق أن المستدعي أدمن أو يحقق `can_manage_warehouse`، ثم ترسل لرموز `driver` الخاصة بـ `drivers.user_id`.
- **العميل:** واجهة المندوب تسجّل الرمز بـ `p_app_audience='driver'`. **تحقق** من مكان تسجيل الرمز في `src/` اليوم (Capacitor).

### 7b.6 واجهة المندوب (عميل فقط) — الملاحظتان 20 و21
- **مفتاح التوفّر (الملاحظة 20):**
  - **التحقق:** `setOnline` معرّفة في [DriverContext.tsx](<../src/presentation/pages/driver/DriverContext.tsx>) L48–51 ولا يستخدمها أي مكوّن، بينما تطلب الحالة الفارغة في `DriverHomePage.tsx` L143 «فعّل "متاح"». كذلك `sharing` و`lastSentAt` (L54–57) لا يعرضهما أي مكوّن.
  - **الإصلاح:**
    - مفتاح «متاح / غير متاح» في رأس `DriverHomePage.tsx` بحالة انشغال.
    - منع «غير متاح» مع وجود طلب `shipped`. **تحقق** هل تفرض دالة `setMyAvailability` في الخادم هذا الشرط.
    - شارة مشاركة الموقع: نشطة، أو متوقفة، أو الإذن مرفوض، مع «آخر إرسال منذ…».
- **طابور دون اتصال:**
  - `src/infrastructure/offline/driverActionQueue.ts` يحفظ تحديثات الحالة وفحوص الاستلام في IndexedDB ويعيد إرسالها عند `online`، معتمداً على عدم التكرار في §7b.2.
  - الصور تُرفع قبل الإرسال.
  - `delivered` غير متاح دون اتصال حين يكون الرمز مطلوباً، لأن التحقق في الخادم.
- **ترتيب المسار:**
  - `src/application/services/routeOrdering.ts` يرتّب الطلبات النشطة بالمسافة (haversine من الموقع الحالي إلى `customer_lat`/`customer_lng`)، ويرجع إلى `created_at` حين لا يتوفر الموقع.
  - الخادم يرتّب اليوم بالحالة ثم `created_at` فقط (`driver_rpc_product_ids.sql` L49).
- **مربعات الحوار:** استبدال `window.confirm` في `DriverOrderPage.tsx` L106 وL111 بمربع حوار مشترك (§7c.6).
- **شاشة الملخص:** من `get_my_driver_summary`.

### 7b.7 المهام
- [ ] كتابة migrations `20261022000100` إلى `20261022000500` بالترتيب، مع تنظيف وسوم الموعد بعد المراجعة.
- [ ] إنشاء bucket `delivery-proofs` وسياساته، وإنشاء الدالة `driver-assignment-push` ونشرها.
- [ ] **بوابة الإدارة:** تبويب «يحتاج إجراء»، ومحرر الموعد، والتعبئة، واستلام المرتجع، وتفصيل التجزئة، و`DriversMapPage`، وجرس التنبيهات.
- [ ] **المندوب:** مفتاح التوفّر وشارة الموقع، والقائمة المحفوظة، وصورة الإثبات، والطابور دون اتصال، وترتيب المسار، والملخص، وتسجيل الرمز بجمهور `driver`.
- [ ] تفعيل `require_packing_check` و`require_delivery_proof` بعد تدريب المستودعات.
- [ ] إعادة توليد `supabase/full_schema_setup.sql` وملفات `database.types.ts`.

### 7b.8 المخاطر
- **إعادة تعريف `update_driver_order_status`** للمرة الثانية بعد 1b: يجب أن تبقى كل الشروط السابقة، ويكشف ذلك اختبار `driver-flow`.
- **الطابور دون اتصال** قد يرسل تحديثاً لطلب أُعيد إسناده. الخادم يرفضه لأن `driver_id` مختلف، والواجهة تعرض الرفض وتحذف العنصر من الطابور.
- **دقة الموقع** في الخريطة تعتمد على تكرار الإرسال من `useLocationSharing`.
- **تكرار التنبيهات:** فهرس عدم التكرار يمنع التكرار ما دام التنبيه غير مقروء فقط.

### 7b.9 معايير القبول
- [ ] **اختبار جديد `tests/backend/warehouse-ops.test.ts`** بنمط ترقية العميل إلى مدير `KRT`:
  - `staff_get_orders_needing_action` يُرجع طلب `delivery_failed` من `KRT` ولا يُرجع طلبات `PZU`.
  - `staff_set_order_eta` لا يغيّر `orders.notes`.
  - `delivery_failed→cancelled` قبل استلام المرتجع يُرفض.
  - `shipped` قبل `packed_at` يُرفض مع تفعيل العلم.
  - تكرار `delivered` من المندوب نفسه يُرجع الحالة بلا خطأ.
  - انخفاض المخزون تحت `reorder_level` يُنشئ تنبيهاً واحداً للمدير.
  - `staff_get_driver_locations` لا يُرجع مناديب مستودع آخر.
- [ ] **`driver-flow.test.ts`** ما زال ناجحاً، ومعه حالات صورة الإثبات وبادئة المسار.
- [ ] **يدوي:**
  - إسناد طلب يوصل إشعاراً للمندوب.
  - مفتاح التوفّر يغيّر `drivers.status`.
  - الطابور يعيد الإرسال بعد عودة الاتصال.
- [ ] الأوامر: كما في المرحلة 1.

---

## 7c. المرحلة 6 — موقع العميل (الملاحظات 23، 25–29)

> تعتمد على 1b لأن إزالة البيانات الوهمية وحالات الخطأ تمت هناك، وعلى المرحلة 4 لأن `preview_cart_pricing` تعيد تقييم الكوبون في §7c.3. تغييرات `src/` فقط، عدا migrations §7c.3 و§7c.6.

### 7c.1 الكاش — الملاحظة 23
- **التحقق من الكود:**
  - [cache.ts](<../src/infrastructure/cache.ts>) L4: `const DEFAULT_TTL_MS = 50 * 60 * 1000; // 10 minutes`.
  - L41 يعطي المدخل المقروء من `localStorage` طابعاً زمنياً جديداً (`ts: Date.now()`)، فيبدأ عدّ الصلاحية من جديد مع كل تحميل للصفحة.
  - دالة stale-while-revalidate موجودة (L79–98) لكن لا يستدعيها أي مستودع؛ كلها تستخدم `cachedFetch` (L67–77).
- **الإصلاح:**
  - صلاحية 10 دقائق للكتالوج، و5 دقائق لطرق الدفع والمناطق، وتعليق مطابق للقيمة.
  - حفظ `ts` الأصلي عند القراءة من `localStorage`.
  - استخدام دالة SWR لقراءات الكتالوج، مع تحديث في الخلفية عند `visibilitychange`.

### 7c.2 السلة والمفضلة — الملاحظة 25
- **التحقق من الكود:**
  - `addToCart` ([StoreContext.tsx](<../src/presentation/context/StoreContext.tsx>) L282–304) و`updateQuantity` (L318–324) لا يقرآن `stock`.
  - كتابات المفضلة (L341–345، L354–356) تبدأ بـ `void supabase...` بلا انتظار ولا فحص خطأ ولا تراجع عن التحديث المتفائل.
  - هذه الكتابات تعمل داخل دالة تحديث `setWishlist`، فقد تُنفَّذ مرتين في StrictMode.
- **الإصلاح:**
  - الكمية تُسقف بـ `product.stock` لمجموع متغيرات المنتج نفسه (المخزون لكل منتج، ADR 0001)، مع تنبيه للعميل.
  - إعادة التحقق من السلة بمخزون حديث عند دخول `CheckoutPage`. **تحقق** أن `get_public_products` يُرجع `stock` للعملاء.
  - كتابات المفضلة تخرج من دالة التحديث، مع `await` وتراجع ورسالة عند الخطأ.

### 7c.3 الدفع: بديل GPS وإعادة تقييم الكوبون (`20261023000300_checkout_location_fallback.sql`، مشروطة) — الملاحظة 26
- **التحقق من الكود:**
  - `CheckoutPage.tsx` يمنع الإرسال (L233–240) ويعطّل الزر حين `gps.status !== 'granted'` (L406).
  - الخادم يشترط الإحداثيات أيضاً (`store_customer_gps_in_order.sql` L92–95)، ويستخدمها في `resolve_fulfillment_warehouses` (L151) و`calculate_delivery_quote` (L199).
  - `CheckoutPage.tsx` L212–213 يستدعي `setCoupon(null)` عند أي تغير في `cartSignature`، دون رسالة.
- **بديل GPS (حسب قرار §9.2):**
  - حين يُرفض إذن الموقع يختار العميل الولاية والمحلية والعنوان.
  - `checkout_order_safe` تقبل إحداثيات `NULL` مع منطقة محددة، وتستخدم مركز المنطقة لاختيار المستودع وعرض السعر. **تحقق** من وجود إحداثيات للمناطق في جدولها.
  - تُضبط `orders.location_source='zone'` (عمود جديد) و`needs_fulfillment_review=true`، ليؤكد الطاقم العنوان هاتفياً.
  - إعادة التعريف تحمل منطق 1b والمرحلة 4.
- **الكوبون:** بدل الإزالة الصامتة، تُعاد المعاينة بـ `preview_cart_pricing` تلقائياً. إن لم يعد الكوبون صالحاً تظهر رسالة بالسبب ويبقى الرمز في الحقل.

### 7c.4 تحسين محركات البحث (SEO) — الملاحظة 27
- **التحقق من الكود:**
  - [index.html](<../index.html>) L12–13 فيه وصف و`<title>` ثابتان، بلا وسوم OG.
  - لا `document.title` ولا `react-helmet` في `src`.
  - `public/` يحوي `.htaccess` و`logo.PNG` و`manifest.webmanifest` فقط، فلا `robots.txt` ولا sitemap.
- **الإصلاح:**
  - خطاف `src/presentation/hooks/usePageMeta.ts` يضبط العنوان والوصف و`og:*` و`canonical` لكل صفحة. صفحة المنتج تستخدم اسمه وصورته وسعره.
  - إضافة `public/robots.txt`.
  - سكربت `scripts/generate-sitemap.mjs` يُشغَّل ضمن `build`، ويكتب `dist/sitemap.xml` من المنتجات النشطة والتصنيفات.
- **قيد:** الموقع SPA بلا SSR، فمعاينات الروابط (واتساب وفيسبوك) لا تنفّذ JavaScript وترى وسوم `index.html` فقط. التصيير المسبق لصفحات المنتجات خارج النطاق.

### 7c.5 نقاط الولاء والإحالات والتنبيه بالتوفر والمفضلة — الملاحظة 28
- **التحقق من الكود:**
  - [orderRepository.ts](<../src/infrastructure/repositories/orderRepository.ts>) L126–138 لا يرسل `p_points_to_redeem`، مع أن المعامل موجود في `checkout_order_safe` (`store_customer_gps_in_order.sql` L31).
  - `subscribe_restock` معرّفة (baseline L1033) ولا تُستدعى في `src`.
  - لا مسارات للولاء أو الإحالات أو المفضلة في [App.tsx](<../src/App.tsx>) L114–139.
  - `mobile-app` يملك كل ذلك: `checkout.tsx` L37–38 وL95–96، و`loyalty.tsx`، و`referrals.tsx`، و`favorites.tsx`، و`tips-api.ts` L304.
- **الإصلاح:**
  - الصفحات `LoyaltyPage.tsx` و`ReferralsPage.tsx` و`FavoritesPage.tsx` في `src/presentation/pages/customer/`، بإعادة استخدام RPCs التي يستدعيها `mobile-app`.
  - رصيد النقاط واستبدالها في الدفع بإرسال `p_points_to_redeem`، ورمز الإحالة إن كان معاملاً في نسخة الويب **(تحقق)**.
  - زر «أعلميني عند التوفر» في صفحة المنتج النافد، يستدعي `subscribe_restock`.

### 7c.6 تحسينات متفرقة (`20261023000100_customer_addresses.sql`، `20261023000200_paginated_product_reviews.sql`) — الملاحظة 29
- **العناوين المحفوظة:**
  - **التحقق:** لا جدول ولا واجهة للعناوين.
  - **الإصلاح:** جدول `customer_addresses(id, customer_id, label, recipient_name, phone, state, city, address_line, latitude, longitude, is_default, created_at, updated_at)` بفهرس جزئي فريد للعنوان الافتراضي، وRLS للمالك فقط. يُختار العنوان في الدفع، ويُحفظ الجديد اختيارياً.
- **إعادة الطلب:** **جزئية**، فالزر موجود في `OrderDetailPage.tsx` L207. يُضاف أيضاً في قائمة الطلبات.
- **الترقيم:**
  - **الطلبات:** `orderRepository.ts` L61 بلا `.range`. الإصلاح `.range` مع «تحميل المزيد».
  - **المراجعات:** [reviewRepository.ts](<../src/infrastructure/repositories/reviewRepository.ts>) L5 يجلبها كلها في استدعاء واحد. الإصلاح `DROP` ثم `CREATE` لدالة RPC المراجعات (**تحقق** من اسمها)، مع `p_limit integer DEFAULT NULL, p_offset integer DEFAULT 0` في النهاية. القيمة `NULL` تعني «الكل»، فلا يتغير سلوك `mobile-app`.
- **`StoreProvider`:**
  - **التحقق:** [main.tsx](<../src/main.tsx>) L35 يغلّف كل التطبيق، ومنه مسارات المندوب (`App.tsx` L77) والمشرف (L95)، فيُحمَّل الكتالوج فيها بلا حاجة.
  - **الإصلاح:** نقله إلى مسار تخطيط العميل.
- **الصور:**
  - **التحقق:** لا سمات `width`/`height` في [ProductCard.tsx](<../src/presentation/components/ui/ProductCard.tsx>) L87–101 ولا في `ProductDetailsPage.tsx` L133–142. كذلك `productRepository.ts` L29–36 يضيف `width`/`quality`/`format` إلى `/storage/v1/object/public/`، وهذا المسار يتجاهلها.
  - **الإصلاح:** إضافة السمات، واستخدام `/storage/v1/render/image/public/` مع الرجوع للأصل. **تحقق** من تفعيل تحويل الصور في خطة Supabase.
- **إمكانية الوصول:**
  - **التحقق:** `<Link>` في `ProductCard.tsx` L46–171 يحوي ثلاثة أزرار (L51، L62، L139).
  - **الإصلاح:** البطاقة عنصر `article`، والرابط على الصورة والعنوان، والأزرار خارجه.
- **`window.confirm`:**
  - **التحقق:** يُستخدم في `OrderDetailPage.tsx` L107 (العميل) و`DriverOrderPage.tsx` L106 وL111.
  - **الإصلاح:** مكوّن مشترك `ConfirmDialog` في `src/presentation/components/ui/`.
- **محدد الكمية:**
  - **التحقق:** `ProductDetailsPage.tsx` L95 يضيف وحدة واحدة دائماً.
  - **الإصلاح:** محدد كمية مسقوف بالمخزون (§7c.2).

### 7c.7 المهام
- [ ] الكاش (§7c.1) والسلة والمفضلة (§7c.2).
- [ ] قرار بديل GPS (§9.2)، ثم `20261023000300_checkout_location_fallback.sql` إن اعتُمد، وإعادة تقييم الكوبون.
- [ ] `usePageMeta`، و`robots.txt`، و`scripts/generate-sitemap.mjs`.
- [ ] صفحات الولاء والإحالات والمفضلة، والتنبيه بالتوفر، والنقاط في الدفع.
- [ ] `20261023000100_customer_addresses.sql` و`20261023000200_paginated_product_reviews.sql` وواجهاتهما.
- [ ] نقل `StoreProvider`، والصور، و`ProductCard`، و`ConfirmDialog`، ومحدد الكمية، وإعادة الطلب من القائمة.
- [ ] إعادة توليد `supabase/full_schema_setup.sql` وملفات `database.types.ts`.

### 7c.8 المخاطر
- **بديل GPS** يقلل دقة اختيار المستودع وسعر التوصيل، والتخفيف هو `needs_fulfillment_review` والتأكيد الهاتفي.
- **نقل `StoreProvider`** قد يكسر مكوّناً مشتركاً يستخدم `useStore` خارج مسارات العميل. **تحقق** بالبحث عن `useStore` قبل النقل.
- **نقطة نهاية تحويل الصور** قد لا تكون مفعّلة، فيبقى الرجوع إلى الرابط الأصلي ضرورياً.

### 7c.9 معايير القبول
- [ ] **اختبارات وحدة في `tests/unit/`:**
  - الكاش يحفظ `ts` الأصلي.
  - `addToCart` لا يتجاوز المخزون.
  - ترتيب البنود لتجزئة الحمولة ثابت.
- [ ] **`tests/backend/orders.test.ts`:** استبدال النقاط من الويب يخفض الإجمالي، وطلب بلا GPS مع منطقة ينجح ويُعلَّم للمراجعة (إن اعتُمد البديل).
- [ ] **اختبار للعناوين:** العميل لا يقرأ عناوين غيره.
- [ ] **يدوي:**
  - عنوان الصفحة يتغير بالمسار، و`/robots.txt` و`sitemap.xml` متاحان بعد البناء.
  - صفحات المندوب لا تطلب الكتالوج (من تبويب الشبكة).
- [ ] الأوامر: كما في المرحلة 1، إضافةً إلى `npm run build`.

---

## 7d. المرحلة 7 — جودة بوابة الإدارة والوثائق (الملاحظتان 8 و30)

> آخر المراحل، لأن سجل التدقيق يغطي جداول المرحلتين 2 و3، ولأن الوثائق يجب أن تصف الحالة النهائية. نقل `GPS_DELIVERY_PRICING_PLAN.md` وحده يمكن تنفيذه في أي وقت.

### 7d.1 سجل التدقيق (`20261024000100_admin_audit_log.sql`)
- **التحقق من الكود:** جدول التدقيق الوحيد هو `delivery_pricing_config_audit` ([gps_pricing_schema.sql](<../supabase/migrations/20261001000100_gps_pricing_schema.sql>) L77–123)، ولا يغطي إلا تلك الجداول (انظر §1).
- **نموذج البيانات:**
  ```sql
  CREATE TABLE public.admin_audit_log (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    table_name      text NOT NULL,
    row_id          text NOT NULL,
    action          text NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
    old_data        jsonb,
    new_data        jsonb,
    changed_columns text[],
    changed_by      uuid,
    changed_at      timestamptz NOT NULL DEFAULT timezone('utc', now())
  );
  CREATE INDEX admin_audit_log_table_row_idx ON public.admin_audit_log (table_name, row_id, changed_at DESC);
  ```
- **المشغّل `log_admin_change()`** (SECURITY DEFINER، AFTER INSERT/UPDATE/DELETE):
  - **الجداول:** `coupons`، و`promotions`، و`affiliate_profiles`، و`storefront_banners`، و`app_settings`، و`drivers`، و`warehouses`، وجدول مناطق التوصيل (**تحقق** من اسمه)، و`categories`، و`brands`، و`warehouse_manager_access`، و`suppliers`.
  - **أعمدة مستثناة:** تُمرَّر قائمتها معاملاً للمشغّل، مثل `drivers.status` و`updated_at`، حتى لا يمتلئ السجل بتغيرات التوفّر.
- **RLS:** قراءة للأدمن فقط، ولا منح كتابة.
- **الواجهة:** صفحة `admin-portal/src/pages/AuditLogPage.tsx` على `/audit` (`access: 'admin'`) بفلاتر الجدول والمستخدم والتاريخ، وتبويب «السجل» في صفحات الكيانات.

### 7d.2 الترقيم والإجراءات الجماعية (`20261024000200_admin_paginated_lists_bulk_actions.sql`)
- **التحقق من الكود:**
  - لا `.range()` في [catalogApi.ts](<../admin-portal/src/lib/catalogApi.ts>). القوائم تُجلب كاملة: المنتجات (L66)، والتشكيلات (L365)، والكوبونات (L406)، والمسوقون (L447)، والعروض (L542)، والمرتجعات (L623).
  - المراجعات تُقص بصمت عند `.limit(300)` (L600).
  - العملاء وحدهم مرقّمون بعدّ من الخادم (`adminApi.ts` L372–402)، وهم النمط المتّبع.
  - لا إجراءات جماعية، فمربعات الاختيار كلها لأعلام مفردة.
- **الترقيم:**
  - القراءات المباشرة تستخدم `.range()` مع `count: 'exact'`.
  - `get_admin_products()` و`admin_list_order_returns()`: `DROP` ثم `CREATE` مع `p_limit integer DEFAULT NULL, p_offset integer DEFAULT 0, p_search text DEFAULT NULL` في النهاية، و`total_count` عبر `count(*) OVER ()` في نهاية `RETURNS TABLE`.
  - القيمة `NULL` تعني «الكل»، فتبقى الاستدعاءات القديمة صالحة.
- **RPCs جماعية:**
  - **الدوال:**
    - `admin_bulk_set_products_active(p_ids uuid[], p_is_active boolean)`.
    - `admin_bulk_set_review_status(p_ids uuid[], p_status text)`.
    - `admin_bulk_set_coupons_active(p_ids uuid[], p_is_active boolean)`.
    - `admin_bulk_assign_category(p_ids uuid[], p_category_id uuid)` (بعد المرحلة 2).
  - **القيود:** للأدمن فقط، بحد أقصى 500 معرّف، في معاملة واحدة، وتسجّلها مشغّلات التدقيق.
- **الواجهة:** مكوّن ترقيم مشترك في قوائم المنتجات والكوبونات والمسوقين والعروض والتشكيلات والمرتجعات والمراجعات، مع مربعات اختيار وشريط إجراءات جماعية.

### 7d.3 تصدير CSV
- **التحقق من الكود:** لا يوجد أي تصدير في `admin-portal/src`.
- **الإصلاح:**
  - `admin-portal/src/lib/csv.ts`: UTF-8 مع BOM حتى يقرأ Excel العربية، وتهريب القيم، وتحييد حقن الصيغ بإضافة `'` قبل القيم التي تبدأ بـ `=` أو `+` أو `-` أو `@`.
  - **ما يُصدَّر:** الطلبات (بحلقة صفحات من الخادم)، والعملاء، والمرتجعات، والعمولات والدفعات، والتسويات والدفتر، وتقرير الأرباح، وحركات المخزون.

### 7d.4 لوحة التحكم بنطاق تاريخ
- **التحقق من الكود:** [AdminDashboard.tsx](<../admin-portal/src/pages/AdminDashboard.tsx>) L9 يثبّت `DAYS = 30` بلا منتقٍ (L23–25)، مع أن `admin_business_report(p_start, p_end)` تُستدعى بالمعاملين (`adminApi.ts` L291).
- **الإصلاح:**
  - منتقي نطاق: اليوم، و7، و30، و90 يوماً، ونطاق مخصص، يُحفظ في معاملات الرابط.
  - مقارنة بالفترة السابقة.

### 7d.5 الأنواع وتنظيف الكود
- **التحقق من الكود:**
  - نحو 24 موضع `as any`، أغلبها في `catalogApi.ts`، إضافةً إلى `adminApi.ts` L194.
  - `fetchDrivers` معرّفة مرتين: `adminApi.ts` L213 تُرجع `DriverOption[]`، و`catalogApi.ts` L288 تُرجع `Driver[]`.
- **الإصلاح:**
  - إعادة توليد `admin-portal/src/lib/database.types.ts` و`src/infrastructure/supabase/database.types.ts` بعد كل migrations الخطة، ثم إزالة `as any`.
  - توحيد `fetchDrivers` في دالة واحدة.

### 7d.6 تنظيف الوثائق — الملاحظة 30
- [ ] نقل `GPS_DELIVERY_PRICING_PLAN.md` من الجذر إلى `docs/GPS_DELIVERY_PRICING_PLAN.md` وفق `AGENTS.md`، وتحديث مرجعه في `docs/specs/gps-delivery-pricing.md` L3.
- [ ] `docs/PRODUCT.md` L13 يقول «A single admin role at launch»: تحديثه بأدوار مدير المستودع والمندوب.
- [ ] `docs/ADMIN_SETUP.md` L41 يذكر RBAC كعمل مستقبلي: توثيق `get_my_staff_context` و`admin_set_warehouse_manager_access` وسكربتات الأدوار.
- [ ] `docs/AUDIT-REPORT.md`: وسمه وثيقة تاريخية مع رابط إلى هذه الخطة للحالة الحالية.
- [ ] `docs/ADMIN_FINANCE_STATS_AND_RETURNS_AUDIT.md` (قسمها 2.5، L65) يصف دورة النقد عبر `SupervisorHomePage`: تحديثه بدفتر النقد و`WarehouseCashPage`.
- [ ] مراجعة `docs/WORKFLOW_SUPERVISOR_DRIVER_PLAN.md` بعد تنظيف `/supervisor`.

### 7d.7 المهام والمخاطر والقبول
- [ ] كتابة `20261024000100_admin_audit_log.sql` و`20261024000200_admin_paginated_lists_bulk_actions.sql`.
- [ ] الترقيم والإجراءات الجماعية والتصدير ولوحة التحكم وتنظيف الأنواع.
- [ ] تنظيف الوثائق (§7d.6).
- **المخاطر:**
  - مشغّلات التدقيق تضيف كلفة كتابة صغيرة.
  - `old_data`/`new_data` قد يحويان `cost_price`، لكن السجل للأدمن فقط.
  - تغيير `RETURNS TABLE` لـ `get_admin_products` يتطلب تحديث أنواع البوابة في الإصدار نفسه.
- [ ] **اختبار جديد `tests/backend/admin-audit.test.ts`:**
  - تعديل كوبون يُنشئ صفاً في السجل.
  - العميل لا يقرأ السجل.
  - الإجراء الجماعي يرفض أكثر من 500 معرّف ويرفض غير الأدمن.
- [ ] **يدوي:** ملف CSV يُفتح في Excel بعربية سليمة، والمراجعات تتجاوز 300 بالترقيم.
- [ ] الأوامر: كما في المرحلة 1.

---

## 8. ترتيب التنفيذ والتنظيف

- [ ] **المرحلة 1:** الصلاحيات والأمان، وتُنشر أولاً وحدها لأنها تغلق ثغرات مالية قائمة. تشمل أيضاً الملاحظات 4 و10 و11 و14 و16 و31.
- [ ] **المرحلة 1b:** الإصلاحات المالية والأمنية العاجلة (§4b)، وتعتمد على `can_manage_warehouse` و`driver_outstanding_cod`. يمكن نشر migrations الست فيها متتابعةً كلٌّ مع واجهتها.
  - **ترتيب مقترح:** 4b.8 (العميل فقط)، ثم 4b.6، ثم 4b.1، ثم 4b.4، ثم 4b.3، ثم 4b.5، ثم 4b.7، ثم 4b.2.
  - **العلم:** `require_delivery_code` يُفعَّل أخيراً.
- [ ] **المرحلة 2:** على ثلاث دفعات: 2a المخطط والمزامنة، ثم 2b صفحات الإدارة، ثم 2c تحويل قارئي `src/` و`mobile-app`.
- [ ] **المرحلة 3:** المشتريات، وتعتمد على `can_manage_warehouse` من المرحلة 1.
- [ ] **المرحلة 4:** العروض، وتعتمد على `categories` و`brands` للاستهداف الهرمي، وتحمل منطق §4b.7 في `checkout_order_safe`.
- [ ] **المرحلة 5:** التشغيل (§7b)، وتعتمد على 1 و1b فقط. يمكن تقديمها على 2–4 بإعادة تسمية ملفاتها كما في §3.
- [ ] **المرحلة 6:** موقع العميل (§7c)، وتعتمد على 1b، وعلى 4 في إعادة تقييم الكوبون فقط. البنود §7c.1 و§7c.2 و§7c.4 و§7c.5 لا تعتمد على 4.
- [ ] **المرحلة 7:** جودة الإدارة والوثائق (§7d)، وتأتي أخيراً.
- [ ] **تنظيف بعد المرحلة 3:** تحويل `/supervisor` في `src/` إلى رسالة تحويل لبوابة الإدارة، ثم حذف `SupervisorHomePage.tsx` و`SupervisorLayout.tsx` و`supervisorRepository.ts`، وتحديث `postLogin.ts:11` و`src/App.tsx:65`. ميزات المدير في المرحلة 5 تُبنى في بوابة الإدارة، فلا تؤخر هذا التنظيف.

### أوامر التحقق لكل مرحلة
```bash
node scripts/generate-full-schema.mjs
npm run typecheck
npm run lint
npm test
npm run test:backend            # يتطلب .env.test.local بحسابَي TEST_CUSTOMER_* و TEST_ADMIN_*
npm --prefix admin-portal run typecheck
npm --prefix admin-portal run lint
npm --prefix admin-portal run build
pnpm --dir mobile-app check      # المراحل 2 و4 و5 (register_push_token)
pnpm --dir mobile-app test       # المراحل 2 و4 و5
npm run build                    # المرحلة 6 (sitemap)
supabase functions deploy order-status-push       # المرحلة 1
supabase functions deploy driver-assignment-push  # المرحلة 5
```

## 9. قرارات المالك

### 9.1 قرارات معتمدة
- [x] **اعتماد فاتورة الشراء بيد الأدمن** فقط عند غياب مدير للمستودع في `warehouse_manager_access`، وغير ذلك يعتمدها مدير المستودع (§6.3).
- [x] **مرفق واحد على الأقل** شرط لاعتماد فاتورة الشراء (§6.3).
- [x] **متوسط التكلفة المرجّح لكل منتج** لا لكل متغير في الوقت الحالي، وفق ADR 0001، مع إبقاء `variant_id` في البنود للتتبع (§6.1).
- [x] **إبقاء القيمة المخزّنة `warehouse_supervisor`** وتغيير التسمية في الواجهات فقط إلى «مدير المستودع» (§2.1).

### 9.2 قرارات جديدة من ملاحظات التحسين
> اعتمد المالك القيم المقترحة الخمس (2026-10-28).

- [x] **مدة تعليق عمولة المسوق قبل اعتمادها** (§4b.3): المقترح 14 يوماً بعد التسليم، في `app_settings.affiliate_hold_days`.
- [x] **رمز التسليم** (§4b.2): المقترح 12 رقماً عشوائياً يُرسل للعميل عند `shipped`، مع إعادة الإصدار من صفحة الطلب، وتجاوز المدير بسبب، وتفعيل العلم بعد نشر الواجهات. البديل رمز OTP عبر SMS، وهو يحتاج مزوّداً.
- [x] **بديل GPS في الدفع** (§7c.3): المقترح السماح بالطلب بالولاية والمحلية والعنوان حين يُرفض الموقع، مع مراجعة إلزامية للطلب. البديل إبقاء الشرط الصارم مع شرح أوضح للعميل، وحينها لا تُكتب `20261023000300`.
- [x] **منطقة توقيت يوم العمل لدفتر النقد** (§4b.1): المقترح `Africa/Khartoum` **(تحقق)**.
- [x] **أرباح المندوب** (§7b.4): لا نموذج أجر في القاعدة. المقترح ملخص إحصائي فقط الآن، ونموذج الأجر قرار لاحق.
