import React from 'react';
import { Switch, cn } from "@nextui-org/react";
import { Filter, XCircle } from 'lucide-react';

interface PaginationControlsProps {
    filter: string;
    onOpenFilter: () => void;
    onClearFilter: () => void;
    top: string;
    setTop: (val: string) => void;
    skip: string;
    setSkip: (val: string) => void;
    count: boolean;
    setCount: (val: boolean) => void;
}

export const PaginationControls: React.FC<PaginationControlsProps> = ({
    filter, onOpenFilter, onClearFilter,
    top, setTop,
    skip, setSkip,
    count, setCount
}) => {
    return (
        <div className="flex items-center border-2 border-default-200 rounded-xl px-3 bg-content1 hover:border-default-400 transition-colors h-14 w-full overflow-hidden relative shadow-sm">
            
            {/* 1. Filter Section (Flex Grow + min-w-0 to prevent overflow) */}
            <div 
                className="flex-1 min-w-0 flex flex-col justify-center h-full cursor-pointer group pr-2 mr-2 relative"
                onClick={onOpenFilter}
            >
                <div className="flex items-center justify-between">
                     <span className="text-[10px] text-default-500 group-hover:text-primary transition-colors font-medium">
                        过滤 ($filter)
                    </span>
                </div>
               
                <div className="flex items-center gap-2 h-6 text-small text-foreground w-full">
                    {filter ? (
                        <div className="flex items-center gap-1 w-full">
                            <Filter size={14} className="text-primary shrink-0" />
                            {/* flex-1 + truncate ensures text takes available space but doesn't push others */}
                            <span className="truncate font-mono text-xs flex-1" title={filter}>{filter}</span>
                            {/* Clear Button */}
                            <div 
                                role="button"
                                className="p-1 text-default-400 hover:text-danger z-10 shrink-0"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onClearFilter();
                                }}
                            >
                                <XCircle size={14} />
                            </div>
                        </div>
                    ) : (
                        <span className="text-default-300 text-xs italic group-hover:text-default-400 transition-colors truncate">
                            点击构建过滤器...
                        </span>
                    )}
                </div>
            </div>

            {/* Divider */}
            <div className="w-px h-8 bg-divider shrink-0 mr-3" />

            {/* 2. Top Section (shrink-0) */}
            <div className="flex flex-col w-12 items-center justify-center h-full mr-1 shrink-0">
                <label htmlFor="input-top" className="text-[10px] text-default-500 font-medium cursor-text w-full text-center">Top</label>
                <input 
                    id="input-top"
                    className="w-full bg-transparent text-center font-mono text-sm outline-none h-6 text-default-700 placeholder:text-default-300 focus:text-primary transition-colors"
                    value={top || ''} 
                    onChange={(e) => setTop(e.target.value)}
                    placeholder="20"
                />
            </div>

            {/* Divider */}
            <div className="w-px h-8 bg-divider shrink-0 mx-2" />

            {/* 3. Skip Section (shrink-0) */}
            <div className="flex flex-col w-12 items-center justify-center h-full mr-1 shrink-0">
                <label htmlFor="input-skip" className="text-[10px] text-default-500 font-medium cursor-text w-full text-center">Skip</label>
                <input 
                    id="input-skip"
                    className="w-full bg-transparent text-center font-mono text-sm outline-none h-6 text-default-700 placeholder:text-default-300 focus:text-primary transition-colors"
                    value={skip || ''}
                    onChange={(e) => setSkip(e.target.value)}
                    placeholder="0"
                />
            </div>

            {/* Divider */}
            <div className="w-px h-8 bg-divider shrink-0 mx-2" />

            {/* 4. Count Section (shrink-0) */}
            <div className="flex flex-col items-center justify-center h-full min-w-[50px] shrink-0">
                 <span className="text-[10px] text-default-500 font-medium mb-1">Count</span>
                 <Switch 
                    size="sm" 
                    isSelected={count} 
                    onValueChange={setCount} 
                    aria-label="Count"
                    classNames={{
                        wrapper: "group-data-[selected=true]:bg-primary h-5",
                        thumb: cn("w-3 h-3 group-data-[selected=true]:ml-3")
                    }}
                />
            </div>
        </div>
    );
};