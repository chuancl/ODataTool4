import React, { useMemo } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import { Checkbox, Tooltip } from "@nextui-org/react";
import { ChevronDown, ChevronRight, Key, Link2 } from 'lucide-react';
import { flexRender } from '@tanstack/react-table';
import { isExpandableData, updateRecursiveSelection } from './utils';
import { EditableCell } from './EditableCell';

interface UseTableColumnsProps {
    data: any[];
    containerWidth: number;
    pkSet: Set<string>;
    fkSet: Set<string>;
    fkInfoMap: Map<string, string>;
    navPropSet: Set<string>;
}

export const useTableColumns = ({
    data,
    containerWidth,
    pkSet,
    fkSet,
    fkInfoMap,
    navPropSet
}: UseTableColumnsProps) => {
    const columnHelper = createColumnHelper<any>();
    
    // IMPORTANT: columns useMemo should NOT depend on 'editDraft' or 'isEditing'
    // This ensures the DOM structure of cells (Inputs) is not destroyed on every keystroke.
    const columns = useMemo(() => {
        if (!data || data.length === 0) return [];
        
        const FIXED_WIDTH = 32 + 40 + 50;

        // Expander Column
        const expanderColumn = columnHelper.display({
            id: 'expander',
            header: () => null,
            cell: ({ row }) => {
                return row.getCanExpand() ? (
                    <div className="flex items-center justify-center w-full">
                        <button
                            {...{
                                onClick: row.getToggleExpandedHandler(),
                                style: { cursor: 'pointer' },
                            }}
                            className="p-0.5 hover:bg-primary/10 text-default-400 hover:text-primary rounded transition-colors"
                        >
                            {row.getIsExpanded() ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </button>
                    </div>
                ) : null;
            },
            size: 32,
            enableResizing: false,
        });

        // Select Column
        const selectColumn = columnHelper.display({
            id: 'select',
            header: ({ table }) => (
                <div className="flex items-center justify-center w-full">
                     <Checkbox
                        size="sm"
                        isIndeterminate={!!table.getIsSomeRowsSelected()}
                        isSelected={!!table.getIsAllRowsSelected()}
                        onValueChange={(val) => {
                            const isSelected = !!val;
                            table.toggleAllRowsSelected(isSelected);
                            updateRecursiveSelection(data, isSelected);
                        }}
                        aria-label="Select all"
                        classNames={{ wrapper: "m-0" }}
                    />
                </div>
            ),
            cell: ({ row }) => (
                <div className="flex items-center justify-center w-full">
                    <Checkbox
                        size="sm"
                        isSelected={!!row.getIsSelected()}
                        onValueChange={(val) => {
                            const isSelected = !!val;
                            row.toggleSelected(isSelected);
                            updateRecursiveSelection(row.original, isSelected);
                        }}
                        aria-label="Select row"
                        classNames={{ wrapper: "m-0" }}
                    />
                </div>
            ),
            size: 40,
            enableResizing: false,
            minSize: 40,
            maxSize: 40,
        });

        const indexColumn = columnHelper.display({
            id: 'index',
            header: '#',
            cell: (info) => (
                <span className="text-default-400 font-mono text-xs w-full text-center block">
                    {info.row.index + 1}
                </span>
            ),
            size: 50,
            enableResizing: true,
            minSize: 40,
            maxSize: 100,
        });

        // 获取所有 Key，排除元数据和选中标记
        const rawKeys = Object.keys(data[0]).filter(key => key !== '__metadata' && key !== '__selected');
        
        // 过滤：排除导航属性 (Navigation Properties) 和 纯 Deferred 对象
        const dataKeys = rawKeys.filter(key => {
            // 1. 如果 Schema 明确指出是导航属性，则隐藏
            if (navPropSet.has(key)) return false;
            
            // 2. 启发式检测：如果该列的值是一个只包含 __deferred 的对象，且没有其他数据，则视为未展开的关联，隐藏之
            // 注意：已展开的关联数据 (Array 或 Complex Object) 也不应该在主表显示，
            // 但如果 Schema 缺失，我们可能无法区分 ComplexType (应显示) 和 NavigationProperty (不应显示)。
            // 鉴于 ComplexType 较少见且通常不含 __deferred，这里主要针对 deferred link 进行隐藏。
            const val = data[0][key];
            if (val && typeof val === 'object' && !Array.isArray(val)) {
                if (val.__deferred && Object.keys(val).length === 1) {
                    return false;
                }
            }
            // 如果是已展开的 Array，通常也是导航属性，隐藏 (应在详情行显示)
            if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object') {
                 // 简单的启发式：数组对象通常是关联实体
                 // 但如果是 Primitive Array (V4)，则应该显示。这里 OData V2/V3 主要是 Entity Array。
                 // 暂且保留显示 Array，除非 schema 明确禁止，或者让它显示为 Chip 供点击展开 (ExpandedRowView)
                 // 用户现在的需求主要是 "deferred" 列。
                 // 如果 Schema 存在，navPropSet 已经覆盖了这种情况。
            }

            return true;
        });

        if (dataKeys.length === 0) return [expanderColumn, selectColumn, indexColumn];

        const sampleData = data.slice(0, 20);
        const columnMeta: Record<string, number> = {};
        let totalBaseWidth = 0;
        
        dataKeys.forEach(key => {
            let maxWeightedLen = Math.max(key.length * 1.3, 4); 
            sampleData.forEach(row => {
                const val = row[key];
                if (val !== null && val !== undefined) {
                    const str = String(val);
                    let len = 0;
                    for (let i = 0; i < str.length; i++) len += (str.charCodeAt(i) > 255) ? 1.6 : 1;
                    let weightedLen = len;
                    if (len > 30) weightedLen = 30 + (len - 30) * 0.5;
                    if (weightedLen > 80) weightedLen = 80 + (weightedLen - 80) * 0.2;
                    if (weightedLen > 250) weightedLen = 250;
                    if (weightedLen > maxWeightedLen) maxWeightedLen = weightedLen;
                }
            });
            const basePx = Math.min(Math.max(Math.ceil(maxWeightedLen * 8) + 24, 80), 400);
            columnMeta[key] = basePx;
            totalBaseWidth += basePx;
        });

        const availableWidthForData = containerWidth > 0 ? (containerWidth - 2 - FIXED_WIDTH) : 0;
        const shouldScale = availableWidthForData > 0 && totalBaseWidth < availableWidthForData;
        const scaleRatio = shouldScale ? (availableWidthForData / totalBaseWidth) : 1;

        let currentTotalWidth = 0;

        const dataColumns = dataKeys.map((key, index) => {
            let finalWidth = Math.floor(columnMeta[key] * scaleRatio);
            if (shouldScale && index === dataKeys.length - 1) {
                const remaining = availableWidthForData - currentTotalWidth - finalWidth;
                if (remaining > 0 && remaining < 100) finalWidth += remaining;
            }
            currentTotalWidth += finalWidth;
            
            const isPK = pkSet.has(key);
            const isFK = fkSet.has(key);
            const fkTarget = fkInfoMap.get(key);

            return columnHelper.accessor(row => row[key], { 
                id: key,
                header: () => (
                    <div className="flex items-center gap-1.5">
                        {isPK && (
                            <Tooltip content="Primary Key">
                                <Key size={12} className="text-warning-500 shrink-0 fill-warning-500/20" />
                            </Tooltip>
                        )}
                        {isFK && (
                            <Tooltip content={`Foreign Key -> ${fkTarget}`}>
                                <Link2 size={12} className="text-secondary-500 shrink-0" />
                            </Tooltip>
                        )}
                        <span className={isPK ? "font-bold text-foreground" : isFK ? "text-secondary-600 font-medium" : ""}>
                            {key}
                        </span>
                    </div>
                ),
                // Use the stable component here
                cell: EditableCell, 
                size: finalWidth,
                minSize: 60,
                maxSize: 5000,
            });
        });

        return [expanderColumn, selectColumn, indexColumn, ...dataColumns];
    }, [data, containerWidth, pkSet, fkSet, fkInfoMap, navPropSet]); 
    
    return columns;
};