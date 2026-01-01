import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Button, Tabs, Tab, ScrollShadow, Textarea, Tooltip, Card, CardBody } from "@nextui-org/react";
import { EntityType } from '@/utils/odata-helper';
import { Calculator, Calendar, Type, FunctionSquare, Braces, Eraser, Check, Link2, GripHorizontal, X, Scaling } from 'lucide-react';
import { storage } from 'wxt/storage';

interface FilterBuilderModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentFilter: string;
    onApply: (filter: string) => void;
    currentSchema: EntityType | null;
    expandedProperties?: any[];
}

const STORAGE_KEY = 'sync:filter_builder_modal_geometry';

const OPERATORS = {
    comparison: [
        { label: '等于 (eq)', value: ' eq ' },
        { label: '不等于 (ne)', value: ' ne ' },
        { label: '大于 (gt)', value: ' gt ' },
        { label: '大于等于 (ge)', value: ' ge ' },
        { label: '小于 (lt)', value: ' lt ' },
        { label: '小于等于 (le)', value: ' le ' },
    ],
    logical: [
        { label: '并且 (and)', value: ' and ' },
        { label: '或者 (or)', value: ' or ' },
        { label: '非 (not)', value: 'not ' },
        { label: '括号 ( )', value: '(', isWrapper: true },
    ],
    arithmetic: [
        { label: '加 (add)', value: ' add ' },
        { label: '减 (sub)', value: ' sub ' },
        { label: '乘 (mul)', value: ' mul ' },
        { label: '除 (div)', value: ' div ' },
        { label: '取模 (mod)', value: ' mod ' },
    ]
};

const FUNCTIONS = {
    string: [
        { label: '包含 (substringof)', value: "substringof('value', Field)", desc: "判断 Field 是否包含 'value' (V2)" },
        { label: '包含 (contains)', value: "contains(Field, 'value')", desc: "判断 Field 是否包含 'value' (V4)" },
        { label: '以...结尾 (endswith)', value: "endswith(Field, 'value')" },
        { label: '以...开头 (startswith)', value: "startswith(Field, 'value')" },
        { label: '长度 (length)', value: "length(Field)" },
        { label: '索引位置 (indexof)', value: "indexof(Field, 'value')" },
        { label: '替换 (replace)', value: "replace(Field, 'find', 'replace')" },
        { label: '截取 (substring)', value: "substring(Field, 1)" },
        { label: '转小写 (tolower)', value: "tolower(Field)" },
        { label: '转大写 (toupper)', value: "toupper(Field)" },
        { label: '去空格 (trim)', value: "trim(Field)" },
        { label: '连接 (concat)', value: "concat(Field1, Field2)" },
    ],
    date: [
        { label: '年 (year)', value: "year(Field)" },
        { label: '月 (month)', value: "month(Field)" },
        { label: '日 (day)', value: "day(Field)" },
        { label: '时 (hour)', value: "hour(Field)" },
        { label: '分 (minute)', value: "minute(Field)" },
        { label: '秒 (second)', value: "second(Field)" },
    ],
    math: [
        { label: '四舍五入 (round)', value: "round(Field)" },
        { label: '向下取整 (floor)', value: "floor(Field)" },
        { label: '向上取整 (ceiling)', value: "ceiling(Field)" },
    ]
};

