// Turns backend and auth errors into the Arabic the Admin Portal shows. The backend raises
// English messages; anything not listed falls back to the caller's text.

const backendMessages: [RegExp, string][] = [
    // Order operations (admin_update_order_operation)
    [/updated by another user/i, 'تم تحديث هذا الطلب من مستخدم آخر، أعد التحميل وحاول مجدداً.'],
    [/transition is not allowed/i, 'هذا الانتقال في حالة الطلب غير مسموح.'],
    [/Assign a driver/i, 'يجب تعيين مندوب قبل بدء التوصيل.'],
    [/driver is not available/i, 'المندوب المختار غير متاح.'],
    [/assigned to another warehouse/i, 'المندوب المختار تابع لمخزن آخر.'],
    [/warehouse is not active/i, 'المخزن المختار غير نشط.'],
    [/Assignments cannot change/i, 'لا يمكن تغيير التعيينات بعد بدء التوصيل.'],
    // Catalogue, inventory and settings
    [/Administrator access required/i, 'هذا الإجراء يتطلب صلاحيات مدير.'],
    [/Insufficient stock/i, 'الكمية المطلوبة غير متوفرة في هذا المخزن.'],
    [/Quantity change cannot be zero/i, 'يجب أن يكون التغيير في الكمية مختلفاً عن صفر.'],
    [/Source and destination/i, 'يجب أن يختلف مخزن المصدر عن مخزن الوجهة.'],
    [/Transfer quantity must be positive/i, 'كمية التحويل يجب أن تكون أكبر من صفر.'],
    [/Coupon code already exists/i, 'هذا الكود مستخدم لكود خصم آخر.'],
    [/Coupon code is invalid/i, 'الكود يجب أن يكون من 3 إلى 30 حرفاً إنجليزياً أو رقماً أو شرطة.'],
    [/Coupon value is invalid/i, 'قيمة الخصم غير صحيحة.'],
    [/Coupon window is invalid/i, 'تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية.'],
    [/Coupon has redemptions/i, 'هذا الكود استُخدم في طلبات ولا يمكن حذفه؛ يمكنك إيقافه بدلاً من ذلك.'],
    [/duplicate key/i, 'هذه القيمة مستخدمة مسبقاً.'],
    [/appears in orders/i, 'هذا المنتج مرتبط بطلبات ولا يمكن حذفه؛ يمكنك إيقافه بدلاً من ذلك.'],
    [/row-level security/i, 'ليس لديك صلاحية لتنفيذ هذا الإجراء.'],
];

export function errorMessage(error: unknown, fallback = 'حدث خطأ غير متوقع، حاولي مرة أخرى.'): string {
    if (error && typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string') {
        const message = (error as { message: string }).message;
        for (const [pattern, text] of backendMessages) {
            if (pattern.test(message)) return text;
        }
        return /[؀-ۿ]/.test(message) ? message : fallback;
    }
    return fallback;
}

export function loginErrorMessage(message: string): string {
    if (/invalid login credentials/i.test(message)) return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
    if (/email not confirmed/i.test(message)) return 'يرجى تأكيد البريد الإلكتروني أولاً.';
    if (/rate limit|too many/i.test(message)) return 'محاولات كثيرة، حاولي بعد قليل.';
    return 'فشل تسجيل الدخول، حاولي مرة أخرى.';
}
