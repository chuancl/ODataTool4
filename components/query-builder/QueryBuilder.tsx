import React, { useState, useEffect, useMemo } from 'react';
import { Selection } from "@nextui-org/react";
import { ODataVersion, ParsedSchema } from '@/utils/odata-helper';

import { ParamsForm, SortItem } from './query-builder/ParamsForm';
import { UrlBar } from './query-builder/UrlBar';
import { ResultTabs } from './query-builder/ResultTabs';
import { CodeModal } from './query-builder/CodeModal';

// Hooks
import { useODataQuery } from './query-builder/hooks/useODataQuery';
import { useEntityActions } from './query-builder/hooks/useEntityActions';

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
  const [sortItems, setSortItems] = useState<SortItem[]>([]);
  const [top, setTop] = useState('20');
  const [skip, setSkip] = useState('0');
  const [count, setCount] = useState(false);
  
  // URL 生成状态
  const [generatedUrl, setGeneratedUrl] = useState('');

  // 1. 初始化 EntitySets
  useEffect(() => {
    if (!schema) return;
    let sets: string[] = [];
    if (schema.entitySets && schema.entitySets.length > 0) {
        sets = schema.entitySets.map(es => es.name);
    } else if (schema.entities && schema.entities.length > 0) {
        sets = schema.entities.map(e => e.name + 's'); 
    }
    setEntitySets(sets);
    if (sets.length > 0) setSelectedEntity(sets[0]);
  }, [schema]);

  // 计算当前选中实体的 Schema (用于智能感知)
  const currentSchema = useMemo(() => {
      if (!selectedEntity || !schema || !schema.entities) return null;
      const setInfo = schema.entitySets.find(es => es.name === selectedEntity);
      if (setInfo) {
          const typeName = setInfo.entityType.split('.').pop();
          return schema.entities.find(e => e.name === typeName) || null;
      }
      let match = schema.entities.find(s => s.name === selectedEntity);
      if (!match && selectedEntity.endsWith('s')) {
          match = schema.entities.find(s => s.name === selectedEntity.slice(0, -1));
      }
      return match || schema.entities.find(s => selectedEntity.includes(s.name)) || null;
  }, [selectedEntity, schema]);

  // 2. 自动生成 OData URL
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
        params.append('$orderby', sortItems.map(item => `${item.field} ${item.order}`).join(','));
    }
    if (top) params.append('$top', top);
    if (skip) params.append('$skip', skip);
    if (count) {
      if (version === 'V4') params.append('$count', 'true');
      else params.append('$inlinecount', 'allpages');
    }
    const rawQuery = params.toString();
    const cleanQuery = rawQuery ? `?${decodeURIComponent(rawQuery.replace(/\+/g, '%20'))}` : '';
    setGeneratedUrl(`${baseUrl}${selectedEntity}${cleanQuery}`);
  }, [url, selectedEntity, filter, select, expand, sortItems, top, skip, count, version]);

  // 3. 使用 Hooks 封装逻辑
  
  // Query Logic Hook
  const { 
      loading, queryResult, executeQuery, 
      rawJsonResult, rawXmlResult, 
      setRawJsonResult, setRawXmlResult 
  } = useODataQuery(version);

  // Actions Logic Hook (Delete, Update)
  const {
      isOpen, onOpenChange, codePreview, modalAction,
      prepareDelete, prepareUpdate, executeBatch, isExecuting
  } = useEntityActions(
      url, version, schema, selectedEntity, currentSchema, 
      () => executeQuery(generatedUrl), // 传入刷新回调
      setRawJsonResult, setRawXmlResult
  );

  // Handlers
  const handleEntityChange = (keys: Selection) => {
    setSelectedEntity(Array.from(keys).join(''));
    setSelect(''); setExpand(''); setFilter(''); setSortItems([]);
  };

  const handleRunQuery = () => executeQuery(generatedUrl);

  const downloadFile = (content: string, filename: string, type: 'json' | 'xml') => {
    if (!content || content.startsWith('//') || content.startsWith('<!--')) return;
    const blob = new Blob([content], { type: type === 'json' ? 'application/json' : 'application/xml' });
    const u = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = u; link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(u);
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
          onRun={handleRunQuery}
          onCopyCode={() => { /* 保持原逻辑或移入 hook */ }}
      />

      <ResultTabs 
          queryResult={queryResult}
          rawJsonResult={rawJsonResult}
          rawXmlResult={rawXmlResult}
          loading={loading || isExecuting}
          isDark={isDark}
          onDelete={() => prepareDelete(queryResult)} // 触发删除流程
          onUpdate={prepareUpdate} // 触发更新流程
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
          onExecute={executeBatch}
      />
    </div>
  );
};

export default QueryBuilder;