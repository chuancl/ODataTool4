import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Button, Chip, Tabs, Tab, Checkbox } from "@nextui-org/react";
import { 
    Table as TableIcon, Trash, Save, Braces, Download, Copy, FileCode, 
    ChevronUp, ChevronDown, GripVertical 
} from 'lucide-react';
import { 
    useReactTable, 
    getCoreRowModel, 
    getSortedRowModel,
    flexRender, 
    createColumnHelper,
    SortingState,
    ColumnOrderState,
    RowSelectionState
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

export const ResultTabs: React.FC<ResultTabsProps> = ({
    queryResult, rawJsonResult, rawXmlResult, loading, isDark,
    onDelete, onExport, downloadFile
}) => {
    const editorTheme = isDark ? vscodeDark : githubLight;
    const tableContainerRef = useRef<HTMLDivElement>(null);
    
    // 初始化宽度使用 Window 宽度做兜底
    const [containerWidth, setContainerWidth] = useState(() => {
        if (typeof window !== 'undefined') return Math.max(800, window.innerWidth - 64);
        return 1200;
    });

    // --- Table State ---
    const [sorting, setSorting] = useState<SortingState>([]);
    const [columnOrder, setColumnOrder] = useState<ColumnOrderState>([]);
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({}); // 行选中状态
    const [draggingColumn, setDraggingColumn] = useState<string | null>(null);

    // 监听容器宽度变化
    useEffect(() => {
        if (!tableContainerRef.current) return;
        
        const observer = new ResizeObserver(entries => {
            for (const entry of entries) {
                if (entry.contentRect.width > 0) {
                    setContainerWidth(entry.contentRect.width);
                }
            }
        });
        
        observer.observe(tableContainerRef.current);
        return () => observer.disconnect();
    }, []);

    // --- Smart Column Width Algorithm ---
    const columnHelper = createColumnHelper<any>();
    
    const columns = useMemo(() => {
        if (queryResult.length === 0) return [];
        
        // 1. 定义固定列 (勾选列 + 行号列)
        // 勾选列宽 40px, 行号列宽 50px (默认)
        const FIXED_COLUMNS_WIDTH = 40 + 50;

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
            enableResizing: false, // 禁止调整大小
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
            enableResizing: true, // 允许调整大小
            minSize: 40,
            maxSize: 100,
        });

        // 2. 处理数据列
        const rawKeys = Object.keys(queryResult[0]).filter(key => key !== '__metadata');
        if (rawKeys.length === 0) return [selectColumn, indexColumn];

        // 采样前 20 行计算内容宽度
        const sampleData = queryResult.slice(0, 20);
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
        // 可用宽度 = 容器宽度 - 边框缓冲 - 固定列的总宽度
        const availableWidthForData = containerWidth > 0 ? (containerWidth - 2 - FIXED_COLUMNS_WIDTH) : 0;
        
        // 如果数据列总基准宽度 < 可用于数据的宽度，则放大比例
        const shouldScale = availableWidthForData > 0 && totalBaseWidth < availableWidthForData;
        const scaleRatio = shouldScale ? (availableWidthForData / totalBaseWidth) : 1;

        let currentTotalWidth = 0;

        const dataColumns = rawKeys.map((key, index) => {
            let finalWidth = Math.floor(columnMeta[key] * scaleRatio);
            
            // 补齐像素
            if (shouldScale && index === rawKeys.length - 1) {
                const remaining = availableWidthForData - currentTotalWidth - finalWidth;
                if (remaining > 0 && remaining < 100) {
                    finalWidth += remaining;
                }
            }
            currentTotalWidth += finalWidth;

            return columnHelper.accessor(key, { 
                id: key,
                header: key, 
                cell: info => <ContentRenderer value={info.getValue()} columnName={key} />,
                size: finalWidth,
                minSize: 60,
                maxSize: 5000,
            });
        });

        // 将固定列和数据列合并
        return [selectColumn, indexColumn, ...dataColumns];
    }, [queryResult, containerWidth]);

    // 初始化列顺序
    useEffect(() => {
        if (columns.length > 0) {
            setColumnOrder(columns.map(c => c.id as string));
        }
    }, [columns.length]); 

    const table = useReactTable({
        data: queryResult,
        columns,
        state: {
            sorting,
            columnOrder,
            rowSelection,
        },
        enableRowSelection: true, // 启用行选择
        onRowSelectionChange: setRowSelection,
        onSortingChange: setSorting,
        onColumnOrderChange: setColumnOrder,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        enableColumnResizing: true,
        columnResizeMode: 'onChange',
    });

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
                            {Object.keys(rowSelection).length > 0 && (
                                <Chip size="sm" color="primary" variant="flat" className="h-4 text-[10px] px-1 ml-1">
                                    选中 {Object.keys(rowSelection).length}
                                </Chip>
                            )}
                        </div>
                    }
                >
                    <div className="h-full flex flex-col">
                        <div className="bg-default-50 p-2 flex gap-2 border-b border-divider items-center justify-end shrink-0">
                            <div className="flex gap-2">
                                <Button size="sm" color="danger" variant="light" onPress={onDelete} startContent={<Trash size={14} />}>删除 (Delete)</Button>
                                <Button size="sm" color="primary" variant="light" startContent={<Save size={14} />}>导出 (Export)</Button>
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
                                                    // --- 拖拽重排逻辑 (仅非固定列允许拖拽) ---
                                                    draggable={!header.isPlaceholder && header.id !== 'select' && header.id !== 'index'}
                                                    onDragStart={(e) => {
                                                        if (header.id === 'select' || header.id === 'index') return;
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
                                                        // 禁止将列拖拽到固定列之前，或拖拽固定列
                                                        if (draggingColumn && draggingColumn !== header.column.id && header.id !== 'select' && header.id !== 'index') {
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
                                                        {/* 拖拽手柄图标 (仅非固定列显示) */}
                                                        {header.id !== 'select' && header.id !== 'index' && (
                                                            <GripVertical 
                                                                size={12} 
                                                                className="text-default-300 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity shrink-0 absolute left-1" 
                                                            />
                                                        )}
                                                        
                                                        {/* 表头文本与排序点击区域 */}
                                                        {header.id === 'select' || header.id === 'index' ? (
                                                            // 固定列直接渲染内容
                                                            <div className="flex items-center justify-center w-full">
                                                                {flexRender(header.column.columnDef.header, header.getContext())}
                                                            </div>
                                                        ) : (
                                                            // 数据列支持点击排序
                                                            <div 
                                                                className="flex items-center gap-1 cursor-pointer flex-1 overflow-hidden pl-4" // pl-4 为左侧手柄留空
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

                                                    {/* --- 列宽调整手柄 (仅允许调整大小的列显示) --- */}
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
                                        <tr 
                                            key={row.id} 
                                            className={`
                                                border-b border-divider/40 last:border-0 transition-colors
                                                hover:bg-primary/5
                                                ${row.getIsSelected() ? 'bg-primary/10' : (idx % 2 === 0 ? 'bg-transparent' : 'bg-default-50/30')}
                                            `}
                                        >
                                            {row.getVisibleCells().map(cell => (
                                                <td 
                                                    key={cell.id} 
                                                    className="p-2 text-sm text-default-700 align-middle overflow-hidden border-r border-divider/10 last:border-0"
                                                    style={{ width: cell.column.getSize() }}
                                                >
                                                    {/* 内容渲染容器 */}
                                                    <div className="w-full">
                                                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                                    </div>
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            
                            {queryResult.length === 0 && !loading && (
                                <div className="flex flex-col items-center justify-center h-40 text-default-400">
                                    <p>暂无数据</p>
                                </div>
                            )}
                        </div>
                    </div>
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