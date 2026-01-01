// ----------------------------------------------------------------------
// Helper: Check if value is a nested OData entity (Array or Object)
// ----------------------------------------------------------------------
export const isExpandableData = (value: any): boolean => {
    if (!value) return false;
    // V2/V4 Array
    if (Array.isArray(value)) return value.length > 0;
    // V2 Nested { results: [] }
    if (typeof value === 'object') {
        if (value instanceof Date) return false;
        if (value.__metadata && Object.keys(value).length === 1) return false; // Only metadata
        if (value.__deferred) return false; // Deferred link, not expanded data
        return true;
    }
    return false;
};