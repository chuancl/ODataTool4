import React from 'react';
import { Input, Switch, Tooltip } from "@nextui-org/react";
import { ContentRenderer } from '../ContentRenderer';
import { isExpandableData, toInputDate, fromInputDate } from './utils';

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
    const precision = propDef?.precision;
    const scale = propDef?.scale;

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
    // Int64/Decimal 范围通常由 Precision 控制，或者太大不适合 HTML min/max

    // --- 值变更处理 ---
    const handleTypedChange = (val: string) => {
        let finalVal: any = val;

        if (type) {
             // 1. 数值类型处理 (Integer & Decimal)
             if (isInteger || isDecimal) {
                 if (val === '') {
                    finalVal = null; 
                 } else {
                     // A. 基础字符检查 (只允许数字, 负号, 小数点)
                     const regex = isInteger ? /^-?\d*$/ : /^-?\d*\.?\d*$/;
                     if (!regex.test(val)) return; 

                     // B. 精度与小数位检查 (Precision & Scale)
                     if (isDecimal && precision !== undefined) {
                         const parts = val.split('.');
                         // 去除负号计算数字位数
                         const intPart = parts[0].replace('-', '');
                         const decPart = parts[1] || '';
                         
                         // Scale 检查 (小数位)
                         // 默认如果没有 scale，是否允许小数？通常 Edm.Decimal 需要 scale。
                         // 如果 scale 未定义，但在 V4 可能是 Variable。这里假设 undefined 不限制或限制宽松。
                         if (scale !== undefined && decPart.length > scale) return;

                         // Precision 检查 (总有效位数: 整数位 + 小数位)
                         const totalDigits = intPart.length + decPart.length;
                         if (totalDigits > precision) return;
                     }

                     const num = parseFloat(val);
                     if (!isNaN(num)) {
                         // C. 范围检查 (Min/Max)
                         // 只有当数字完整有效时才检查，避免阻止用户输入 "-"
                         if (minAttr !== undefined && num < minAttr) return;
                         if (maxAttr !== undefined && num > maxAttr) return;
                         
                         // D. 存储策略
                         // 为了更好的 UX (如输入 "1." 不被重置为 "1")，以及 OData 类型的特殊性：
                         // 如果字符串表示与数字表示完全一致，存为 Number (JSON payload 更干净)
                         // 否则 (如 "1.", "007", "-0"), 存为 String，保留用户输入状态
                         if (String(num) === val) {
                             // 对于 Edm.Int64 和 Edm.Decimal，OData 经常推荐 String 传输以防精度丢失
                             // 但如果用户输入的是简单数字，转为 Number 也是符合 JSON 标准的。
                             // 如果是 Int64 且数值极大，JS Number 会丢失精度，此时 String(num) !== val，会自动走 else 分支存 String
                             finalVal = num;
                         } else {
                             finalVal = val;
                         }
                     } else {
                         // 处理 "-" 或 "." 等中间状态
                         finalVal = val;
                     }
                 }
             }
             // 2. GUID 处理
             else if (isGuid) {
                 if (val.length > 36) return;
                 finalVal = val;
             }
             // 3. 字符串处理
             else {
                 if (maxLength && val.length > maxLength) return; 
                 finalVal = val;
             }
        }
        
        handleInputChange(row.index, columnId, finalVal);
    };

    // --- 渲染逻辑 ---

    if (isEditing && isSelected && !isExpandable && !isPK) {
        const currentDraft = editDraft[row.index]?.[columnId];
        const displayValue = currentDraft !== undefined ? currentDraft : (initialValue ?? '');

        // 1. 布尔值 Switch
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

        // 2. 日期时间
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

        // 3. 数值类型 Input
        if (isInteger || isDecimal) {
            // 构建提示信息
            const hints: string[] = [`Type: ${type.split('.').pop()}`];
            if (minAttr !== undefined) hints.push(`Min: ${minAttr}`);
            if (maxAttr !== undefined) hints.push(`Max: ${maxAttr}`);
            if (precision !== undefined) hints.push(`Prec: ${precision}`);
            if (scale !== undefined) hints.push(`Scale: ${scale}`);

            return (
                <Tooltip content={hints.join(', ')} delay={1000}>
                    <Input 
                        // 使用 text 类型以获得对 "-" 和 "." 输入的完全控制，避免浏览器 number input 的默认行为干扰正则校验
                        type="text" 
                        size="sm" 
                        variant="bordered"
                        value={String(displayValue)}
                        onValueChange={handleTypedChange}
                        classNames={{ input: "text-xs font-mono h-6", inputWrapper: "h-7 min-h-7 px-1" }}
                    />
                </Tooltip>
            );
        }

        // 4. 默认/字符串/文件 Input
        // 允许直接编辑所有文本内容 (包括 Base64)
        return (
            <Tooltip content={maxLength ? `Max Length: ${maxLength}` : "Text / File String"} delay={1000} isDisabled={!maxLength}>
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