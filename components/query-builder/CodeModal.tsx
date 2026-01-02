import React, { useState, useEffect, useMemo } from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button } from "@nextui-org/react";
import { FileCode, Trash2, Copy, Globe, Terminal, Coffee } from 'lucide-react';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { javascript } from '@codemirror/lang-javascript';
import { java } from '@codemirror/lang-java';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';

interface CodeModalProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    // code can be a string (single view) or an object (multi-tab)
    code: string | { url: string, sapui5: string, csharp: string, java: string };
    action: 'delete' | 'update' | 'create';
    onExecute: () => void;
}

export const CodeModal: React.FC<CodeModalProps> = ({ isOpen, onOpenChange, code, action, onExecute }) => {
    const [selectedTab, setSelectedTab] = useState<string>('url');

    // 每次打开时重置 Tab 到默认值
    useEffect(() => {
        if (isOpen) {
            setSelectedTab('url');
        }
    }, [isOpen]);

    const isSingleMode = typeof code === 'string';

    const currentCodeText = useMemo(() => {
        if (isSingleMode) return (code as string) || '';
        const codeObj = code as { [key: string]: string };
        return codeObj[selectedTab] || '';
    }, [code, isSingleMode, selectedTab]);

    // 根据 Tab 类型动态选择高亮模式
    const extensions = useMemo(() => {
        if (isSingleMode) {
            // 如果是单模式，通常是 MockDataGenerator 里的 SAPUI5 创建代码
            return [javascript({ jsx: false, typescript: false })];
        }
        
        switch (selectedTab) {
            case 'sapui5':
                return [javascript({ jsx: false, typescript: false })];
            case 'csharp':
                // C# 语法与 Java 高度相似，CodeMirror 的 java 包能提供很好的高亮支持
                return [java()];
            case 'java':
                return [java()];
            case 'url':
            default:
                // URL 列表通常不是合法的 JSON，使用 json() 会导致报错变红，这里不使用特定 extension
                return []; 
        }
    }, [selectedTab, isSingleMode]);

    const handleCopy = () => {
        navigator.clipboard.writeText(currentCodeText);
    };

    // Manual Tab Definition (Safe & Simple)
    const tabOptions = [
        { key: 'url', label: 'URL List', icon: Globe },
        { key: 'sapui5', label: 'SAPUI5', icon: FileCode },
        { key: 'csharp', label: 'C# (HttpClient)', icon: Terminal },
        { key: 'java', label: 'Java (Olingo)', icon: Coffee },
    ];

    return (
        <Modal 
            isOpen={isOpen} 
            onOpenChange={onOpenChange} 
            size="4xl" 
            scrollBehavior="inside"
            isDismissable={false}
        >
            <ModalContent>
                {(onClose) => (
                    <>
                        <ModalHeader className="flex gap-2 items-center border-b border-divider">
                            <FileCode className="text-primary" />
                            {action === 'delete' ? '确认删除 (Confirm Delete)' : `代码预览 (${action})`}
                        </ModalHeader>
                        <ModalBody className="p-0 bg-[#1e1e1e] flex flex-col min-h-[400px]">
                            {action === 'delete' && (
                                <div className="p-4 pb-0 text-sm text-warning-500 font-bold bg-background shrink-0">
                                    警告: 您即将执行 DELETE 操作。以下是生成的代码供参考。
                                    <br/>
                                    Warning: You are about to DELETE data. Review the code snippets below.
                                </div>
                            )}

                            {isSingleMode ? (
                                <div className="p-4 h-full flex-1">
                                     <CodeMirror
                                        value={currentCodeText}
                                        height="100%"
                                        className="h-full"
                                        extensions={extensions}
                                        theme={vscodeDark}
                                        readOnly={true}
                                        editable={false}
                                    />
                                </div>
                            ) : (
                                <div className="flex flex-col h-[500px]">
                                    {/* Custom Tabs Header - Replaces NextUI Tabs to prevent unmounting bugs */}
                                    <div className="bg-[#252526] border-b border-white/10 px-4 shrink-0 flex gap-6 select-none">
                                        {tabOptions.map((item) => (
                                            <button
                                                key={item.key}
                                                onClick={() => setSelectedTab(item.key)}
                                                type="button"
                                                className={`
                                                    group flex items-center gap-2 h-10 text-sm border-b-2 transition-all outline-none cursor-pointer bg-transparent p-0 px-1
                                                    ${selectedTab === item.key 
                                                        ? 'border-primary text-white font-medium' 
                                                        : 'border-transparent text-gray-400 hover:text-gray-300'
                                                    }
                                                `}
                                            >
                                                <item.icon size={14} className={selectedTab === item.key ? "text-primary" : "group-hover:text-gray-300"} />
                                                <span>{item.label}</span>
                                            </button>
                                        ))}
                                    </div>

                                    <div className="flex-1 overflow-hidden relative">
                                        <CodeMirror
                                            key={selectedTab} // Force remount on tab switch
                                            value={currentCodeText}
                                            height="100%"
                                            className="h-full absolute inset-0"
                                            extensions={extensions}
                                            theme={vscodeDark}
                                            readOnly={true}
                                            editable={false}
                                        />
                                    </div>
                                </div>
                            )}
                        </ModalBody>
                        <ModalFooter className="border-t border-divider bg-background">
                            <div className="flex-1">
                                {action === 'delete' && (
                                     <span className="text-xs text-default-400">点击 "Copy" 复制当前标签页代码。点击 "Execute" 在此工具中运行删除。</span>
                                )}
                            </div>
                            <Button color="default" variant="light" onPress={onClose}>取消 (Cancel)</Button>
                            
                            <Button color="secondary" variant="flat" onPress={handleCopy} startContent={<Copy size={16}/>}>
                                复制 (Copy Code)
                            </Button>

                            {action === 'delete' && (
                                <Button color="danger" onPress={() => { onExecute(); onClose(); }} startContent={<Trash2 size={16}/>}>
                                    确认执行删除 (Execute Delete)
                                </Button>
                            )}
                        </ModalFooter>
                    </>
                )}
            </ModalContent>
        </Modal>
    );
};