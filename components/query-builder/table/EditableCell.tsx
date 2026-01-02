import React from 'react';
import { Input, Switch } from "@nextui-org/react";
import { ContentRenderer } from '../ContentRenderer';
import { isExpandableData, toInputDate, fromInputDate } from './utils';

// --- Cell Component (Defined outside to maintain stability) ---
export const EditableCell = ({ getValue, row, column, table }: any) => {
    const initialValue = getValue();
    // 从 table meta 中获取动态状态，避免列定义重新生成导致 input 失去焦点
    const { editDraft, handleInputChange, isEditing, schemaProperties, pkSet } = table.options.meta as any;
    
    const isSelected = row.getIsSelected();
    const columnId = column.id;
    const isPK = pkSet.has(columnId);
    const isExpandable = isExpandableData(initialValue);

    // Schema Type Check
    const propDef = schemaProperties?.[columnId];
    const type = propDef?.type || 'Edm.String';
    const isBoolean = type === 'Edm.Boolean';
    const isDate = type === 'Edm.DateTime' || type === 'Edm.DateTimeOffset';

    // 如果处于编辑模式且行被选中，且不是主键或复杂对象，则渲染编辑器
    if (isEditing && isSelected && !isExpandable && !isPK) {
        const currentDraft = editDraft[row.index]?.[columnId];
        // 优先显示草稿值，否则显示初始值
        const displayValue = currentDraft !== undefined ? currentDraft : (initialValue ?? '');

        if (isBoolean) {
            return (
                <Switch 
                    size="sm" 
                    isSelected={displayValue === true || String(displayValue) === 'true'}
                    onValueChange={(checked) => handleInputChange(row.index, columnId, checked)}
                />
            );
        }

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

        return (
            <Input 
                size="sm" 
                variant="bordered"
                value={String(displayValue)}
                onValueChange={(val) => handleInputChange(row.index, columnId, val)}
                classNames={{ input: "text-xs font-mono h-6", inputWrapper: "h-7 min-h-7 px-1" }}
            />
        );
    }

    // 默认显示模式
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