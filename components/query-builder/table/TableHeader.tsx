import React from 'react';
import { Button, Chip } from "@nextui-org/react";
import { Trash, Save, Pencil, Check, X } from 'lucide-react';

interface TableHeaderProps {
    isEditing: boolean;
    onStartEdit: () => void;
    onCancelEdit: () => void;
    onConfirmUpdate: () => void;
    onDelete: () => void;
    onExport: () => void;
}

export const TableHeader: React.FC<TableHeaderProps> = ({
    isEditing,
    onStartEdit,
    onCancelEdit,
    onConfirmUpdate,
    onDelete,
    onExport
}) => {
    return (
        <div className="bg-default-50 p-2 flex gap-2 border-b border-divider items-center justify-between shrink-0 h-12">
             <div className="flex items-center gap-2">
                {/* Header Left Content */}
                {isEditing && (
                    <Chip size="sm" color="warning" variant="flat" className="animate-pulse">编辑模式 (Editing)</Chip>
                )}
             </div>
             
             <div className="flex gap-2">
                {/* 1. Modify Button: Always show when not editing */}
                {!isEditing && (
                    <Button size="sm" variant="flat" onPress={onStartEdit} startContent={<Pencil size={14} />}>
                        修改 (Modify)
                    </Button>
                )}

                {/* 2. Update/Cancel Buttons: Show only when editing */}
                {isEditing && (
                    <>
                        <Button size="sm" color="success" variant="solid" className="text-white" onPress={onConfirmUpdate} startContent={<Check size={14} />}>
                            更新 (Update)
                        </Button>
                        <Button size="sm" color="default" variant="flat" onPress={onCancelEdit} startContent={<X size={14} />}>
                            取消 (Cancel)
                        </Button>
                    </>
                )}
                
                {/* 3. Delete Button: Always show */}
                <Button size="sm" color="danger" variant="light" onPress={onDelete} startContent={<Trash size={14} />}>
                    删除 (Delete)
                </Button>

                {/* 4. Export Button: Always show */}
                <Button size="sm" color="primary" variant="light" onPress={onExport} startContent={<Save size={14} />}>
                    导出 Excel
                </Button>
            </div>
        </div>
    );
};