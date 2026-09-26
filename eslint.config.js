import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
    // 'android' and 'ios' hold the native projects: Capacitor copies its own native-bridge.js into
    // android/app/build/ during a build, and linting generated vendor output reports errors nobody
    // can fix in this repo. They were invisible until the first APK build produced them.
    globalIgnores(['dist', 'admin-portal', 'mobile-app', 'supabase', 'node_modules', 'android', 'ios', 'src/lib/database.types.ts']),
    {
        files: ['**/*.{ts,tsx}'],
        extends: [
            js.configs.recommended,
            tseslint.configs.recommended,
            reactHooks.configs.flat.recommended,
            reactRefresh.configs.vite,
        ],
        languageOptions: {
            ecmaVersion: 2020,
            globals: globals.browser,
        },
        rules: {
            // Data is loaded with fetch-in-effect + setState; the React Compiler rule is too strict for that.
            'react-hooks/set-state-in-effect': 'off',
            'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
        },
    },
]);
