import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: {
        alias: {
            '@domain': path.resolve(__dirname, 'src/domain'),
            '@application': path.resolve(__dirname, 'src/application'),
            '@infrastructure': path.resolve(__dirname, 'src/infrastructure'),
            '@presentation': path.resolve(__dirname, 'src/presentation'),
            '@': path.resolve(__dirname, 'src'),
        },
    },
    test: {
        include: ['tests/**/*.test.ts'],
        environment: 'node',
        testTimeout: 60_000,
        hookTimeout: 60_000,
        fileParallelism: false,
    },
});
