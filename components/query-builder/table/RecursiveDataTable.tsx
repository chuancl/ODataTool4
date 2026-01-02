import React, { useMemo, useState, useEffect, useRef } from 'react';
import { 
    ChevronUp, ChevronDown, GripVertical
} from 'lucide-react';
import { 
    useReactTable, 
    getCoreRowModel, 
    getSortedRowModel,
    getExpandedRowModel,
    flexRender, 
    SortingState,
    ColumnOrderState,
    RowSelectionState,
    ExpandedState
} from '@tanstack/react-table';

import { isExpandableData, updateRecursiveSelection } from './utils';
import { exportToExcel } from './excel-export';
import { ExpandedRowView } from './ExpandedRowView';
import { ParsedSchema } from '@/utils/odata-helper';
import { TableHeader } from './TableHeader';
import { useTableColumns } from './useTableColumns';

interface RecursiveDataTableProps {
    data: any[];
    isDark: boolean;
    isRoot?: boolean; 
    onDelete?: (selectedRows: any[]) => void; 
    onUpdate?: (updates: { item: any, changes: any }[]) => void;
    onExport?: () => void;
    loading?: boolean;
    parentSelected?: boolean; 
    entityName?: string;
    schema?: ParsedSchema | null;
}

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

    // --- Schema Analysis ---
    const { pkSet, fkSet, fkInfoMap, schemaProperties, navPropSet } = useMemo(() => {
        const pkSet = new Set<string>();
        const fkSet = new Set<string>();
        const navPropSet = new Set<string>();
        const fkInfoMap = new Map<string, string>(); 
        const schemaProperties: Record<string, any> = {};

        if (schema && entityName && schema.entities) {
            let entityType = schema.entities.find(e => e.name === entityName);
            // 尝试模糊匹配或查找 EntitySet 对应的 Type
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
                entityType.properties.forEach(p => {
                    schemaProperties[p.name] = p;
                });
                entityType.navigationProperties.forEach(nav => {
                    navPropSet.add(nav.name);
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
        return { pkSet, fkSet, fkInfoMap, schemaProperties, navPropSet };
    }, [schema, entityName]);

    // --- Edit Handlers ---
    const handleStartEdit = () => {
        setIsEditing(true);
    };

    const handleCancelEdit = () => {
        setIsEditing(false);
        setEditDraft({});
    };

    const handleConfirmUpdate = () => {
        if (!onUpdate) {
            console.error("No onUpdate handler provided");
            return;
        }
        
        const updates: { item: any, changes: any }[] = [];
        const changedIndices = Object.keys(editDraft).map(Number);
        
        changedIndices.forEach(idx => {
            // Check row selection (handle both number and string keys)
            const isSelected = rowSelection[idx] === true || rowSelection[String(idx)] === true;

            if (isSelected) {
                const originalItem = data[idx];
                const changes = editDraft[idx];
                
                const realChanges: any = {};
                let hasChanges = false;
                Object.entries(changes).forEach(([key, newVal]) => {
                    // Loose equality check to handle string vs number inputs
                    if (originalItem[key] != newVal) {
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
             const hasDrafts = Object.keys(editDraft).length > 0;
             if (hasDrafts) {
                 alert("检测到修改，但未选中对应行。请勾选修改过的行再点击更新。\n(Changes detected but rows not selected. Please select modified rows.)");
             } else {
                 alert("未检测到任何实质性修改 (No changes detected)");
             }
             return;
        }

        onUpdate(updates);
    };

    const handleInputChange = (rowIndex: number, columnId: string, value: any) => {
        setEditDraft(prev => ({
            ...prev,
            [rowIndex]: {
                ...(prev[rowIndex] || {}),
                [columnId]: value
            }
        }));
        
        // 自动选中正在修改的行 (Auto-select row on edit)
        // Check if already selected (handle both keys)
        if (!rowSelection[rowIndex] && !rowSelection[String(rowIndex)]) {
            setRowSelection(prev => ({ ...prev, [rowIndex]: true }));
            // 同时也更新数据源标记，以便导出等功能感知
            updateRecursiveSelection(data[rowIndex], true);
        }
    };

    // --- Columns Definition (Use Hook) ---
    const columns = useTableColumns({
        data,
        containerWidth,
        pkSet,
        fkSet,
        fkInfoMap,
        navPropSet
    });

    // Sync column order
    useEffect(() => {
        if (columns.length > 0) {
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
        meta: {
            editDraft,
            handleInputChange,
            isEditing,
            schemaProperties,
            pkSet
        },
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
            <TableHeader 
                isEditing={isEditing}
                onStartEdit={handleStartEdit}
                onCancelEdit={handleCancelEdit}
                onConfirmUpdate={handleConfirmUpdate}
                onDelete={handleDeleteClick}
                onExport={handleExport}
            />

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
                                                onUpdate={onUpdate} 
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