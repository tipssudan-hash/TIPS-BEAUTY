import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    server: {
        port: 3000,
        host: '0.0.0.0',
    },
    plugins: [react()],
    resolve: {
        alias: {
            '@domain': path.resolve(__dirname, 'src/domain'),
            '@application': path.resolve(__dirname, 'src/application'),
            '@infrastructure': path.resolve(__dirname, 'src/infrastructure'),
            '@presentation': path.resolve(__dirname, 'src/presentation'),
            '@': path.resolve(__dirname, 'src'),
        },
    },
});
