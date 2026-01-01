import React, { useMemo, useState, useEffect } from 'react';
import { Input, Select, SelectItem, Checkbox, Selection, Button, Chip, Tooltip } from "@nextui-org/react";
import { CheckSquare, ArrowDownAz, ArrowUpZa, CornerDownRight, Link2, ChevronRight, ChevronDown, Wand2, Filter } from 'lucide-react';
import { EntityType, ParsedSchema } from '@/utils/odata-helper';
import { FilterBuilderModal } from './FilterBuilderModal';

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

    // State for Filter Builder Modal
    const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);

    // 本地状态：控制下拉框中哪些节点是"视觉上"展开的 (用于查看下级)
    // 这与 "是否选中" ($expand 参数) 分离开来
    const [treeExpandedKeys, setTreeExpandedKeys] = useState<Set<string>>(new Set());

    // 当切换主实体时，重置视觉展开状态
    useEffect(() => {
        setTreeExpandedKeys(new Set());
    }, [selectedEntity]);

    const toggleTreeExpand = (path: string) => {
        setTreeExpandedKeys(prev => {
            const next = new Set(prev);
            if (next.has(path)) next.delete(path);
            else next.add(path);
            return next;
        });
    };

    // --- Helper: 解析 Expand 路径获取对应实体的属性 (用于 Select 和 Sort 候选项) ---
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

    // --- Expand 字段逻辑 (动态递归生成 + 按钮控制) ---
    const expandItems = useMemo(() => {
        if (!currentSchema || !schema) return [];

        /**
         * 递归构建 Expand 选项树
         */
        const buildRecursive = (entity: EntityType, parentPath: string, level: number, ancestors: string[]): any[] => {
            const navs = entity.navigationProperties;
            if (!navs || navs.length === 0) return [];
            
            let result: any[] = [];
            const sortedNavs = [...navs].sort((a, b) => a.name.localeCompare(b.name));

            for (const nav of sortedNavs) {
                // 1. 解析目标实体类型名称
                let targetTypeName = nav.targetType;
                if (targetTypeName?.startsWith('Collection(')) {
                    targetTypeName = targetTypeName.slice(11, -1);
                }
                targetTypeName = targetTypeName?.split('.').pop() || "";

                // 2. 循环引用检测
                if (ancestors.includes(targetTypeName)) {
                    continue; 
                }

                const currentPath = parentPath ? `${parentPath}/${nav.name}` : nav.name;
                const nextEntity = schema.entities.find(e => e.name === targetTypeName);
                
                // 3. 检查是否有子节点 (用于决定是否显示展开按钮)
                let hasChildren = false;
                if (nextEntity && level < 10) {
                     const nextAncestors = [...ancestors, targetTypeName];
                     // 预先检查下一级是否有合法的、不构成循环的导航属性
                     hasChildren = nextEntity.navigationProperties.some(n => {
                        let t = n.targetType;
                        if (t?.startsWith('Collection(')) t = t.slice(11, -1);
                        t = t?.split('.').pop() || "";
                        return !nextAncestors.includes(t);
                     });
                }
                
                // 4. 检查当前节点是否被用户展开了 (视觉展开)
                const isTreeExpanded = treeExpandedKeys.has(currentPath);

                result.push({
                    name: currentPath,
                    label: nav.name,
                    fullPath: currentPath,
                    type: 'nav',
                    targetType: nav.targetType,
                    level: level,
                    hasChildren,        // 是否显示箭头
                    isTreeExpanded      // 箭头方向
                });

                // 5. 递归下钻逻辑 (基于 treeExpandedKeys)
                if (hasChildren && isTreeExpanded && nextEntity) {
                     const nextAncestors = [...ancestors, targetTypeName];
                     const children = buildRecursive(nextEntity, currentPath, level + 1, nextAncestors);
                     result.push(...children);
                }
            }
            return result;
        };

        const items = buildRecursive(currentSchema, "", 0, [currentSchema.name]);

        if (items.length === 0) {
            return [{ name: 'none', label: '无关联实体', type: 'placeholder', targetType: undefined, level: 0 }];
        }

        return items;
    }, [currentSchema, schema, treeExpandedKeys]); // 依赖 treeExpandedKeys 触发重绘

    const currentExpandKeys = useMemo(() => {
        return new Set(expand ? expand.split(',') : []);
    }, [expand]);

    const handleExpandChange = (keys: Selection) => {
        const newSet = new Set(keys);
        if (newSet.has('none')) newSet.delete('none');
        setExpand(Array.from(newSet).join(','));
    };

    // --- Sort 字段逻辑 ---
    const sortOptions = useMemo(() => {
        if (!currentSchema) return [];
        const mainProps = currentSchema.properties.map(p => ({ ...p, label: p.name, isExpanded: false }));
        return [...mainProps, ...expandedEntityProperties];
    }, [currentSchema, expandedEntityProperties, sortItems]);

    const currentAscKeys = useMemo(() => new Set(sortItems.filter(i => i.order === 'asc').map(i => i.field)), [sortItems]);
    const currentDescKeys = useMemo(() => new Set(sortItems.filter(i => i.order === 'desc').map(i => i.field)), [sortItems]);

    const updateSortItems = (newSelectedKeys: Set<React.Key>, type: 'asc' | 'desc') => {
        const otherTypeItems = sortItems.filter(item => item.order !== type);
        const keptCurrentTypeItems = sortItems.filter(item => item.order === type && newSelectedKeys.has(item.field));
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

    return (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 p-4 rounded-xl bg-content1 shadow-sm border border-divider shrink-0">
            {/* Filter Modal Component */}
            <FilterBuilderModal 
                isOpen={isFilterModalOpen}
                onClose={() => setIsFilterModalOpen(false)}
                currentFilter={filter}
                onApply={setFilter}
                currentSchema={currentSchema}
            />

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
                
                {/* 过滤 ($filter) - 使用 Input + Button 触发 Modal */}
                <div className="md:col-span-1 relative">
                    <Input 
                        label="过滤 ($filter)" 
                        placeholder="例如: Price gt 20" 
                        value={filter} 
                        onValueChange={setFilter} 
                        size="sm" 
                        variant="bordered"
                        endContent={
                            <Tooltip content="打开过滤器构建器 (Builder)">
                                <Button 
                                    isIconOnly 
                                    size="sm" 
                                    variant="light" 
                                    className="h-6 w-6 min-w-4 text-default-400 hover:text-primary"
                                    onPress={() => setIsFilterModalOpen(true)}
                                    isDisabled={!currentSchema}
                                >
                                    <Wand2 size={14} />
                                </Button>
                            </Tooltip>
                        }
                    />
                </div>

                {/* 排序 - 升序 */}
                <div className="md:col-span-1">
                    {currentSchema ? (
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
                    ) : (
                        <Input isDisabled label="升序" placeholder="需先选择实体" size="sm" variant="bordered" />
                    )}
                </div>

                {/* 排序 - 降序 */}
                <div className="md:col-span-1">
                    {currentSchema ? (
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
                    ) : (
                        <Input isDisabled label="降序" placeholder="需先选择实体" size="sm" variant="bordered" />
                    )}
                </div>

                <div className="flex gap-2 items-center">
                    <Input label="Top" value={top} onValueChange={setTop} size="sm" variant="bordered" className="w-16" />
                    <Input label="Skip" value={skip} onValueChange={setSkip} size="sm" variant="bordered" className="w-16" />
                    <Checkbox isSelected={count} onValueChange={setCount} size="sm">计数</Checkbox>
                </div>

                {/* Select ($select) */}
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
                            renderValue={(items) => (
                                <div className="flex flex-wrap gap-1">
                                    {items.map((item) => (
                                        <span key={item.key} className="text-xs truncate max-w-[100px]">
                                            {item.textValue}{items.length > 1 ? ',' : ''}
                                        </span>
                                    ))}
                                </div>
                            )}
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

                {/* Expand ($expand) - 支持独立展开按钮 */}
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
                                const indent = item.level > 0 ? `${item.level * 20}px` : '0px';
                                return (
                                    <SelectItem key={item.name} value={item.name} textValue={item.name}>
                                        <div className="flex flex-col" style={{ paddingLeft: indent }}>
                                            <div className="flex items-center gap-1">
                                                {/* 独立的展开按钮 */}
                                                {item.hasChildren ? (
                                                    <div 
                                                        role="button"
                                                        className="p-0.5 hover:bg-default-200 rounded cursor-pointer text-default-500 z-50 flex items-center justify-center transition-colors"
                                                        // 阻止所有可能触发选中的事件冒泡
                                                        onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
                                                        onPointerUp={(e) => { e.stopPropagation(); e.preventDefault(); }}
                                                        onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            e.preventDefault();
                                                            toggleTreeExpand(item.fullPath);
                                                        }}
                                                    >
                                                        {item.isTreeExpanded ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
                                                    </div>
                                                ) : (
                                                    <div className="w-[18px]" /> // 占位符，保持对齐
                                                )}

                                                <div className="flex flex-col">
                                                    <span className="text-small">{item.label}</span>
                                                    {item.targetType && (
                                                        <span className="text-[9px] text-default-400">
                                                            To: {item.targetType?.split('.').pop()}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
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