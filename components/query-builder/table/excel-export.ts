import * as XLSX from 'xlsx';
import { isExpandableData } from './utils';

// 定义简单的 Toast 接口，避免循环依赖
interface Toast {
    success: (msg: string) => void;
    error: (msg: string) => void;
    info: (msg: string) => void;
    warning: (msg: string) => void;
}

const getEntityNameFromData = (data: any[]): string | null => {
    if (!data || data.length === 0) return null;
    const first = data[0];
    // V2
    if (first.__metadata?.type) {
        return first.__metadata.type.split('.').pop() || null;
    }
    // V4
    if (first['@odata.type']) {
        return first['@odata.type'].replace('#', '').split('.').pop() || null;
    }
    return null;
};

const isRowSelected = (row: any) => {
    return row['__selected'] === true;
};

// 递归检查当前节点或其子节点是否有被勾选的项
const hasDeepSelection = (data: any): boolean => {
    if (!data) return false;
    
    // 数组：检查任意元素
    if (Array.isArray(data)) {
        return data.some(hasDeepSelection);
    }
    
    // V2 { results: ... } 包装器
    if (typeof data === 'object' && data.results && Array.isArray(data.results)) {
        return data.results.some(hasDeepSelection);
    }

    // 对象：检查自身或属性
    if (typeof data === 'object') {
        // 1. 自身被勾选
        if (data['__selected'] === true) return true;
        
        // 2. 检查子属性 (Navigation Properties)
        return Object.entries(data).some(([key, val]) => {
            if (key === '__metadata' || key === '__deferred' || key === '__selected') return false;
            // 只有可展开的数据才可能包含子选中项
            if (isExpandableData(val)) {
                return hasDeepSelection(val);
            }
            return false;
        });
    }
    
    return false;
};

export const exportToExcel = (allRootData: any[], defaultRootName: string = 'Main', toast?: Toast) => {
    // 1. 过滤：保留 "自身被勾选" 或 "包含被勾选子项" 的根节点
    // 这样即使父级没勾选，只要子级勾选了，也能进入处理队列
    const rootsToProcess = allRootData.filter(hasDeepSelection);

    if (rootsToProcess.length === 0) {
        const msg = "没有勾选要导出的数据 (No selected data to export)";
        if (toast) toast.warning(msg);
        else console.warn(msg);
        return;
    }

    const wb = XLSX.utils.book_new();
    let globalIdCounter = 1;

    const sheetsMap: Map<string, any[]> = new Map();

    // 确定根 Sheet 名称
    let rootSheetName = defaultRootName;
    const detectedRoot = getEntityNameFromData(rootsToProcess);
    if (detectedRoot) rootSheetName = detectedRoot;

    // 队列任务：处理这批数据，将选中的行写入 sheetName
    const queue = [{ 
        data: rootsToProcess, 
        sheetName: rootSheetName, 
        parentIds: new Array(rootsToProcess.length).fill(null) 
    }];

    while (queue.length > 0) {
        const { data, sheetName, parentIds } = queue.shift()!;
        
        if (data.length === 0) continue;

        if (!sheetsMap.has(sheetName)) {
            sheetsMap.set(sheetName, []);
        }
        const currentSheetRows = sheetsMap.get(sheetName)!;

        // 下一层任务暂存
        const nextLevelTasks: Map<string, { rows: any[], parentIds: any[] }> = new Map();

        data.forEach((row, idx) => {
            const isSelfSelected = isRowSelected(row);
            const flatRow: any = {};
            const myId = globalIdCounter++; 
            
            // 遍历属性：同时负责 "构建当前行数据" 和 "发现子任务"
            Object.entries(row).forEach(([key, val]) => {
                if (key === '__metadata' || key === '__deferred' || key === '__selected') return;

                if (isExpandableData(val)) {
                    // === 处理嵌套/关联数据 ===
                    
                    // 标准化为数组，统一处理 1:N (Array) 和 1:1 (Object)
                    let childDataArray: any[] = [];
                    if (Array.isArray(val)) {
                        childDataArray = val;
                    } else if (val && Array.isArray((val as any).results)) {
                        childDataArray = (val as any).results;
                    } else if (val && typeof val === 'object') {
                        // 1:1 关系：作为单元素数组处理，以便放入独立 Sheet
                        childDataArray = [val];
                    }

                    // 筛选：只保留 "自身勾选" 或 "有勾选子项" 的子节点进行递归
                    const itemsToTraverse = childDataArray.filter(hasDeepSelection);

                    if (itemsToTraverse.length > 0) {
                        // 确定子 Sheet 名称
                        let childSheetName = key; 
                        const detectedChildEntity = getEntityNameFromData(itemsToTraverse);
                        if (detectedChildEntity) childSheetName = detectedChildEntity; 

                        // 加入下一层队列
                        if (!nextLevelTasks.has(childSheetName)) {
                            nextLevelTasks.set(childSheetName, { rows: [], parentIds: [] });
                        }
                        const task = nextLevelTasks.get(childSheetName)!;
                        
                        task.rows.push(...itemsToTraverse);
                        itemsToTraverse.forEach(() => task.parentIds.push(myId));

                        // 如果当前行要导出，写入链接标记
                        if (isSelfSelected) {
                            flatRow[key] = `[Sheet: ${childSheetName}]`;
                        }
                    } else if (isSelfSelected && childDataArray.length > 0) {
                         // 有数据但没勾选任何项
                         flatRow[key] = `[0 Selected]`;
                    }
                } else {
                    // === 处理基本类型 ===
                    // 只有当前行被勾选时，才收集属性值
                    if (isSelfSelected) {
                        flatRow[key] = val;
                    }
                }
            });

            // 只有当前行被勾选时，才加入 Sheet
            if (isSelfSelected) {
                currentSheetRows.push(flatRow);
            }
        });

        // 将新任务加入主队列
        nextLevelTasks.forEach((task, nextSheetName) => {
            queue.push({
                data: task.rows,
                sheetName: nextSheetName,
                parentIds: task.parentIds
            });
        });
    }

    // --- 生成 Excel Sheets ---
    // 过滤掉没有任何选中行的 Sheet
    const validSheetNames = Array.from(sheetsMap.keys()).filter(name => {
        return sheetsMap.get(name)!.length > 0;
    });

    if (validSheetNames.length === 0) {
        const msg = "生成结果为空 (No rows generated)";
        if (toast) toast.warning(msg);
        else console.warn(msg);
        return;
    }

    const sortedSheetNames = validSheetNames.sort((a, b) => {
        if (a === rootSheetName) return -1;
        if (b === rootSheetName) return 1;
        return a.localeCompare(b);
    });

    const finalSheetNames = new Set<string>();
    
    sortedSheetNames.forEach(rawName => {
        let validName = rawName.substring(0, 31).replace(/[:\\\/?*\[\]]/g, "_");
        
        if (finalSheetNames.has(validName)) {
            let counter = 1;
            while (finalSheetNames.has(`${validName.substring(0, 28)}_${counter}`)) {
                counter++;
            }
            validName = `${validName.substring(0, 28)}_${counter}`;
        }
        finalSheetNames.add(validName);

        const rows = sheetsMap.get(rawName)!;
        const ws = XLSX.utils.json_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, validName);
    });

    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const filename = `${rootSheetName}_Export_${timestamp}.xlsx`;
    XLSX.writeFile(wb, filename);

    if (toast) {
        toast.success(`导出成功: ${filename}\n(Export Successful)`);
    }
};
