import React, { useMemo, useState } from 'react';
import { EntityProperty } from '@/utils/odata-helper';
import { Key, Link2, ChevronDown, ChevronUp, GripVertical } from 'lucide-react';
import { useReactTable, getCoreRowModel, getSortedRowModel, flexRender, createColumnHelper, SortingState, ColumnOrderState } from '@tanstack/react-table';

export const EntityDetailsTable = ({ 
    properties, 
    keys, 
    getFkInfo,
    onJumpToEntity,
    onFocus
}: { 
    properties: EntityProperty[], 
    keys: string[], 
    getFkInfo: (name: string) => any,
    onJumpToEntity: (name: string) => void,
    onFocus?: () => void
}) => {
    const [sorting, setSorting] = useState<SortingState>([]);
    const [columnOrder, setColumnOrder] = useState<ColumnOrderState>(['name', 'type', 'size', 'attributes', 'defaultValue', 'relation']);
    const [draggingColumn, setDraggingColumn] = useState<string | null>(null);

    const columnHelper = createColumnHelper<EntityProperty>();

    const columns = useMemo(() => [
        // 1. Name Column
        columnHelper.accessor('name', {
            id: 'name',
            header: 'Field',
            enableSorting: true,
            minSize: 110,
            cell: info => {
                const isKey = keys.includes(info.getValue());
                return (
                    <div className="flex items-center gap-2">
                        {isKey ? <Key size={14} className="text-warning shrink-0" /> : <div className="w-3.5" />}
                        <span className={`${isKey ? "font-bold text-foreground" : "text-default-700"} text-xs`}>
                            {info.getValue()}
                        </span>
                    </div>
                );
            }
        }),

        // 2. Type Column
        columnHelper.accessor('type', {
            id: 'type',
            header: 'Type',
            enableSorting: true,
            size: 100,
            cell: info => <span className="font-mono text-xs text-primary/80">{info.getValue().split('.').pop()}</span>
        }),

        // 3. Size/Precision Column
        columnHelper.accessor(row => row.maxLength || row.precision || 0, {
            id: 'size',
            header: 'Size',
            enableSorting: true,
            size: 70,
            cell: info => {
                const p = info.row.original;
                if (p.maxLength) return <span className="font-mono text-xs text-default-500">{p.maxLength}</span>;
                if (p.precision) return <span className="font-mono text-xs text-default-500">{p.precision}{p.scale !== undefined ? `,${p.scale}` : ''}</span>;
                return <span className="text-default-300 text-xs">-</span>;
            }
        }),

        // 4. Attributes Column
        columnHelper.accessor(row => `${row.nullable}${row.unicode}${row.fixedLength}${row.concurrencyMode}`, {
            id: 'attributes',
            header: 'Attributes',
            enableSorting: false, 
            size: 180,
            cell: info => {
                const p = info.row.original;
                return (
                    <div className="flex items-center gap-1.5 flex-wrap">
                        {/* Nullable status */}
                        {!p.nullable && (
                            <span title="Field is Required (Not Null)" className="px-1.5 py-0.5 rounded-[4px] bg-danger/10 text-danger text-[10px] font-semibold border border-danger/20">Required</span>
                        )}
                        
                        {/* Fixed Length */}
                        {p.fixedLength && (
                             <span title="Fixed Length String/Binary" className="px-1.5 py-0.5 rounded-[4px] bg-default-100 text-default-600 text-[10px] font-medium border border-default-200">Fixed Length</span>
                        )}

                        {/* Unicode Status */}
                        {p.unicode === false ? (
                             <span title="Non-Unicode (ANSI)" className="px-1.5 py-0.5 rounded-[4px] bg-warning/10 text-warning-700 text-[10px] font-medium border border-warning/20">Non-Unicode</span>
                        ) : (
                             <span title="Unicode Enabled" className="px-1.5 py-0.5 rounded-[4px] bg-primary/5 text-primary/70 text-[10px] font-medium border border-primary/10">Unicode</span>
                        )}

                        {/* Concurrency */}
                        {p.concurrencyMode === 'Fixed' && (
                            <span title="Optimistic Concurrency Control" className="px-1.5 py-0.5 rounded-[4px] bg-success/10 text-success-700 text-[10px] font-medium border border-success/20">Concurrency</span>
                        )}
                    </div>
                );
            }
        }),

        // 5. Default Value
        columnHelper.accessor('defaultValue', {
            id: 'defaultValue',
            header: 'Default',
            enableSorting: true,
            size: 90,
            cell: info => info.getValue() ? <span className="font-mono text-xs bg-default-50 px-1 rounded border border-default-100 text-default-600 max-w-[80px] truncate block" title={info.getValue()}>{info.getValue()}</span> : <span className="text-default-200 text-xs">-</span>
        }),

        // 6. Relation Column
        columnHelper.display({
            id: 'relation',
            header: 'Relation',
            size: 200,
            cell: info => {
                const fk = getFkInfo(info.row.original.name);
                if (!fk) return null;
                return (
                    <div className="flex items-center gap-1 text-xs w-full group">
                        <Link2 size={12} className="text-secondary shrink-0" />
                        <div className="flex items-center gap-0.5 overflow-hidden">
                            <span 
                                className="font-bold text-secondary cursor-pointer hover:underline hover:text-secondary-600 truncate" 
                                // Prevent wrapper's onMouseDown to avoid re-render race condition killing the click.
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => { e.stopPropagation(); onJumpToEntity(fk.targetEntity); }}
                                title={`Jump to Entity: ${fk.targetEntity}`}
                            >
                                {fk.targetEntity}
                            </span>
                            <span className="text-default-400">.</span>
                            <span className="font-mono text-default-600 truncate" title={`Target Field: ${fk.targetProperty}`}>{fk.targetProperty}</span>
                        </div>
                    </div>
                );
            }
        })

    ], [keys, getFkInfo, onJumpToEntity]);

    const table = useReactTable({
        data: properties,
        columns,
        state: { sorting, columnOrder },
        onSortingChange: setSorting,
        onColumnOrderChange: setColumnOrder,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        enableColumnResizing: true,
        columnResizeMode: 'onChange',
    });

    return (
        <div className="w-full h-full flex flex-col">
            <table className="w-full text-left border-collapse table-fixed">
                <thead className="sticky top-0 z-20 bg-default-50/90 backdrop-blur-md shadow-sm border-b border-divider">
                    {table.getHeaderGroups().map(headerGroup => (
                        <tr key={headerGroup.id}>
                            {headerGroup.headers.map(header => (
                                <th 
                                    key={header.id} 
                                    className="relative p-2 py-3 text-xs font-bold text-default-600 uppercase tracking-wider select-none group border-r border-divider/10 hover:bg-default-100 transition-colors"
                                    style={{ width: header.getSize() }}
                                    draggable={!header.isPlaceholder}
                                    onDragStart={(e) => {
                                        setDraggingColumn(header.column.id);
                                        e.dataTransfer.effectAllowed = 'move';
                                    }}
                                    onDragOver={(e) => e.preventDefault()}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        if (draggingColumn && draggingColumn !== header.column.id) {
                                            const newOrder = [...columnOrder];
                                            const dragIndex = newOrder.indexOf(draggingColumn);
                                            const dropIndex = newOrder.indexOf(header.column.id);
                                            if (dragIndex !== -1 && dropIndex !== -1) {
                                                newOrder.splice(dragIndex, 1);
                                                newOrder.splice(dropIndex, 0, draggingColumn);
                                                setColumnOrder(newOrder);
                                            }
                                            setDraggingColumn(null);
                                        }
                                    }}
                                >
                                    <div className="flex items-center gap-1 w-full">
                                        <GripVertical 
                                            size={12} 
                                            // Stop propagation on drag handle to prevent wrapper MD event 
                                            onMouseDown={(e) => e.stopPropagation()}
                                            className="text-default-300 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity" 
                                        />
                                        
                                        <div 
                                            className="flex items-center gap-1 cursor-pointer flex-1 overflow-hidden"
                                            // Stop propagation on sorting click area to prevent wrapper MD event
                                            onMouseDown={(e) => e.stopPropagation()}
                                            onClick={(e) => {
                                                 header.column.getToggleSortingHandler()?.(e);
                                                 onFocus?.(); // Manually trigger bring-to-front on sort click
                                            }}
                                        >
                                            <span className="truncate">{flexRender(header.column.columnDef.header, header.getContext())}</span>
                                            {{
                                                asc: <ChevronUp size={12} className="text-primary shrink-0" />,
                                                desc: <ChevronDown size={12} className="text-primary shrink-0" />,
                                            }[header.column.getIsSorted() as string] ?? null}
                                        </div>
                                    </div>
                                    
                                    {/* Resizer Handle */}
                                    <div
                                        // Stop propagation on resizer to prevent wrapper MD event interfering with drag
                                        onMouseDown={(e) => {
                                            e.stopPropagation();
                                            header.getResizeHandler()(e);
                                        }}
                                        onTouchStart={(e) => {
                                            e.stopPropagation();
                                            header.getResizeHandler()(e);
                                        }}
                                        className={`absolute right-0 top-0 h-full w-1 cursor-col-resize touch-none select-none hover:bg-primary/50 ${
                                            header.column.getIsResizing() ? 'bg-primary w-1.5' : 'bg-transparent'
                                        }`}
                                    />
                                </th>
                            ))}
                        </tr>
                    ))}
                </thead>
                <tbody>
                    {table.getRowModel().rows.map((row, idx) => (
                        <tr 
                            key={row.id} 
                            className={`
                                border-b border-divider/40 last:border-0 transition-colors
                                hover:bg-primary/5
                                ${idx % 2 === 0 ? 'bg-transparent' : 'bg-default-50/30'}
                            `}
                        >
                            {row.getVisibleCells().map(cell => (
                                <td key={cell.id} className="p-2 text-xs h-10 border-r border-divider/20 last:border-r-0 align-middle overflow-hidden text-ellipsis">
                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
            {properties.length === 0 && <div className="p-8 text-center text-sm text-default-400">No properties found for this entity.</div>}
        </div>
    );
};