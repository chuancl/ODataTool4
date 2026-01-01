import React from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button } from "@nextui-org/react";
import { FileCode, Trash2, Copy } from 'lucide-react';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';

interface CodeModalProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    code: string;
    action: 'delete' | 'update' | 'create';
    onExecute: () => void; // Renamed from onCopy to generic onExecute
}

export const CodeModal: React.FC<CodeModalProps> = ({ isOpen, onOpenChange, code, action, onExecute }) => {
    return (
        <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="3xl">
            <ModalContent>
                {(onClose) => (
                    <>
                        <ModalHeader className="flex gap-2 items-center">
                            <FileCode className="text-primary" />
                            {action === 'delete' ? '确认删除 (Confirm Delete)' : `SAPUI5 ${action === 'update' ? '更新(Update)' : '创建(Create)'} 代码`}
                        </ModalHeader>
                        <ModalBody>
                            {action === 'delete' && (
                                <div className="text-sm text-warning-500 font-bold mb-2">
                                    警告: 即将对以下 URL 执行 DELETE 请求。此操作不可撤销！
                                </div>
                            )}
                            <div className="bg-[#1e1e1e] rounded-lg overflow-hidden border border-white/10 relative">
                                <CodeMirror
                                    value={code}
                                    height="400px"
                                    extensions={[json()]}
                                    theme={vscodeDark}
                                    readOnly={true}
                                    editable={false}
                                />
                            </div>
                        </ModalBody>
                        <ModalFooter>
                            <Button color="default" variant="light" onPress={onClose}>关闭 (Close)</Button>
                            {action === 'delete' ? (
                                <Button color="danger" onPress={() => { onExecute(); onClose(); }} startContent={<Trash2 size={16}/>}>
                                    确认执行删除 (Execute Delete)
                                </Button>
                            ) : (
                                <Button color="primary" onPress={() => { onExecute(); onClose(); }} startContent={<Copy size={16}/>}>
                                    复制到剪贴板 (Copy Code)
                                </Button>
                            )}
                        </ModalFooter>
                    </>
                )}
            </ModalContent>
        </Modal>
    );
};