import { useState, useCallback } from 'react';
import { useDisclosure } from "@nextui-org/react";
import { 
    ODataVersion, ParsedSchema, EntityType, 
    generateSAPUI5Code, generateCSharpDeleteCode, generateJavaDeleteCode,
    generateCSharpUpdateCode, generateJavaUpdateCode 
} from '@/utils/odata-helper';
import { EntityContextTask, collectSelectedItemsWithContext, resolveItemUri } from '@/utils/odata-traversal';

interface ActionState {
    codePreview: string | { url: string, sapui5: string, csharp: string, java: string };
    modalAction: 'delete' | 'update' | 'create';
    itemsToProcess: (EntityContextTask & { changes?: any })[]; // Extended to hold changes
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

    // 2. 准备更新
    const prepareUpdate = useCallback((updates: { item: any, changes: any }[]) => {
        if (!updates || updates.length === 0) {
            alert("请先修改数据 (Please modify data first)");
            return;
        }

        const baseUrl = url.endsWith('/') ? url : `${url}/`;
        const urlList: string[] = [];
        const sapUpdates: any[] = [];
        const csUpdates: any[] = [];

        // 将 Update 数据转换为处理任务，并注入类型信息
        const tasks: (EntityContextTask & { changes?: any })[] = updates.map(u => {
            // 复制变更数据
            const payload = { ...u.changes };

            // --- 关键修复：注入类型信息 ---
            // 解决 "Type information must be specified" 错误
            // 我们必须确保 payload 中包含类型元数据，且 Content-Type 设置为 verbose (见 executeBatch)
            if (version !== 'V4') {
                let typeName = u.item.__metadata?.type;

                // 兜底策略：如果数据中没有 metadata（因为之前没用 verbose 查询），
                // 尝试根据当前 Schema 拼接类型名称：Namespace.EntityName
                if (!typeName && schema && currentSchema) {
                    typeName = schema.namespace ? `${schema.namespace}.${currentSchema.name}` : currentSchema.name;
                }

                if (typeName) {
                    payload.__metadata = { type: typeName };
                }
            } 
            // OData V4 需要 @odata.type
            else {
                let typeName = u.item['@odata.type'];
                if (!typeName && schema && currentSchema) {
                     typeName = schema.namespace ? `#${schema.namespace}.${currentSchema.name}` : `#${currentSchema.name}`;
                }
                if (typeName) {
                    payload['@odata.type'] = typeName;
                }
            }

            return {
                item: u.item,
                changes: payload, // 使用带有类型信息的 Payload
                // 尝试推断 EntitySet，如果没有 Metadata，默认使用 selectedEntity (如果是Root)
                entitySet: selectedEntity, 
                entityType: currentSchema
            };
        });

        tasks.forEach(task => {
            // resolveItemUri 会尝试从 __metadata 或 @odata.id 恢复正确的 Context
            const { url: requestUrl, predicate } = resolveItemUri(task.item, baseUrl, null, null);

            // 如果无法从 Item 自身解析，尝试使用传入的 selectedEntity (仅适用于 Root 表)
            const finalUrl = requestUrl || resolveItemUri(task.item, baseUrl, selectedEntity, currentSchema).url;
            const finalPredicate = predicate || resolveItemUri(task.item, baseUrl, selectedEntity, currentSchema).predicate;

            if (finalUrl && finalPredicate) {
                // 在预览中显示，注意这里是 Patch 请求体预览
                urlList.push(`PATCH ${finalUrl}\nContent-Type: application/json;odata=verbose\n\n${JSON.stringify(task.changes, null, 2)}`);
                sapUpdates.push({ predicate: finalPredicate, changes: task.changes });
                csUpdates.push({ predicate: finalPredicate, changes: task.changes });
            } else {
                urlList.push(`// SKIP: Cannot determine URL for item. Missing Metadata or Key.`);
            }
        });

        // 生成代码
        const codeSap = generateSAPUI5Code('update', selectedEntity, { updates: sapUpdates }, version);
        const codeCSharp = generateCSharpUpdateCode(selectedEntity, csUpdates, baseUrl, version);
        const codeJava = generateJavaUpdateCode(selectedEntity, csUpdates, version, baseUrl);

        setState({
            itemsToProcess: tasks,
            modalAction: 'update',
            codePreview: {
                url: urlList.join('\n\n'),
                sapui5: codeSap,
                csharp: codeCSharp,
                java: codeJava
            }
        });
        
        // 确保打开模态框
        onOpen();

    }, [url, version, selectedEntity, currentSchema, schema, onOpen]);


