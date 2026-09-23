#!/usr/bin/env node
// Builds the @capacitor/assets source images from the brand logo, then generates every Android and
// iOS icon and splash size from them.
//
// Source of truth is public/logo.PNG (1024x1024) — the same mark the PWA icons came from, so the web
// store, the Play listing and the App Store all show one brand.
//
//   node scripts/generate-app-assets.mjs        # build sources + generate into android/ and ios/
//
// Splash screens are composed rather than hand-drawn: the logo centred at 40% on the Storefront's
// background colour, matching manifest.webmanifest and capacitor.config.ts.

import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';

const repoRoot = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const logo = path.join(repoRoot, 'public', 'logo.PNG');
const assetsDir = path.join(repoRoot, 'assets');

const BACKGROUND = '#f8fafc'; // manifest.webmanifest background_color
const THEME = '#005696';      // brand blue, used for the Android adaptive icon background
const SPLASH_SIZE = 2732;     // @capacitor/assets expects a square 2732px splash source
const SPLASH_LOGO_RATIO = 0.4;

if (!existsSync(logo)) {
    console.error(`Missing ${path.relative(repoRoot, logo)} — cannot generate app assets.`);
    process.exit(1);
}

mkdirSync(assetsDir, { recursive: true });

const write = async (name, pipeline) => {
    const out = path.join(assetsDir, name);
    await pipeline.toFile(out);
    console.log(`assets/${name}`);
};

// Icons. icon-only and icon-foreground are the same mark; Android composites foreground over
// background for its adaptive icon.
const square = (size) => sharp(logo).resize(size, size, { fit: 'contain', background: BACKGROUND }).png();

await write('icon-only.png', square(1024));
await write('icon-foreground.png', square(1024));
await write('icon-background.png', sharp({
    create: { width: 1024, height: 1024, channels: 4, background: THEME },
}).png());

// Splash: logo centred on the flat background, one image for both light and dark. The Storefront has
// a single light theme, so a separate dark splash would be a lie about the app that follows it.
const splashLogo = await sharp(logo)
    .resize(Math.round(SPLASH_SIZE * SPLASH_LOGO_RATIO), Math.round(SPLASH_SIZE * SPLASH_LOGO_RATIO), { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

const splash = () => sharp({
    create: { width: SPLASH_SIZE, height: SPLASH_SIZE, channels: 4, background: BACKGROUND },
}).composite([{ input: splashLogo, gravity: 'centre' }]).png();

await write('splash.png', splash());
await write('splash-dark.png', splash());

// Android and iOS only, explicitly. Left to itself the tool also regenerates the PWA icon set and
// REWRITES public/manifest.webmanifest with `../icons/*.webp` paths and the wrong MIME type, which
// silently breaks "add to home screen" on the web store. The web icons are hand-maintained.
console.log('\nGenerating platform assets...');
execFileSync('npx', ['@capacitor/assets', 'generate', '--android', '--ios', '--iconBackgroundColor', THEME, '--splashBackgroundColor', BACKGROUND], {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
});
