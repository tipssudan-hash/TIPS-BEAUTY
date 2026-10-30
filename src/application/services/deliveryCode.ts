// The driver types the code or scans the customer's QR, whose JSON payload carries it as verification_code.
// Only the characters are normalised here; the server decides whether the code is right.
export function readDeliveryCode(input: string): string | null {
    const raw = input.trim();
    if (!raw) return null;
    let candidate = raw;
    if (raw.startsWith('{')) {
        try {
            const parsed = JSON.parse(raw) as { verification_code?: unknown };
            candidate = typeof parsed.verification_code === 'string' ? parsed.verification_code : '';
        } catch {
            return null;
        }
    }
    const code = candidate.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    return code || null;
}
