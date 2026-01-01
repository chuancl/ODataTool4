import React, { useState, useRef, useEffect } from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Tabs, Tab, Listbox, ListboxItem, ScrollShadow, Textarea, Chip, Tooltip } from "@nextui-org/react";
import { EntityType } from '@/utils/odata-helper';
import { Calculator, Calendar, Type, FunctionSquare, Braces, MousePointerClick, Eraser, Check } from 'lucide-react';

interface FilterBuilderModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentFilter: string;
    onApply: (filter: string) => void;
    currentSchema: EntityType | null;
}

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
        { label: '包含 (substringof)', value: "substringof('value', Field)", desc: "判断字段是否包含某值 (V2)" },
        { label: '包含 (contains)', value: "contains(Field, 'value')", desc: "判断字段是否包含某值 (V4)" },
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
    isOpen, onClose, currentFilter, onApply, currentSchema
}) => {
    const [expression, setExpression] = useState(currentFilter || '');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Sync expression when modal opens
    useEffect(() => {
        if (isOpen) {
            setExpression(currentFilter || '');
        }
    }, [isOpen, currentFilter]);

    // Helper to insert text at cursor position
    const insertText = (text: string, isWrapper = false) => {
        const textarea = textareaRef.current;
        if (!textarea) {
            setExpression(prev => prev + text);
            return;
        }

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const currentVal = textarea.value;

        let newVal = '';
        let newCursorPos = 0;

        if (isWrapper && text === '(') {
            // Special handling for wrapper like parentheses around selection
            const selectedText = currentVal.substring(start, end);
            newVal = currentVal.substring(0, start) + `(${selectedText})` + currentVal.substring(end);
            newCursorPos = start + 1 + selectedText.length + 1;
        } else {
            newVal = currentVal.substring(0, start) + text + currentVal.substring(end);
            newCursorPos = start + text.length;
        }

        setExpression(newVal);

        // Need to set selection after render
        requestAnimationFrame(() => {
            if (textareaRef.current) {
                textareaRef.current.focus();
                textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
            }
        });
    };

    const handleApply = () => {
        onApply(expression);
        onClose();
    };

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            size="4xl" 
            scrollBehavior="inside"
            classNames={{
                body: "p-0",
            }}
        >
            <ModalContent>
                {(onClose) => (
                    <>
                        <ModalHeader className="flex flex-col gap-1 bg-content1 border-b border-divider">
                            <span className="flex items-center gap-2">
                                <FunctionSquare className="text-primary" />
                                过滤器构建器 ($filter Builder)
                            </span>
                            <span className="text-tiny text-default-400 font-normal">
                                通过点击下方元素构建 OData 筛选条件。支持手动编辑。
                            </span>
                        </ModalHeader>
                        
                        <ModalBody className="grid grid-cols-12 h-[500px] overflow-hidden bg-content2/50">
                            {/* Left Column: Field Selection */}
                            <div className="col-span-3 border-r border-divider bg-content1 flex flex-col h-full">
                                <div className="p-2 text-xs font-bold text-default-500 bg-default-50 border-b border-divider uppercase tracking-wider">
                                    实体属性 (Fields)
                                </div>
                                <ScrollShadow className="flex-1 p-2">
                                    {currentSchema ? (
                                        <div className="flex flex-col gap-1">
                                            {currentSchema.properties.map((prop) => (
                                                <div 
                                                    key={prop.name}
                                                    className="group flex flex-col p-2 rounded-md hover:bg-primary/10 cursor-pointer transition-colors border border-transparent hover:border-primary/20"
                                                    onClick={() => insertText(prop.name)}
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-sm font-medium text-foreground">{prop.name}</span>
                                                        <span className="text-[10px] text-primary font-mono bg-primary/10 px-1 rounded">{prop.type.split('.').pop()}</span>
                                                    </div>
                                                </div>
                                            ))}
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
                                    
                                    {/* Logical */}
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

                                    {/* Comparison */}
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

                                    {/* Arithmetic */}
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
                                    
                                    <div className="bg-warning/10 p-2 rounded text-[10px] text-warning-700">
                                        提示: OData 字符串需要使用单引号包围，例如 'Text'。
                                    </div>
                                </ScrollShadow>
                            </div>

                            {/* Right Column: Functions */}
                            <div className="col-span-6 bg-content1 flex flex-col h-full">
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
                                        <Tab key="string" title={<div className="flex items-center gap-1"><Type size={14}/><span>字符串</span></div>}>
                                            <ScrollShadow className="h-full p-2 grid grid-cols-2 gap-2 content-start">
                                                {FUNCTIONS.string.map((fn, idx) => (
                                                    <Tooltip key={idx} content={fn.desc || fn.value} delay={1000}>
                                                        <Button 
                                                            size="sm" variant="bordered" className="h-auto py-2 flex flex-col items-start gap-1"
                                                            onPress={() => insertText(fn.value)}
                                                        >
                                                            <span className="font-bold text-xs">{fn.label}</span>
                                                            <span className="text-[10px] text-default-400 font-mono truncate w-full text-left">{fn.value}</span>
                                                        </Button>
                                                    </Tooltip>
                                                ))}
                                            </ScrollShadow>
                                        </Tab>
                                        <Tab key="date" title={<div className="flex items-center gap-1"><Calendar size={14}/><span>日期时间</span></div>}>
                                            <ScrollShadow className="h-full p-2 grid grid-cols-2 gap-2 content-start">
                                                {FUNCTIONS.date.map((fn, idx) => (
                                                    <Button 
                                                        key={idx} size="sm" variant="bordered" className="h-auto py-2 flex flex-col items-start gap-1"
                                                        onPress={() => insertText(fn.value)}
                                                    >
                                                        <span className="font-bold text-xs">{fn.label}</span>
                                                        <span className="text-[10px] text-default-400 font-mono">{fn.value}</span>
                                                    </Button>
                                                ))}
                                            </ScrollShadow>
                                        </Tab>
                                        <Tab key="math" title={<div className="flex items-center gap-1"><Calculator size={14}/><span>数学</span></div>}>
                                            <ScrollShadow className="h-full p-2 grid grid-cols-2 gap-2 content-start">
                                                {FUNCTIONS.math.map((fn, idx) => (
                                                    <Button 
                                                        key={idx} size="sm" variant="bordered" className="h-auto py-2 flex flex-col items-start gap-1"
                                                        onPress={() => insertText(fn.value)}
                                                    >
                                                        <span className="font-bold text-xs">{fn.label}</span>
                                                        <span className="text-[10px] text-default-400 font-mono">{fn.value}</span>
                                                    </Button>
                                                ))}
                                            </ScrollShadow>
                                        </Tab>
                                    </Tabs>
                                </div>
                            </div>
                        </ModalBody>
                        
                        <ModalFooter className="flex-col items-stretch gap-2 border-t border-divider bg-content1 pb-4">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-default-500 flex items-center gap-2">
                                    <Braces size={14} /> 表达式预览 (Expression Preview)
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
                                <Button color="primary" onPress={handleApply} startContent={<Check size={16} />}>
                                    应用过滤
                                </Button>
                            </div>
                        </ModalFooter>
                    </>
                )}
            </ModalContent>
        </Modal>
    );
};
