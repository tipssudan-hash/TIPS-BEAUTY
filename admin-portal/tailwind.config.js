import { brand, ringFocus, status } from '../design/tokens.js';

/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                brand,
                'ring-focus': ringFocus,
                status: Object.fromEntries(Object.entries(status).flatMap(([k, v]) => [[`${k}-ground`, v.ground], [`${k}-ink`, v.ink]])),
            },
            // Semantic radius/shadow names shared in shape with the storefront's tailwind.config.js
            // (DESIGN.md "Shapes"/"Elevation & Depth"): same vocabulary, values tuned per surface.
            borderRadius: {
                control: '0.75rem', // 12px — inputs, buttons, badges
                card: '1.5rem', // 24px — Admin cards, per DESIGN.md (deliberately larger than storefront's)
            },
            boxShadow: {
                card: '0 1px 2px 0 rgb(0 0 0 / 0.05)', // resting card, both surfaces
                'card-glow': '0 10px 15px -3px rgb(15 23 42 / 0.1), 0 4px 6px -4px rgb(15 23 42 / 0.1)', // near-black tinted glow, primary CTA
            },
        },
    },
    plugins: [],
}
