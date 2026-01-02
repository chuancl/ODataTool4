import React from 'react';
import { Input, Switch, Tooltip } from "@nextui-org/react";
import { ContentRenderer } from '../ContentRenderer';
import { isExpandableData, toInputDate, fromInputDate } from './utils';
import { Lock } from 'lucide-react';

// --- 辅助：判断是否为不宜编辑的文件/二进制数据 ---
const isFileLike = (val: any, columnName: string): boolean => {
    if (!val) return false;
    const str = String(val);
    
    // 1. Data URI
    if (str.startsWith('data:')) return true;
    
    // 2. 典型的 Base64 文件头 (Magic Numbers)
    const MAGIC_NUMBERS = ['/9j/', 'iVBORw0KGgo', 'R0lGOD', 'Qk', 'UklGR', 'JVBER', 'UEsDB'];
    if (str.length > 50 && /^[A-Za-z0-9+/]*={0,2}$/.test(str.replace(/\s/g, ''))) {
        if (MAGIC_NUMBERS.some(m => str.startsWith(m))) return true;
        // 启发式：如果列名包含 image/file 且内容很长，视为文件
        if (/image|photo|file|doc|stream|blob/i.test(columnName) && str.length > 200) return true;
    }

    return false;
};

// --- Cell Component ---
export const EditableCell = ({ getValue, row, column, table }: any) => {
    const initialValue = getValue();
    const { editDraft, handleInputChange, isEditing, schemaProperties, pkSet } = table.options.meta as any;
    
    const isSelected = row.getIsSelected();
    const columnId = column.id;
    const isPK = pkSet.has(columnId);
    const isExpandable = isExpandableData(initialValue);

    // Schema Type Check
    const propDef = schemaProperties?.[columnId];
    const type = propDef?.type || 'Edm.String';
    
    // 提取约束条件
    const maxLength = propDef?.maxLength;
    //const precision = propDef?.precision;
    //const scale = propDef?.scale;

    // --- 类型特征判断 ---
    const isBoolean = type === 'Edm.Boolean';
    const isDate = type === 'Edm.DateTime' || type === 'Edm.DateTimeOffset';
    
    const isInteger = ['Edm.Int16', 'Edm.Int32', 'Edm.Byte', 'Edm.SByte', 'Edm.Int64'].includes(type);
    const isDecimal = ['Edm.Double', 'Edm.Single', 'Edm.Float', 'Edm.Decimal'].includes(type);
    const isGuid = type === 'Edm.Guid';

    // --- 确定数值范围 ---
    let minAttr: number | undefined;
    let maxAttr: number | undefined;

    if (type === 'Edm.Byte') { minAttr = 0; maxAttr = 255; }
    else if (type === 'Edm.SByte') { minAttr = -128; maxAttr = 127; }
    else if (type === 'Edm.Int16') { minAttr = -32768; maxAttr = 32767; }
    else if (type === 'Edm.Int32') { minAttr = -2147483648; maxAttr = 2147483647; }
    // Int64 范围太大，HTML input number 可能有精度问题，通常作为字符串处理或不做严格 max 限制

    // --- 值变更处理 ---
    const handleTypedChange = (val: string) => {
        let finalVal: any = val;

        if (type) {
             // 1. 整数处理
             if (isInteger) {
                 if (val === '') {
                    finalVal = null; 
                 } else {
                     // 限制输入必须为数字
                     if (!/^-?\d*$/.test(val)) return; // 拒绝非数字输入

                     let num = parseInt(val, 10);
                     if (!isNaN(num)) {
                         // 范围检查 (Range Check)
                         if (minAttr !== undefined && num < minAttr) num = minAttr;
                         if (maxAttr !== undefined && num > maxAttr) num = maxAttr;
                         
                         // Int64 特殊处理：如果后端需要字符串格式的数字，则保持 string
                         if (type === 'Edm.Int64') finalVal = val; 
                         else finalVal = num;
                     }
                 }
             }
             // 2. 小数处理
             else if (isDecimal) {
                 if (val === '') {
                     finalVal = null;
                 } else {
                     // 允许小数点
                     if (!/^-?\d*\.?\d*$/.test(val)) return;

                     // 简单的 float 转换，精度控制通常在失去焦点时做，输入时不宜过于强制
                     const num = parseFloat(val);
                     if (!isNaN(num)) {
                         // Decimal 同样有时需要传字符串以保精度
                         if (type === 'Edm.Decimal') finalVal = num; // 或 val
                         else finalVal = num;
                     }
                 }
             }
             // 3. GUID 处理
             else if (isGuid) {
                 if (val.length > 36) return; // 长度限制
                 finalVal = val;
             }
             // 4. 字符串处理
             else {
                 if (maxLength && val.length > maxLength) return; // 长度限制
                 finalVal = val;
             }
        }
        
        handleInputChange(row.index, columnId, finalVal);
    };

    // --- 渲染逻辑 ---

    if (isEditing && isSelected && !isExpandable && !isPK) {
        const currentDraft = editDraft[row.index]?.[columnId];
        const displayValue = currentDraft !== undefined ? currentDraft : (initialValue ?? '');

        // 1. 文件/二进制类型检测：禁止编辑
        if (isFileLike(displayValue, columnId) || type === 'Edm.Binary' || type === 'Edm.Stream') {
            return (
                <div className="flex items-center gap-2 opacity-60 cursor-not-allowed bg-default-100 p-1 rounded border border-default-200">
                    <Lock size={12} className="text-default-400" />
                    <span className="text-[10px] text-default-500 italic">文件类型不可编辑</span>
                </div>
            );
        }

        // 2. 布尔值 Switch
        if (isBoolean) {
            return (
                <div className="flex items-center h-7">
                    <Switch 
                        size="sm" 
                        isSelected={displayValue === true || String(displayValue) === 'true'}
                        onValueChange={(checked) => handleInputChange(row.index, columnId, checked)}
                    />
                </div>
            );
        }

        // 3. 日期时间
        if (isDate) {
            return (
                <input
                    type="datetime-local"
                    className="w-full h-7 text-xs px-1 border border-default-300 rounded bg-transparent focus:border-primary outline-none"
                    value={toInputDate(displayValue)}
                    onChange={(e) => handleInputChange(row.index, columnId, fromInputDate(e.target.value))}
                />
            );
        }

        // 4. 数值类型 Input
        if (isInteger || isDecimal) {
            return (
                <Tooltip content={`Type: ${type.split('.').pop()} ${minAttr!==undefined ? `[${minAttr}, ${maxAttr}]` : ''}`} delay={1000}>
                    <Input 
                        type="number"
                        size="sm" 
                        variant="bordered"
                        value={String(displayValue)}
                        onValueChange={handleTypedChange}
                        classNames={{ input: "text-xs font-mono h-6", inputWrapper: "h-7 min-h-7 px-1" }}
                        // HTML5 Constraints
                        min={minAttr}
                        max={maxAttr}
                        step={isInteger ? "1" : "any"}
                    />
                </Tooltip>
            );
        }

        // 5. 默认字符串 Input
        return (
            <Tooltip content={maxLength ? `Max Length: ${maxLength}` : "Text"} delay={1000} isDisabled={!maxLength}>
                <Input 
                    type="text"
                    size="sm" 
                    variant="bordered"
                    value={String(displayValue)}
                    onValueChange={handleTypedChange}
                    classNames={{ input: "text-xs font-mono h-6", inputWrapper: "h-7 min-h-7 px-1" }}
                    maxLength={maxLength}
                />
            </Tooltip>
        );
    }

    // --- 非编辑模式 (Read-Only) ---
    return (
        <ContentRenderer 
            value={initialValue} 
            columnName={columnId} 
            onExpand={
                isExpandable
                ? row.getToggleExpandedHandler() 
                : undefined
            }
        />
    );
};