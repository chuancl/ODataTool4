import React, { useState, useEffect, useMemo } from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Tabs, Tab } from "@nextui-org/react";
import { FileCode, Trash2, Copy, Globe, Terminal, Coffee } from 'lucide-react';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
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
    // 使用 React.Key 类型以匹配 NextUI Tabs
    const [selectedTab, setSelectedTab] = useState<string | number>('url');

    // 每次打开时重置 Tab 到默认值，避免状态混乱
    useEffect(() => {
        if (isOpen) {
            setSelectedTab('url');
        }
    }, [isOpen]);

    // 如果 code 是字符串，说明是单视图模式
    const isSingleMode = typeof code === 'string';

    // 计算当前需要显示的代码内容
    const currentCodeText = useMemo(() => {
        if (isSingleMode) return (code as string) || '';
        
        // 多语言模式，根据 selectedTab 返回对应代码
        const codeObj = code as { [key: string]: string };
        return codeObj[selectedTab as string] || '';
    }, [code, isSingleMode, selectedTab]);

    const handleCopy = () => {
        navigator.clipboard.writeText(currentCodeText);
    };

    return (
        <Modal 
            isOpen={isOpen} 
            onOpenChange={onOpenChange} 
            size="4xl" 
            scrollBehavior="inside"
            isDismissable={false}
            // Remove manual shouldBlockScroll to rely on NextUI default handling which avoids cleanup race conditions
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
                                        extensions={[json()]}
                                        theme={vscodeDark}
                                        readOnly={true}
                                        editable={false}
                                    />
                                </div>
                            ) : (
                                <div className="flex flex-col h-[500px]">
                                    {/* 
                                      Tabs Controller
                                    */}
                                    <div className="bg-[#252526] border-b border-white/10 px-4 shrink-0">
                                        <Tabs 
                                            aria-label="Code Options" 
                                            color="primary" 
                                            variant="underlined"
                                            selectedKey={selectedTab}
                                            onSelectionChange={setSelectedTab}
                                            classNames={{
                                                tabList: "gap-6 w-full relative rounded-none p-0",
                                                cursor: "w-full bg-primary",
                                                tab: "max-w-fit px-2 h-10 text-sm text-gray-400 data-[selected=true]:text-white",
                                                panel: "hidden" // Hide default panel content mechanism
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
                                            />
                                            <Tab 
                                                key="sapui5" 
                                                title={
                                                    <div className="flex items-center space-x-2">
                                                        <FileCode size={14} />
                                                        <span>SAPUI5</span>
                                                    </div>
                                                } 
                                            />
                                            <Tab 
                                                key="csharp" 
                                                title={
                                                    <div className="flex items-center space-x-2">
                                                        <Terminal size={14} />
                                                        <span>C# (HttpClient)</span>
                                                    </div>
                                                } 
                                            />
                                            <Tab 
                                                key="java" 
                                                title={
                                                    <div className="flex items-center space-x-2">
                                                        <Coffee size={14} />
                                                        <span>Java (Olingo)</span>
                                                    </div>
                                                } 
                                            />
                                        </Tabs>
                                    </div>

                                    <div className="flex-1 overflow-hidden relative">
                                        {/* 
                                          Use key={selectedTab} to force a full remount of CodeMirror when switching tabs.
                                          This prevents internal state issues in CodeMirror when content/language changes rapidly inside a Modal,
                                          which can lead to errors that block the Modal cleanup process.
                                        */}
                                        <CodeMirror
                                            key={String(selectedTab)}
                                            value={currentCodeText}
                                            height="100%"
                                            className="h-full absolute inset-0"
                                            extensions={[json()]}
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