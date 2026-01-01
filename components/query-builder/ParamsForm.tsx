import React, { useMemo, useState } from 'react';
import { Select, SelectItem, Selection } from "@nextui-org/react";
import { EntityType, ParsedSchema } from '@/utils/odata-helper';
import { FilterBuilderModal } from './FilterBuilderModal';

// 引入拆分的子组件
import { ExpandSelect } from './params/ExpandSelect';
import { SelectFields } from './params/SelectFields';
import { SortFields, SortItem } from './params/SortFields';
import { PaginationControls } from './params/PaginationControls';

// 重新导出 SortItem 以保持兼容性
export type { SortItem };

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
    // State for Filter Builder Modal
    const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);

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

            {/* --- 左侧控制面板 (实体, 过滤, 分页) [col-span-3] --- */}
            {/* 使用 gap-4 以匹配右侧 grid gap */}
            <div className="md:col-span-3 flex flex-col gap-4">
                {/* 1. 实体集选择 */}
                <Select
                    label="实体集 (Entity Set)"
                    placeholder="选择实体"
                    selectedKeys={selectedEntity ? [selectedEntity] : []}
                    onSelectionChange={onEntityChange}
                    variant="bordered"
                    // 移除 size="sm" 以使用默认高度 (通常也是 h-14 左右，与我们的 Toolbar 对齐)
                    // 或者显式设置高度 class
                    className="w-full"
                    classNames={{
                        trigger: "h-14 min-h-14 border-2 border-default-200 data-[hover=true]:border-default-400", // Force height to match toolbar
                        label: "text-[10px] font-medium text-default-500",
                        value: "text-small"
                    }}
                    items={entitySets.map(e => ({ key: e, label: e }))}
                >
                    {(item) => <SelectItem key={item.key} value={item.key}>{item.label}</SelectItem>}
                </Select>

                {/* 2. 组合工具栏：过滤 + 分页 + 计数 */}
                {/* 
                    这个组件内部高度设置为 h-14 (56px)，与上面的 Select 对齐。
                    边框样式也模拟了 Select variant="bordered"。
                */}
                <PaginationControls 
                    filter={filter}
                    onOpenFilter={() => setIsFilterModalOpen(true)}
                    onClearFilter={() => setFilter('')}
                    top={top} setTop={setTop}
                    skip={skip} setSkip={setSkip}
                    count={count} setCount={setCount}
                />
            </div>

            {/* --- 右侧配置面板 (排序, 字段, 展开) [col-span-9] --- */}
            {/* 使用 grid-cols-2 实现 2x2 布局: Row 1 (Sort), Row 2 (Select/Expand) */}
            <div className="md:col-span-9 grid grid-cols-1 md:grid-cols-2 gap-4 h-full content-start">
                
                {/* 3. 排序 ($orderby) - 自动占 2 个格子 (SortFields 内部有两个 Select) */}
                <SortFields 
                    currentSchema={currentSchema}
                    expandedProperties={expandedEntityProperties}
                    sortItems={sortItems}
                    setSortItems={setSortItems}
                />

                {/* 4. 字段选择 ($select) */}
                <SelectFields 
                    currentSchema={currentSchema}
                    expandedProperties={expandedEntityProperties}
                    select={select}
                    setSelect={setSelect}
                />

                {/* 5. 展开关联 ($expand) */}
                <ExpandSelect 
                    currentSchema={currentSchema}
                    schema={schema}
                    expand={expand}
                    setExpand={setExpand}
                />
            </div>
        </div>
    );
};