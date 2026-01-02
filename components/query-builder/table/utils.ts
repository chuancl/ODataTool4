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

// 递归更新数据的选中状态
export const updateRecursiveSelection = (data: any, isSelected: boolean) => {
    if (!data) return;
    if (Array.isArray(data)) {
        data.forEach(item => updateRecursiveSelection(item, isSelected));
        return;
    }
    if (typeof data === 'object') {
        data['__selected'] = isSelected;
        Object.values(data).forEach(val => {
            if (isExpandableData(val)) {
                if (Array.isArray(val)) {
                    updateRecursiveSelection(val, isSelected);
                } else if ((val as any).results && Array.isArray((val as any).results)) {
                    updateRecursiveSelection((val as any).results, isSelected);
                } else {
                     updateRecursiveSelection(val, isSelected);
                }
            }
        });
    }
};

// 辅助：日期格式转换
export const toInputDate = (val: any) => {
    if (!val) return '';
    const str = String(val);
    // 2023-10-10T12:00:00.000Z -> 2023-10-10T12:00
    if (str.length >= 16 && str.includes('T')) {
        return str.substring(0, 16);
    }
    return str;
};

export const fromInputDate = (val: string) => {
    if (!val) return null;
    // 补全秒数和时区 Z，使其符合常见 OData ISO 格式
    if (val.length === 16) return `${val}:00Z`;
    return val;
};