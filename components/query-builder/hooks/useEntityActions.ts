import { useState, useCallback } from 'react';
import { useDisclosure } from "@nextui-org/react";
import { ODataVersion, ParsedSchema, EntityType, generateSAPUI5Code, generateCSharpDeleteCode, generateJavaDeleteCode } from '@/utils/odata-helper';
import { EntityContextTask, collectSelectedItemsWithContext, resolveItemUri } from '@/utils/odata-traversal';

interface ActionState {
    codePreview: string | { url: string, sapui5: string, csharp: string, java: string };
    modalAction: 'delete' | 'update' | 'create';
    itemsToProcess: EntityContextTask[];
}

export const useEntityActions = (
    url: string,
    version: ODataVersion,
    schema: ParsedSchema | null,
    selectedEntity: string,
    currentSchema: EntityType | null,
    refreshQuery: () => Promise<void>,
    setRawJsonResult: (val: string) => void,
    setRawXmlResult: (val: string) => void
) => {
    const { isOpen, onOpen, onOpenChange } = useDisclosure(); 
    const [state, setState] = useState<ActionState>({
        codePreview: '',
        modalAction: 'delete',
        itemsToProcess: []
    });
    const [isExecuting, setIsExecuting] = useState(false);

    // --- 准备阶段：收集数据并生成预览代码 ---
    
    // 1. 准备删除
    const prepareDelete = useCallback((rootData: any[]) => {
        // 使用工具类进行递归遍历
        const tasks = collectSelectedItemsWithContext(rootData, selectedEntity, currentSchema, schema);

        if (!tasks || tasks.length === 0) {
            alert("请先勾选需要删除的数据 (Please select rows to delete first)");
            return;
        }

        const predicates: string[] = [];
        const urlList: string[] = [];
        const baseUrl = url.endsWith('/') ? url : `${url}/`;

        // 生成 URL 列表
        tasks.forEach(task => {
            const { url: deleteUrl, predicate } = resolveItemUri(task.item, baseUrl, task.entitySet, task.entityType);
            
            if (deleteUrl) {
                urlList.push(`DELETE ${deleteUrl}`);
                predicates.push(predicate || '(Unknown Key)');
            } else {
                urlList.push(`// SKIP: Cannot determine URL for item in ${task.entitySet}`);
            }
        });

        // 生成多语言代码
        const codeSap = generateSAPUI5Code('delete', selectedEntity, { keyPredicates: predicates }, version);
        const codeCSharp = generateCSharpDeleteCode(selectedEntity, predicates, baseUrl, version);
        const codeJava = generateJavaDeleteCode(selectedEntity, predicates, version, baseUrl);

        setState({
            itemsToProcess: tasks,
            modalAction: 'delete',
            codePreview: {
                url: urlList.join('\n'),
                sapui5: codeSap,
                csharp: codeCSharp,
                java: codeJava
            }
        });
        onOpen();
    }, [url, version, schema, selectedEntity, currentSchema, onOpen]);

    // 2. 准备更新 (Placeholder for future implementation)
    const prepareUpdate = useCallback((rootData: any[]) => {
        // Logic similar to delete: collect items -> generate PATCH/PUT requests
        const tasks = collectSelectedItemsWithContext(rootData, selectedEntity, currentSchema, schema);
        if (!tasks || tasks.length === 0) {
            alert("请先勾选需要更新的数据");
            return;
        }
        
        // TODO: 这里可以进一步扩展，比如弹出一个简单的表单让用户输入要更新的字段
        // 目前仅生成一个占位符代码
        const urlList = tasks.map(t => {
            const { url: itemUrl } = resolveItemUri(t.item, url, t.entitySet, t.entityType);
            return `PATCH ${itemUrl} \n{ "Property": "NewValue" }`;
        });

        setState({
            itemsToProcess: tasks,
            modalAction: 'update',
            codePreview: {
                url: urlList.join('\n\n'),
                sapui5: "// SAPUI5 Update Code Placeholder",
                csharp: "// C# Update Code Placeholder",
                java: "// Java Update Code Placeholder"
            }
        });
        onOpen();
    }, [url, schema, selectedEntity, currentSchema, onOpen]);


    // --- 执行阶段：批量发送请求 ---
    const executeBatch = async () => {
        if (state.itemsToProcess.length === 0) return;
        setIsExecuting(true);

        const baseUrl = url.endsWith('/') ? url : `${url}/`;
        const results: string[] = [];
        let successCount = 0;

        for (const task of state.itemsToProcess) {
            const { url: requestUrl } = resolveItemUri(task.item, baseUrl, task.entitySet, task.entityType);
            
            if (!requestUrl) {
                results.push(`SKIP: Unable to determine URL`);
                continue;
            }

            try {
                const method = state.modalAction === 'delete' ? 'DELETE' : 'PATCH';
                // Note: Update requires a body, currently we assume it's just a demo or delete
                // For 'delete', body is null.
                const res = await fetch(requestUrl, { method });
                
                if (res.ok) {
                    results.push(`SUCCESS (${method}): ${requestUrl}`);
                    successCount++;
                } else {
                    results.push(`FAILED (${res.status}): ${requestUrl} - ${res.statusText}`);
                }
            } catch (e: any) {
                results.push(`ERROR: ${requestUrl} - ${e.message}`);
            }
        }

        setRawJsonResult(`// 批量操作报告 (Batch Operation Report):\n// 成功: ${successCount}, 失败: ${state.itemsToProcess.length - successCount}\n\n${results.join('\n')}`);
        setRawXmlResult(`<!-- Check JSON Tab for detailed report -->`);
        
        await refreshQuery(); // 刷新表格
        setIsExecuting(false);
        setState(prev => ({ ...prev, itemsToProcess: [] })); // 清空任务
    };

    return {
        isOpen,
        onOpenChange,
        codePreview: state.codePreview,
        modalAction: state.modalAction,
        prepareDelete,
        prepareUpdate, // 暴露更新方法
        executeBatch,
        isExecuting
    };
};