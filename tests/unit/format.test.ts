import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, formatSDG } from '../../src/lib/format';
import * as adminFormat from '../../admin-portal/src/lib/format';

// One formatting module per app (T2-05); both apps must render the same money and dates.

describe('formatting', () => {
    it('formats SDG amounts rounded with Arabic digits in both apps', () => {
        expect(formatSDG(1234.6)).toBe(adminFormat.formatSDG(1234.6));
        expect(formatSDG(null)).toMatch(/ج\.س$/);
        expect(adminFormat.formatNumber(1500)).toBe((1500).toLocaleString('ar-EG'));
    });

    it('renders dates in Sudan time and a dash for missing values', () => {
        const iso = '2026-09-20T21:30:00Z'; // 00:30 next day in Africa/Khartoum (UTC+2)
        expect(formatDateTime(iso)).toBe(adminFormat.formatDateTime(iso));
        expect(formatDate(iso)).toBe(adminFormat.formatDate(iso));
        expect(formatDate(null)).toBe('—');
        expect(adminFormat.formatDateTime(undefined)).toBe('—');
    });
});
