import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Button, Chip, Tabs, Tab } from "@nextui-org/react";
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
    ColumnOrderState
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
    const [containerWidth, setContainerWidth] = useState(0);

    // --- Table State ---
    const [sorting, setSorting] = useState<SortingState>([]);
    const [columnOrder, setColumnOrder] = useState<ColumnOrderState>([]);
    const [draggingColumn, setDraggingColumn] = useState<string | null>(null);

    // 监听容器宽度变化，用于动态计算列宽
    useEffect(() => {
        if (!tableContainerRef.current) return;
        
        const observer = new ResizeObserver(entries => {
            for (const entry of entries) {
                setContainerWidth(entry.contentRect.width);
            }
        });
        
        observer.observe(tableContainerRef.current);
        return () => observer.disconnect();
    }, []);

    // --- Smart Column Width Algorithm ---
    const columnHelper = createColumnHelper<any>();
    
    // 动态生成列定义，包含智能宽度计算
    const columns = useMemo(() => {
        if (queryResult.length === 0) return [];
        
        const rawKeys = Object.keys(queryResult[0]).filter(key => typeof queryResult[0][key] !== 'object' && key !== '__metadata');
        if (rawKeys.length === 0) return [];

        // 1. 计算每一列的“内容基准宽度”
        // 采样前 20 行数据
        const sampleData = queryResult.slice(0, 20);
        const columnBaseWidths: Record<string, number> = {};
        
        rawKeys.forEach(key => {
            // 表头长度
            let maxCharLength = key.length; 
            
            // 采样数据长度
            sampleData.forEach(row => {
                const val = row[key];
                if (val !== null && val !== undefined) {
                    const str = String(val);
                    // 简单的视觉长度估算：中文当2个字符
                    const len = str.length + (str.match(/[^\x00-\xff]/g) || []).length; 
                    if (len > maxCharLength) maxCharLength = len;
                }
            });

            // 估算像素宽度: 
            // 基础Padding(24) + 字符数 * 字符平均宽度(约8px)
            // 限制：最小 80px, 最大 400px (防止某一列内容过长撑爆屏幕)
            const estimatedWidth = Math.min(Math.max(maxCharLength * 8 + 24, 80), 400);
            columnBaseWidths[key] = estimatedWidth;
        });

        // 2. 计算总基准宽度
        const totalBaseWidth = rawKeys.reduce((sum, key) => sum + columnBaseWidths[key], 0);

        // 3. 决定是否铺满屏幕
        // 如果容器有宽度，且总基准宽度小于容器宽度，则按比例放大各列以铺满屏幕
        let scaleFactor = 1;
        if (containerWidth > 0 && totalBaseWidth < containerWidth) {
             // 减去一些滚动条预留空间 (20px)
             scaleFactor = (containerWidth - 20) / totalBaseWidth;
        }

        // 4. 生成最终列定义
        return rawKeys.map(key => {
            // 计算最终宽度
            let finalWidth = Math.floor(columnBaseWidths[key] * scaleFactor);
            // 即使是放大，也稍微限制一下最大值（比如不建议超过 800px），除非只有一两列
            if (rawKeys.length > 2 && finalWidth > 600) finalWidth = 600;

            return columnHelper.accessor(key, { 
                id: key,
                header: key, 
                // 使用 ContentRenderer 渲染单元格内容
                cell: info => <ContentRenderer value={info.getValue()} columnName={key} />,
                // 设置计算出的宽度
                size: finalWidth,
                // 允许调整的最小宽度
                minSize: 60,
                maxSize: 1000,
            });
        });
    }, [queryResult, containerWidth]); // 依赖 containerWidth 以便在窗口 resize 时重新计算填充

    // 当列定义变化时（例如新查询返回了不同结构），初始化列顺序
    useEffect(() => {
        if (columns.length > 0) {
            setColumnOrder(columns.map(c => c.id as string));
        }
    }, [columns.length]); // 仅当列数量变化时重置顺序，避免 resize 导致重置

    const table = useReactTable({
        data: queryResult,
        columns,
        state: {
            sorting,
            columnOrder,
        },
        onSortingChange: setSorting,
        onColumnOrderChange: setColumnOrder,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(), // 启用客户端排序
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
                            {/* 使用 table-fixed 配合列宽调整 */}
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
                                                    // --- 拖拽重排逻辑 ---
                                                    draggable={!header.isPlaceholder}
                                                    onDragStart={(e) => {
                                                        setDraggingColumn(header.column.id);
                                                        e.dataTransfer.effectAllowed = 'move';
                                                        // 设置拖拽时的透明度
                                                        e.currentTarget.style.opacity = '0.5';
                                                    }}
                                                    onDragEnd={(e) => {
                                                        e.currentTarget.style.opacity = '1';
                                                        setDraggingColumn(null);
                                                    }}
                                                    onDragOver={(e) => e.preventDefault()}
                                                    onDrop={(e) => {
                                                        e.preventDefault();
                                                        if (draggingColumn && draggingColumn !== header.column.id) {
                                                            const newOrder = [...columnOrder];
                                                            const dragIndex = newOrder.indexOf(draggingColumn);
                                                            const dropIndex = newOrder.indexOf(header.column.id);
                                                            if (dragIndex !== -1 && dropIndex !== -1) {
                                                                // 移动数组元素
                                                                newOrder.splice(dragIndex, 1);
                                                                newOrder.splice(dropIndex, 0, draggingColumn);
                                                                setColumnOrder(newOrder);
                                                            }
                                                        }
                                                    }}
                                                >
                                                    <div className="flex items-center gap-1 w-full overflow-hidden">
                                                        {/* 拖拽手柄图标 */}
                                                        <GripVertical 
                                                            size={12} 
                                                            className="text-default-300 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity shrink-0" 
                                                        />
                                                        
                                                        {/* 表头文本与排序点击区域 */}
                                                        <div 
                                                            className="flex items-center gap-1 cursor-pointer flex-1 overflow-hidden"
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
                                                    </div>

                                                    {/* --- 列宽调整手柄 --- */}
                                                    <div
                                                        onMouseDown={header.getResizeHandler()}
                                                        onTouchStart={header.getResizeHandler()}
                                                        className={`absolute right-0 top-0 h-full w-1 cursor-col-resize touch-none select-none hover:bg-primary/50 transition-colors z-10 ${
                                                            header.column.getIsResizing() ? 'bg-primary w-1' : 'bg-transparent'
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
                                                <td 
                                                    key={cell.id} 
                                                    className="p-2 text-sm text-default-700 align-middle overflow-hidden border-r border-divider/10 last:border-0"
                                                    style={{ width: cell.column.getSize() }}
                                                >
                                                    {/* 内容渲染容器：确保 flex 布局以支持 full width，但交给 ContentRenderer 内部处理文本溢出 */}
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