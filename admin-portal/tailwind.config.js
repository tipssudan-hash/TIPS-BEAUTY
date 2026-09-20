/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
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
                }
            }
        },
    },
    plugins: [],
}
