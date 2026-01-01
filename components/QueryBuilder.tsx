import React, { useState, useEffect, useMemo } from 'react';
import { useDisclosure, Selection } from "@nextui-org/react";
import { generateSAPUI5Code, generateCSharpDeleteCode, generateJavaDeleteCode, ODataVersion, ParsedSchema } from '@/utils/odata-helper';
import xmlFormat from 'xml-formatter';

import { ParamsForm, SortItem } from './query-builder/ParamsForm';
import { UrlBar } from './query-builder/UrlBar';
import { ResultTabs } from './query-builder/ResultTabs';
import { CodeModal } from './query-builder/CodeModal';

interface Props {
  url: string;
  version: ODataVersion;
  isDark: boolean;
  schema: ParsedSchema | null;
}

const QueryBuilder: React.FC<Props> = ({ url, version, isDark, schema }) => {
  const [entitySets, setEntitySets] = useState<string[]>([]);
  const [selectedEntity, setSelectedEntity] = useState<string>('');
  
  // 查询参数状态
  const [filter, setFilter] = useState('');
  const [select, setSelect] = useState('');
  const [expand, setExpand] = useState('');
  
  // 替换为 sortItems 支持多字段排序
  const [sortItems, setSortItems] = useState<SortItem[]>([]);
  
  const [top, setTop] = useState('20');
  const [skip, setSkip] = useState('0');
  const [count, setCount] = useState(false);
  
  // 结果状态
  const [loading, setLoading] = useState(false);
  const [queryResult, setQueryResult] = useState<any[]>([]); 
  const [rawJsonResult, setRawJsonResult] = useState('');    
  const [rawXmlResult, setRawXmlResult] = useState('');      
  const [generatedUrl, setGeneratedUrl] = useState('');

  // 模态框状态
  const { isOpen, onOpen, onOpenChange } = useDisclosure(); 
  // CodePreview 现在可以是字符串或包含多语言的对象
  const [codePreview, setCodePreview] = useState<string | { url: string, sapui5: string, csharp: string, java: string }>('');
  const [modalAction, setModalAction] = useState<'delete'|'update'>('delete');
  
  // 待删除的数据项缓存
  const [itemsToDelete, setItemsToDelete] = useState<any[]>([]);

  // 1. 初始化：使用传入的 Schema 填充 EntitySets
  useEffect(() => {
    if (!schema) return;
    
    let sets: string[] = [];
    if (schema.entitySets && schema.entitySets.length > 0) {
        sets = schema.entitySets.map(es => es.name);
    } else if (schema.entities && schema.entities.length > 0) {
        sets = schema.entities.map(e => e.name + 's'); // Simple pluralization fallback
    }

    setEntitySets(sets);
    if (sets.length > 0) setSelectedEntity(sets[0]);
  }, [schema]);

  // 计算当前选中实体的 Schema 信息 (用于智能感知)
  const currentSchema = useMemo(() => {
      if (!selectedEntity || !schema || !schema.entities) return null;
      
      const setInfo = schema.entitySets.find(es => es.name === selectedEntity);
      if (setInfo) {
          const typeName = setInfo.entityType.split('.').pop();
          const matchedEntity = schema.entities.find(e => e.name === typeName);
          if (matchedEntity) return matchedEntity;
      }

      let match = schema.entities.find(s => s.name === selectedEntity);
      if (!match && selectedEntity.endsWith('s')) {
          const singular = selectedEntity.slice(0, -1);
          match = schema.entities.find(s => s.name === singular);
      }
      if (!match) {
          match = schema.entities.find(s => selectedEntity.includes(s.name));
      }
      return match;
  }, [selectedEntity, schema]);


  // 2. 监听参数变化：自动生成 OData URL
  useEffect(() => {
    const baseUrl = url.endsWith('/') ? url : `${url}/`;
    
    if (!selectedEntity) {
        setGeneratedUrl(baseUrl);
        return;
    }

    const params = new URLSearchParams();
    if (filter) params.append('$filter', filter);
    if (select) params.append('$select', select);
    if (expand) params.append('$expand', expand);
    
    if (sortItems.length > 0) {
        // 使用空格连接字段和排序方向，例如 "Name asc"
        const orderbyStr = sortItems.map(item => `${item.field} ${item.order}`).join(',');
        params.append('$orderby', orderbyStr);
    }

    if (top) params.append('$top', top);
    if (skip) params.append('$skip', skip);
    if (count) {
      if (version === 'V4') params.append('$count', 'true');
      else params.append('$inlinecount', 'allpages');
    }
    
    // URLSearchParams 默认会将空格编码为 '+'。
    // 为了符合 OData 常见格式 (使用 %20 或直接空格显示)，我们手动处理一下显示字符串。
    // replace(/\+/g, '%20') 将 '+' 替换为 '%20'
    // decodeURIComponent 将 '%20' 替换为空格，将其他编码字符还原
    const rawQuery = params.toString();
    const cleanQuery = rawQuery ? `?${decodeURIComponent(rawQuery.replace(/\+/g, '%20'))}` : '';
    
    setGeneratedUrl(`${baseUrl}${selectedEntity}${cleanQuery}`);
  }, [url, selectedEntity, filter, select, expand, sortItems, top, skip, count, version]);

  // 3. 执行查询
  const executeQuery = async () => {
    setLoading(true);
    setRawXmlResult('// 正在加载 XML...');
    setRawJsonResult('// 正在加载 JSON...');
    setQueryResult([]);

    try {
      // 这里的 generatedUrl 可能包含空格，浏览器的 fetch 会自动正确编码 (变成 %20)
      const [jsonRes, xmlRes] = await Promise.allSettled([
        fetch(generatedUrl, { headers: { 'Accept': 'application/json' } }),
        fetch(generatedUrl, { headers: { 'Accept': 'application/xml, application/atom+xml' } })
      ]);

      // --- JSON 处理 ---
      if (jsonRes.status === 'fulfilled') {
        const response = jsonRes.value;
        const text = await response.text();

        if (response.ok) {
          try {
            const data = JSON.parse(text);
            const results = data.d?.results || data.value || (Array.isArray(data) ? data : []);
            setQueryResult(results);
            setRawJsonResult(JSON.stringify(data, null, 2));
          } catch (e) {
            setRawJsonResult(`// JSON 解析失败: \n${text}`);
          }
        } else {
          // HTTP Error: 尝试美化错误信息
          let errorBody = text;
          try {
            const jsonError = JSON.parse(text);
            errorBody = JSON.stringify(jsonError, null, 2);
          } catch (e) {
            // keep raw text if not json
          }
          setRawJsonResult(`// HTTP Error: ${response.status} ${response.statusText}\n// 详细信息 (Details):\n${errorBody}`);
        }
      } else {
        // Network Error
        setRawJsonResult(`// 请求失败 (Network Error): ${jsonRes.reason}`);
      }

      // --- XML 处理 ---
      if (xmlRes.status === 'fulfilled') {
        const response = xmlRes.value;
        const text = await response.text();

        if (response.ok) {
            try {
                const formatted = xmlFormat(text, { 
                    indentation: '  ', 
                    filter: (node) => node.type !== 'Comment', 
                    collapseContent: true, 
                    lineSeparator: '\n' 
                });
                setRawXmlResult(formatted);
            } catch (err) {
                setRawXmlResult(text);
            }
        } else {
            // HTTP Error: 尝试美化 XML 错误信息
            let errorBody = text;
            try {
                errorBody = xmlFormat(text, { 
                    indentation: '  ', 
                    filter: (node) => node.type !== 'Comment', 
                    collapseContent: true, 
                    lineSeparator: '\n' 
                });
            } catch(e) {}
            
            setRawXmlResult(`<!-- HTTP Error: ${response.status} ${response.statusText} -->\n<!-- 详细信息 (Details): -->\n${errorBody}`);
        }
      } else {
        setRawXmlResult(`<!-- 请求失败 (Network Error): ${xmlRes.reason} -->`);
      }

    } catch (e: any) {
      console.error(e);
      setRawJsonResult(`错误: ${e.message || e}`);
    } finally {
      setLoading(false);
    }
  };

  const copyReadCode = () => {
    const orderbyStr = sortItems.length > 0 ? sortItems.map(i => `${i.field} ${i.order}`).join(',') : undefined;
    const code = generateSAPUI5Code('read', selectedEntity, {
      filters: filter ? [{field: 'Manual', operator: 'EQ', value: filter}] : [], 
      expand, select, 
      orderby: orderbyStr,
      top, skip, inlinecount: count
    }, version);
    navigator.clipboard.writeText(code);
    alert("SAPUI5 Read 代码已复制!");
  };

  // 生成单条数据的唯一 Key 谓词字符串 (e.g. "(ID=1)" 或 "(Key1=1,Key2='A')")
  const getKeyPredicate = (item: any): string | null => {
      let keys: string[] = [];
      
      // 1. 尝试从 Schema 获取 Key 定义
      if (currentSchema && currentSchema.keys.length > 0) {
          keys = currentSchema.keys;
      } 
      // 2. 尝试常见的 Key 字段名
      else {
          const possibleKeys = ['ID', 'Id', 'id', 'Uuid', 'UUID', 'Guid', 'Key'];
          const found = possibleKeys.find(k => item[k] !== undefined);
          if (found) keys = [found];
      }

      if (keys.length === 0) return null;

      if (keys.length === 1) {
          const k = keys[0];
          const val = item[k];
          // 简单判断字符串加引号 (更严谨的需要查 Schema 类型)
          const formattedVal = typeof val === 'string' ? `'${val}'` : val;
          // 某些 OData 服务支持简化格式 Entity('123')，但 Entity(ID='123') 更标准
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

  // 点击删除按钮触发（准备阶段）
  const handleDelete = (selectedItems: any[]) => {
    if (!selectedItems || selectedItems.length === 0) {
        alert("请先勾选需要删除的数据 (Please select rows to delete first)");
        return;
    }

    setItemsToDelete(selectedItems);
    
    // 收集所有需要删除的 Key Predicate
    const predicates: string[] = [];
    const urlList: string[] = [];
    const baseUrl = url.endsWith('/') ? url : `${url}/`;

    selectedItems.forEach(item => {
        const pred = getKeyPredicate(item);
        if (pred) {
            predicates.push(pred);
            urlList.push(`DELETE ${baseUrl}${selectedEntity}${pred}`);
        } else {
            urlList.push(`// SKIP: Cannot find key for item: ${JSON.stringify(item)}`);
        }
    });

    // 1. URL List Code
    const codeUrl = urlList.join('\n');

    // 2. SAPUI5 Code
    const codeSap = generateSAPUI5Code('delete', selectedEntity, { keyPredicates: predicates }, version);

    // 3. C# Code (Pass version)
    const codeCSharp = generateCSharpDeleteCode(selectedEntity, predicates, baseUrl, version);

    // 4. Java Code (Pass version & baseUrl)
    const codeJava = generateJavaDeleteCode(selectedEntity, predicates, version, baseUrl);

    // 传递多语言代码对象给 Modal
    setCodePreview({
        url: codeUrl,
        sapui5: codeSap,
        csharp: codeCSharp,
        java: codeJava
    });
    
    setModalAction('delete');
    onOpen();
  };

  // 确认执行批量删除
  const executeBatchDelete = async () => {
      if (itemsToDelete.length === 0) return;
      
      setLoading(true);
      const baseUrl = url.endsWith('/') ? url : `${url}/`;
      const results: string[] = [];
      let successCount = 0;

      for (const item of itemsToDelete) {
          const predicate = getKeyPredicate(item);
          if (!predicate) {
              results.push(`SKIP: No Key found for item`);
              continue;
          }

          const deleteUrl = `${baseUrl}${selectedEntity}${predicate}`;
          try {
              const res = await fetch(deleteUrl, { method: 'DELETE' });
              if (res.ok) {
                  results.push(`SUCCESS: ${predicate}`);
                  successCount++;
              } else {
                  results.push(`FAILED (${res.status}): ${predicate} - ${res.statusText}`);
              }
          } catch (e: any) {
              results.push(`ERROR: ${predicate} - ${e.message}`);
          }
      }

      // 将执行结果显示在结果面板
      setRawJsonResult(`// 批量删除结果 (Batch Delete Report):\n// 成功: ${successCount}, 失败: ${itemsToDelete.length - successCount}\n\n${results.join('\n')}`);
      setRawXmlResult(`<!-- Check JSON Tab for detailed delete report -->`);
      
      // 重新加载数据
      await executeQuery();
      setLoading(false);
      setItemsToDelete([]); // 清空缓存
  };

  const handleEntityChange = (keys: Selection) => {
    const selected = Array.from(keys).join('');
    setSelectedEntity(selected);
    // 重置参数
    setSelect('');
    setExpand('');
    setFilter('');
    setSortItems([]); // 重置排序
  };

  const downloadFile = (content: string, filename: string, type: 'json' | 'xml') => {
    if (!content || content.startsWith('//') || content.startsWith('<!--')) return;
    const blob = new Blob([content], { type: type === 'json' ? 'application/json' : 'application/xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleModalExecute = () => {
      if (modalAction === 'delete') {
          executeBatchDelete();
      } else {
          // 对于非删除操作，Modal 内部现在有复制按钮，
          // 但为了兼容，如果这里传了 text，我们也可以在这里 fallback handle
          if (typeof codePreview === 'string') {
              navigator.clipboard.writeText(codePreview);
          }
      }
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      <ParamsForm 
          entitySets={entitySets}
          selectedEntity={selectedEntity}
          onEntityChange={handleEntityChange}
          filter={filter} setFilter={setFilter}
          select={select} setSelect={setSelect}
          expand={expand} setExpand={setExpand}
          
          sortItems={sortItems} setSortItems={setSortItems}

          top={top} setTop={setTop}
          skip={skip} setSkip={setSkip}
          count={count} setCount={setCount}
          currentSchema={currentSchema}
          schema={schema}
      />

      <UrlBar 
          generatedUrl={generatedUrl}
          setGeneratedUrl={setGeneratedUrl}
          loading={loading}
          onRun={executeQuery}
          onCopyCode={copyReadCode}
      />

      <ResultTabs 
          queryResult={queryResult}
          rawJsonResult={rawJsonResult}
          rawXmlResult={rawXmlResult}
          loading={loading}
          isDark={isDark}
          onDelete={handleDelete} // 传递新的处理函数
          onExport={() => {}} 
          downloadFile={downloadFile}
          entityName={selectedEntity}
          schema={schema}
      />

      <CodeModal 
          isOpen={isOpen}
          onOpenChange={onOpenChange}
          code={codePreview}
          action={modalAction}
          onExecute={handleModalExecute} // 使用通用执行回调
      />
    </div>
  );
};

export default QueryBuilder;