import { EntityType, ParsedSchema } from './odata-helper';

export interface EntityContextTask {
    item: any;
    entitySet: string | null;
    entityType: EntityType | null;
}

// 辅助：根据 Type 名称查找 EntitySet
export const findEntitySetByType = (schema: ParsedSchema | null, shortTypeName: string): string | null => {
    if (!schema) return null;
    // 忽略命名空间匹配
    const set = schema.entitySets.find(es => es.entityType.endsWith(`.${shortTypeName}`) || es.entityType === shortTypeName);
    return set ? set.name : null;
};

// 辅助：根据 Type 名称查找 EntityType 对象
export const findEntityTypeObj = (schema: ParsedSchema | null, shortTypeName: string): EntityType | null => {
    if (!schema) return null;
    return schema.entities.find(e => e.name === shortTypeName) || null;
};

// 核心：生成单条数据的唯一 Key 谓词字符串 (e.g. "(ID=1)")
export const getKeyPredicate = (item: any, entityType: EntityType | null): string | null => {
    let keys: string[] = [];
    
    // 1. 尝试从 Schema 获取 Key 定义
    if (entityType && entityType.keys.length > 0) {
        keys = entityType.keys;
    } 
    // 2. 尝试常见的 Key 字段名 (Fallback)
    else {
        const possibleKeys = ['ID', 'Id', 'id', 'Uuid', 'UUID', 'Guid', 'Key'];
        const found = possibleKeys.find(k => item[k] !== undefined);
        if (found) keys = [found];
    }

    if (keys.length === 0) return null;

    if (keys.length === 1) {
        const k = keys[0];
        const val = item[k];
        const formattedVal = typeof val === 'string' ? `'${val}'` : val;
        return `(${k}=${formattedVal})`;
    } else {
        // 复合主键
        const parts = keys.map(k => {
            const val = item[k];
            const formattedVal = typeof val === 'string' ? `'${val}'` : val;
            return `${k}=${formattedVal}`;
        });
        return `(${parts.join(',')})`;
    }
};

// 核心：递归遍历数据，收集所有被勾选的项 (__selected: true)
// 包含上下文感知 (EntitySet, EntityType)
export const collectSelectedItemsWithContext = (
    items: any[], 
    entitySet: string | null, 
    currentEntityType: EntityType | null,
    schema: ParsedSchema | null
): EntityContextTask[] => {
    let results: EntityContextTask[] = [];
    
    items.forEach(node => {
        // 0. 上下文自愈 (Context Self-Healing)
        // 如果上下文缺失，尝试从数据本身的 Metadata 中恢复
        let effectiveEntitySet = entitySet;
        let effectiveEntityType = currentEntityType;

        if ((!effectiveEntitySet || !effectiveEntityType) && typeof node === 'object' && node !== null) {
            let typeName: string | null = null;
            // V2/V3
            if (node.__metadata && node.__metadata.type) typeName = node.__metadata.type;
            // V4
            else if (node['@odata.type']) typeName = node['@odata.type'].replace(/^#/, '');

            if (typeName && schema) {
                const shortType = typeName.split('.').pop();
                if (shortType) {
                    if (!effectiveEntitySet) effectiveEntitySet = findEntitySetByType(schema, shortType);
                    if (!effectiveEntityType) effectiveEntityType = findEntityTypeObj(schema, shortType);
                }
            }
        }

        // 1. 如果当前节点被选中，加入结果集
        if (node['__selected'] === true) {
            results.push({ item: node, entitySet: effectiveEntitySet, entityType: effectiveEntityType });
        }
        
        // 2. 遍历子属性 (Robust Traversal)
        if (typeof node === 'object' && node !== null) {
            Object.entries(node).forEach(([key, val]) => {
                // 跳过系统字段
                if (key === '__metadata' || key === '__deferred' || key === '__selected') return;

                // 规范化数据 (处理 V2 results wrapper)
                let childrenData = val;
                if (childrenData && (childrenData as any).results && Array.isArray((childrenData as any).results)) {
                    childrenData = (childrenData as any).results;
                }

                const isArray = Array.isArray(childrenData);
                const isObject = typeof childrenData === 'object' && childrenData !== null;

                if (isArray || isObject) {
                     // 尝试解析子上下文
                     let childSet: string | null = null;
                     let childTypeObj: EntityType | null = null;

                     // 使用（可能已修复的）有效上下文来查找导航属性
                     if (effectiveEntityType) {
                         const nav = effectiveEntityType.navigationProperties.find(n => n.name === key);
                         if (nav) {
                             let targetType = nav.targetType;
                             if (targetType?.startsWith('Collection(')) targetType = targetType.slice(11, -1);
                             const shortType = targetType?.split('.').pop();
                             if (shortType) {
                                 childSet = findEntitySetByType(schema, shortType);
                                 childTypeObj = findEntityTypeObj(schema, shortType);
                             }
                         }
                     }

                     const itemsToRecurse = isArray ? (childrenData as any[]) : [childrenData];
                     
                     if (itemsToRecurse.length > 0) {
                         results = results.concat(collectSelectedItemsWithContext(itemsToRecurse, childSet, childTypeObj, schema));
                     }
                }
            });
        }
    });
    return results;
};

// 辅助：解析单条数据的操作 URL
export const resolveItemUri = (item: any, baseUrl: string, entitySet: string | null, entityType: EntityType | null): { url: string | null, predicate: string | null } => {
    let explicitUri: string | null = null;
    const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

    // A. 优先使用元数据中的 URI
    // V2 Metadata
    if (item.__metadata && item.__metadata.uri) {
        explicitUri = item.__metadata.uri;
    }
    // V4 Context/ID
    else if (item['@odata.id']) {
        explicitUri = item['@odata.id'];
        if (explicitUri && !explicitUri.startsWith('http')) {
            explicitUri = `${cleanBaseUrl.replace(/\/$/, '')}/${explicitUri.replace(/^\//, '')}`;
        }
    }
    else if (item['@odata.editLink']) {
        explicitUri = item['@odata.editLink'];
         if (explicitUri && !explicitUri.startsWith('http')) {
            explicitUri = `${cleanBaseUrl.replace(/\/$/, '')}/${explicitUri.replace(/^\//, '')}`;
        }
    }

    if (explicitUri) {
         const match = explicitUri.match(/\/([^\/]+\(.+\))$/);
         const predicate = match ? match[1] : '(From URI)';
         return { url: explicitUri, predicate };
    } 
    
    // B. 回退：手动构建 URL
    if (entitySet) {
        const pred = getKeyPredicate(item, entityType);
        if (pred) {
            return { url: `${cleanBaseUrl}${entitySet}${pred}`, predicate: pred };
        }
    }

    return { url: null, predicate: null };
};