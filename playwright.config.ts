import { defineConfig } from '@playwright/test';

// T2-13: a local-only smoke suite against the LIVE Supabase project — both apps' own dev servers,
// pointed at production/staging data via the test accounts in .env.test.local. Not wired into CI
// (docs/specs/tier-2.md §Playwright smoke); run with `npm run test:e2e`.
export default defineConfig({
    testDir: './tests/e2e',
    timeout: 60_000,
    fullyParallel: false,
    retries: 0,
    reporter: 'list',
    use: {
        trace: 'retain-on-failure',
    },
    webServer: [
        { command: 'npm run dev', url: 'http://localhost:3000', reuseExistingServer: true, timeout: 30_000 },
        { command: 'npm run dev', url: 'http://localhost:5173', cwd: 'admin-portal', reuseExistingServer: true, timeout: 30_000 },
    ],
});
