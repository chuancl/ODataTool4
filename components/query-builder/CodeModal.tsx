import React from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button } from "@nextui-org/react";
import { FileCode } from 'lucide-react';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';

interface CodeModalProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    code: string;
    action: 'delete' | 'update' | 'create';
    onCopy: () => void;
}

export const CodeModal: React.FC<CodeModalProps> = ({ isOpen, onOpenChange, code, action, onCopy }) => {
    return (
        <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="3xl">
            <ModalContent>
                {(onClose) => (
                    <>
                        <ModalHeader className="flex gap-2 items-center">
                            <FileCode className="text-primary" />
                            SAPUI5 {action === 'delete' ? '删除(Delete)' : action === 'update' ? '更新(Update)' : '创建(Create)'} 代码
                        </ModalHeader>
                        <ModalBody>
                            <div className="bg-[#1e1e1e] rounded-lg overflow-hidden border border-white/10">
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
                            <Button color="default" variant="light" onPress={onClose}>关闭</Button>
                            <Button color="primary" onPress={() => { onCopy(); onClose(); }}>
                                复制到剪贴板
                            </Button>
                        </ModalFooter>
                    </>
                )}
            </ModalContent>
        </Modal>
    );
};
