import React, { useState, useMemo, useEffect } from 'react';
import { Select, SelectItem, Selection } from "@nextui-org/react";
import { ChevronRight, ChevronDown } from 'lucide-react';
import { EntityType, ParsedSchema } from '@/utils/odata-helper';

interface ExpandSelectProps {
    currentSchema: EntityType | null;
    schema: ParsedSchema | null;
    expand: string;
    setExpand: (val: string) => void;
}

export const ExpandSelect: React.FC<ExpandSelectProps> = ({
    currentSchema,
    schema,
    expand,
    setExpand
}) => {
    // 本地状态：控制下拉框中哪些节点是"视觉上"展开的 (用于查看下级)
    const [treeExpandedKeys, setTreeExpandedKeys] = useState<Set<string>>(new Set());

    // 当主实体变化时 (currentSchema 变化), 重置视觉展开状态
    useEffect(() => {
        setTreeExpandedKeys(new Set());
    }, [currentSchema?.name]);

    const toggleTreeExpand = (path: string) => {
        setTreeExpandedKeys(prev => {
            const next = new Set(prev);
            if (next.has(path)) next.delete(path);
            else next.add(path);
            return next;
        });
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
    }, [currentSchema, schema, treeExpandedKeys]);

    const currentExpandKeys = useMemo(() => {
        return new Set(expand ? expand.split(',') : []);
    }, [expand]);

    const handleExpandChange = (keys: Selection) => {
        const newSet = new Set(keys);
        if (newSet.has('none')) newSet.delete('none');
        setExpand(Array.from(newSet).join(','));
    };

    const commonClassNames = {
        trigger: "h-14 min-h-14 border-2 border-default-200 data-[hover=true]:border-default-400",
        label: "text-[10px] font-medium text-default-500",
        value: "text-small"
    };

    if (!currentSchema) {
        return <Select isDisabled label="展开 ($expand)" placeholder="需先选择实体" variant="bordered" classNames={commonClassNames}><SelectItem key="placeholder">Placeholder</SelectItem></Select>;
    }

    return (
        <Select
            label="展开 ($expand)"
            placeholder="选择关联实体"
            selectionMode="multiple"
            selectedKeys={currentExpandKeys}
            onSelectionChange={handleExpandChange}
            variant="bordered"
            classNames={commonClassNames}
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
    );
};