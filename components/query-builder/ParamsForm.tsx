import React, { useMemo } from 'react';
import { Input, Select, SelectItem, Checkbox, Selection, Button, Chip } from "@nextui-org/react";
import { CheckSquare, ArrowDownAz, ArrowUpZa, CornerDownRight, Link2 } from 'lucide-react';
import { EntityType, ParsedSchema } from '@/utils/odata-helper';

export interface SortItem {
    field: string;
    order: 'asc' | 'desc';
}

interface ParamsFormProps {
    entitySets: string[];
    selectedEntity: string;
    onEntityChange: (keys: Selection) => void;
    
    filter: string; setFilter: (val: string) => void;
    select: string; setSelect: (val: string) => void;
    expand: string; setExpand: (val: string) => void;
    
    // Changed sort props to support multiple items
    sortItems: SortItem[];
    setSortItems: (items: SortItem[]) => void;

    top: string; setTop: (val: string) => void;
    skip: string; setSkip: (val: string) => void;
    count: boolean; setCount: (val: boolean) => void;

    currentSchema: EntityType | null;
    schema: ParsedSchema | null;
}

export const ParamsForm: React.FC<ParamsFormProps> = ({
    entitySets, selectedEntity, onEntityChange,
    filter, setFilter,
    select, setSelect,
    expand, setExpand,
    sortItems, setSortItems,
    top, setTop,
    skip, setSkip,
    count, setCount,
    currentSchema,
    schema
}) => {
    const ALL_KEY = '_ALL_';

    // --- Helper: 解析 Expand 路径获取对应实体的属性 ---
    const expandedEntityProperties = useMemo(() => {
        if (!currentSchema || !schema || !expand) return [];
        
        const paths = expand.split(',').filter(p => p && p !== 'none');
        const extraProps: any[] = [];

        paths.forEach(path => {
            let current = currentSchema;
            const segments = path.split('/');
            let isValidPath = true;

            for (const segment of segments) {
                const nav = current.navigationProperties.find(n => n.name === segment);
                if (!nav) {
                    isValidPath = false;
                    break;
                }
                
                let targetTypeName = nav.targetType;
                if (targetTypeName?.startsWith('Collection(')) {
                    targetTypeName = targetTypeName.slice(11, -1);
                }
                targetTypeName = targetTypeName?.split('.').pop() || "";
                
                const nextEntity = schema.entities.find(e => e.name === targetTypeName);
                if (!nextEntity) {
                    isValidPath = false;
                    break;
                }
                current = nextEntity;
            }

            if (isValidPath && current) {
                extraProps.push(
                    ...current.properties.map(p => ({
                        ...p,
                        name: `${path}/${p.name}`,
                        label: `${path}/${p.name}`,
                        originalName: p.name,
                        sourcePath: path,
                        type: p.type,
                        isExpanded: true
                    }))
                );
            }
        });
        
        return extraProps;
    }, [expand, currentSchema, schema]);

    // --- Select 字段逻辑 ---
    const selectItems = useMemo(() => {
        if (!currentSchema) return [];
        const mainProps = currentSchema.properties.map(p => ({ ...p, label: p.name, isExpanded: false }));
        const items = [
            { name: ALL_KEY, type: 'Special', label: '全选 (Select All)', isExpanded: false },
            ...mainProps,
            ...expandedEntityProperties
        ];
        return items;
    }, [currentSchema, expandedEntityProperties]);

    const currentSelectKeys = useMemo(() => {
        const selected = new Set(select ? select.split(',') : []);
        if (currentSchema) {
            const allAvailableKeys = [
                ...currentSchema.properties.map(p => p.name),
                ...expandedEntityProperties.map(p => p.name)
            ];
            const allSelected = allAvailableKeys.length > 0 && allAvailableKeys.every(n => selected.has(n));
            if (allSelected) selected.add(ALL_KEY);
        }
        return selected;
    }, [select, currentSchema, expandedEntityProperties]);

    const handleSelectChange = (keys: Selection) => {
        if (!currentSchema) return;
        const newSet = new Set(keys);
        
        const allAvailableKeys = [
            ...currentSchema.properties.map(p => p.name),
            ...expandedEntityProperties.map(p => p.name)
        ];

        const wasAllSelected = currentSelectKeys.has(ALL_KEY);
        const isAllSelected = newSet.has(ALL_KEY);

        let finalSelection: string[] = [];

        if (isAllSelected && !wasAllSelected) {
            finalSelection = allAvailableKeys;
        } else if (!isAllSelected && wasAllSelected) {
            finalSelection = [];
        } else {
            newSet.delete(ALL_KEY);
            finalSelection = Array.from(newSet).map(String);
        }

        setSelect(Array.from(new Set(finalSelection)).join(','));
    };

    // --- Expand 字段逻辑 ---
    const expandItems = useMemo(() => {
        if (!currentSchema || !schema) return [];
        if (currentSchema.navigationProperties.length === 0) {
            return [{ name: 'none', label: '无关联实体', type: 'placeholder', targetType: undefined, level: 0 }];
        }

        const buildPaths = (entityName: string, parentPath: string, currentDepth: number): any[] => {
            if (currentDepth >= 2) return [];
            const entity = schema.entities.find(e => e.name === entityName);
            if (!entity) return [];

            let results: any[] = [];
            for (const nav of entity.navigationProperties) {
                const currentPath = parentPath ? `${parentPath}/${nav.name}` : nav.name;
                results.push({
                    name: currentPath,
                    label: nav.name,
                    fullPath: currentPath,
                    type: 'nav',
                    targetType: nav.targetType,
                    level: currentDepth
                });

                let targetTypeName = nav.targetType;
                if (targetTypeName) {
                    if (targetTypeName.startsWith('Collection(')) {
                        targetTypeName = targetTypeName.slice(11, -1);
                    }
                    targetTypeName = targetTypeName.split('.').pop() || "";
                    if (targetTypeName) {
                        const children = buildPaths(targetTypeName, currentPath, currentDepth + 1);
                        results = results.concat(children);
                    }
                }
            }
            return results;
        };
        return buildPaths(currentSchema.name, "", 0);
    }, [currentSchema, schema]);

    const currentExpandKeys = useMemo(() => {
        return new Set(expand ? expand.split(',') : []);
    }, [expand]);

    const handleExpandChange = (keys: Selection) => {
        const newSet = new Set(keys);
        if (newSet.has('none')) newSet.delete('none');
        setExpand(Array.from(newSet).join(','));
    };

    // --- Sort 字段逻辑 (支持多选和独立排序) ---
    const sortOptions = useMemo(() => {
        if (!currentSchema) return [];
        const mainProps = currentSchema.properties.map(p => ({ ...p, label: p.name, isExpanded: false }));
        return [...mainProps, ...expandedEntityProperties];
    }, [currentSchema, expandedEntityProperties]);

    const currentSortKeys = useMemo(() => {
        return new Set(sortItems.map(i => i.field));
    }, [sortItems]);

    const handleSortSelectionChange = (keys: Selection) => {
        const newKeys = new Set(keys);
        
        // 1. 保留现有的 items (如果它们还在新集合里)
        const keptItems = sortItems.filter(item => newKeys.has(item.field));
        
        // 2. 找出新增的 keys
        const existingKeySet = new Set(sortItems.map(i => i.field));
        const addedKeys = Array.from(newKeys).filter(k => !existingKeySet.has(String(k)));
        
        // 3. 创建新 items
        const newItems = addedKeys.map(k => ({ field: String(k), order: 'asc' as const }));
        
        setSortItems([...keptItems, ...newItems]);
    };

    const toggleSortOrder = (field: string) => {
        setSortItems(sortItems.map(item => 
            item.field === field 
                ? { ...item, order: item.order === 'asc' ? 'desc' : 'asc' } 
                : item
        ));
    };

    const removeSortItem = (field: string) => {
        setSortItems(sortItems.filter(item => item.field !== field));
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 p-4 rounded-xl bg-content1 shadow-sm border border-divider shrink-0">
            <div className="md:col-span-3">
                <Select
                    label="实体集 (Entity Set)"
                    placeholder="选择实体"
                    selectedKeys={selectedEntity ? [selectedEntity] : []}
                    onSelectionChange={onEntityChange}
                    variant="bordered"
                    size="sm"
                    items={entitySets.map(e => ({ key: e, label: e }))}
                >
                    {(item) => <SelectItem key={item.key} value={item.key}>{item.label}</SelectItem>}
                </Select>
            </div>

            <div className="md:col-span-9 grid grid-cols-2 md:grid-cols-4 gap-4">
                <Input label="过滤 ($filter)" placeholder="例如: Price gt 20" value={filter} onValueChange={setFilter} size="sm" variant="bordered" />

                {/* 排序 ($orderby) - 支持多选与独立顺序 */}
                <div className="md:col-span-1">
                    {currentSchema ? (
                        <Select
                            label="排序 ($orderby)"
                            placeholder="选择排序字段"
                            selectionMode="multiple"
                            selectedKeys={currentSortKeys}
                            onSelectionChange={handleSortSelectionChange}
                            size="sm"
                            variant="bordered"
                            classNames={{ 
                                value: "text-xs",
                                trigger: "min-h-unit-10"
                            }}
                            items={sortOptions}
                            isMultiline={true}
                            renderValue={(items) => {
                                return (
                                    <div className="flex flex-wrap gap-1">
                                        {items.map((item) => {
                                            const sortItem = sortItems.find(i => i.field === item.key);
                                            const isAsc = sortItem?.order === 'asc';
                                            return (
                                                <Chip 
                                                    key={item.key} 
                                                    size="sm" 
                                                    variant="flat"
                                                    onClose={() => removeSortItem(String(item.key))}
                                                    classNames={{ base: "h-5 text-[10px] gap-1 px-1" }}
                                                >
                                                    <div 
                                                        className="flex items-center gap-1 cursor-pointer select-none"
                                                        onClick={(e) => { e.stopPropagation(); toggleSortOrder(String(item.key)); }}
                                                        title="点击切换升/降序"
                                                    >
                                                        <span>{item.data?.name}</span>
                                                        {isAsc ? <ArrowDownAz size={10} /> : <ArrowUpZa size={10} />}
                                                    </div>
                                                </Chip>
                                            );
                                        })}
                                    </div>
                                );
                            }}
                        >
                            {(p) => (
                                <SelectItem key={p.name} value={p.name} textValue={p.name}>
                                    <div className="flex items-center gap-2">
                                        {p.isExpanded && <Link2 size={12} className="text-secondary opacity-70"/>}
                                        <div className="flex flex-col">
                                            <span className={`text-small ${p.isExpanded ? 'text-secondary' : ''}`}>{p.name}</span>
                                        </div>
                                    </div>
                                </SelectItem>
                            )}
                        </Select>
                    ) : (
                        <Input 
                            label="排序 ($orderby)" 
                            placeholder="字段 (例如: Price desc)" 
                            value={sortItems.length > 0 ? sortItems.map(i => `${i.field} ${i.order}`).join(',') : ''} 
                            // 简单回退处理：如果手动输入，视为单个 asc 字段
                            onValueChange={(v) => setSortItems(v ? [{ field: v, order: 'asc' }] : [])} 
                            size="sm" 
                            variant="bordered" 
                        />
                    )}
                </div>

                <div className="flex gap-2 items-center">
                    <Input label="Top" value={top} onValueChange={setTop} size="sm" variant="bordered" className="w-16" />
                    <Input label="Skip" value={skip} onValueChange={setSkip} size="sm" variant="bordered" className="w-16" />
                    <Checkbox isSelected={count} onValueChange={setCount} size="sm">计数</Checkbox>
                </div>

                <div className="hidden md:block"></div> {/* Spacer */}

                {/* 智能 Select 字段选择 */}
                <div className="md:col-span-2">
                    {currentSchema ? (
                        <Select
                            label="字段 ($select)"
                            placeholder="选择返回字段"
                            selectionMode="multiple"
                            selectedKeys={currentSelectKeys}
                            onSelectionChange={handleSelectChange}
                            size="sm"
                            variant="bordered"
                            classNames={{ value: "text-xs" }}
                            items={selectItems}
                            renderValue={(items) => {
                                return (
                                    <div className="flex flex-wrap gap-1">
                                        {items.map((item) => (
                                            <span key={item.key} className="text-xs truncate max-w-[100px]">
                                                {item.textValue}{items.length > 1 ? ',' : ''}
                                            </span>
                                        ))}
                                    </div>
                                );
                            }}
                        >
                            {(item) => {
                                if (item.type === 'Special') {
                                    return (
                                        <SelectItem key={item.name} textValue={item.label} className="font-bold border-b border-divider mb-1">
                                            <div className="flex items-center gap-2">
                                                <CheckSquare size={14} /> {item.label}
                                            </div>
                                        </SelectItem>
                                    );
                                }
                                return (
                                    <SelectItem key={item.name} value={item.name} textValue={item.name}>
                                        <div className="flex items-center justify-between">
                                             <div className="flex items-center gap-2">
                                                {item.isExpanded && <Link2 size={12} className="text-secondary opacity-70"/>}
                                                <div className="flex flex-col">
                                                    <span className={`text-small ${item.isExpanded ? 'text-secondary' : ''}`}>{item.name}</span>
                                                    <span className="text-tiny text-default-400">{item.type?.split('.').pop()}</span>
                                                </div>
                                             </div>
                                             {item.isExpanded && <span className="text-[10px] text-default-300 ml-2 border border-divider px-1 rounded">Ext</span>}
                                        </div>
                                    </SelectItem>
                                );
                            }}
                        </Select>
                    ) : (
                        <Input label="字段 ($select)" placeholder="例如: Name,Price" value={select} onValueChange={setSelect} size="sm" variant="bordered" />
                    )}
                </div>

                {/* 智能 Expand 展开选择 (级联) */}
                <div className="md:col-span-2">
                    {currentSchema ? (
                        <Select
                            label="展开 ($expand)"
                            placeholder="选择关联实体"
                            selectionMode="multiple"
                            selectedKeys={currentExpandKeys}
                            onSelectionChange={handleExpandChange}
                            size="sm"
                            variant="bordered"
                            classNames={{ value: "text-xs" }}
                            items={expandItems}
                        >
                            {(item) => {
                                if (item.type === 'placeholder') {
                                    return <SelectItem key="none" isReadOnly>无关联实体</SelectItem>;
                                }
                                const indent = item.level > 0 ? `${item.level * 12}px` : '0px';
                                return (
                                    <SelectItem key={item.name} value={item.name} textValue={item.name}>
                                        <div className="flex flex-col" style={{ paddingLeft: indent }}>
                                            <div className="flex items-center gap-1">
                                                {item.level > 0 && <CornerDownRight size={12} className="text-default-400" />}
                                                <span className="text-small">{item.label}</span>
                                            </div>
                                            {item.targetType && (
                                                <span className="text-tiny text-default-400 ml-1">
                                                    To: {item.targetType?.split('.').pop()}
                                                </span>
                                            )}
                                        </div>
                                    </SelectItem>
                                );
                            }}
                        </Select>
                    ) : (
                        <Input label="展开 ($expand)" placeholder="例如: Category" value={expand} onValueChange={setExpand} size="sm" variant="bordered" />
                    )}
                </div>
            </div>
        </div>
    );
};