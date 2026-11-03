export const formatDateTime = (value?: string | null) => {
    if (!value) return 'N/D';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return 'N/D';
    return parsed.toLocaleString('es-DO');
};
