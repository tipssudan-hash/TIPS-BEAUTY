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
        const message = (error as { message: string }).message;
        // checkout_order raises the same typed reason preview_coupon returns.
        const refused = /Coupon refused: (\w+)/.exec(message);
        if (refused) return couponRefusalMessage(refused[1]);
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

export function socialAuthErrorMessage(message: string): string {
    // Raised by the DB trigger that keeps staff and driver accounts on email+password.
    if (/staff_social_login_not_allowed/i.test(message)) return 'حسابات الموظفين والسائقين تسجّل الدخول بالبريد الإلكتروني وكلمة المرور.';
    // Native build is running before the Capacitor sign-in plugins are wired up.
    if (/native_social_sign_in_unavailable/i.test(message)) return 'تسجيل الدخول عبر Google وApple غير متاح في هذا الإصدار، استخدمي البريد الإلكتروني.';
    // Google blocks OAuth inside embedded WebViews.
    if (/disallowed_useragent/i.test(message)) return 'تعذر فتح صفحة Google داخل التطبيق، جربي من المتصفح.';
    if (/rate limit/i.test(message)) return 'تم تجاوز عدد المحاولات، حاولي لاحقاً';
    return 'تعذر تسجيل الدخول عبر مزود الخدمة، حاولي مرة أخرى.';
}

export function otpErrorMessage(message: string): string {
    // Raised by record_otp_attempt via the send-otp hook.
    if (/cooldown/i.test(message)) return 'انتظري قليلاً قبل طلب رمز جديد.';
    if (/phone_quota|ip_quota|rate limit|too many/i.test(message)) return 'تم تجاوز عدد المحاولات، حاولي بعد ساعة.';
    if (/invalid_phone/i.test(message)) return 'رقم الهاتف غير صحيح.';
    if (/expired/i.test(message)) return 'انتهت صلاحية الرمز، اطلبي رمزاً جديداً.';
    if (/invalid.*(token|otp|code)/i.test(message)) return 'الرمز غير صحيح، تأكدي من الأرقام.';
    if (/captcha/i.test(message)) return 'تعذر التحقق، حاولي مرة أخرى.';
    // Every channel failed, or none is configured — a real outage, not the customer's mistake.
    if (/no otp channel|delivery failed/i.test(message)) return 'تعذر إرسال الرمز حالياً، جربي تسجيل الدخول بالبريد الإلكتروني.';
    return 'تعذر إرسال رمز التحقق، حاولي مرة أخرى.';
}
