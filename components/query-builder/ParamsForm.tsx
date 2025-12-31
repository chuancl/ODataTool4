import React, { useMemo } from 'react';
import { Input, Select, SelectItem, Checkbox, Selection, Button } from "@nextui-org/react";
import { CheckSquare, ArrowDownAz, ArrowUpZa } from 'lucide-react';
import { EntityType } from '@/utils/odata-helper';

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
    currentSchema
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

    // --- Expand 字段逻辑 ---
    const expandItems = useMemo(() => {
        if (!currentSchema) return [];
        if (currentSchema.navigationProperties.length === 0) {
            return [{ name: 'none', label: '无关联实体', type: 'placeholder', targetType: undefined }];
        }
        return [
            { name: ALL_KEY, type: 'Special', label: '全选 (Expand All)', targetType: undefined },
            ...currentSchema.navigationProperties.map(nav => ({
                name: nav.name,
                label: nav.name,
                type: 'nav',
                targetType: nav.targetType
            }))
        ];
    }, [currentSchema]);

    const currentExpandKeys = useMemo(() => {
        const selected = new Set(expand ? expand.split(',') : []);
        if (currentSchema && currentSchema.navigationProperties.length > 0 && selected.size === currentSchema.navigationProperties.length) {
            selected.add(ALL_KEY);
        }
        return selected;
    }, [expand, currentSchema]);

    const handleExpandChange = (keys: Selection) => {
        if (!currentSchema) return;
        const newSet = new Set(keys);
        const allNavs = currentSchema.navigationProperties.map(n => n.name);

        if (newSet.has('none')) newSet.delete('none');

        const wasAllSelected = currentExpandKeys.has(ALL_KEY);
        const isAllSelected = newSet.has(ALL_KEY);

        if (isAllSelected && !wasAllSelected) {
            setExpand(allNavs.join(','));
        } else if (!isAllSelected && wasAllSelected) {
            setExpand('');
        } else {
            newSet.delete(ALL_KEY);
            setExpand(Array.from(newSet).join(','));
        }
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

                {/* 智能 Expand 展开选择 */}
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
                                if (item.type === 'Special') {
                                    return (
                                        <SelectItem key={item.name} textValue={item.label} className="font-bold border-b border-divider mb-1">
                                            <div className="flex items-center gap-2">
                                                <CheckSquare size={14} /> {item.label}
                                            </div>
                                        </SelectItem>
                                    );
                                }
                                if (item.type === 'placeholder') {
                                    return <SelectItem key="none" isReadOnly>无关联实体</SelectItem>;
                                }
                                return (
                                    <SelectItem key={item.name} value={item.name} textValue={item.name}>
                                        <div className="flex flex-col">
                                            <span className="text-small">{item.name}</span>
                                            <span className="text-tiny text-default-400">To: {item.targetType?.split('.').pop()}</span>
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
