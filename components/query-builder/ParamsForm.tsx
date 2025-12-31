import React, { useMemo } from 'react';
import { Input, Select, SelectItem, Checkbox, Selection, Button, ListboxSection } from "@nextui-org/react";
import { CheckSquare, ArrowDownAz, ArrowUpZa, CornerDownRight, Link2 } from 'lucide-react';
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
                // 将该实体的所有属性加以前缀
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
        
        // 如果有扩展字段，不需要“全选”逻辑（因为它通常只针对主实体），或者全选只选主实体
        // 这里为了简单，保留全选作为“全选主实体字段”
        const items = [
            { name: ALL_KEY, type: 'Special', label: '全选主实体 (Select All Main)', isExpanded: false },
            ...mainProps,
            ...expandedEntityProperties
        ];
        
        return items;
    }, [currentSchema, expandedEntityProperties]);

    const currentSelectKeys = useMemo(() => {
        const selected = new Set(select ? select.split(',') : []);
        // 全选逻辑仅判断主实体属性是否都已选中
        if (currentSchema) {
            const mainPropNames = currentSchema.properties.map(p => p.name);
            const allMainSelected = mainPropNames.length > 0 && mainPropNames.every(n => selected.has(n));
            if (allMainSelected) {
                selected.add(ALL_KEY);
            }
        }
        return selected;
    }, [select, currentSchema]);

    const handleSelectChange = (keys: Selection) => {
        if (!currentSchema) return;
        const newSet = new Set(keys);
        const allMainProps = currentSchema.properties.map(p => p.name);

        const wasAllSelected = currentSelectKeys.has(ALL_KEY);
        const isAllSelected = newSet.has(ALL_KEY);

        // 如果之前选中的包含了扩展属性，我们希望保留它们，除非用户手动反选
        const currentExpandedSelected = select ? select.split(',').filter(s => s.includes('/')) : [];

        let finalSelection: string[] = [];

        if (isAllSelected && !wasAllSelected) {
            // 点击了全选 -> 选中所有主实体 + 保持已选的扩展属性
            finalSelection = [...allMainProps, ...currentExpandedSelected];
        } else if (!isAllSelected && wasAllSelected) {
            // 取消了全选 -> 清空主实体 + 保持已选的扩展属性
            finalSelection = [...currentExpandedSelected];
        } else {
            // 普通选择
            newSet.delete(ALL_KEY);
            finalSelection = Array.from(newSet).map(String);
        }

        // 去重并设置
        setSelect(Array.from(new Set(finalSelection)).join(','));
    };

    // --- Expand 字段逻辑 (支持级联) ---
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

    // --- Sort 字段逻辑 ---
    const sortItems = useMemo(() => {
        if (!currentSchema) return [];
        const mainProps = currentSchema.properties.map(p => ({ ...p, label: p.name, isExpanded: false }));
        return [...mainProps, ...expandedEntityProperties];
    }, [currentSchema, expandedEntityProperties]);

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