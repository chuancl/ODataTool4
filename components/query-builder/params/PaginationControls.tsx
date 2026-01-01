import React from 'react';
import { Input, Checkbox, Tooltip } from "@nextui-org/react";

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
        <div className="flex items-center gap-2 flex-1">
            <Input 
                label="Top" 
                placeholder="20"
                value={top} 
                onValueChange={setTop} 
                size="sm" 
                variant="bordered" 
                className="w-16" 
                classNames={{
                    input: "text-center",
                    label: "text-[10px]"
                }}
            />
            <Input 
                label="Skip" 
                placeholder="0"
                value={skip} 
                onValueChange={setSkip} 
                size="sm" 
                variant="bordered" 
                className="w-16"
                classNames={{
                    input: "text-center",
                    label: "text-[10px]"
                }}
            />
            <Tooltip content="包含总数 ($inlinecount / $count)">
                <Checkbox 
                    isSelected={count} 
                    onValueChange={setCount} 
                    size="sm"
                    classNames={{
                        label: "text-tiny text-default-500",
                        base: "m-0 p-0 gap-1"
                    }}
                >
                    Count
                </Checkbox>
            </Tooltip>
        </div>
    );
};