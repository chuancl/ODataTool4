import React, { useState, useEffect } from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Tabs, Tab } from "@nextui-org/react";
import { FileCode, Trash2, Copy, Globe, Terminal, Coffee } from 'lucide-react';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';

interface CodeModalProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    // Update: code can be a string (single view) or an object (multi-tab)
    code: string | { url: string, sapui5: string, csharp: string, java: string };
    action: 'delete' | 'update' | 'create';
    onExecute: () => void; // For 'delete', this executes. For others, it handles copy? No, we handle copy internally now.
}

export const CodeModal: React.FC<CodeModalProps> = ({ isOpen, onOpenChange, code, action, onExecute }) => {
    const [selectedTab, setSelectedTab] = useState<string>('url');

    // 如果 code 是字符串，说明是单视图模式（如 Update/Create/MockData）
    const isSingleMode = typeof code === 'string';

    // 获取当前显示的文本内容，用于复制
    const currentCodeText = isSingleMode 
        ? (code as string)
        : (code as any)[selectedTab] || '';

    const handleCopy = () => {
        navigator.clipboard.writeText(currentCodeText);
        // 可以加一个 toast 提示，但这里简单处理
    };

    return (
        <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="4xl" scrollBehavior="inside">
            <ModalContent>
                {(onClose) => (
                    <>
                        <ModalHeader className="flex gap-2 items-center border-b border-divider">
                            <FileCode className="text-primary" />
                            {action === 'delete' ? '确认删除 (Confirm Delete)' : `代码预览 (${action})`}
                        </ModalHeader>
                        <ModalBody className="p-0 bg-[#1e1e1e]">
                            {action === 'delete' && (
                                <div className="p-4 pb-0 text-sm text-warning-500 font-bold bg-background">
                                    警告: 您即将执行 DELETE 操作。以下是生成的代码供参考。
                                    <br/>
                                    Warning: You are about to DELETE data. Review the code snippets below.
                                </div>
                            )}

                            {isSingleMode ? (
                                <div className="p-4">
                                     <CodeMirror
                                        value={code as string}
                                        height="400px"
                                        extensions={[json()]}
                                        theme={vscodeDark}
                                        readOnly={true}
                                        editable={false}
                                    />
                                </div>
                            ) : (
                                <div className="flex flex-col h-[500px]">
                                    <Tabs 
                                        aria-label="Code Options" 
                                        color="primary" 
                                        variant="underlined"
                                        selectedKey={selectedTab}
                                        onSelectionChange={(key) => setSelectedTab(key as string)}
                                        classNames={{
                                            tabList: "gap-6 w-full relative rounded-none p-0 border-b border-white/10 px-4 bg-[#252526]",
                                            cursor: "w-full bg-primary",
                                            tab: "max-w-fit px-2 h-10 text-sm text-gray-400 data-[selected=true]:text-white",
                                            panel: "flex-1 p-0 overflow-hidden h-full flex flex-col bg-[#1e1e1e]"
                                        }}
                                    >
                                        <Tab 
                                            key="url" 
                                            title={
                                                <div className="flex items-center space-x-2">
                                                    <Globe size={14} />
                                                    <span>URL List</span>
                                                </div>
                                            }
                                        >
                                            <CodeMirror
                                                value={(code as any).url}
                                                height="100%"
                                                extensions={[json()]}
                                                theme={vscodeDark}
                                                readOnly={true}
                                                editable={false}
                                                className="h-full"
                                            />
                                        </Tab>
                                        <Tab 
                                            key="sapui5" 
                                            title={
                                                <div className="flex items-center space-x-2">
                                                    <FileCode size={14} />
                                                    <span>SAPUI5</span>
                                                </div>
                                            }
                                        >
                                            <CodeMirror
                                                value={(code as any).sapui5}
                                                height="100%"
                                                extensions={[json()]}
                                                theme={vscodeDark}
                                                readOnly={true}
                                                editable={false}
                                                className="h-full"
                                            />
                                        </Tab>
                                        <Tab 
                                            key="csharp" 
                                            title={
                                                <div className="flex items-center space-x-2">
                                                    <Terminal size={14} />
                                                    <span>C# (HttpClient)</span>
                                                </div>
                                            }
                                        >
                                            <CodeMirror
                                                value={(code as any).csharp}
                                                height="100%"
                                                extensions={[json()]}
                                                theme={vscodeDark}
                                                readOnly={true}
                                                editable={false}
                                                className="h-full"
                                            />
                                        </Tab>
                                        <Tab 
                                            key="java" 
                                            title={
                                                <div className="flex items-center space-x-2">
                                                    <Coffee size={14} />
                                                    <span>Java (Olingo)</span>
                                                </div>
                                            }
                                        >
                                            <CodeMirror
                                                value={(code as any).java}
                                                height="100%"
                                                extensions={[json()]}
                                                theme={vscodeDark}
                                                readOnly={true}
                                                editable={false}
                                                className="h-full"
                                            />
                                        </Tab>
                                    </Tabs>
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
                            
                            {/* Copy Button is always available now */}
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