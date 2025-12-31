import React, { useMemo } from 'react';
import { Input, Select, SelectItem, Checkbox, Selection, Button } from "@nextui-org/react";
import { CheckSquare, ArrowDownAz, ArrowUpZa, CornerDownRight } from 'lucide-react';
import { EntityType, ParsedSchema } from '@/utils/odata-helper';

interface ParamsFormProps {
    entitySets: string[];
    selectedEntity: string;
    onEntityChange: (keys: Selection) => void;
    
    filter: string; setFilter: (val: string) => void;
    select: string; setSelect: (val: string) => void;
    expand: string; setExpand: (val: string) => void;
    sortField: string; setSortField: (val: string) => void;
    sortOrder: 'asc' | 'desc'; setSortOrder: (val: any) => void;
    top: string; setTop: (val: string) => void;
    skip: string; setSkip: (val: string) => void;
    count: boolean; setCount: (val: boolean) => void;

    currentSchema: EntityType | null;
    schema: ParsedSchema | null; // 需要完整的 schema 来查找级联实体
}

export const ParamsForm: React.FC<ParamsFormProps> = ({
    entitySets, selectedEntity, onEntityChange,
    filter, setFilter,
    select, setSelect,
    expand, setExpand,
    sortField, setSortField, sortOrder, setSortOrder,
    top, setTop,
    skip, setSkip,
    count, setCount,
    currentSchema,
    schema
}) => {
    const ALL_KEY = '_ALL_';

    // --- Select 字段逻辑 ---
    const selectItems = useMemo(() => {
        if (!currentSchema) return [];
        return [
            { name: ALL_KEY, type: 'Special', label: '全选 (Select All)' },
            ...currentSchema.properties.map(p => ({ ...p, label: p.name }))
        ];
    }, [currentSchema]);

    const currentSelectKeys = useMemo(() => {
        const selected = new Set(select ? select.split(',') : []);
        if (currentSchema && currentSchema.properties.length > 0 && selected.size === currentSchema.properties.length) {
            selected.add(ALL_KEY);
        }
        return selected;
    }, [select, currentSchema]);

    const handleSelectChange = (keys: Selection) => {
        if (!currentSchema) return;
        const newSet = new Set(keys);
        const allProps = currentSchema.properties.map(p => p.name);

        const wasAllSelected = currentSelectKeys.has(ALL_KEY);
        const isAllSelected = newSet.has(ALL_KEY);

        if (isAllSelected && !wasAllSelected) {
            setSelect(allProps.join(','));
        } else if (!isAllSelected && wasAllSelected) {
            setSelect('');
        } else {
            newSet.delete(ALL_KEY);
            setSelect(Array.from(newSet).join(','));
        }
    };

    // --- Expand 字段逻辑 (支持级联) ---
    const expandItems = useMemo(() => {
        if (!currentSchema || !schema) return [];
        if (currentSchema.navigationProperties.length === 0) {
            return [{ name: 'none', label: '无关联实体', type: 'placeholder', targetType: undefined, level: 0 }];
        }

        // 递归查找级联路径的辅助函数
        // entityName: 当前实体名
        // parentPath: 父路径 (e.g., "Supplier")
        // currentDepth: 当前深度
        const buildPaths = (entityName: string, parentPath: string, currentDepth: number): any[] => {
            // 限制最大深度为 2 (Root -> Level 1 -> Level 2)，避免无限递归和 UI 过于复杂
            if (currentDepth >= 2) return [];

            const entity = schema.entities.find(e => e.name === entityName);
            if (!entity) return [];

            let results: any[] = [];
            
            for (const nav of entity.navigationProperties) {
                const currentPath = parentPath ? `${parentPath}/${nav.name}` : nav.name;
                
                // 添加当前层级
                results.push({
                    name: currentPath,
                    label: nav.name, // 显示名只显示当前段，渲染时会有缩进
                    fullPath: currentPath,
                    type: 'nav',
                    targetType: nav.targetType,
                    level: currentDepth
                });

                // 递归查找下一级
                let targetTypeName = nav.targetType;
                if (targetTypeName) {
                    // 清理 EntityType 名称 (e.g., "Collection(Namespace.Type)" -> "Type")
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

        // 从当前实体开始构建，初始深度 0
        return buildPaths(currentSchema.name, "", 0);
    }, [currentSchema, schema]);

    const currentExpandKeys = useMemo(() => {
        // Expand 只是简单的多选，不再有全选逻辑
        return new Set(expand ? expand.split(',') : []);
    }, [expand]);

    const handleExpandChange = (keys: Selection) => {
        const newSet = new Set(keys);
        if (newSet.has('none')) newSet.delete('none');
        // 直接设置选中的路径字符串集合
        setExpand(Array.from(newSet).join(','));
    };

    // --- Sort 字段逻辑 ---
    const sortItems = useMemo(() => {
        if (!currentSchema) return [];
        return currentSchema.properties.map(p => ({ ...p, label: p.name }));
    }, [currentSchema]);

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

                {/* 排序 ($orderby) */}
                <div className="flex gap-1 items-end">
                    <div className="flex-1">
                        {currentSchema ? (
                            <Select
                                label="排序 ($orderby)"
                                placeholder="字段"
                                selectedKeys={sortField ? [sortField] : []}
                                onSelectionChange={(k) => setSortField(Array.from(k).join(''))}
                                size="sm"
                                variant="bordered"
                                classNames={{ value: "text-xs" }}
                                items={sortItems}
                            >
                                {(p) => (
                                    <SelectItem key={p.name} value={p.name} textValue={p.name}>
                                        {p.name}
                                    </SelectItem>
                                )}
                            </Select>
                        ) : (
                            <Input label="排序 ($orderby)" placeholder="字段" value={sortField} onValueChange={setSortField} size="sm" variant="bordered" />
                        )}
                    </div>
                    <Button
                        isIconOnly
                        size="sm"
                        variant="flat"
                        color={sortOrder === 'asc' ? 'default' : 'secondary'}
                        onPress={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                        title={sortOrder === 'asc' ? '升序 (Ascending)' : '降序 (Descending)'}
                        className="mb-0.5"
                    >
                        {sortOrder === 'asc' ? <ArrowDownAz size={18} /> : <ArrowUpZa size={18} />}
                    </Button>
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
                                        <div className="flex flex-col">
                                            <span className="text-small">{item.name}</span>
                                            <span className="text-tiny text-default-400">{item.type.split('.').pop()}</span>
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
                                // 根据层级进行缩进渲染
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