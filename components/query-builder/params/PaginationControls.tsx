import React from 'react';
import { Input, Button, Tooltip } from "@nextui-org/react";
import { Hash, Calculator } from 'lucide-react';

interface PaginationControlsProps {
    top: string;
    setTop: (val: string) => void;
    skip: string;
    setSkip: (val: string) => void;
    count: boolean;
    setCount: (val: boolean) => void;
}

export const PaginationControls: React.FC<PaginationControlsProps> = ({
    top, setTop,
    skip, setSkip,
    count, setCount
}) => {
    return (
        <div className="flex items-center gap-1">
            <Input 
                label="Top" 
                value={top} 
                onValueChange={setTop} 
                size="sm" 
                variant="bordered" 
                className="w-[4.5rem]" 
                classNames={{
                    input: "text-center font-mono",
                    label: "text-[9px] text-default-400",
                    inputWrapper: "h-8 min-h-8 px-1" // Force standard height
                }}
            />
            <Input 
                label="Skip" 
                value={skip} 
                onValueChange={setSkip} 
                size="sm" 
                variant="bordered" 
                className="w-[4.5rem]"
                classNames={{
                    input: "text-center font-mono",
                    label: "text-[9px] text-default-400",
                    inputWrapper: "h-8 min-h-8 px-1" // Force standard height
                }}
            />
            <Tooltip content={count ? "已启用计数 ($count=true)" : "启用计数 ($count)"}>
                <Button
                    isIconOnly
                    size="sm"
                    variant={count ? "solid" : "bordered"}
                    color={count ? "primary" : "default"}
                    onPress={() => setCount(!count)}
                    className="w-8 h-8 min-w-8"
                >
                    <Hash size={14} className={count ? "text-white" : "text-default-500"} />
                </Button>
            </Tooltip>
        </div>
    );
};