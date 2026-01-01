import React, { useMemo } from 'react';
import { Input, Select, SelectItem, Selection } from "@nextui-org/react";
import { ArrowDownAz, ArrowUpZa, Link2 } from 'lucide-react';
import { EntityType } from '@/utils/odata-helper';

export interface SortItem {
    field: string;
    order: 'asc' | 'desc';
}

interface SortFieldsProps {
    currentSchema: EntityType | null;
    expandedProperties: any[];
    sortItems: SortItem[];
    setSortItems: (items: SortItem[]) => void;
}

export const SortFields: React.FC<SortFieldsProps> = ({
    currentSchema,
    expandedProperties,
    sortItems,
    setSortItems
}) => {
    // --- Sort 字段逻辑 ---
    const sortOptions = useMemo(() => {
        if (!currentSchema) return [];
        const mainProps = currentSchema.properties.map(p => ({ ...p, label: p.name, isExpanded: false }));
        return [...mainProps, ...expandedProperties];
    }, [currentSchema, expandedProperties, sortItems]);

    const currentAscKeys = useMemo(() => new Set(sortItems.filter(i => i.order === 'asc').map(i => i.field)), [sortItems]);
    const currentDescKeys = useMemo(() => new Set(sortItems.filter(i => i.order === 'desc').map(i => i.field)), [sortItems]);

    const updateSortItems = (newSelectedKeys: Set<React.Key>, type: 'asc' | 'desc') => {
        const otherTypeItems = sortItems.filter(item => item.order !== type);
        const existingKeySet = new Set(sortItems.map(i => i.field));
        
        const newItems: SortItem[] = [];
        newSelectedKeys.forEach(key => {
            const field = String(key);
            if (!existingKeySet.has(field)) {
                newItems.push({ field, order: type });
            }
        });
        
        const nextItems = sortItems.filter(item => {
            if (item.order !== type) return true; 
            return newSelectedKeys.has(item.field); 
        });
        
        nextItems.push(...newItems);
        setSortItems(nextItems);
    };

    const handleAscChange = (keys: Selection) => {
        const selectedSet = keys === "all" 
            ? new Set(sortOptions.filter(o => !currentDescKeys.has(o.name)).map(o => o.name))
            : new Set(keys);
        updateSortItems(selectedSet, 'asc');
    };

    const handleDescChange = (keys: Selection) => {
        const selectedSet = keys === "all"
            ? new Set(sortOptions.filter(o => !currentAscKeys.has(o.name)).map(o => o.name))
            : new Set(keys);
        updateSortItems(selectedSet, 'desc');
    };

    if (!currentSchema) {
        return (
            <>
                <Input isDisabled label="升序" placeholder="需先选择实体" size="sm" variant="bordered" />
                <Input isDisabled label="降序" placeholder="需先选择实体" size="sm" variant="bordered" />
            </>
        );
    }

    return (
        <>
            {/* 排序 - 升序 */}
            <Select
                label="升序 (Ascending)"
                placeholder="选择升序字段"
                selectionMode="multiple"
                selectedKeys={currentAscKeys}
                onSelectionChange={handleAscChange}
                disabledKeys={Array.from(currentDescKeys)} 
                size="sm"
                variant="bordered"
                classNames={{ value: "text-xs" }}
                items={sortOptions}
                isMultiline={true}
                startContent={<ArrowDownAz size={14} className="text-default-400" />}
            >
                {(p) => (
                    <SelectItem key={p.name} value={p.name} textValue={p.name}>
                        <div className="flex items-center gap-2 justify-between">
                            <div className="flex items-center gap-2">
                                {p.isExpanded && <Link2 size={12} className="text-secondary opacity-70"/>}
                                <span className={`text-small ${p.isExpanded ? 'text-secondary' : ''}`}>{p.name}</span>
                            </div>
                            {currentDescKeys.has(p.name) && <span className="text-[10px] text-danger">已选降序</span>}
                        </div>
                    </SelectItem>
                )}
            </Select>

            {/* 排序 - 降序 */}
            <Select
                label="降序 (Descending)"
                placeholder="选择降序字段"
                selectionMode="multiple"
                selectedKeys={currentDescKeys}
                onSelectionChange={handleDescChange}
                disabledKeys={Array.from(currentAscKeys)} 
                size="sm"
                variant="bordered"
                classNames={{ value: "text-xs" }}
                items={sortOptions}
                isMultiline={true}
                startContent={<ArrowUpZa size={14} className="text-default-400" />}
            >
                {(p) => (
                    <SelectItem key={p.name} value={p.name} textValue={p.name}>
                        <div className="flex items-center gap-2 justify-between">
                            <div className="flex items-center gap-2">
                                {p.isExpanded && <Link2 size={12} className="text-secondary opacity-70"/>}
                                <span className={`text-small ${p.isExpanded ? 'text-secondary' : ''}`}>{p.name}</span>
                            </div>
                            {currentAscKeys.has(p.name) && <span className="text-[10px] text-primary">已选升序</span>}
                        </div>
                    </SelectItem>
                )}
            </Select>
        </>
    );
};