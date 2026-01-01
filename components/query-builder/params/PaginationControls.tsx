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
        <div className="flex flex-col gap-2 w-full">
            <div className="flex gap-2">
                <Input 
                    label="Top" 
                    placeholder="20"
                    value={top} 
                    onValueChange={setTop} 
                    size="sm" 
                    variant="bordered" 
                    className="flex-1" 
                />
                <Input 
                    label="Skip" 
                    placeholder="0"
                    value={skip} 
                    onValueChange={setSkip} 
                    size="sm" 
                    variant="bordered" 
                    className="flex-1" 
                />
            </div>
            <Checkbox 
                isSelected={count} 
                onValueChange={setCount} 
                size="sm"
                classNames={{
                    label: "text-small text-default-500"
                }}
            >
                计数 ($count)
            </Checkbox>
        </div>
    );
};