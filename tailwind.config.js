import { brand, ringFocus, status } from './design/tokens.js';

/** @type {import('tailwindcss').Config} */
export default {
    content: [
        './index.html',
        './App.tsx',
        './index.tsx',
        './src/**/*.{ts,tsx}',
    ],
    theme: {
        extend: {
            colors: {
                brand,
                'ring-focus': ringFocus,
                status: Object.fromEntries(Object.entries(status).flatMap(([k, v]) => [[`${k}-ground`, v.ground], [`${k}-ink`, v.ink]])),
            },
            fontFamily: {
                sans: ['Cairo', 'sans-serif'],
            },
            // Semantic radius/shadow names shared in shape with admin-portal's tailwind.config.js
            // (DESIGN.md "Shapes"/"Elevation & Depth"): same vocabulary, values tuned per surface.
            borderRadius: {
                control: '0.75rem', // 12px — inputs, buttons, badges
                card: '1rem', // 16px — Storefront cards, per DESIGN.md
            },
            boxShadow: {
                card: '0 1px 2px 0 rgb(0 0 0 / 0.05)', // resting card, both surfaces
                'card-glow': '0 10px 15px -3px rgb(0 86 150 / 0.15), 0 4px 6px -4px rgb(0 86 150 / 0.15)', // sky-blue tinted glow, primary CTA
            },
            keyframes: {
                fadeIn: {
                    from: { opacity: '0', transform: 'translateY(6px)' },
                    to: { opacity: '1', transform: 'translateY(0)' },
                },
            },
            animation: {
                fadeIn: 'fadeIn 0.3s ease-out both',
            },
        },
    },
    plugins: [],
};
