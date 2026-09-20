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
                brand: {
                    green: '#22AD52',
                    blue: '#005696',
                    cyan: '#00AEEF',
                    'green-soft': '#f0fdf4',
                    'blue-soft': '#f0f9ff',
                },
            },
            fontFamily: {
                sans: ['Cairo', 'sans-serif'],
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
