import React, { useMemo } from 'react';
import { Chip, Tabs, Tab } from "@nextui-org/react";
import { Layers, LayoutList, Braces } from 'lucide-react';
import { isExpandableData } from './utils';
import { RecursiveDataTable } from './RecursiveDataTable';
import { ParsedSchema } from '@/utils/odata-helper';

interface ExpandedRowViewProps {
    rowData: any;
    isDark: boolean;
    parentSelected: boolean;
    schema?: ParsedSchema | null;
    parentEntityName?: string;
    onUpdate?: (updates: { item: any, changes: any }[]) => void; // Propagate Update
}

// ----------------------------------------------------------------------
// ExpandedRowView Component (Master-Detail Content)
// ----------------------------------------------------------------------
export const ExpandedRowView: React.FC<ExpandedRowViewProps> = ({ 
    rowData, isDark, parentSelected, schema, parentEntityName, onUpdate 
}) => {
    // 找出所有嵌套的属性（Expands），并尝试解析对应的实体类型
    const expandProps = useMemo(() => {
        const props: { key: string, data: any[], type: 'array' | 'object', childEntityName?: string }[] = [];
        
        // 尝试获取父级实体定义
        let parentEntityType = null;
        if (schema && parentEntityName) {
            parentEntityType = schema.entities.find(e => e.name === parentEntityName) ||
                               schema.entities.find(e => parentEntityName.startsWith(e.name)); // 简单回退
        }

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
                
                // 尝试解析子实体的类型名称
                let childEntityName = key;
                if (parentEntityType) {
                    const nav = parentEntityType.navigationProperties.find(n => n.name === key);
                    if (nav && nav.targetType) {
                        let target = nav.targetType;
                        if (target.startsWith('Collection(')) target = target.slice(11, -1);
                        childEntityName = target.split('.').pop() || target;
                    }
                }

                props.push({ key, data: normalizedData, type, childEntityName });
            }
        });
        return props;
    }, [rowData, schema, parentEntityName]);

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
                            {/* Recursively use RecursiveDataTable for nested data, passing schema and child entity name */}
                            <RecursiveDataTable 
                                data={prop.data} 
                                isDark={isDark} 
                                isRoot={false} // Sub-tables don't show global delete/export
                                parentSelected={parentSelected}
                                schema={schema}
                                entityName={prop.childEntityName}
                                onUpdate={onUpdate} // Propagate update capability
                            />
                        </Tab>
                    ))}
                </Tabs>
            </div>
        </div>
    );
};