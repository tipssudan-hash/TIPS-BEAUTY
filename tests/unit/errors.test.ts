import { describe, expect, it } from 'vitest';
import * as storefront from '@application/errors';
import * as admin from '../../admin-portal/src/lib/errors';

// One error-mapping module and one formatting module per app (T2-05). The backend raises
// English messages; each app turns the ones its screens can hit into Arabic and falls back
// to the caller's text for anything else.

describe('storefront errorMessage', () => {
    it('translates known backend messages and keeps Arabic ones', () => {
        expect(storefront.errorMessage(new Error('Insufficient stock for product x'))).toMatch(/غير متوفرة/);
        expect(storefront.errorMessage({ message: 'Only new orders can be cancelled' })).toMatch(/لا يمكن إلغاء/);
        expect(storefront.errorMessage({ message: 'تعذر شيء ما' })).toBe('تعذر شيء ما');
    });

    it('falls back for unknown or non-error values', () => {
        expect(storefront.errorMessage(new Error('boom'), 'بديل')).toBe('بديل');
        expect(storefront.errorMessage(null, 'بديل')).toBe('بديل');
        expect(storefront.errorMessage('boom', 'بديل')).toBe('بديل');
    });

    it('maps auth errors for login and signup', () => {
        expect(storefront.loginErrorMessage('Invalid login credentials')).toMatch(/غير صحيحة/);
        expect(storefront.loginErrorMessage('Email not confirmed')).toMatch(/تأكيد البريد/);
        expect(storefront.signupErrorMessage('User already registered')).toMatch(/مسجل بالفعل/);
        expect(storefront.signupErrorMessage('Password should be at least 6 characters')).toMatch(/6/);
    });

    it('translates the checkout idempotency refusals', () => {
        expect(storefront.errorMessage(new Error('IDEMPOTENCY_KEY_REUSED'))).toMatch(/بيانات الطلب/);
        expect(storefront.errorMessage({ message: 'IDEMPOTENCY_ORDER_CANCELLED' })).toMatch(/تم إلغاء/);
    });

    it('maps the delivery code refusals returned by update_driver_order_status', () => {
        expect(storefront.deliveryCodeRefusalMessage('delivery_code_invalid')).toMatch(/غير صحيح/);
        expect(storefront.deliveryCodeRefusalMessage('delivery_code_locked')).toMatch(/رمز التسليم/);
        expect(storefront.deliveryCodeRefusalMessage('delivery_code_required')).toMatch(/رمز التسليم/);
        expect(storefront.deliveryCodeRefusalMessage('delivered')).toBeNull();
        expect(storefront.deliveryCodeRefusalMessage(null)).toBeNull();
    });
});

describe('admin errorMessage', () => {
    it('covers both the order operations and the catalogue messages', () => {
        expect(admin.errorMessage({ message: 'This order was updated by another user' })).toMatch(/مستخدم آخر/);
        expect(admin.errorMessage({ message: 'Assign a driver before starting delivery' })).toMatch(/مندوب/);
        expect(admin.errorMessage({ message: 'duplicate key value violates unique constraint' })).toMatch(/مستخدمة مسبقاً/);
        expect(admin.errorMessage({ message: 'Transfer quantity must be positive' })).toMatch(/أكبر من صفر/);
        expect(admin.errorMessage({ message: 'Administrator access required' })).toMatch(/صلاحيات مدير/);
    });

    it('falls back for unknown messages', () => {
        expect(admin.errorMessage(new Error('boom'), 'بديل')).toBe('بديل');
        expect(admin.errorMessage(undefined)).toMatch(/غير متوقع/);
    });

    it('maps login errors', () => {
        expect(admin.loginErrorMessage('Invalid login credentials')).toMatch(/غير صحيحة/);
        expect(admin.loginErrorMessage('Request rate limit reached')).toMatch(/محاولات كثيرة/);
    });
});
