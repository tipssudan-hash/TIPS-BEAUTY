# خطة إصلاح احتساب الإيرادات، مشكلة المسوقين، وحماية المرتجعات من الاحتيال
# (Fix Revenue Delivery Failed, Affiliate Details, and Anti-Scam Refund Protections Plan)

## 1. الأهداف
1. **استبعاد الطلبات الفاشلة (`delivery_failed`) من الإيرادات:**
   - تعديل دالة التقرير الإداري `admin_business_report` لاستبعاد `delivery_failed` مع `cancelled`.
   - تعديل تجميع إجمالي إنفاق العملاء في `adminApi.ts` لاستبعاد `delivery_failed`.
2. **إصلاح مشكلة تضاعف أرقام وإحصائيات المسوقين (Cartesian Product Bug):**
   - تعديل دالة `admin_get_affiliate_details` في قاعدة البيانات لتجميع إحصائيات الطلبات والعمولات والمسحوبات عبر استعلامات منفصلة ومستقلة، بدلاً من الدمج المباشر عبر `LEFT JOIN`.
3. **تحصين وتأمين دورة الاسترداد المالي ضد الاحتيال (Anti-Scam Refund Security):**
   - **منع استرداد أي طلب غير مدفوع:** فحص في `review_order_return` و `request_order_return` يمنع رفض/طلب استرداد إلا إذا كانت حالة الدفع الأصلية للطلب `payment_status = 'paid'`.
   - **ضبط تدرج الحالات الصارم (Strict State Machine):** لا يمكن الانتقال للاسترداد `refunded` إلا إذا كان المنتج مستلماً فعلياً في المستودع `received`.
   - **منع الاحتيال بتكرار الكميات (Anti-Over-Return):** منع إرجاع كميات تتجاوز الكميات المشتراة عبر مقارنة مجموع المرتجعات السابقة غير المرفوضة مع كمية الشراء الأصلية.
   - **توثيق حركة الاسترداد المالي:** إضافة أعمدة `refund_amount` و `refund_reference` و `refunded_at` وتوثيق الرقم المرجعي للتحويل البنكي الصادر للعميل مع تنبيهات أمان في واجهة الإدارة لمنع الضغط بالخطأ.

---

## 2. خطوات التنفيذ التفصيلية

- [ ] **خطوة 1: إنشاء ملف الميجريشن الجديد في Supabase:**
  - `supabase/migrations/20261017000100_fix_revenue_affiliate_and_refund_scams.sql`
  - تحديث `admin_business_report`.
  - تحديث `admin_get_affiliate_details`.
  - إضافة أعمدة الأمان لجدول `order_returns`.
  - تحديث `request_order_return` بالتحقق من الدفع والكميات التراكمية.
  - تحديث `review_order_return` بالتحقق الصارم من الدفع والاستلام الفعلي وحفظ مرجع التحويل.
  - تحديث `admin_list_order_returns` لإرجاع بيانات دفع الطلب ومبلغ ومرجع الاسترداد.
- [ ] **خطوة 2: تحديث الملف الموحد `supabase/full_schema_setup.sql`:**
  - تشغيل `node scripts/generate-full-schema.mjs`.
- [ ] **خطوة 3: تحديث كود لوحة الإدارة (`admin-portal`):**
  - تحديث `types.ts` لدعم حقول الاسترداد ومعلومات دفع الطلب.
  - تحديث `adminApi.ts` لاستبعاد `delivery_failed` من `total_spent`.
  - تحديث `catalogApi.ts` لتمرير `refund_amount` و `refund_reference` إلى `review_order_return`.
  - تحديث `ReturnsPage.tsx` لعرض حالة دفع الطلب، ومنع الاسترداد للطلبات غير المدفوعة، وإلزام إدخال الرقم المرجعي للتحويل.
- [ ] **خطوة 4: التحقق والاختبارات:**
  - تشغيل `npm run typecheck` لكلا المشروعين.
  - تشغيل `npm test` للتحقق من سلامة كافة الاختبارات.
