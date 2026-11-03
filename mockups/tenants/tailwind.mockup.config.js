/** Config para compilar el CSS de los mockups (no afecta a la app). */
export default {
    content: ['./mockups/tenants/*.html'],
    theme: {
        extend: {
            fontFamily: { sans: ['Public Sans', 'system-ui', 'sans-serif'] },
            colors: {
                brand: { dark: '#0f172a', DEFAULT: '#3b82f6', light: '#eff6ff' },
            },
        },
    },
    plugins: [],
};
