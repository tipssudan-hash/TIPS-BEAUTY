#!/usr/bin/env node
// Guards the shared-vocabulary contract between the two portals' UI primitives files.
// Fixes the exact failure mode that let CheckoutPage.tsx quietly reinvent its own inputClass:
// the two files can diverge in *values* (each portal keeps its own visual identity per
// DESIGN.md) but must never diverge in the *names* both portals genuinely use, so a developer
// who's touched one primitives file recognizes the other.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.dirname(fileURLToPath(import.meta.url)) + '/..';

const STOREFRONT_UI = path.join(repoRoot, 'src/components/ui.tsx');
const ADMIN_UI = path.join(repoRoot, 'admin-portal/src/components/ui.tsx');

// The subset both portals genuinely use today (per the design-system audit). Names outside
// this set (e.g. admin's PageHeader/Table/StatusPill) are portal-specific by design — YAGNI on
// the storefront side until a real need shows — and are reported, not enforced.
const CORE_EXPORTS = ['Card', 'Notice', 'Spinner', 'Field', 'inputClass', 'primaryButtonClass', 'secondaryButtonClass', 'smallButtonClass'];

function exportedNames(filePath) {
    const src = readFileSync(filePath, 'utf8');
    const names = new Set();
    for (const m of src.matchAll(/^export (?:const|function) (\w+)/gm)) names.add(m[1]);
    return names;
}

const storefront = exportedNames(STOREFRONT_UI);
const admin = exportedNames(ADMIN_UI);

const missing = CORE_EXPORTS.filter((name) => !storefront.has(name) || !admin.has(name)).map((name) => ({
    name,
    inStorefront: storefront.has(name),
    inAdmin: admin.has(name),
}));

if (missing.length > 0) {
    console.error('Primitives parity check failed — the shared export surface has diverged:\n');
    for (const m of missing) {
        console.error(`  ${m.name}: storefront=${m.inStorefront ? 'present' : 'MISSING'} admin=${m.inAdmin ? 'present' : 'MISSING'}`);
    }
    console.error('\nBoth src/components/ui.tsx and admin-portal/src/components/ui.tsx must export the same core primitive names (values may differ per portal identity).');
    process.exit(1);
}

const storefrontOnly = [...storefront].filter((n) => !admin.has(n) && !CORE_EXPORTS.includes(n));
const adminOnly = [...admin].filter((n) => !storefront.has(n) && !CORE_EXPORTS.includes(n));
if (storefrontOnly.length) console.log(`Storefront-only primitives (fine, portal-specific): ${storefrontOnly.join(', ')}`);
if (adminOnly.length) console.log(`Admin-only primitives (fine, portal-specific): ${adminOnly.join(', ')}`);

console.log('Primitives parity check passed.');
