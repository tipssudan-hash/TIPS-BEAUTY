#!/usr/bin/env node
// Guards against the exact regression found in the design-system audit: CheckoutPage.tsx had
// redeclared its own local `const inputClass = '...'` instead of importing the shared one from
// ui.tsx, and drifted (rounded-lg vs. the documented rounded-control). Scoped narrowly to
// `Class`/`ClassName`-named local Tailwind-string constants inside pages/** — this is a precise,
// low-false-positive check for "a page reinvented a primitive," not a general Tailwind-class
// linter (that would need a real AST/plugin and isn't justified for this codebase's size).
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.dirname(fileURLToPath(import.meta.url)) + '/..';

const PAGE_GLOBS = [
    path.join(repoRoot, 'src/pages'),
    path.join(repoRoot, 'admin-portal/src/pages'),
];

const PATTERN = /\bconst\s+\w*(Class|ClassName)\b\s*=\s*['"`]/g;

function walk(dir, out = []) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, out);
        else if (/\.(tsx?|jsx?)$/.test(entry.name)) out.push(full);
    }
    return out;
}

let violations = [];
for (const dir of PAGE_GLOBS) {
    for (const file of walk(dir)) {
        const src = readFileSync(file, 'utf8');
        for (const m of src.matchAll(PATTERN)) {
            const line = src.slice(0, m.index).split('\n').length;
            violations.push(`${path.relative(repoRoot, file)}:${line}`);
        }
    }
}

if (violations.length > 0) {
    console.error('Found local Tailwind-class-string constants inside pages/** — import the shared primitive from ui.tsx instead:\n');
    for (const v of violations) console.error(`  ${v}`);
    process.exit(1);
}

console.log('No local style constants found in pages/**.');
