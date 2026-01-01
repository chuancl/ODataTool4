import React from 'react';
import { Input, Checkbox } from "@nextui-org/react";

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
        <div className="flex items-center gap-2">
            <Input 
                label="Top" 
                value={top} 
                onValueChange={setTop} 
                size="sm" 
                variant="bordered" 
                className="w-20" 
                classNames={{
                    input: "text-center font-mono",
                    label: "text-[9px] text-default-500",
                    inputWrapper: "h-10 min-h-10 px-2 border-default-200"
                }}
            />
            <Input 
                label="Skip" 
                value={skip} 
                onValueChange={setSkip} 
                size="sm" 
                variant="bordered" 
                className="w-20"
                classNames={{
                    input: "text-center font-mono",
                    label: "text-[9px] text-default-500",
                    inputWrapper: "h-10 min-h-10 px-2 border-default-200"
                }}
            />
            <Checkbox 
                isSelected={count} 
                onValueChange={setCount}
                size="sm"
                classNames={{
                    label: "text-small text-default-600 font-medium select-none"
                }}
            >
                Count
            </Checkbox>
        </div>
    );
};