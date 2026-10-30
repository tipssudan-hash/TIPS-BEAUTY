import { describe, expect, it } from 'vitest';
import { readDeliveryCode } from '@application/services/deliveryCode';

describe('readDeliveryCode', () => {
    it('keeps the 12 characters and drops hyphens, spaces and case', () => {
        expect(readDeliveryCode(' ab23-cdef-gh2j ')).toBe('AB23CDEFGH2J');
        expect(readDeliveryCode('AB23CDEFGH2J')).toBe('AB23CDEFGH2J');
    });

    it('reads verification_code from the customer QR payload', () => {
        const payload = JSON.stringify({ app: 'TIPS-BEAUTY', verification_code: 'ab23-cdef-gh2j', order_number: 'ORD-2026-0042' });
        expect(readDeliveryCode(payload)).toBe('AB23CDEFGH2J');
    });

    it('returns null when the payload has no code or is malformed', () => {
        expect(readDeliveryCode(JSON.stringify({ order_number: 'ORD-2026-0042' }))).toBeNull();
        expect(readDeliveryCode('{"verification_code": 42}')).toBeNull();
        expect(readDeliveryCode('{not json')).toBeNull();
    });

    it('returns null for empty or symbol-only input', () => {
        expect(readDeliveryCode('')).toBeNull();
        expect(readDeliveryCode('   ')).toBeNull();
        expect(readDeliveryCode('---')).toBeNull();
    });
});
