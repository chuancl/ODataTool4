import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Button, Checkbox, Tooltip, Input, Chip } from "@nextui-org/react";
import { 
    Trash, Save, ChevronUp, ChevronDown, GripVertical, ChevronRight, Key, Link2, Pencil, Check, X
} from 'lucide-react';
import { 
    useReactTable, 
    getCoreRowModel, 
    getSortedRowModel,
    getExpandedRowModel,
    flexRender, 
    createColumnHelper,
    SortingState,
    ColumnOrderState,
    RowSelectionState,
    ExpandedState
} from '@tanstack/react-table';
import { ContentRenderer } from '../ContentRenderer';
import { isExpandableData } from './utils';
import { exportToExcel } from './excel-export';
import { ExpandedRowView } from './ExpandedRowView';
import { ParsedSchema } from '@/utils/odata-helper';

interface RecursiveDataTableProps {
    data: any[];
    isDark: boolean;
    isRoot?: boolean; // If true, shows global actions like Delete/Export
    onDelete?: (selectedRows: any[]) => void; 
    onUpdate?: (updates: { item: any, changes: any }[]) => void;
    onExport?: () => void;
    loading?: boolean;
    parentSelected?: boolean; 
    entityName?: string;
    schema?: ParsedSchema | null;
}

// 递归更新数据的选中状态
const updateRecursiveSelection = (data: any, isSelected: boolean) => {
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

export const RecursiveDataTable: React.FC<RecursiveDataTableProps> = ({ 
    data, 
    isDark, 
    isRoot = false, 
    onDelete, 
    onUpdate,
    onExport, 
    loading = false,
    parentSelected = false,
    entityName = 'Main',
    schema
}) => {
    const tableContainerRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(() => {
        if (typeof window !== 'undefined') return Math.max(600, window.innerWidth - 100);
        return 1000;
    });

    // --- Table State ---
    const [sorting, setSorting] = useState<SortingState>([]);
    const [columnOrder, setColumnOrder] = useState<ColumnOrderState>([]);
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({}); 
    const [expanded, setExpanded] = useState<ExpandedState>({});
    const [draggingColumn, setDraggingColumn] = useState<string | null>(null);

    // --- Editing State ---
    const [isEditing, setIsEditing] = useState(false);
    // Keyed by Row Index (React-Table index)
    const [editDraft, setEditDraft] = useState<Record<number, Record<string, any>>>({});

    // --- 1. 初始化及同步选中状态 ---
    useEffect(() => {
        const newSelection: RowSelectionState = {};
        data.forEach((row, index) => {
            if (row['__selected'] === true) {
                newSelection[index] = true;
            }
        });
        setRowSelection(newSelection);
        
        // Reset edits when data changes externally (e.g. refresh)
        setEditDraft({});
        setIsEditing(false);
    }, [data, parentSelected]);

    // 监听容器宽度变化
    useEffect(() => {
        if (!tableContainerRef.current) return;
        const observer = new ResizeObserver(entries => {
            for (const entry of entries) {
                if (entry.contentRect.width > 0) setContainerWidth(entry.contentRect.width);
            }
        });
        observer.observe(tableContainerRef.current);
        return () => observer.disconnect();
    }, []);

    // --- Identify PKs & FKs based on Schema ---
    const { pkSet, fkSet, fkInfoMap } = useMemo(() => {
        const pkSet = new Set<string>();
        const fkSet = new Set<string>();
        const fkInfoMap = new Map<string, string>(); 

        if (schema && entityName && schema.entities) {
            let entityType = schema.entities.find(e => e.name === entityName);
            if (!entityType) {
                const es = schema.entitySets.find(s => s.name === entityName);
                if (es) {
                    const typeName = es.entityType.split('.').pop();
                    entityType = schema.entities.find(e => e.name === typeName);
                }
            }
            if (!entityType) {
                 entityType = schema.entities.find(e => entityName.startsWith(e.name));
            }

            if (entityType) {
                entityType.keys.forEach(k => pkSet.add(k));
                entityType.navigationProperties.forEach(nav => {
                    if (nav.constraints) {
                        nav.constraints.forEach(c => {
                            fkSet.add(c.sourceProperty);
                            let target = nav.targetType || "Entity";
                            if (target.startsWith('Collection(')) target = target.slice(11, -1);
                            target = target.split('.').pop() || target;
                            fkInfoMap.set(c.sourceProperty, target);
                        });
                    }
                });
            }
        }
        return { pkSet, fkSet, fkInfoMap };
    }, [schema, entityName]);

    // --- Edit Handlers ---
    const handleStartEdit = () => {
        const selectedCount = Object.keys(rowSelection).length;
        if (selectedCount === 0) {
            alert("请先勾选需要修改的行");
            return;
        }
        setIsEditing(true);
        // Initialize draft with current values for selected rows? 
        // No need, we fallback to original value if draft is missing.
    };

    const handleCancelEdit = () => {
        setIsEditing(false);
        setEditDraft({});
    };

    const handleConfirmUpdate = () => {
        if (!onUpdate) return;
        
        const updates: { item: any, changes: any }[] = [];
        const changedIndices = Object.keys(editDraft).map(Number);
        
        changedIndices.forEach(idx => {
            // Only process if row is still selected
            if (rowSelection[idx]) {
                const originalItem = data[idx];
                const changes = editDraft[idx];
                
                // Calculate actual Diff
                const realChanges: any = {};
                let hasChanges = false;
                Object.entries(changes).forEach(([key, newVal]) => {
                    if (originalItem[key] != newVal) { // loose comparison for string/number match
                        realChanges[key] = newVal;
                        hasChanges = true;
                    }
                });

                if (hasChanges) {
                    updates.push({ item: originalItem, changes: realChanges });
                }
            }
        });

        if (updates.length === 0) {
             alert("未检测到任何实质性修改 (No changes detected)");
             return;
        }

        onUpdate(updates);
    };

    const handleInputChange = (rowIndex: number, columnId: string, value: string) => {
        setEditDraft(prev => ({
            ...prev,
            [rowIndex]: {
                ...(prev[rowIndex] || {}),
                [columnId]: value
            }
        }));
    };


    // --- Smart Column Width Algorithm ---
    const columnHelper = createColumnHelper<any>();
    
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

        const rawKeys = Object.keys(data[0]).filter(key => key !== '__metadata' && key !== '__selected');
        if (rawKeys.length === 0) return [expanderColumn, selectColumn, indexColumn];

        const sampleData = data.slice(0, 20);
        const columnMeta: Record<string, number> = {};
        let totalBaseWidth = 0;
        
        rawKeys.forEach(key => {
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

        const dataColumns = rawKeys.map((key, index) => {
            let finalWidth = Math.floor(columnMeta[key] * scaleRatio);
            if (shouldScale && index === rawKeys.length - 1) {
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
                cell: info => {
                    const isSelected = info.row.getIsSelected();
                    // 仅当开启编辑模式、当前行被选中、且值不是复杂对象时，渲染输入框
                    const value = info.getValue();
                    const isEditable = isEditing && isSelected && !isExpandableData(value) && !isPK; // Usually don't edit PKs

                    if (isEditable) {
                         const currentDraft = editDraft[info.row.index]?.[key];
                         const displayValue = currentDraft !== undefined ? currentDraft : (value === null ? '' : String(value));
                         
                         return (
                            <Input 
                                size="sm" 
                                variant="bordered"
                                value={displayValue}
                                onValueChange={(val) => handleInputChange(info.row.index, key, val)}
                                classNames={{ input: "text-xs font-mono h-6", inputWrapper: "h-7 min-h-7 px-1" }}
                            />
                         );
                    }

                    return (
                        <ContentRenderer 
                            value={value} 
                            columnName={key} 
                            onExpand={
                                isExpandableData(value) 
                                ? info.row.getToggleExpandedHandler() 
                                : undefined
                            }
                        />
                    );
                },
                size: finalWidth,
                minSize: 60,
                maxSize: 5000,
            });
        });

        return [expanderColumn, selectColumn, indexColumn, ...dataColumns];
    }, [data, containerWidth, pkSet, fkSet, fkInfoMap, isEditing, editDraft]);

    // Sync column order but prevent "Column not found" warnings
    useEffect(() => {
        if (columns.length > 0) {
            const validIds = new Set(columns.map(c => c.id));
            setColumnOrder(prev => {
                 const newOrder = columns.map(c => c.id as string);
                 return newOrder;
            });
        }
    }, [columns]); 

    const safeColumnOrder = useMemo(() => {
        const validIds = new Set(columns.map(c => c.id));
        return columnOrder.filter(id => validIds.has(id));
    }, [columnOrder, columns]);

    const table = useReactTable({
        data,
        columns,
        state: { 
            sorting, 
            columnOrder: safeColumnOrder,
            rowSelection, 
            expanded 
        },
        enableRowSelection: true, 
        enableExpanding: true,
        getRowCanExpand: row => {
            const keys = Object.keys(row.original);
            return keys.some(k => k !== '__metadata' && k !== '__selected' && isExpandableData(row.original[k]));
        },
        onExpandedChange: setExpanded,
        onRowSelectionChange: setRowSelection,
        onSortingChange: setSorting,
        onColumnOrderChange: setColumnOrder,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getExpandedRowModel: getExpandedRowModel(),
        enableColumnResizing: true,
        columnResizeMode: 'onChange',
    });

    const handleExport = () => {
        exportToExcel(data, entityName);
    };

    const handleDeleteClick = () => {
        const selectedRows = data.filter(r => r['__selected'] === true);
        if (onDelete) {
            onDelete(selectedRows);
        }
    };

    return (
        <div className="h-full flex flex-col bg-content1 overflow-hidden">
            <div className="bg-default-50 p-2 flex gap-2 border-b border-divider items-center justify-between shrink-0 h-12">
                 <div className="flex items-center gap-2">
                    {/* Header Left Content if any */}
                    {isEditing && (
                        <Chip size="sm" color="warning" variant="flat" className="animate-pulse">编辑模式 (Editing)</Chip>
                    )}
                 </div>
                 
                 <div className="flex gap-2">
                    {/* Edit Actions */}
                    {onUpdate && !isEditing && (
                         <Button size="sm" variant="flat" onPress={handleStartEdit} startContent={<Pencil size={14} />}>
                             修改 (Modify)
                         </Button>
                    )}

                    {isEditing && (
                        <>
                            <Button size="sm" color="success" variant="solid" className="text-white" onPress={handleConfirmUpdate} startContent={<Check size={14} />}>
                                更新 (Update)
                            </Button>
                            <Button size="sm" color="default" variant="flat" onPress={handleCancelEdit} startContent={<X size={14} />}>
                                取消 (Cancel)
                            </Button>
                        </>
                    )}
                    
                    {/* Standard Actions (Hide when editing to prevent confusion) */}
                    {!isEditing && (
                        <>
                            {onDelete && <Button size="sm" color="danger" variant="light" onPress={handleDeleteClick} startContent={<Trash size={14} />}>删除 (Delete)</Button>}
                            {isRoot && <Button size="sm" color="primary" variant="light" onPress={handleExport} startContent={<Save size={14} />}>导出 Excel</Button>}
                        </>
                    )}
                </div>
            </div>

            <div className="overflow-auto flex-1 w-full bg-content1 scrollbar-thin" ref={tableContainerRef}>
                <table 
                    className="w-full text-left border-collapse table-fixed"
                    style={{ width: table.getTotalSize() }}
                >
                    <thead className="sticky top-0 z-20 bg-default-50/90 backdrop-blur-md shadow-sm border-b border-divider">
                        {table.getHeaderGroups().map(headerGroup => (
                            <tr key={headerGroup.id}>
                                {headerGroup.headers.map(header => (
                                    <th 
                                        key={header.id} 
                                        className="relative p-2 py-3 text-xs font-bold text-default-600 select-none group border-r border-divider/10 hover:bg-default-100 transition-colors"
                                        style={{ width: header.getSize() }}
                                        draggable={!header.isPlaceholder && !['expander', 'select', 'index'].includes(header.id)}
                                        onDragStart={(e) => {
                                            if (['expander', 'select', 'index'].includes(header.id)) return;
                                            setDraggingColumn(header.column.id);
                                            e.dataTransfer.effectAllowed = 'move';
                                            e.currentTarget.style.opacity = '0.5';
                                        }}
                                        onDragEnd={(e) => {
                                            e.currentTarget.style.opacity = '1';
                                            setDraggingColumn(null);
                                        }}
                                        onDragOver={(e) => e.preventDefault()}
                                        onDrop={(e) => {
                                            e.preventDefault();
                                            if (draggingColumn && draggingColumn !== header.column.id && !['expander', 'select', 'index'].includes(header.id)) {
                                                const newOrder = [...columnOrder];
                                                const dragIndex = newOrder.indexOf(draggingColumn);
                                                const dropIndex = newOrder.indexOf(header.column.id);
                                                if (dragIndex !== -1 && dropIndex !== -1) {
                                                    newOrder.splice(dragIndex, 1);
                                                    newOrder.splice(dropIndex, 0, draggingColumn);
                                                    setColumnOrder(newOrder);
                                                }
                                            }
                                        }}
                                    >
                                        <div className="flex items-center gap-1 w-full overflow-hidden justify-center">
                                            {!['expander', 'select', 'index'].includes(header.id) && (
                                                <GripVertical size={12} className="text-default-300 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity shrink-0 absolute left-1" />
                                            )}
                                            {['expander', 'select', 'index'].includes(header.id) ? (
                                                <div className="flex items-center justify-center w-full">
                                                    {flexRender(header.column.columnDef.header, header.getContext())}
                                                </div>
                                            ) : (
                                                <div 
                                                    className="flex items-center gap-1 cursor-pointer flex-1 overflow-hidden pl-4"
                                                    onClick={header.column.getToggleSortingHandler()}
                                                >
                                                    <span className="truncate" title={header.column.id}>
                                                        {flexRender(header.column.columnDef.header, header.getContext())}
                                                    </span>
                                                    {{
                                                        asc: <ChevronUp size={12} className="text-primary shrink-0" />,
                                                        desc: <ChevronDown size={12} className="text-primary shrink-0" />,
                                                    }[header.column.getIsSorted() as string] ?? null}
                                                </div>
                                            )}
                                        </div>
                                        {header.column.getCanResize() && (
                                            <div
                                                onMouseDown={header.getResizeHandler()}
                                                onTouchStart={header.getResizeHandler()}
                                                className={`absolute right-0 top-0 h-full w-1 cursor-col-resize touch-none select-none hover:bg-primary/50 transition-colors z-10 ${
                                                    header.column.getIsResizing() ? 'bg-primary w-1' : 'bg-transparent'
                                                }`}
                                            />
                                        )}
                                    </th>
                                ))}
                            </tr>
                        ))}
                    </thead>
                    <tbody>
                        {table.getRowModel().rows.map((row, idx) => (
                            <React.Fragment key={row.id}>
                                <tr 
                                    className={`
                                        border-b border-divider/40 last:border-0 transition-colors
                                        hover:bg-primary/5
                                        ${row.getIsSelected() ? 'bg-primary/10' : (idx % 2 === 0 ? 'bg-transparent' : 'bg-default-50/30')}
                                        ${row.getIsExpanded() ? 'bg-default-100 border-b-0' : ''}
                                    `}
                                >
                                    {row.getVisibleCells().map(cell => (
                                        <td 
                                            key={cell.id} 
                                            className="p-2 text-sm text-default-700 align-middle overflow-hidden border-r border-divider/10 last:border-0"
                                            style={{ width: cell.column.getSize() }}
                                        >
                                            <div className="w-full">
                                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                            </div>
                                        </td>
                                    ))}
                                </tr>
                                {row.getIsExpanded() && (
                                    <tr className="bg-default-50/50">
                                        <td colSpan={row.getVisibleCells().length} className="p-0 border-b border-divider">
                                            <ExpandedRowView 
                                                rowData={row.original} 
                                                isDark={isDark} 
                                                parentSelected={row.getIsSelected()} 
                                                schema={schema} 
                                                parentEntityName={entityName}
                                                onUpdate={onUpdate} // Pass it down to nested tables
                                            />
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
                
                {data.length === 0 && !loading && (
                    <div className="flex flex-col items-center justify-center h-40 text-default-400">
                        <p>暂无数据</p>
                    </div>
                )}
            </div>
        </div>
    );
};