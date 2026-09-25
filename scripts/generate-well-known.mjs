#!/usr/bin/env node
// Writes the two files that make HTTPS deep links work, into dist/.well-known/ after a web build:
//
//   apple-app-site-association -> iOS Universal Links
//   assetlinks.json            -> Android App Links
//
// They are generated rather than committed because both carry values that only exist once the store
// accounts do: Apple's Team ID and the release keystore's SHA-256 fingerprint. A committed file with
// placeholder values is worse than no file — iOS and Android both fail link verification *silently*,
// and you would be debugging "links open the browser instead of the app" for a day.
//
// Missing env is therefore a warning, not an error: the web store still deploys, deep links simply
// stay off until the values exist.
//
//   APPLE_TEAM_ID        e.g. A1B2C3D4E5        (Apple Developer > Membership)
//   ANDROID_CERT_SHA256  e.g. AB:CD:...:12      (keytool -list -v -keystore release.keystore)
//
// ANDROID_CERT_SHA256 accepts several comma-separated fingerprints. Android matches a link against
// every entry in the array, so a debug-signed test build and the release build can both verify at the
// same time — which is what lets a tester check deep links before a release keystore exists. Google
// sign-in does not need this file at all (Credential Manager does not use Digital Asset Links); only
// App Links do.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const outDir = path.join(repoRoot, 'dist', '.well-known');

const APP_ID = 'com.tipssd.beauty';
const teamId = process.env.APPLE_TEAM_ID?.trim();
const certSha256 = process.env.ANDROID_CERT_SHA256?.trim();

const written = [];
const skipped = [];

if (teamId) {
    // "*" matches every path: any storefront URL that resolves in the app should open in the app.
    const aasa = {
        applinks: {
            apps: [],
            details: [{ appID: `${teamId}.${APP_ID}`, paths: ['*'] }],
        },
    };
    mkdirSync(outDir, { recursive: true });
    // No file extension, and it must be served as application/json — check your host's config.
    writeFileSync(path.join(outDir, 'apple-app-site-association'), JSON.stringify(aasa, null, 2));
    written.push('apple-app-site-association');
} else {
    skipped.push('apple-app-site-association (set APPLE_TEAM_ID)');
}

if (certSha256) {
    // Split on commas so a debug and a release fingerprint can coexist; dedupe because pasting the
    // same value twice is an easy mistake and a duplicated entry makes Google's verifier complain.
    const fingerprints = [...new Set(
        certSha256.split(',').map((value) => value.trim().toUpperCase()).filter(Boolean),
    )];
    const assetLinks = [{
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
            namespace: 'android_app',
            package_name: APP_ID,
            sha256_cert_fingerprints: fingerprints,
        },
    }];
    mkdirSync(outDir, { recursive: true });
    writeFileSync(path.join(outDir, 'assetlinks.json'), JSON.stringify(assetLinks, null, 2));
    written.push('assetlinks.json');
} else {
    skipped.push('assetlinks.json (set ANDROID_CERT_SHA256)');
}

if (written.length) console.log(`Deep-link files written to dist/.well-known/: ${written.join(', ')}`);
for (const item of skipped) console.warn(`Deep links off — skipped ${item}`);
