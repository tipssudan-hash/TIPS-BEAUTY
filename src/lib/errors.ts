// Turns backend and auth errors into the Arabic the Storefront shows. The backend raises
// English messages; anything not listed falls back to the caller's text.

const backendMessages: [RegExp, string][] = [
    [/Insufficient stock/i, 'الكمية المطلوبة غير متوفرة حالياً لأحد المنتجات.'],
    [/No active warehouse/i, 'عذراً، لا يمكن توصيل هذا الطلب كاملاً إلى منطقتك حالياً.'],
    [/Inventory changed/i, 'تغيّر المخزون أثناء إتمام الطلب، يرجى المحاولة مرة أخرى.'],
    [/no longer available/i, 'أحد المنتجات لم يعد متاحاً.'],
    [/Unsupported payment method/i, 'طريقة الدفع غير مدعومة.'],
    [/Coupon is not active yet/i, 'كود الخصم لم يبدأ بعد.'],
    [/Coupon is invalid or expired/i, 'كود الخصم غير صحيح أو منتهي.'],
    [/Coupon minimum order amount/i, 'قيمة الطلب أقل من الحد الأدنى لكود الخصم.'],
    [/Coupon usage limit for this account/i, 'لقد استخدمتِ هذا الكود الحد الأقصى من المرات.'],
    [/Coupon usage limit has been reached/i, 'انتهت مرات استخدام هذا الكود.'],
    [/Coupon does not beat/i, 'المنتجات في سلتك عليها تخفيض أكبر بالفعل، لذا لا يُطبَّق الكود.'],
    [/Only new orders can be cancelled/i, 'لا يمكن إلغاء الطلب بعد تأكيده، تواصلي مع خدمة العملاء.'],
    [/Authentication required/i, 'يجب تسجيل الدخول أولاً.'],
    [/delivered order/i, 'يمكن تقييم المنتجات المستلمة فقط.'],
    [/already/i, 'تم تنفيذ هذا الإجراء مسبقاً.'],
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
    if (/email not confirmed/i.test(message)) return 'يرجى تأكيد البريد الإلكتروني أولاً';
    if (/invalid login credentials/i.test(message)) return 'البريد الإلكتروني أو كلمة المرور غير صحيحة';
    return 'فشل تسجيل الدخول. يرجى التحقق من البيانات.';
}

export function signupErrorMessage(message: string): string {
    if (/already registered|already exists/i.test(message)) return 'هذا البريد الإلكتروني مسجل بالفعل';
    if (/password/i.test(message)) return 'كلمة المرور يجب أن تكون 6 أحرف على الأقل';
    if (/rate limit/i.test(message)) return 'تم تجاوز عدد المحاولات، حاولي لاحقاً';
    return 'فشل إنشاء الحساب، حاولي مرة أخرى.';
}

// Why the backend refused a Coupon (preview_coupon reasons), in the customer's words.
const couponRefusals: Record<string, string> = {
    unknown: 'كود الخصم غير صحيح.',
    inactive: 'كود الخصم غير مفعّل.',
    not_started: 'كود الخصم لم يبدأ بعد.',
    expired: 'كود الخصم منتهي.',
    used_up: 'انتهت مرات استخدام هذا الكود.',
    customer_limit: 'لقد استخدمتِ هذا الكود الحد الأقصى من المرات.',
    below_minimum: 'قيمة الطلب أقل من الحد الأدنى لكود الخصم.',
    not_best: 'المنتجات في سلتك عليها تخفيض أكبر بالفعل، لذا لا يُطبَّق الكود.',
};

export function couponRefusalMessage(reason: string | null | undefined): string {
    return (reason && couponRefusals[reason]) || 'تعذر تطبيق كود الخصم.';
}
