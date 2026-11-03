export const getErrorMessage = (error: unknown) => {
    if (typeof error === 'string') return error;
    if (error instanceof Error) return error.message;
    if (
        typeof error === 'object'
        && error !== null
        && 'error' in error
        && (error as { error?: unknown }).error === 'DEVICE_ID_REQUIRED'
    ) {
        return 'DEVICE_ID_REQUIRED: selecciona o confirma el device_id autorizado actual antes de llamar ERP.';
    }
    if (
        typeof error === 'object'
        && error !== null
        && 'message' in error
        && typeof (error as { message?: unknown }).message === 'string'
    ) {
        return (error as { message: string }).message;
    }
    if (
        typeof error === 'object'
        && error !== null
        && 'error_description' in error
        && typeof (error as { error_description?: unknown }).error_description === 'string'
    ) {
        return (error as { error_description: string }).error_description;
    }
    return 'Error desconocido';
};