export const FilterBuilderModal: React.FC<FilterBuilderModalProps> = ({
    isOpen, onClose, currentFilter, onApply, currentSchema, expandedProperties = []
}) => {
    const [expression, setExpression] = useState(currentFilter || '');
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [selectedField, setSelectedField] = useState<string | null>(null);

    // --- Window State (Drag & Resize) ---
    const [geometry, setGeometry] = useState({ x: 100, y: 100, width: 900, height: 600 });
    const isDragging = useRef(false);
    const isResizing = useRef(false);
    const dragStart = useRef({ x: 0, y: 0, initialX: 0, initialY: 0 });
    const resizeStart = useRef({ x: 0, y: 0, initialW: 0, initialH: 0 });

    // Load initial geometry from storage
    useEffect(() => {
        storage.getItem(STORAGE_KEY).then((saved: any) => {
            if (saved && typeof saved === 'object') {
                setGeometry(saved);
            } else {
                // Default Center
                setGeometry({
                    x: Math.max(0, (window.innerWidth - 900) / 2),
                    y: Math.max(0, (window.innerHeight - 600) / 2),
                    width: 900,
                    height: 600
                });
            }
        });
    }, []);

    // Sync expression when opening
    useEffect(() => {
        if (isOpen) {
            setExpression(currentFilter || '');
            setSelectedField(null);
        }
    }, [isOpen, currentFilter]);

    // Save geometry on change (debounced slightly via logic)
    const saveGeometry = (geo: typeof geometry) => {
        setGeometry(geo);
        storage.setItem(STORAGE_KEY, geo);
    };

    // --- Drag & Resize Logic ---
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (isDragging.current) {
                const dx = e.clientX - dragStart.current.x;
                const dy = e.clientY - dragStart.current.y;
                setGeometry(prev => ({
                    ...prev,
                    x: dragStart.current.initialX + dx,
                    y: dragStart.current.initialY + dy
                }));
            }
            if (isResizing.current) {
                const dx = e.clientX - resizeStart.current.x;
                const dy = e.clientY - resizeStart.current.y;
                setGeometry(prev => ({
                    ...prev,
                    width: Math.max(600, resizeStart.current.initialW + dx),
                    height: Math.max(400, resizeStart.current.initialH + dy)
                }));
            }
        };

        const handleMouseUp = () => {
            if (isDragging.current || isResizing.current) {
                isDragging.current = false;
                isResizing.current = false;
                // Save final state to storage
                storage.setItem(STORAGE_KEY, geometry); 
            }
        };

        if (isOpen) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isOpen, geometry]); // geometry in dep array to ensure save gets latest? No, standard closure issue. Use ref or just save in setGeometry?
    // Optimization: saving to storage on every mouse move is bad. Save on MouseUp.
    // The handleMouseUp accesses 'geometry' state, so we need it in dependency or use a Ref for current geometry.
    // To simplify, I'm saving in handleMouseUp using the state updater callback or just relying on the fact that geometry updates trigger re-render and effect re-bind.

    const onMouseDownDrag = (e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('.no-drag')) return; // Prevent drag on buttons
        isDragging.current = true;
        dragStart.current = { x: e.clientX, y: e.clientY, initialX: geometry.x, initialY: geometry.y };
    };

    const onMouseDownResize = (e: React.MouseEvent) => {
        e.stopPropagation();
        isResizing.current = true;
        resizeStart.current = { x: e.clientX, y: e.clientY, initialW: geometry.width, initialH: geometry.height };
    };

    // --- Filter Logic ---

    const allProperties = useMemo(() => {
        const mainProps = currentSchema ? currentSchema.properties.map(p => ({
            ...p,
            isExpand: false,
            displayName: p.name
        })) : [];
        const extraProps = expandedProperties.map(p => ({
            ...p,
            isExpand: true,
            displayName: p.name
        }));
        return [...mainProps, ...extraProps];
    }, [currentSchema, expandedProperties]);

    const insertText = (text: string, isWrapper = false) => {
        const textarea = textareaRef.current;
        if (!textarea) {
            setExpression(prev => prev + text);
            return;
        }

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const currentVal = textarea.value;
        const selectedText = currentVal.substring(start, end);

        let newVal = '';
        let newCursorStart = 0;
        let newCursorEnd = 0;

        if (isWrapper && text === '(') {
            newVal = currentVal.substring(0, start) + `(${selectedText})` + currentVal.substring(end);
            if (selectedText.length === 0) {
                // If no selection, place cursor inside brackets: (|)
                newCursorStart = start + 1;
                newCursorEnd = start + 1;
            } else {
                // If selection exists, keep selection wrapped: (selected)
                newCursorStart = start + 1 + selectedText.length + 1;
                newCursorEnd = newCursorStart;
            }
        } else {
            newVal = currentVal.substring(0, start) + text + currentVal.substring(end);
            
            // Auto-select placeholder logic
            // Look for first quoted value e.g. 'value' or 'find' to select it
            // This is a simple heuristic: select the first string inside single quotes in the inserted text
            const quoteMatch = /'([^']+)'/.exec(text);
            if (quoteMatch) {
                // Found a placeholder like 'value'
                const matchIndex = text.indexOf(quoteMatch[0]); // Index of 'value' inside inserted text
                newCursorStart = start + matchIndex; // Start at opening quote
                newCursorEnd = start + matchIndex + quoteMatch[0].length; // End at closing quote (selects full 'value')
            } else {
                newCursorStart = start + text.length;
                newCursorEnd = start + text.length;
            }
        }

        setExpression(newVal);

        requestAnimationFrame(() => {
            if (textareaRef.current) {
                textareaRef.current.focus();
                textareaRef.current.setSelectionRange(newCursorStart, newCursorEnd);
            }
        });
    };

    const handleInsertFunction = (fnValue: string) => {
        if (selectedField) {
            const replaced = fnValue.replace(/\b(Field|Field1)\b/g, selectedField);
            insertText(replaced);
        } else {
            insertText(fnValue);
        }
    };

    if (!isOpen) return null;

    return (
        // Overlay (Backdrop)
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-start overflow-hidden">
            {/* Draggable Window */}
            <Card 
                className="fixed shadow-2xl border border-default-200 bg-background flex flex-col"
                style={{
                    left: geometry.x,
                    top: geometry.y,
                    width: geometry.width,
                    height: geometry.height,
                    maxWidth: '100vw',
                    maxHeight: '100vh',
                }}
            >
                {/* Header (Drag Handle) */}
                <div 
                    className="flex items-center justify-between px-4 py-2 border-b border-divider bg-content1 cursor-move select-none"
                    onMouseDown={onMouseDownDrag}
                >
                    <div className="flex items-center gap-2 font-bold text-small text-default-700">
                        <GripHorizontal size={16} className="text-default-400" />
                        <FunctionSquare size={16} className="text-primary" />
                        <span>过滤器构建器 ($filter Builder)</span>
                    </div>
                    <Button isIconOnly size="sm" variant="light" onPress={onClose} className="no-drag">
                        <X size={18} />
                    </Button>
                </div>

                <CardBody className="p-0 flex flex-col overflow-hidden bg-content2/50 relative">
                    <div className="flex-1 grid grid-cols-12 overflow-hidden h-full">
                        {/* Left Column: Field Selection */}
                        <div className="col-span-3 border-r border-divider bg-content1 flex flex-col h-full min-w-0">
                            <div className="p-2 text-xs font-bold text-default-500 bg-default-50 border-b border-divider uppercase tracking-wider">
                                实体属性 (Fields)
                            </div>
                            <ScrollShadow className="flex-1 p-2">
                                {allProperties.length > 0 ? (
                                    <div className="flex flex-col gap-1">
                                        {allProperties.map((prop) => {
                                            const isSelected = selectedField === prop.displayName;
                                            return (
                                                <div 
                                                    key={prop.displayName}
                                                    className={`
                                                        group flex flex-col p-2 rounded-md cursor-pointer transition-all border shrink-0
                                                        ${isSelected 
                                                            ? 'bg-primary text-primary-foreground border-primary shadow-sm' 
                                                            : 'bg-transparent hover:bg-default-100 border-transparent text-foreground'
                                                        }
                                                    `}
                                                    onClick={() => setSelectedField(prop.displayName)}
                                                    onDoubleClick={() => insertText(prop.displayName)}
                                                >
                                                    <div className="flex items-center justify-between gap-2 overflow-hidden">
                                                        {/* 这里的 overflow-x-auto 允许长名称横向滚动 */}
                                                        <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
                                                            {prop.isExpand && <Link2 size={10} className={`shrink-0 ${isSelected ? "text-primary-foreground/70" : "text-secondary"}`} />}
                                                            <span className="text-sm font-medium whitespace-nowrap" title={prop.displayName}>{prop.displayName}</span>
                                                        </div>
                                                        <span className={`text-[10px] font-mono px-1 rounded shrink-0 ${isSelected ? 'bg-white/20' : 'bg-default-100 text-default-400'}`}>
                                                            {prop.type.split('.').pop()}
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="p-4 text-center text-default-400 text-sm">无可用属性</div>
                                )}
                            </ScrollShadow>
                        </div>

                        {/* Middle Column: Operators */}
                        <div className="col-span-3 border-r border-divider bg-content1 flex flex-col h-full">
                            <div className="p-2 text-xs font-bold text-default-500 bg-default-50 border-b border-divider uppercase tracking-wider">
                                运算符 (Operators)
                            </div>
                            <ScrollShadow className="flex-1 p-2 flex flex-col gap-4">
                                <div>
                                    <div className="text-[10px] text-default-400 mb-1 px-1">逻辑运算</div>
                                    <div className="grid grid-cols-2 gap-1">
                                        {OPERATORS.logical.map(op => (
                                            <Button 
                                                key={op.label} size="sm" variant="flat" className="h-8 text-xs justify-start"
                                                onPress={() => insertText(op.value, op.isWrapper)}
                                            >
                                                {op.label}
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-[10px] text-default-400 mb-1 px-1">比较运算</div>
                                    <div className="grid grid-cols-2 gap-1">
                                        {OPERATORS.comparison.map(op => (
                                            <Button 
                                                key={op.label} size="sm" variant="flat" className="h-8 text-xs justify-start"
                                                onPress={() => insertText(op.value)}
                                            >
                                                {op.label}
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-[10px] text-default-400 mb-1 px-1">算数运算</div>
                                    <div className="grid grid-cols-2 gap-1">
                                        {OPERATORS.arithmetic.map(op => (
                                            <Button 
                                                key={op.label} size="sm" variant="flat" className="h-8 text-xs justify-start"
                                                onPress={() => insertText(op.value)}
                                            >
                                                {op.label}
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                            </ScrollShadow>
                        </div>

                        {/* Right Column: Functions */}
                        <div className="col-span-6 bg-content1 flex flex-col h-full min-w-0">
                            <div className="p-2 text-xs font-bold text-default-500 bg-default-50 border-b border-divider uppercase tracking-wider">
                                常用函数 (Functions)
                            </div>
                            <div className="flex-1 overflow-hidden flex flex-col">
                                <Tabs 
                                    aria-label="Function Types" 
                                    size="sm" 
                                    variant="underlined"
                                    color="primary"
                                    classNames={{
                                        tabList: "px-2 border-b border-divider w-full gap-4",
                                        cursor: "w-full",
                                        panel: "p-0 flex-1 overflow-hidden"
                                    }}
                                >
                                    {['string', 'date', 'math'].map(type => (
                                        <Tab 
                                            key={type} 
                                            title={
                                                <div className="flex items-center gap-1">
                                                    {type === 'string' ? <Type size={14}/> : type === 'date' ? <Calendar size={14}/> : <Calculator size={14}/>}
                                                    <span className="capitalize">{type === 'string' ? '字符串' : type === 'date' ? '日期' : '数学'}</span>
                                                </div>
                                            }
                                        >
                                            <ScrollShadow className="h-full p-2 grid grid-cols-2 gap-2 content-start">
                                                {(FUNCTIONS as any)[type].map((fn: any, idx: number) => (
                                                    <Tooltip key={idx} content={fn.desc || fn.value} delay={1000}>
                                                        <Button 
                                                            size="sm" variant="bordered" className="h-auto py-2 flex flex-col items-start gap-1 group hover:border-primary/50"
                                                            onPress={() => handleInsertFunction(fn.value)}
                                                        >
                                                            <span className="font-bold text-xs group-hover:text-primary transition-colors">{fn.label}</span>
                                                            <span className="text-[10px] text-default-400 font-mono truncate w-full text-left">
                                                                {selectedField 
                                                                    ? fn.value.replace(/\b(Field|Field1)\b/g, selectedField) 
                                                                    : fn.value
                                                                }
                                                            </span>
                                                        </Button>
                                                    </Tooltip>
                                                ))}
                                            </ScrollShadow>
                                        </Tab>
                                    ))}
                                </Tabs>
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="flex flex-col gap-2 border-t border-divider bg-content1 p-3 shrink-0">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-default-500 flex items-center gap-2">
                                <Braces size={14} /> 表达式预览
                            </span>
                            <Button size="sm" color="danger" variant="light" startContent={<Eraser size={14} />} onPress={() => setExpression('')}>
                                清空
                            </Button>
                        </div>
                        
                        <Textarea
                            ref={textareaRef}
                            value={expression}
                            onValueChange={setExpression}
                            minRows={3}
                            maxRows={5}
                            placeholder="点击上方按钮或在此输入 OData $filter 表达式..."
                            variant="faded"
                            classNames={{
                                input: "font-mono text-sm",
                                inputWrapper: "bg-content2"
                            }}
                        />
                        
                        <div className="flex justify-end gap-2 mt-2">
                            <Button variant="light" onPress={onClose}>
                                取消
                            </Button>
                            <Button color="primary" onPress={() => onApply(expression)} startContent={<Check size={16} />}>
                                应用过滤
                            </Button>
                        </div>
                    </div>

                    {/* Resize Handle */}
                    <div 
                        className="absolute bottom-1 right-1 cursor-se-resize text-default-400 hover:text-primary z-50 p-1"
                        onMouseDown={onMouseDownResize}
                    >
                        <Scaling size={16} />
                    </div>
                </CardBody>
            </Card>
        </div>
    );
};