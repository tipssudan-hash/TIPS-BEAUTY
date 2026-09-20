import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// CONTEXT.md is the glossary. Every entry may carry an Arabic canonical term ("(Arabic: X)") and an
// "_Avoid_:" list; any Arabic word in an Avoid list must not appear in user-facing source.
const ROOT = process.cwd();
const SOURCE_DIRS = ['src', 'admin-portal/src', 'supabase/functions'];
const SOURCE_EXT = /\.(ts|tsx)$/;

function arabicAvoidTerms(): { term: string; entry: string }[] {
    const glossary = readFileSync(join(ROOT, 'CONTEXT.md'), 'utf8');
    const out: { term: string; entry: string }[] = [];
    let entry = '';
    for (const line of glossary.split('\n')) {
        const heading = line.match(/^\*\*(.+?)\*\*/);
        if (heading) entry = heading[1];
        const avoid = line.match(/^_Avoid_:\s*(.+)$/);
        if (!avoid) continue;
        for (const raw of avoid[1].replace(/\(.*?\)/g, '').split(/[,،]/)) {
            const term = raw.trim();
            if (/[؀-ۿ]/.test(term)) out.push({ term, entry });
        }
    }
    return out;
}

function sourceFiles(dir: string): string[] {
    const abs = join(ROOT, dir);
    return readdirSync(abs).flatMap((name) => {
        const p = join(abs, name);
        if (statSync(p).isDirectory()) return name === 'node_modules' ? [] : sourceFiles(join(dir, name));
        return SOURCE_EXT.test(name) ? [p] : [];
    });
}

describe('UI copy follows the CONTEXT.md glossary', () => {
    const terms = arabicAvoidTerms();

    it('the glossary lists Arabic terms to avoid', () => {
        expect(terms.map((t) => t.term)).toEqual(expect.arrayContaining(['منطقة', 'الإيصال', 'رقم العملية', 'غير مقروء']));
    });

    it('no avoided Arabic term appears in Storefront, Admin Portal or Edge Function source', () => {
        const hits: string[] = [];
        for (const dir of SOURCE_DIRS) {
            for (const file of sourceFiles(dir)) {
                const lines = readFileSync(file, 'utf8').split('\n');
                lines.forEach((line, i) => {
                    for (const { term, entry } of terms) {
                        if (line.includes(term)) hits.push(`${relative(ROOT, file)}:${i + 1} uses "${term}" (see ${entry})`);
                    }
                });
            }
        }
        expect(hits).toEqual([]);
    });
});
