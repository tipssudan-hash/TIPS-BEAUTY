// Sudanese phone numbers, in one canonical form.
//
// Sudanese mobile numbers are 9 national digits starting 1 or 9 (Zain, MTN, Sudani), written locally
// with a leading 0.

export const SUDAN_DIALLING_CODE = '+249';

/** E.164, or null when the input is not a Sudanese mobile number. */
export function normalizeSudanPhone(input: string | null | undefined): string | null {
    if (!input) return null;
    const text = input.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
                      .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776));
    let digits = text.replace(/\D/g, '');
    digits = digits.replace(/^00249/, '').replace(/^249/, '').replace(/^0/, '');
    return /^[19]\d{8}$/.test(digits) ? `${SUDAN_DIALLING_CODE}${digits}` : null;
}

/** How the number is shown back to the user: 091 234 5678. */
export function formatSudanPhone(input: string | null | undefined): string {
    const normalized = normalizeSudanPhone(input);
    if (!normalized) return input ?? '';
    const national = normalized.slice(SUDAN_DIALLING_CODE.length);
    return `0${national.slice(0, 2)} ${national.slice(2, 5)} ${national.slice(5)}`;
}

/** True once there is enough input to be a valid Sudanese phone number. */
export function isValidSudanPhone(input: string | null | undefined): boolean {
    return normalizeSudanPhone(input) !== null;
}
