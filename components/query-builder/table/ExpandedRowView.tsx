import React, { useMemo } from 'react';
import { Chip, Tabs, Tab } from "@nextui-org/react";
import { Layers, LayoutList, Braces } from 'lucide-react';
import { isExpandableData } from './utils';
import { RecursiveDataTable } from './RecursiveDataTable';

interface ExpandedRowViewProps {
    rowData: any;
    isDark: boolean;
    parentSelected: boolean;
}

// ----------------------------------------------------------------------
// ExpandedRowView Component (Master-Detail Content)
// ----------------------------------------------------------------------
export const ExpandedRowView: React.FC<ExpandedRowViewProps> = ({ rowData, isDark, parentSelected }) => {
    // 找出所有嵌套的属性（Expands）
    const expandProps = useMemo(() => {
        const props: { key: string, data: any[], type: 'array' | 'object' }[] = [];
        Object.entries(rowData).forEach(([key, val]: [string, any]) => {
            if (key !== '__metadata' && isExpandableData(val)) {
                let normalizedData: any[] = [];
                let type: 'array' | 'object' = 'object';

                if (Array.isArray(val)) {
                    normalizedData = val;
                    type = 'array';
                } else if (val && Array.isArray(val.results)) {
                    normalizedData = val.results;
                    type = 'array';
                } else {
                    normalizedData = [val]; // Single object as 1-row array
                    type = 'object';
                }
                
                props.push({ key, data: normalizedData, type });
            }
        });
        return props;
    }, [rowData]);

    if (expandProps.length === 0) return <div className="p-4 text-default-400 italic text-xs">No expanded details available.</div>;

    return (
        <div className="p-4 bg-default-50/50 inner-shadow-sm">
            <div className="flex items-center gap-2 mb-2 text-xs font-bold text-default-500 uppercase tracking-wider">
                <Layers size={14} /> 关联详情 (Associated Details)
            </div>
            <div className="bg-background rounded-xl border border-divider overflow-hidden flex flex-col min-h-[200px]">
                <Tabs 
                    aria-label="Expanded Data" 
                    variant="underlined"
                    color="secondary"
                    classNames={{
                        tabList: "px-4 border-b border-divider bg-default-50",
                        cursor: "w-full bg-secondary",
                        tab: "h-10 text-xs",
                        panel: "p-0 flex-1 flex flex-col" // Important: p-0 to let table fill the panel
                    }}
                >
                    {expandProps.map(prop => (
                        <Tab 
                            key={prop.key} 
                            title={
                                <div className="flex items-center gap-2">
                                    {prop.type === 'array' ? <LayoutList size={14} /> : <Braces size={14} />}
                                    <span>{prop.key}</span>
                                    <Chip size="sm" variant="flat" className="h-4 text-[9px] px-1">{prop.data.length}</Chip>
                                </div>
                            }
                        >
                            {/* Recursively use RecursiveDataTable for nested data, passing parent selection state */}
                            <RecursiveDataTable 
                                data={prop.data} 
                                isDark={isDark} 
                                isRoot={false} // Sub-tables don't show global delete/export
                                parentSelected={parentSelected}
                            />
                        </Tab>
                    ))}
                </Tabs>
            </div>
        </div>
    );
};