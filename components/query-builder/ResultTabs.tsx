import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Button, Chip, Tabs, Tab, Checkbox } from "@nextui-org/react";
import { 
    Table as TableIcon, Trash, Save, Braces, Download, Copy, FileCode, 
    ChevronUp, ChevronDown, GripVertical, ChevronRight, Layers, LayoutList
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
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { xml } from '@codemirror/lang-xml';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';
import { githubLight } from '@uiw/codemirror-theme-github';
import { ContentRenderer } from './ContentRenderer';

interface ResultTabsProps {
    queryResult: any[];
    rawJsonResult: string;
    rawXmlResult: string;
    loading: boolean;
    isDark: boolean;
    onDelete: () => void;
    onExport: () => void;
    downloadFile: (content: string, filename: string, type: 'json' | 'xml') => void;
}

// ----------------------------------------------------------------------
// Helper: Check if value is a nested OData entity (Array or Object)
// ----------------------------------------------------------------------
const isExpandableData = (value: any): boolean => {
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

// ----------------------------------------------------------------------
// Component: RecursiveDataTable
// Reusable Table component that supports self-nesting
// ----------------------------------------------------------------------

interface RecursiveDataTableProps {
    data: any[];
    isDark: boolean;
    isRoot?: boolean; // If true, shows global actions like Delete/Export
    onDelete?: () => void;
    onExport?: () => void;
    loading?: boolean;
    parentSelected?: boolean; // 新增：接收父级选中状态
}

const RecursiveDataTable: React.FC<RecursiveDataTableProps> = ({ 
    data, 
    isDark, 
    isRoot = false, 
    onDelete, 
    onExport,
    loading = false,
    parentSelected = false 
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

    // --- Smart Column Width Algorithm ---
    const columnHelper = createColumnHelper<any>();
    
    const columns = useMemo(() => {
        if (!data || data.length === 0) return [];
        
        // 1. 定义固定列
        // Expander(32px) + Checkbox(40px) + Index(50px) = 122px
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
                        isIndeterminate={table.getIsSomeRowsSelected()}
                        isSelected={table.getIsAllRowsSelected()}
                        onValueChange={(val) => table.toggleAllRowsSelected(!!val)}
                        aria-label="Select all"
                        classNames={{ wrapper: "m-0" }}
                    />
                </div>
            ),
            cell: ({ row }) => (
                <div className="flex items-center justify-center w-full">
                    <Checkbox
                        size="sm"
                        isSelected={row.getIsSelected()}
                        onValueChange={(val) => row.toggleSelected(!!val)}
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

        // Index Column
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

        // 2. 处理数据列
        const rawKeys = Object.keys(data[0]).filter(key => key !== '__metadata');
        if (rawKeys.length === 0) return [expanderColumn, selectColumn, indexColumn];

        // 采样前 20 行计算内容宽度
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
                    for (let i = 0; i < str.length; i++) {
                        len += (str.charCodeAt(i) > 255) ? 1.6 : 1;
                    }
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

        // 3. 决定铺满逻辑
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

            return columnHelper.accessor(key, { 
                id: key,
                header: key, 
                cell: info => (
                    <ContentRenderer 
                        value={info.getValue()} 
                        columnName={key} 
                        // IMPORTANT: Pass expand handler. 
                        // If cell content is an array/object chip, clicking it will expand the row.
                        onExpand={
                            isExpandableData(info.getValue()) 
                            ? info.row.getToggleExpandedHandler() 
                            : undefined
                        }
                    />
                ),
                size: finalWidth,
                minSize: 60,
                maxSize: 5000,
            });
        });

        return [expanderColumn, selectColumn, indexColumn, ...dataColumns];
    }, [data, containerWidth]);

    // 初始化列顺序
    useEffect(() => {
        if (columns.length > 0) {
            setColumnOrder(columns.map(c => c.id as string));
        }
    }, [columns.length]); 

    const table = useReactTable({
        data,
        columns,
        state: {
            sorting,
            columnOrder,
            rowSelection,
            expanded,
        },
        enableRowSelection: true, 
        enableExpanding: true,
        // 自定义展开逻辑：只有包含对象或数组的行才可展开
        getRowCanExpand: row => {
            const keys = Object.keys(row.original);
            return keys.some(k => k !== '__metadata' && isExpandableData(row.original[k]));
        },
        onExpandedChange: setExpanded,
        onRowSelectionChange: setRowSelection,
        onSortingChange: setSorting,
        onColumnOrderChange: setColumnOrder,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getExpandedRowModel: getExpandedRowModel(), // Required for expansion
        enableColumnResizing: true,
        columnResizeMode: 'onChange',
    });

    // --- 级联勾选逻辑 (Cascading Selection) ---
    // 监听 parentSelected 变化，同步当前表的所有行状态
    useEffect(() => {
        // 如果 parentSelected 明确为 true，全选
        if (parentSelected) {
            table.toggleAllRowsSelected(true);
        } 
        // 如果 parentSelected 明确为 false，全不选
        else if (parentSelected === false) {
            table.toggleAllRowsSelected(false);
        }
        // 注意：这里并不处理 "parentSelected 为 undefined" 的情况，保持默认状态
    }, [parentSelected]);

    return (
        <div className="h-full flex flex-col bg-content1 overflow-hidden">
            {isRoot && (
                <div className="bg-default-50 p-2 flex gap-2 border-b border-divider items-center justify-end shrink-0">
                    <div className="flex gap-2">
                        {onDelete && <Button size="sm" color="danger" variant="light" onPress={onDelete} startContent={<Trash size={14} />}>删除 (Delete)</Button>}
                        {onExport && <Button size="sm" color="primary" variant="light" startContent={<Save size={14} />}>导出 (Export)</Button>}
                    </div>
                </div>
            )}

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
                                            // Disable dragging fixed columns or dropping onto them
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
                                            {/* Drag Handle */}
                                            {!['expander', 'select', 'index'].includes(header.id) && (
                                                <GripVertical 
                                                    size={12} 
                                                    className="text-default-300 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity shrink-0 absolute left-1" 
                                                />
                                            )}
                                            
                                            {/* Header Content */}
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

                                        {/* Resizer */}
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
                                {/* EXPANDED ROW DETAIL */}
                                {row.getIsExpanded() && (
                                    <tr className="bg-default-50/50">
                                        <td colSpan={row.getVisibleCells().length} className="p-0 border-b border-divider">
                                            {/* Reuse the Recursive structure, passing current row selection status down */}
                                            <ExpandedRowView 
                                                rowData={row.original} 
                                                isDark={isDark} 
                                                parentSelected={row.getIsSelected()} 
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

// ----------------------------------------------------------------------
// ExpandedRowView Component (Master-Detail Content)
// ----------------------------------------------------------------------
const ExpandedRowView = ({ rowData, isDark, parentSelected }: { rowData: any, isDark: boolean, parentSelected: boolean }) => {
    // 找出所有嵌套的属性（Expands）
    const expandProps = useMemo(() => {
        const props: { key: string, data: any[], type: 'array' | 'object' }[] = [];
        Object.entries(rowData).forEach(([key, val]: [string, any]) => {
            if (key !== '__metadata' && isExpandableData(val)) {
                let normalizedData: any[] = [];
                let type: 'array' | 'object' = 'object';

                if (Array.isArray(val)) {
                    normalizedData = val;
                    type = 'array';
                } else if (val && Array.isArray(val.results)) {
                    normalizedData = val.results;
                    type = 'array';
                } else {
                    normalizedData = [val]; // Single object as 1-row array
                    type = 'object';
                }
                
                props.push({ key, data: normalizedData, type });
            }
        });
        return props;
    }, [rowData]);

    if (expandProps.length === 0) return <div className="p-4 text-default-400 italic text-xs">No expanded details available.</div>;

    return (
        <div className="p-4 bg-default-50/50 inner-shadow-sm">
            <div className="flex items-center gap-2 mb-2 text-xs font-bold text-default-500 uppercase tracking-wider">
                <Layers size={14} /> 关联详情 (Associated Details)
            </div>
            <div className="bg-background rounded-xl border border-divider overflow-hidden flex flex-col min-h-[200px]">
                <Tabs 
                    aria-label="Expanded Data" 
                    variant="underlined"
                    color="secondary"
                    classNames={{
                        tabList: "px-4 border-b border-divider bg-default-50",
                        cursor: "w-full bg-secondary",
                        tab: "h-10 text-xs",
                        panel: "p-0 flex-1 flex flex-col" // Important: p-0 to let table fill the panel
                    }}
                >
                    {expandProps.map(prop => (
                        <Tab 
                            key={prop.key} 
                            title={
                                <div className="flex items-center gap-2">
                                    {prop.type === 'array' ? <LayoutList size={14} /> : <Braces size={14} />}
                                    <span>{prop.key}</span>
                                    <Chip size="sm" variant="flat" className="h-4 text-[9px] px-1">{prop.data.length}</Chip>
                                </div>
                            }
                        >
                            {/* Recursively use RecursiveDataTable for nested data, passing parent selection state */}
                            <RecursiveDataTable 
                                data={prop.data} 
                                isDark={isDark} 
                                isRoot={false} // Sub-tables don't show global delete/export
                                parentSelected={parentSelected}
                            />
                        </Tab>
                    ))}
                </Tabs>
            </div>
        </div>
    );
};


export const ResultTabs: React.FC<ResultTabsProps> = ({
    queryResult, rawJsonResult, rawXmlResult, loading, isDark,
    onDelete, onExport, downloadFile
}) => {
    const editorTheme = isDark ? vscodeDark : githubLight;
    
    // --- Render ---

    return (
        <div className="flex-1 min-h-0 bg-content1 rounded-xl border border-divider overflow-hidden flex flex-col shadow-sm">
            <Tabs
                aria-label="Result Options"
                color="primary"
                variant="underlined"
                classNames={{
                    tabList: "gap-6 w-full relative rounded-none p-0 border-b border-divider px-4 bg-default-100",
                    cursor: "w-full bg-primary",
                    tab: "max-w-fit px-2 h-10 text-sm",
                    tabContent: "group-data-[selected=true]:font-bold",
                    panel: "flex-1 p-0 overflow-hidden h-full flex flex-col"
                }}
            >
                {/* Tab 1: 表格预览 */}
                <Tab
                    key="table"
                    title={
                        <div className="flex items-center space-x-2">
                            <TableIcon size={14} />
                            <span>表格预览</span>
                            <Chip size="sm" variant="flat" className="h-4 text-[10px] px-1 ml-1">{queryResult.length}</Chip>
                        </div>
                    }
                >
                    <RecursiveDataTable 
                        data={queryResult} 
                        isDark={isDark}
                        isRoot={true}
                        onDelete={onDelete}
                        onExport={onExport}
                        loading={loading}
                    />
                </Tab>

                {/* Tab 2: JSON 预览 (CodeMirror) */}
                <Tab
                    key="json"
                    title={
                        <div className="flex items-center space-x-2">
                            <Braces size={14} />
                            <span>JSON 预览</span>
                        </div>
                    }
                >
                    <div className="h-full flex flex-col">
                        <div className="p-2 border-b border-divider flex justify-between items-center shrink-0 bg-content2">
                            <span className="text-xs font-bold px-2 text-warning-500">JSON 响应结果</span>
                            <div className="flex gap-1">
                                <Button isIconOnly size="sm" variant="light" onPress={() => downloadFile(rawJsonResult, 'result.json', 'json')} title="导出 JSON">
                                    <Download size={14} />
                                </Button>
                                <Button isIconOnly size="sm" variant="light" onPress={() => navigator.clipboard.writeText(rawJsonResult)} title="复制 JSON">
                                    <Copy size={14} />
                                </Button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-hidden relative text-sm">
                            <CodeMirror
                                value={rawJsonResult || '// 请先运行查询以获取结果'}
                                height="100%"
                                className="h-full [&_.cm-scroller]:overflow-scroll"
                                extensions={[json()]}
                                theme={editorTheme}
                                readOnly={true}
                                editable={false}
                                basicSetup={{
                                    lineNumbers: true,
                                    foldGutter: true,
                                    highlightActiveLine: false
                                }}
                            />
                        </div>
                    </div>
                </Tab>

                {/* Tab 3: XML 预览 (CodeMirror) */}
                <Tab
                    key="xml"
                    title={
                        <div className="flex items-center space-x-2">
                            <FileCode size={14} />
                            <span>XML 预览</span>
                        </div>
                    }
                >
                    <div className="h-full flex flex-col">
                        <div className="p-2 border-b border-divider flex justify-between items-center shrink-0 bg-content2">
                            <span className="text-xs font-bold px-2 text-primary-500">XML / Atom 响应结果</span>
                            <div className="flex gap-1">
                                <Button isIconOnly size="sm" variant="light" onPress={() => downloadFile(rawXmlResult, 'result.xml', 'xml')} title="导出 XML">
                                    <Download size={14} />
                                </Button>
                                <Button isIconOnly size="sm" variant="light" onPress={() => navigator.clipboard.writeText(rawXmlResult)} title="复制 XML">
                                    <Copy size={14} />
                                </Button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-hidden relative text-sm">
                            <CodeMirror
                                value={rawXmlResult || '// 请先运行查询以获取结果'}
                                height="100%"
                                className="h-full [&_.cm-scroller]:overflow-scroll"
                                extensions={[xml()]}
                                theme={editorTheme}
                                readOnly={true}
                                editable={false}
                                basicSetup={{
                                    lineNumbers: true,
                                    foldGutter: true,
                                    highlightActiveLine: false
                                }}
                            />
                        </div>
                    </div>
                </Tab>
            </Tabs>
        </div>
    );
};