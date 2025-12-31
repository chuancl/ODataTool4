import React from 'react';
import { Input, Button, Chip } from "@nextui-org/react";
import { Copy, Play } from 'lucide-react';

interface UrlBarProps {
    generatedUrl: string;
    setGeneratedUrl: (url: string) => void;
    loading: boolean;
    onRun: () => void;
    onCopyCode: () => void;
}

export const UrlBar: React.FC<UrlBarProps> = ({ generatedUrl, setGeneratedUrl, loading, onRun, onCopyCode }) => {
    return (
        <div className="flex gap-2 items-center bg-content2 p-2 rounded-lg border border-divider shrink-0">
            <Chip size="sm" color="primary" variant="flat" className="shrink-0">GET</Chip>
            <Input
                value={generatedUrl}
                onValueChange={setGeneratedUrl}
                size="sm"
                variant="flat"
                className="font-mono text-sm"
                classNames={{ inputWrapper: "bg-transparent shadow-none" }}
            />
            <Button isIconOnly size="sm" variant="light" onPress={onCopyCode} title="复制 SAPUI5 代码">
                <Copy size={16} />
            </Button>
            <Button color="primary" size="sm" onPress={onRun} isLoading={loading} startContent={<Play size={16} />}>
                运行查询
            </Button>
        </div>
    );
};
