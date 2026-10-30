export interface CsvColumn<T> {
    header: string;
    value: (row: T) => unknown;
}

const FORMULA_START = /^[=+\-@]/;

export function csvCell(value: unknown): string {
    let text: string;
    if (value === null || value === undefined) return '';
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (value instanceof Date) text = value.toISOString();
    else if (typeof value === 'string') text = value;
    else text = JSON.stringify(value);
    if (FORMULA_START.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
    const lines = [columns.map((c) => csvCell(c.header)).join(',')];
    for (const row of rows) lines.push(columns.map((c) => csvCell(c.value(row))).join(','));
    return lines.join('\r\n');
}

export function downloadCsv(filename: string, csv: string): void {
    const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

export function csvFileName(base: string, date = new Date()): string {
    return `${base}-${date.toISOString().slice(0, 10)}.csv`;
}
