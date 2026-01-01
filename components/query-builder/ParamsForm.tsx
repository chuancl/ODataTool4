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
    
    // Sort props
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

    // --- Sort 字段逻辑 (拆分为升序/降序两个下拉框，互斥) ---
    const sortOptions = useMemo(() => {
        if (!currentSchema) return [];
        const mainProps = currentSchema.properties.map(p => ({ ...p, label: p.name, isExpanded: false }));
        return [...mainProps, ...expandedEntityProperties];
    }, [currentSchema, expandedEntityProperties]);

    // 计算当前的 Asc 和 Desc 集合
    const currentAscKeys = useMemo(() => new Set(sortItems.filter(i => i.order === 'asc').map(i => i.field)), [sortItems]);
    const currentDescKeys = useMemo(() => new Set(sortItems.filter(i => i.order === 'desc').map(i => i.field)), [sortItems]);

    // 处理升序变化
    const handleAscChange = (keys: Selection) => {
        const newSet = new Set(keys);
        
        // 1. 保留原本是 Desc 的项 (不受影响)
        // 2. 找出原本是 Asc 但现在依然被选中的项 (保留顺序)
        // 3. 添加新选中的 Asc 项
        
        const existingDescItems = sortItems.filter(i => i.order === 'desc');
        const existingAscItems = sortItems.filter(i => i.order === 'asc' && newSet.has(i.field));
        
        const existingAscKeySet = new Set(existingAscItems.map(i => i.field));
        const newAscItems = Array.from(newSet)
            .filter(k => !existingAscKeySet.has(String(k)))
            .map(k => ({ field: String(k), order: 'asc' as const }));

        // 这里的顺序策略：先保留之前的 Desc，然后是之前的 Asc，然后是新增的 Asc
        // 为了保持用户的预期，通常我们希望整体列表反映操作顺序。
        // 但既然分开了两个框，我们尽量保持 `sortItems` 里的相对顺序稳定。
        // 简单策略：重建列表 -> [所有Desc] + [所有Asc] 或者混合。
        // 为了简单且符合直觉：我们过滤掉旧的Asc，保留Desc，然后追加新的Asc集合。
        // 但这样会导致每次修改Asc，所有的Asc字段都跑到排序末尾。
        // 更好的策略：遍历 `sortItems`，保留还在集合里的；然后追加新的。
        
        const nextItems = sortItems.filter(item => {
            if (item.order === 'desc') return true; // 保留 Desc
            return newSet.has(item.field); // 保留还在选中的 Asc
        });

        // 查找哪些是纯新增的 key
        const currentKeys = new Set(sortItems.map(i => i.field));
        Array.from(newSet).forEach(k => {
            const keyStr = String(k);
            if (!currentKeys.has(keyStr)) {
                nextItems.push({ field: keyStr, order: 'asc' });
            }
        });

        setSortItems(nextItems);
    };

    // 处理降序变化
    const handleDescChange = (keys: Selection) => {
        const newSet = new Set(keys);
        
        const nextItems = sortItems.filter(item => {
            if (item.order === 'asc') return true; // 保留 Asc
            return newSet.has(item.field); // 保留还在选中的 Desc
        });

        const currentKeys = new Set(sortItems.map(i => i.field));
        Array.from(newSet).forEach(k => {
            const keyStr = String(k);
            if (!currentKeys.has(keyStr)) {
                nextItems.push({ field: keyStr, order: 'desc' });
            }
        });

        setSortItems(nextItems);
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

                {/* 排序 - 升序 ($orderby asc) */}
                <div className="md:col-span-1">
                    {currentSchema ? (
                        <Select
                            label="升序 (Ascending)"
                            placeholder="选择升序字段"
                            selectionMode="multiple"
                            selectedKeys={currentAscKeys}
                            onSelectionChange={handleAscChange}
                            size="sm"
                            variant="bordered"
                            classNames={{ value: "text-xs" }}
                            items={sortOptions}
                            isMultiline={true}
                            startContent={<ArrowDownAz size={14} className="text-default-400" />}
                        >
                            {(p) => (
                                <SelectItem 
                                    key={p.name} 
                                    value={p.name} 
                                    textValue={p.name}
                                    // 互斥逻辑：如果在 Desc 集合中，则禁用
                                    isDisabled={currentDescKeys.has(p.name)}
                                    className={currentDescKeys.has(p.name) ? "opacity-50" : ""}
                                >
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
                    ) : (
                        <Input isDisabled label="升序" placeholder="需先选择实体" size="sm" variant="bordered" />
                    )}
                </div>

                {/* 排序 - 降序 ($orderby desc) */}
                <div className="md:col-span-1">
                    {currentSchema ? (
                        <Select
                            label="降序 (Descending)"
                            placeholder="选择降序字段"
                            selectionMode="multiple"
                            selectedKeys={currentDescKeys}
                            onSelectionChange={handleDescChange}
                            size="sm"
                            variant="bordered"
                            classNames={{ value: "text-xs" }}
                            items={sortOptions}
                            isMultiline={true}
                            startContent={<ArrowUpZa size={14} className="text-default-400" />}
                        >
                            {(p) => (
                                <SelectItem 
                                    key={p.name} 
                                    value={p.name} 
                                    textValue={p.name}
                                    // 互斥逻辑：如果在 Asc 集合中，则禁用 
                                    isDisabled={currentAscKeys.has(p.name)}
                                    className={currentAscKeys.has(p.name) ? "opacity-50" : ""}
                                >
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
                    ) : (
                        <Input isDisabled label="降序" placeholder="需先选择实体" size="sm" variant="bordered" />
                    )}
                </div>

                <div className="flex gap-2 items-center">
                    <Input label="Top" value={top} onValueChange={setTop} size="sm" variant="bordered" className="w-16" />
                    <Input label="Skip" value={skip} onValueChange={setSkip} size="sm" variant="bordered" className="w-16" />
                    <Checkbox isSelected={count} onValueChange={setCount} size="sm">计数</Checkbox>
                </div>

                {/* Row 2: Select & Expand (Col Span 2 each) */}
                
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