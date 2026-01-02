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
    itemsToProcess: (EntityContextTask & { changes?: any })[]; 
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

    // --- 辅助：构建 Update Payload ---
    const buildUpdatePayload = (originalItem: any, changes: any, version: ODataVersion, schema: ParsedSchema | null, entityType: EntityType | null) => {
        // 1. 深拷贝 changes，避免修改原始引用
        const payload = JSON.parse(JSON.stringify(changes));

        // 2. 清理可能存在的系统字段 (防止误传)
        delete payload.__metadata;
        delete payload.__deferred;
        delete payload.__selected;
        delete payload['@odata.context'];
        delete payload['@odata.etag'];

        // 3. 注入类型信息 (根据版本)
        if (version === 'V4') {
            // --- OData V4 ---
            // 优先使用原数据中的 @odata.type
            let typeName = originalItem['@odata.type'];
            // 兜底：从 Schema 推断
            if (!typeName && schema && entityType) {
                // V4 格式通常是 "#Namespace.TypeName"
                typeName = schema.namespace ? `#${schema.namespace}.${entityType.name}` : `#${entityType.name}`;
            }
            if (typeName) {
                payload['@odata.type'] = typeName;
            }
        } else {
            // --- OData V2 / V3 ---
            // 必须使用 __metadata: { type: "..." }
            let typeName = originalItem.__metadata?.type;
            
            // 兜底：从 Schema 推断
            if (!typeName && schema && entityType) {
                typeName = schema.namespace ? `${schema.namespace}.${entityType.name}` : entityType.name;
            }

            if (typeName) {
                // 仅注入 type，不要带 uri 等其他 metadata，防止服务端校验失败
                payload.__metadata = { type: typeName };
            }
        }

        return payload;
    };

    // --- 1. 准备删除 ---
    const prepareDelete = useCallback((rootData: any[]) => {
        const tasks = collectSelectedItemsWithContext(rootData, selectedEntity, currentSchema, schema);

        if (!tasks || tasks.length === 0) {
            alert("请先勾选需要删除的数据 (Please select rows to delete first)");
            return;
        }

        const predicates: string[] = [];
        const urlList: string[] = [];
        const baseUrl = url.endsWith('/') ? url : `${url}/`;

        tasks.forEach(task => {
            const { url: deleteUrl, predicate } = resolveItemUri(task.item, baseUrl, task.entitySet, task.entityType);
            if (deleteUrl) {
                urlList.push(`DELETE ${deleteUrl}`);
                predicates.push(predicate || '(Unknown Key)');
            } else {
                urlList.push(`// SKIP: Cannot determine URL for item in ${task.entitySet}`);
            }
        });

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

    // --- 2. 准备更新 ---
    const prepareUpdate = useCallback((updates: { item: any, changes: any }[]) => {
        if (!updates || updates.length === 0) {
            alert("请先修改数据 (Please modify data first)");
            return;
        }

        const baseUrl = url.endsWith('/') ? url : `${url}/`;
        const urlList: string[] = [];
        const sapUpdates: any[] = [];
        const csUpdates: any[] = [];

        // 转换为任务对象
        const tasks: (EntityContextTask & { changes?: any })[] = updates.map(u => {
            // 推断上下文
            // 如果是在嵌套表格中修改，currentSchema 可能不是该 item 的 schema。
            // 但 collectSelectedItemsWithContext 的逻辑比较复杂，这里简化处理：
            // 我们假设 updates 传回来的 item 自身包含足够的元数据来恢复上下文，或者它就是 currentSchema 类型
            
            // 实际上，我们应该重新解析一下 item 的类型，为了简单起见，这里复用 resolveItemUri 的逻辑
            // 如果是 V3，我们在这里就构建好 Payload，以便预览看到的是最终发送的样子
            const payload = buildUpdatePayload(u.item, u.changes, version, schema, currentSchema);
            
            return {
                item: u.item,
                changes: payload,
                entitySet: selectedEntity, // 默认上下文，后续会尝试自愈
                entityType: currentSchema
            };
        });

        tasks.forEach(task => {
            // 尝试获取准确 URL
            let { url: requestUrl, predicate } = resolveItemUri(task.item, baseUrl, null, null);
            if (!requestUrl) {
                // 回退到当前选中的实体集
                const fallback = resolveItemUri(task.item, baseUrl, selectedEntity, currentSchema);
                requestUrl = fallback.url;
                predicate = fallback.predicate;
            }

            if (requestUrl) {
                // 预览信息
                let headerInfo = "";
                if (version === 'V3') headerInfo = "Content-Type: application/json;odata=verbose\nDataServiceVersion: 3.0";
                else if (version === 'V4') headerInfo = "Content-Type: application/json\nOData-Version: 4.0";
                else headerInfo = "Content-Type: application/json\nDataServiceVersion: 2.0";

                urlList.push(`PATCH ${requestUrl}\n${headerInfo}\n\n${JSON.stringify(task.changes, null, 2)}`);
                
                if (predicate) {
                    sapUpdates.push({ predicate: predicate, changes: task.changes });
                    csUpdates.push({ predicate: predicate, changes: task.changes });
                }
            } else {
                urlList.push(`// SKIP: Cannot determine URL for item (Missing Key/Metadata)`);
            }
        });

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
        
        onOpen();

    }, [url, version, selectedEntity, currentSchema, schema, onOpen]);


    // --- 3. 执行批量请求 ---
    const executeBatch = async () => {
        if (state.itemsToProcess.length === 0) return;
        setIsExecuting(true);

        const baseUrl = url.endsWith('/') ? url : `${url}/`;
        const results: string[] = [];
        let successCount = 0;

        for (const task of state.itemsToProcess) {
            let { url: requestUrl } = resolveItemUri(task.item, baseUrl, task.entitySet, task.entityType);
            if (!requestUrl) {
                 requestUrl = resolveItemUri(task.item, baseUrl, selectedEntity, currentSchema).url;
            }
            
            if (!requestUrl) {
                results.push(`SKIP: Unable to determine URL for item`);
                continue;
            }

            try {
                const isDelete = state.modalAction === 'delete';
                // V2 传统上使用 MERGE，但现代 V2 和 V3/V4 都支持 PATCH。
                // 这里的 PATCH 是标准选择。
                const method = isDelete ? 'DELETE' : 'PATCH'; 
                
                const headers: Record<string, string> = {
                    'Accept': 'application/json'
                };

                // --- 严格的版本控制 Header 注入 ---
                if (version === 'V4') {
                    // OData V4
                    headers['OData-Version'] = '4.0';
                    headers['OData-MaxVersion'] = '4.0';
                    headers['Content-Type'] = 'application/json'; // V4 默认 JSON
                } else if (version === 'V3') {
                    // OData V3
                    // 修复报错: "DataServiceVersion '2.0' is too low..."
                    headers['DataServiceVersion'] = '3.0'; 
                    headers['MaxDataServiceVersion'] = '3.0';
                    // 修复报错: "Type information must be specified..." (必须用 verbose 才能识别 __metadata)
                    headers['Content-Type'] = isDelete ? 'application/json' : 'application/json;odata=verbose';
                    headers['Accept'] = 'application/json;odata=verbose';
                } else {
                    // OData V2
                    headers['DataServiceVersion'] = '2.0'; 
                    headers['MaxDataServiceVersion'] = '2.0'; // 有些服务接受 3.0
                    headers['Content-Type'] = 'application/json';
                }
                
                const fetchOptions: RequestInit = {
                    method: method,
                    headers: headers
                };

                if (!isDelete && task.changes) {
                    fetchOptions.body = JSON.stringify(task.changes);
                }

                const res = await fetch(requestUrl, fetchOptions);
                
                if (res.ok || res.status === 204) {
                    results.push(`SUCCESS (${method}): ${requestUrl}`);
                    successCount++;
                } else {
                    const errText = await res.text();
                    let errDisplay = errText.substring(0, 300);
                    try {
                         // 尝试美化 JSON 错误
                         const jsonErr = JSON.parse(errText);
                         errDisplay = JSON.stringify(jsonErr, null, 2);
                    } catch(e) {}
                    results.push(`FAILED (${res.status}): ${requestUrl}\nResponse: ${errDisplay}`);
                }
            } catch (e: any) {
                results.push(`ERROR: ${requestUrl} - ${e.message}`);
            }
        }

        setRawJsonResult(`// 批量操作报告 (Batch Operation Report):\n// 成功: ${successCount}, 失败: ${state.itemsToProcess.length - successCount}\n\n${results.join('\n')}`);
        
        await refreshQuery(); 
        
        setIsExecuting(false);
        setState(prev => ({ ...prev, itemsToProcess: [] }));
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