#!/usr/bin/env node
// Writes dist/sitemap.xml after a web build, listing the storefront pages that search engines should index:
// the home page, the offers page, every active product, and every active category (as a search filter URL,
// since categories have no page of their own). Also appends a Sitemap line to dist/robots.txt.
//
//   VITE_SUPABASE_URL       read from the environment or .env, like the app build
//   VITE_SUPABASE_ANON_KEY  the public anon key; the catalogue RPCs return only public rows
//   SITE_URL                public origin, e.g. https://shop.example.com (VITE_SITE_URL is accepted too)
//
// Missing values are a warning, not an error: the build still succeeds and no sitemap is written.

import 'dotenv/config';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const distDir = path.join(repoRoot, 'dist');

const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim().replace(/\/+$/, '');
const anonKey = process.env.VITE_SUPABASE_ANON_KEY?.trim();
const siteUrl = (process.env.SITE_URL || process.env.VITE_SITE_URL || '').trim().replace(/\/+$/, '');

function escapeXml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

async function rpc(name) {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: {
            apikey: anonKey,
            Authorization: `Bearer ${anonKey}`,
            'Content-Type': 'application/json',
        },
        body: '{}',
    });
    if (!response.ok) throw new Error(`${name} responded ${response.status}`);
    const rows = await response.json();
    return Array.isArray(rows) ? rows : [];
}

function buildSitemap(urls) {
    const entries = urls.map((loc) => `  <url><loc>${escapeXml(loc)}</loc></url>`).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

if (!supabaseUrl || !anonKey) {
    console.warn('[sitemap] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not set; sitemap.xml was not written.');
    process.exit(0);
}
if (!siteUrl) {
    console.warn('[sitemap] SITE_URL is not set; sitemap.xml needs absolute URLs and was not written.');
    process.exit(0);
}
if (!existsSync(distDir)) {
    console.warn('[sitemap] dist/ does not exist; run the web build first. sitemap.xml was not written.');
    process.exit(0);
}

try {
    const [products, categories] = await Promise.all([rpc('get_public_products'), rpc('get_public_categories')]);
    const urls = [
        `${siteUrl}/`,
        `${siteUrl}/offers`,
        ...products.filter((p) => p?.id).map((p) => `${siteUrl}/product/${p.id}`),
        ...categories.filter((c) => c?.name_ar).map((c) => `${siteUrl}/search?category=${encodeURIComponent(c.name_ar)}`),
    ];
    const unique = [...new Set(urls)];

    mkdirSync(distDir, { recursive: true });
    writeFileSync(path.join(distDir, 'sitemap.xml'), buildSitemap(unique));

    const robotsPath = path.join(distDir, 'robots.txt');
    if (existsSync(robotsPath) && !readFileSync(robotsPath, 'utf8').includes('Sitemap:')) {
        appendFileSync(robotsPath, `\nSitemap: ${siteUrl}/sitemap.xml\n`);
    }
    console.log(`[sitemap] wrote dist/sitemap.xml with ${unique.length} URLs.`);
} catch (error) {
    console.warn(`[sitemap] could not read the catalogue; sitemap.xml was not written. ${error instanceof Error ? error.message : error}`);
    process.exit(0);
}
