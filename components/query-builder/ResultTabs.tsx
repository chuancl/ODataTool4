import React from 'react';
import { Button, Chip, Tabs, Tab } from "@nextui-org/react";
import { 
    Table as TableIcon, Braces, Download, Copy, FileCode
} from 'lucide-react';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { xml } from '@codemirror/lang-xml';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';
import { githubLight } from '@uiw/codemirror-theme-github';
import { RecursiveDataTable } from './table/RecursiveDataTable';
import { ParsedSchema } from '@/utils/odata-helper';

interface ResultTabsProps {
    queryResult: any[];
    rawJsonResult: string;
    rawXmlResult: string;
    loading: boolean;
    isDark: boolean;
    onDelete: () => void;
    onExport: () => void;
    downloadFile: (content: string, filename: string, type: 'json' | 'xml') => void;
    entityName?: string; 
    schema: ParsedSchema | null; // 新增
}

export const ResultTabs: React.FC<ResultTabsProps> = ({
    queryResult, rawJsonResult, rawXmlResult, loading, isDark,
    onDelete, onExport, downloadFile, entityName, schema
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
                        entityName={entityName}
                        schema={schema} // 传递 schema
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