    // --- 执行阶段：批量发送请求 ---
    const executeBatch = async () => {
        if (state.itemsToProcess.length === 0) return;
        setIsExecuting(true);

        const baseUrl = url.endsWith('/') ? url : `${url}/`;
        const results: string[] = [];
        let successCount = 0;

        for (const task of state.itemsToProcess) {
            // Re-resolve URL just to be safe
            let { url: requestUrl } = resolveItemUri(task.item, baseUrl, task.entitySet, task.entityType);
            
            // Fallback for root items if metadata missing
            if (!requestUrl) {
                 requestUrl = resolveItemUri(task.item, baseUrl, selectedEntity, currentSchema).url;
            }
            
            if (!requestUrl) {
                results.push(`SKIP: Unable to determine URL for item`);
                continue;
            }

            try {
                const isDelete = state.modalAction === 'delete';
                const method = isDelete ? 'DELETE' : 'PATCH'; 
                
                // Construct Headers
                const headers: Record<string, string> = {
                    'Accept': 'application/json'
                };

                // Add Version & Content-Type Headers (Critical for OData)
                if (version === 'V4') {
                    headers['Content-Type'] = 'application/json';
                    headers['OData-Version'] = '4.0';
                    headers['OData-MaxVersion'] = '4.0';
                } else {
                    // V2/V3 Logic
                    if (version === 'V3') {
                        // CRITICAL FIX: Use verbose JSON for V3 updates to ensure __metadata is processed
                        // Standard 'application/json' in V3 defaults to Light, which ignores __metadata
                        headers['Content-Type'] = isDelete ? 'application/json' : 'application/json;odata=verbose';
                        
                        // Explicitly set 3.0 as requested by server error
                        headers['DataServiceVersion'] = '3.0'; 
                        headers['MaxDataServiceVersion'] = '3.0';
                        
                        // Use Verbose Accept for V3 to get consistent responses
                        headers['Accept'] = 'application/json;odata=verbose';
                    } else {
                        // V2 (or Unknown)
                        headers['Content-Type'] = 'application/json';
                        headers['DataServiceVersion'] = '2.0'; 
                        headers['MaxDataServiceVersion'] = '3.0'; 
                    }
                }
                
                const fetchOptions: RequestInit = {
                    method: method,
                    headers: headers
                };

                if (!isDelete && task.changes) {
                    fetchOptions.body = JSON.stringify(task.changes);
                }

                const res = await fetch(requestUrl, fetchOptions);
                
                // 204 No Content is common for OData updates
                if (res.ok || res.status === 204) {
                    results.push(`SUCCESS (${method}): ${requestUrl}`);
                    successCount++;
                } else {
                    const errText = await res.text();
                    results.push(`FAILED (${res.status}): ${requestUrl} - ${errText.substring(0, 200)}...`);
                }
            } catch (e: any) {
                results.push(`ERROR: ${requestUrl} - ${e.message}`);
            }
        }

        setRawJsonResult(`// 批量操作报告 (Batch Operation Report):\n// 成功: ${successCount}, 失败: ${state.itemsToProcess.length - successCount}\n\n${results.join('\n')}`);
        
        // 操作后刷新
        await refreshQuery(); 
        
        setIsExecuting(false);
        setState(prev => ({ ...prev, itemsToProcess: [] })); // 清空任务
    };

    return {
        isOpen,
        onOpenChange,
        codePreview: state.codePreview,
        modalAction: state.modalAction,
        prepareDelete,
        prepareUpdate, 
        executeBatch,
        isExecuting
    };
};