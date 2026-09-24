// Sudanese phone numbers, in one canonical form.
//
// This mirrors normalize_sd_phone() in the database on purpose. The server is the authority — it owns
// the unique index on a verified phone — but the client needs the same answer before submitting, or a
// customer types 0912345678, gets a code sent to +249912345678, and is told the number does not match.
//
// Sudanese mobile numbers are 9 national digits starting 1 or 9 (Zain, MTN, Sudani), written locally
// with a leading 0.

export const SUDAN_DIALLING_CODE = '+249';

/** E.164, or null when the input is not a Sudanese mobile number. */
export function normalizeSudanPhone(input: string | null | undefined): string | null {
    if (!input) return null;
    let digits = input.replace(/\D/g, '');
    digits = digits.replace(/^00249/, '').replace(/^249/, '').replace(/^0/, '');
    return /^[19]\d{8}$/.test(digits) ? `${SUDAN_DIALLING_CODE}${digits}` : null;
}

/** How the number is shown back to the customer: 091 234 5678, read right to left as they typed it. */
export function formatSudanPhone(input: string | null | undefined): string {
    const normalized = normalizeSudanPhone(input);
    if (!normalized) return input ?? '';
    const national = normalized.slice(SUDAN_DIALLING_CODE.length);
    return `0${national.slice(0, 2)} ${national.slice(2, 5)} ${national.slice(5)}`;
}

/** True once there is enough input to be worth submitting. */
export function isValidSudanPhone(input: string | null | undefined): boolean {
    return normalizeSudanPhone(input) !== null;
}
