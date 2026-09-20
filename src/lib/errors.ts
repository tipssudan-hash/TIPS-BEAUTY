// Turns backend and auth errors into the Arabic the Storefront shows. The backend raises
// English messages; anything not listed falls back to the caller's text.

const backendMessages: [RegExp, string][] = [
    [/Insufficient stock/i, 'الكمية المطلوبة غير متوفرة حالياً لأحد المنتجات.'],
    [/No active warehouse/i, 'عذراً، لا يمكن توصيل هذا الطلب كاملاً إلى منطقتك حالياً.'],
    [/Inventory changed/i, 'تغيّر المخزون أثناء إتمام الطلب، يرجى المحاولة مرة أخرى.'],
    [/no longer available/i, 'أحد المنتجات لم يعد متاحاً.'],
    [/Unsupported payment method/i, 'طريقة الدفع غير مدعومة.'],
    [/Only new orders can be cancelled/i, 'لا يمكن إلغاء الطلب بعد تأكيده، تواصلي مع خدمة العملاء.'],
    [/Authentication required/i, 'يجب تسجيل الدخول أولاً.'],
    [/delivered order/i, 'يمكن تقييم المنتجات المستلمة فقط.'],
    [/already/i, 'تم تنفيذ هذا الإجراء مسبقاً.'],
];

export function errorMessage(error: unknown, fallback = 'حدث خطأ غير متوقع، حاولي مرة أخرى.'): string {
    if (error && typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string') {
        return translateBackendError((error as { message: string }).message) ?? fallback;
    }
    return fallback;
}

function translateBackendError(message: string): string | null {
    for (const [pattern, text] of backendMessages) {
        if (pattern.test(message)) return text;
    }
    return /[؀-ۿ]/.test(message) ? message : null;
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
