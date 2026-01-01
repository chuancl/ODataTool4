import * as XLSX from 'xlsx';
import { isExpandableData } from './utils';

export const exportToExcel = (rowsToExport: any[]) => {
    if (rowsToExport.length === 0) {
        alert("没有可导出的数据 (No data to export)");
        return;
    }

    const wb = XLSX.utils.book_new();
    let globalIdCounter = 1;

    // 定义处理队列：{ name: Sheet名称, data: 数据数组, parentKey: 父级关联键名 }
    const queue = [{ name: 'Main', data: rowsToExport, parentInfo: null as any }];
    const processedSheets = new Set<string>();

    while (queue.length > 0) {
        const current = queue.shift()!;
        let sheetName = current.name;
        
        // 防止 Sheet 名称重复 (Excel 限制)
        let counter = 1;
        const originalName = sheetName;
        while (processedSheets.has(sheetName)) {
            sheetName = `${originalName}_${counter++}`;
        }
        processedSheets.add(sheetName);

        // 限制 Sheet 名称长度 (31字符)
        if (sheetName.length > 31) sheetName = sheetName.substring(0, 31);

        const processedRows: any[] = [];
        
        // 遍历当前层级的数据行
        current.data.forEach((row: any) => {
            const flatRow: any = {};
            
            // 生成唯一 ID
            const currentId = globalIdCounter++;
            flatRow['__Export_ID'] = currentId; // 系统生成 ID

            // 如果有父级信息，添加关联 ID
            if (current.parentInfo) {
                flatRow['__Parent_ID'] = current.parentInfo.parentId;
            }

            // 处理字段
            Object.entries(row).forEach(([key, val]) => {
                if (key === '__metadata' || key === '__deferred') return;

                if (isExpandableData(val)) {
                    // === 处理嵌套数据 ===
                    
                    // Case A: 数组 (1:N) -> 放入队列生成新 Sheet
                    if (Array.isArray(val) || (val && Array.isArray((val as any).results))) {
                        let childData = Array.isArray(val) ? val : (val as any).results;
                        if (childData.length > 0) {
                            queue.push({
                                name: key, // Sheet名 = 字段名
                                data: childData,
                                parentInfo: { parentId: currentId }
                            });
                        }
                        // 在当前行标记
                        flatRow[key] = `[See Sheet: ${key}]`;
                    } 
                    // Case B: 对象 (1:1) -> 扁平化到当前行
                    else if (typeof val === 'object') {
                        Object.entries(val).forEach(([subKey, subVal]) => {
                            if (subKey !== '__metadata' && subKey !== '__deferred') {
                                // 将对象转换为字符串，如果是简单值则直接使用
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
            
            processedRows.push(flatRow);
        });

        // 生成 Sheet
        const ws = XLSX.utils.json_to_sheet(processedRows);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
    }

    // 导出文件
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    XLSX.writeFile(wb, `OData_Export_${timestamp}.xlsx`);
};