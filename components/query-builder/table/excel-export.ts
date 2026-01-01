import * as XLSX from 'xlsx';
import { isExpandableData } from './utils';

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

// 辅助：判断行是否应被导出
// 如果 __selected 为 true (显式选中)，则导出
// 如果 __selected 未定义 (undefined)，我们假设如果其父级被处理了，则默认逻辑可能根据业务需求
// 在本需求中：严格按照 "勾选的数据导出"，意味着必须 __selected === true (或者没有 checkbox 的情况下默认全导?)
// 结合 RecursiveDataTable 的逻辑，Checkbox 默认未选中。
const isRowSelected = (row: any) => {
    return row['__selected'] === true;
};

export const exportToExcel = (allRootData: any[], defaultRootName: string = 'Main') => {
    // 1. 过滤根级数据：只保留被勾选的
    const selectedRootData = allRootData.filter(isRowSelected);

    if (selectedRootData.length === 0) {
        alert("没有勾选要导出的数据 (No selected data to export)");
        return;
    }

    const wb = XLSX.utils.book_new();
    
    // 全局 ID 计数器，用于生成关联 ID
    let globalIdCounter = 1;

    // --- 数据聚合映射 ---
    // Key: Sheet Name (e.g. "Main", "Orders", "OrderItems")
    // Value: Array of rows to be written to that sheet
    const sheetsMap: Map<string, any[]> = new Map();

    // 初始 Sheet 名
    let rootSheetName = defaultRootName;
    const detectedRoot = getEntityNameFromData(selectedRootData);
    if (detectedRoot) rootSheetName = detectedRoot;

    // 广度优先搜索 (BFS) 队列
    // 每个任务包含：
    // - data: 要处理的数据行数组
    // - sheetName: 这些行应该去的 Sheet 名称
    // - parentIds: 对应 data 数组中每一行的父级 ID (如果是根节点则为 null)
    const queue = [{ 
        data: selectedRootData, 
        sheetName: rootSheetName, 
        parentIds: new Array(selectedRootData.length).fill(null) 
    }];

    while (queue.length > 0) {
        const { data, sheetName, parentIds } = queue.shift()!;
        
        if (data.length === 0) continue;

        // 确保 Sheet 存在
        if (!sheetsMap.has(sheetName)) {
            sheetsMap.set(sheetName, []);
        }
        const currentSheetRows = sheetsMap.get(sheetName)!;

        // 临时存储下一层的任务： Key = 子 Sheet 名, Value = { rows: [], parentIds: [] }
        const nextLevelTasks: Map<string, { rows: any[], parentIds: any[] }> = new Map();

        // 遍历当前批次的数据行
        data.forEach((row, idx) => {
            const flatRow: any = {};
            const myId = globalIdCounter++; // 为当前行分配唯一 ID
            
            // 写入系统字段
            flatRow['__Export_ID'] = myId;
            if (parentIds[idx] !== null) {
                flatRow['__Parent_ID'] = parentIds[idx];
            }

            // 遍历属性
            Object.entries(row).forEach(([key, val]) => {
                if (key === '__metadata' || key === '__deferred' || key === '__selected') return;

                if (isExpandableData(val)) {
                    // === 处理嵌套数据 ===
                    
                    // Case A: 数组 (1:N) -> 放入下一层队列
                    // 只有当 val (子数组) 存在且长度 > 0 时处理
                    let childDataArray: any[] = [];
                    if (Array.isArray(val)) {
                        childDataArray = val;
                    } else if (val && Array.isArray((val as any).results)) {
                        childDataArray = (val as any).results;
                    }

                    // *** 关键：只处理勾选的子项 ***
                    const selectedChildData = childDataArray.filter(isRowSelected);

                    if (selectedChildData.length > 0) {
                        // 确定子 Sheet 名称
                        let childSheetName = key; // 默认为属性名 (如 "Items")
                        const detectedChildEntity = getEntityNameFromData(selectedChildData);
                        if (detectedChildEntity) childSheetName = detectedChildEntity; // 优先用实体名 (如 "OrderItem")

                        // 将这些子项加入下一层任务
                        if (!nextLevelTasks.has(childSheetName)) {
                            nextLevelTasks.set(childSheetName, { rows: [], parentIds: [] });
                        }
                        const task = nextLevelTasks.get(childSheetName)!;
                        
                        // 添加数据和对应的父ID
                        task.rows.push(...selectedChildData);
                        // 为这批子项每一个都添加当前行的 ID 作为父 ID
                        selectedChildData.forEach(() => task.parentIds.push(myId));

                        // 在当前行标记
                        flatRow[key] = `[Sheet: ${childSheetName}]`;
                    } else if (childDataArray.length > 0) {
                         // 有数据但没勾选
                         flatRow[key] = `[0 Selected]`;
                    }

                    // Case B: 对象 (1:1) -> 扁平化到当前行 (简单处理)
                    // 如果对象也有 __selected 逻辑，这里简化为只要父级选了，内嵌对象就展开
                    else if (typeof val === 'object' && !Array.isArray(val)) {
                        Object.entries(val).forEach(([subKey, subVal]) => {
                            if (subKey !== '__metadata' && subKey !== '__deferred') {
                                if (typeof subVal === 'object' && subVal !== null) {
                                    flatRow[`${key}.${subKey}`] = JSON.stringify(subVal);
                                } else {
                                    flatRow[`${key}.${subKey}`] = subVal;
                                }
                            }
                        });
                    }
                } else {
                    // === 处理基本类型 ===
                    flatRow[key] = val;
                }
            });

            currentSheetRows.push(flatRow);
        });

        // 将生成的下一层任务加入主队列
        nextLevelTasks.forEach((task, nextSheetName) => {
            queue.push({
                data: task.rows,
                sheetName: nextSheetName,
                parentIds: task.parentIds
            });
        });
    }

    // --- 生成 Excel Sheets ---
    // 为了美观，先处理 Main sheet，然后是其他
    const sortedSheetNames = Array.from(sheetsMap.keys()).sort((a, b) => {
        if (a === rootSheetName) return -1;
        if (b === rootSheetName) return 1;
        return a.localeCompare(b);
    });

    // Excel Sheet 名称有 31 字符限制，且不能重复
    const finalSheetNames = new Set<string>();
    
    sortedSheetNames.forEach(rawName => {
        let validName = rawName.substring(0, 31).replace(/[:\\\/?*\[\]]/g, "_"); // 移除非法字符
        
        // 处理重名
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

    // 导出文件
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    XLSX.writeFile(wb, `${rootSheetName}_Export_${timestamp}.xlsx`);
};