import React, { useState, useEffect, useMemo } from 'react';
import { useDisclosure, Selection } from "@nextui-org/react";
import { generateSAPUI5Code, ODataVersion, ParsedSchema } from '@/utils/odata-helper';
import xmlFormat from 'xml-formatter';

import { ParamsForm } from './query-builder/ParamsForm';
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
  const [sortField, setSortField] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
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
  const [codePreview, setCodePreview] = useState('');
  const [modalAction, setModalAction] = useState<'delete'|'update'>('delete');

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
    if (sortField) params.append('$orderby', `${sortField} ${sortOrder}`);
    if (top) params.append('$top', top);
    if (skip) params.append('$skip', skip);
    if (count) {
      if (version === 'V4') params.append('$count', 'true');
      else params.append('$inlinecount', 'allpages');
    }
    
    const queryString = params.toString();
    const displayQuery = queryString ? `?${decodeURIComponent(queryString)}` : '';
    setGeneratedUrl(`${baseUrl}${selectedEntity}${displayQuery}`);
  }, [url, selectedEntity, filter, select, expand, sortField, sortOrder, top, skip, count, version]);

  // 3. 执行查询
  const executeQuery = async () => {
    setLoading(true);
    setRawXmlResult('// 正在加载 XML...');
    setRawJsonResult('// 正在加载 JSON...');
    setQueryResult([]);

    try {
      const [jsonRes, xmlRes] = await Promise.allSettled([
        fetch(generatedUrl, { headers: { 'Accept': 'application/json' } }),
        fetch(generatedUrl, { headers: { 'Accept': 'application/xml, application/atom+xml' } })
      ]);

      if (jsonRes.status === 'fulfilled' && jsonRes.value.ok) {
        const text = await jsonRes.value.text();
        try {
          const data = JSON.parse(text);
          const results = data.d?.results || data.value || (Array.isArray(data) ? data : []);
          setQueryResult(results);
          setRawJsonResult(JSON.stringify(data, null, 2));
        } catch (e) {
          setRawJsonResult(`// JSON 解析失败: \n${text}`);
        }
      } else {
        const errorMsg = jsonRes.status === 'fulfilled' 
          ? `// HTTP 错误: ${jsonRes.value.status} ${jsonRes.value.statusText}` 
          : `// 请求失败: ${jsonRes.reason}`;
        setRawJsonResult(errorMsg);
      }

      if (xmlRes.status === 'fulfilled' && xmlRes.value.ok) {
        const text = await xmlRes.value.text();
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
        const errorMsg = xmlRes.status === 'fulfilled'
          ? `<!-- HTTP 错误: ${xmlRes.value.status} (该服务可能不支持 XML 格式) -->`
          : `<!-- 请求失败: ${xmlRes.reason} -->`;
        setRawXmlResult(errorMsg);
      }

    } catch (e: any) {
      console.error(e);
      setRawJsonResult(`错误: ${e.message || e}`);
    } finally {
      setLoading(false);
    }
  };

  const copyReadCode = () => {
    const code = generateSAPUI5Code('read', selectedEntity, {
      filters: filter ? [{field: 'Manual', operator: 'EQ', value: filter}] : [], 
      expand, select, 
      orderby: sortField ? `${sortField} ${sortOrder}` : undefined,
      top, skip, inlinecount: count
    }, version);
    navigator.clipboard.writeText(code);
    alert("SAPUI5 Read 代码已复制!");
  };

  const handleDelete = () => {
    const code = generateSAPUI5Code('delete', selectedEntity, { key: "(ID=1)" }, version);
    setCodePreview(code);
    setModalAction('delete');
    onOpen();
  };

  const handleEntityChange = (keys: Selection) => {
    const selected = Array.from(keys).join('');
    setSelectedEntity(selected);
    // 重置参数
    setSelect('');
    setExpand('');
    setFilter('');
    setSortField('');
    setSortOrder('asc');
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

  return (
    <div className="flex flex-col gap-4 h-full">
      <ParamsForm 
          entitySets={entitySets}
          selectedEntity={selectedEntity}
          onEntityChange={handleEntityChange}
          filter={filter} setFilter={setFilter}
          select={select} setSelect={setSelect}
          expand={expand} setExpand={setExpand}
          sortField={sortField} setSortField={setSortField}
          sortOrder={sortOrder} setSortOrder={setSortOrder}
          top={top} setTop={setTop}
          skip={skip} setSkip={setSkip}
          count={count} setCount={setCount}
          currentSchema={currentSchema}
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
          onDelete={handleDelete}
          onExport={() => {}} 
          downloadFile={downloadFile}
      />

      <CodeModal 
          isOpen={isOpen}
          onOpenChange={onOpenChange}
          code={codePreview}
          action={modalAction}
          onCopy={() => navigator.clipboard.writeText(codePreview)}
      />
    </div>
  );
};

export default QueryBuilder;
