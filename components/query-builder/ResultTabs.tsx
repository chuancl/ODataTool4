import React, { useMemo } from 'react';
import { Button, Chip, Tabs, Tab } from "@nextui-org/react";
import { Table as TableIcon, Trash, Save, Braces, Download, Copy, FileCode } from 'lucide-react';
import { useReactTable, getCoreRowModel, flexRender, createColumnHelper } from '@tanstack/react-table';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { xml } from '@codemirror/lang-xml';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';
import { githubLight } from '@uiw/codemirror-theme-github';

interface ResultTabsProps {
    queryResult: any[];
    rawJsonResult: string;
    rawXmlResult: string;
    loading: boolean;
    isDark: boolean;
    onDelete: () => void;
    onExport: () => void; // Not fully implemented in parent yet, but keeping interface ready
    downloadFile: (content: string, filename: string, type: 'json' | 'xml') => void;
}

export const ResultTabs: React.FC<ResultTabsProps> = ({
    queryResult, rawJsonResult, rawXmlResult, loading, isDark,
    onDelete, onExport, downloadFile
}) => {
    const editorTheme = isDark ? vscodeDark : githubLight;

    // --- Table Setup ---
    const columnHelper = createColumnHelper<any>();
    const columns = useMemo(() => {
        if (queryResult.length === 0) return [];
        return Object.keys(queryResult[0])
            .filter(key => typeof queryResult[0][key] !== 'object' && key !== '__metadata')
            .map(key =>
                columnHelper.accessor(key, { header: key, cell: info => String(info.getValue()) })
            );
    }, [queryResult]);

    const table = useReactTable({
        data: queryResult,
        columns,
        getCoreRowModel: getCoreRowModel(),
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

                        <div className="overflow-auto flex-1 w-full">
                            <table className="w-full text-left border-collapse">
                                <thead className="sticky top-0 z-10">
                                    {table.getHeaderGroups().map(headerGroup => (
                                        <tr key={headerGroup.id}>
                                            {headerGroup.headers.map(header => (
                                                <th key={header.id} className="border-b border-divider p-3 text-xs font-semibold bg-content2 whitespace-nowrap text-default-600">
                                                    {flexRender(header.column.columnDef.header, header.getContext())}
                                                </th>
                                            ))}
                                        </tr>
                                    ))}
                                </thead>
                                <tbody>
                                    {table.getRowModel().rows.map(row => (
                                        <tr key={row.id} className="hover:bg-content2/50 transition-colors border-b border-divider/50 last:border-0">
                                            {row.getVisibleCells().map(cell => (
                                                <td key={cell.id} className="p-3 text-sm whitespace-nowrap text-default-700">
                                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
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
