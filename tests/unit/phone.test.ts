import { describe, expect, it } from 'vitest';
import { formatSudanPhone, isValidSudanPhone, normalizeSudanPhone } from '@infrastructure/auth/phone';

// This must agree with normalize_sd_phone() in the database, case for case. If the two ever disagree,
// a customer types a number, gets a code sent to a different string, and the verification "fails" for
// reasons nobody can see. These cases mirror the SQL test in tests/backend/auth-providers.test.ts.

describe('normalizeSudanPhone', () => {
    it('folds every way a Sudanese number gets typed into one E.164 value', () => {
        for (const input of ['0912345678', '+249912345678', '249912345678', '00249912345678', '091 234 5678', '091-234-5678', ' 0912345678 ']) {
            expect(normalizeSudanPhone(input), input).toBe('+249912345678');
        }
    });

    it('accepts the 1xx mobile range as well as 9xx', () => {
        expect(normalizeSudanPhone('0123456789')).toBe('+249123456789');
    });

    it('rejects anything that is not a Sudanese mobile number', () => {
        // 08x is not an allocated Sudanese mobile prefix; +20 is Egypt.
        for (const input of ['', '12345', '0812345678', '+201012345678', 'not a phone', '09123456789']) {
            expect(normalizeSudanPhone(input), input).toBeNull();
        }
        expect(normalizeSudanPhone(null)).toBeNull();
        expect(normalizeSudanPhone(undefined)).toBeNull();
    });

    it('is idempotent, so re-submitting a normalised number is safe', () => {
        const once = normalizeSudanPhone('0912345678');
        expect(normalizeSudanPhone(once)).toBe(once);
    });
});

describe('formatSudanPhone', () => {
    it('shows the number the way a customer wrote it', () => {
        expect(formatSudanPhone('+249912345678')).toBe('091 234 5678');
        expect(formatSudanPhone('0912345678')).toBe('091 234 5678');
    });

    it('echoes unparseable input rather than inventing a format', () => {
        expect(formatSudanPhone('12345')).toBe('12345');
        expect(formatSudanPhone('')).toBe('');
    });
});

describe('isValidSudanPhone', () => {
    it('gates the submit button on the same rule the server applies', () => {
        expect(isValidSudanPhone('0912345678')).toBe(true);
        expect(isValidSudanPhone('091234567')).toBe(false);
    });
});
