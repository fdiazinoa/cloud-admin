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
                    dark: '#0f172a',
                    DEFAULT: '#3b82f6',
                    light: '#eff6ff',
                }
            }
        },
    },
    plugins: [],
}
