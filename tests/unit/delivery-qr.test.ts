import { describe, expect, it } from 'vitest';
import { generate12DigitDeliveryCode } from '../../src/presentation/components/orders/OrderDeliveryQRCode';
import { validateDeliveryCode } from '../../src/presentation/components/driver/BarcodeScannerModal';

describe('Order Delivery QR & Verification Code Generator', () => {
    it('generates a 12-character formatted code (XXXX-XXXX-XXXX)', () => {
        const code = generate12DigitDeliveryCode('e3c5d8a0-1234-4567-89ab-cdef01234567', 'ORD-2026-0042');
        expect(code).toMatch(/^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
        expect(code.replace(/-/g, '')).toHaveLength(12);
    });

    it('is deterministic for identical order inputs', () => {
        const orderId = 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d';
        const orderNumber = 'ORD-2026-9999';

        const code1 = generate12DigitDeliveryCode(orderId, orderNumber);
        const code2 = generate12DigitDeliveryCode(orderId, orderNumber);

        expect(code1).toBe(code2);
    });

    it('produces distinct codes for different orders', () => {
        const codeA = generate12DigitDeliveryCode('11111111-1111-1111-1111-111111111111', 'ORD-2026-0001');
        const codeB = generate12DigitDeliveryCode('22222222-2222-2222-2222-222222222222', 'ORD-2026-0002');

        expect(codeA).not.toBe(codeB);
    });

    it('excludes ambiguous characters (0, O, 1, I)', () => {
        const testIds = [
            'f81d4fae-7dec-11d0-a765-00a0c91e6bf6',
            '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
            '6ba7b811-9dad-11d1-80b4-00c04fd430c8',
        ];

        for (const id of testIds) {
            const code = generate12DigitDeliveryCode(id, 'ORD-TEST');
            expect(code).not.toMatch(/[01OIoi]/);
        }
    });
});

describe('Driver Delivery Verification Security (validateDeliveryCode)', () => {
    const orderId = 'e3c5d8a0-1234-4567-89ab-cdef01234567';
    const orderNumber = 'ORD-2026-0042';
    const valid12Code = generate12DigitDeliveryCode(orderId, orderNumber);

    it('accepts correct 12-digit code with hyphens', () => {
        expect(validateDeliveryCode(valid12Code, orderId, orderNumber)).toBe(true);
    });

    it('accepts correct 12-digit code without hyphens or in lowercase', () => {
        const rawWithoutHyphens = valid12Code.replace(/-/g, '').toLowerCase();
        expect(validateDeliveryCode(rawWithoutHyphens, orderId, orderNumber)).toBe(true);
    });

    it('accepts scanned QR JSON payload containing correct verification code', () => {
        const qrPayload = JSON.stringify({
            order_id: orderId,
            order_number: orderNumber,
            verification_code: valid12Code,
        });
        expect(validateDeliveryCode(qrPayload, orderId, orderNumber)).toBe(true);
    });

    it('rejects public order number to prevent driver fraud', () => {
        expect(validateDeliveryCode(orderNumber, orderId, orderNumber)).toBe(false);
    });

    it('rejects order ID or random text', () => {
        expect(validateDeliveryCode(orderId, orderId, orderNumber)).toBe(false);
        expect(validateDeliveryCode('1234', orderId, orderNumber)).toBe(false);
        expect(validateDeliveryCode('INVALID-CODE-XXXX', orderId, orderNumber)).toBe(false);
        expect(validateDeliveryCode('', orderId, orderNumber)).toBe(false);
    });

    it('rejects QR JSON payload with mismatched verification code', () => {
        const fakeQrPayload = JSON.stringify({
            order_id: orderId,
            order_number: orderNumber,
            verification_code: 'XXXX-YYYY-ZZZZ',
        });
        expect(validateDeliveryCode(fakeQrPayload, orderId, orderNumber)).toBe(false);
    });
});

