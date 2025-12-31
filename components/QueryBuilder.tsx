import React, { useState, useEffect } from 'react';
import { 
  Input, Button, Select, SelectItem, Checkbox, 
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure,
  Selection, Chip, Tabs, Tab
} from "@nextui-org/react";
import { useReactTable, getCoreRowModel, flexRender, createColumnHelper } from '@tanstack/react-table';
import { generateSAPUI5Code, ODataVersion } from '@/utils/odata-helper';
import { Copy, Play, Trash, Save, FileCode, Table as TableIcon, Braces } from 'lucide-react';

// Code Mirror & Formatting Imports
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { xml } from '@codemirror/lang-xml';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';
import { githubLight } from '@uiw/codemirror-theme-github';
import xmlFormat from 'xml-formatter';

interface Props {
  url: string;
  version: ODataVersion;
  isDark: boolean;
}

const QueryBuilder: React.FC<Props> = ({ url, version, isDark }) => {
  const [entitySets, setEntitySets] = useState<string[]>([]);
  const [selectedEntity, setSelectedEntity] = useState<string>('');
  
  // 查询参数状态
  const [filter, setFilter] = useState('');
  const [select, setSelect] = useState('');
  const [expand, setExpand] = useState('');
  const [top, setTop] = useState('20');
  const [skip, setSkip] = useState('0');
  const [count, setCount] = useState(false);
  
  // 结果状态
  const [loading, setLoading] = useState(false);
  const [queryResult, setQueryResult] = useState<any[]>([]); // 用于表格显示的数组
  const [rawJsonResult, setRawJsonResult] = useState('');    // 原始 JSON 字符串
  const [rawXmlResult, setRawXmlResult] = useState('');      // 原始 XML 字符串
  const [generatedUrl, setGeneratedUrl] = useState('');

  // 模态框状态
  const { isOpen, onOpen, onOpenChange } = useDisclosure(); // 代码生成模态框
  const [codePreview, setCodePreview] = useState('');
  const [modalAction, setModalAction] = useState<'delete'|'update'>('delete');

  // 1. 初始化：加载 Metadata 获取实体列表
  useEffect(() => {
    if(!url) return;
    const baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
    
    fetch(baseUrl, { headers: { 'Accept': 'application/json' } }) 
      .then(async r => {
        const text = await r.text();
        try {
          return JSON.parse(text);
        } catch {
          return null;
        }
      }) 
      .then(data => {
        let sets: string[] = [];
        // 根据 OData 版本解析 EntitySets
        if (data && data.d && Array.isArray(data.d.EntitySets)) {
             sets = data.d.EntitySets; // V2
        } else if (data && data.value && Array.isArray(data.value)) {
             sets = data.value.map((v: any) => v.name); // V4
        } else {
             // Fallback: 如果没有获取到，给一些默认示例
             sets = ['Products', 'Orders', 'Customers', 'Employees', 'Suppliers', 'Categories']; 
        }
        setEntitySets(sets);
        if (sets.length > 0) setSelectedEntity(sets[0]);
      });
  }, [url]);

  // 2. 监听参数变化：自动生成 OData URL
  useEffect(() => {
    if (!selectedEntity) return;
    const baseUrl = url.endsWith('/') ? url : `${url}/`;
    const params = new URLSearchParams();
    if (filter) params.append('$filter', filter);
    if (select) params.append('$select', select);
    if (expand) params.append('$expand', expand);
    if (top) params.append('$top', top);
    if (skip) params.append('$skip', skip);
    if (count) {
      if (version === 'V4') params.append('$count', 'true');
      else params.append('$inlinecount', 'allpages');
    }
    
    setGeneratedUrl(`${baseUrl}${selectedEntity}?${params.toString()}`);
  }, [url, selectedEntity, filter, select, expand, top, skip, count, version]);

  // 3. 执行查询：同时获取 JSON 和 XML
  const executeQuery = async () => {
    setLoading(true);
    setRawXmlResult('// 正在加载 XML...');
    setRawJsonResult('// 正在加载 JSON...');
    setQueryResult([]);

    try {
      // 并行发起请求：一个要 JSON 用于表格和 JSON 预览，一个要 XML 用于 XML 预览
      const [jsonRes, xmlRes] = await Promise.allSettled([
        fetch(generatedUrl, { headers: { 'Accept': 'application/json' } }),
        fetch(generatedUrl, { headers: { 'Accept': 'application/xml, application/atom+xml' } })
      ]);

      // 处理 JSON 响应 (用于表格渲染)
      if (jsonRes.status === 'fulfilled' && jsonRes.value.ok) {
        const text = await jsonRes.value.text();
        try {
          const data = JSON.parse(text);
          // 兼容不同版本的 OData 返回结构 (V2 d.results, V4 value)
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

      // 处理 XML 响应
      if (xmlRes.status === 'fulfilled' && xmlRes.value.ok) {
        const text = await xmlRes.value.text();
        // 使用 xml-formatter 进行美化，并允许折叠内容
        try {
            const formatted = xmlFormat(text, { 
                indentation: '  ', 
                filter: (node) => node.type !== 'Comment', 
                collapseContent: true, 
                lineSeparator: '\n' 
            });
            setRawXmlResult(formatted);
        } catch (err) {
            setRawXmlResult(text); // Fallback to raw if formatter fails
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
      expand, select, top, skip, inlinecount: count
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
  };

  // 表格列配置
  const columnHelper = createColumnHelper<any>();
  const columns = queryResult.length > 0 ? Object.keys(queryResult[0])
    .filter(key => typeof queryResult[0][key] !== 'object' && key !== '__metadata') 
    .map(key => 
      columnHelper.accessor(key, { header: key, cell: info => String(info.getValue()) })
  ) : [];

  const table = useReactTable({
    data: queryResult,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  // 编辑器主题配置
  const editorTheme = isDark ? vscodeDark : githubLight;

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* 1. 参数构建区 */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 p-4 rounded-xl bg-content1 shadow-sm border border-divider shrink-0">
        <div className="md:col-span-3">
           <Select 
            label="实体集 (Entity Set)" 
            placeholder="选择实体"
            selectedKeys={selectedEntity ? [selectedEntity] : []} 
            onSelectionChange={handleEntityChange}
            variant="bordered"
            size="sm"
          >
            {entitySets.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
          </Select>
        </div>
        
        <div className="md:col-span-9 grid grid-cols-2 md:grid-cols-4 gap-4">
          <Input label="过滤 ($filter)" placeholder="例如: Price gt 20" value={filter} onValueChange={setFilter} size="sm" variant="bordered" />
          <Input label="字段 ($select)" placeholder="例如: Name,Price" value={select} onValueChange={setSelect} size="sm" variant="bordered" />
          <Input label="展开 ($expand)" placeholder="例如: Category" value={expand} onValueChange={setExpand} size="sm" variant="bordered" />
          <div className="flex gap-2 items-center">
             <Input label="Top" value={top} onValueChange={setTop} size="sm" variant="bordered" className="w-16" />
             <Input label="Skip" value={skip} onValueChange={setSkip} size="sm" variant="bordered" className="w-16" />
             <Checkbox isSelected={count} onValueChange={setCount} size="sm">计数</Checkbox>
          </div>
        </div>
      </div>

      {/* 2. URL 预览和操作栏 */}
      <div className="flex gap-2 items-center bg-content2 p-2 rounded-lg border border-divider shrink-0">
        <Chip size="sm" color="primary" variant="flat" className="shrink-0">GET</Chip>
        <Input 
          value={generatedUrl} 
          readOnly 
          size="sm" 
          variant="flat" 
          className="font-mono text-sm"
          classNames={{ inputWrapper: "bg-transparent shadow-none" }}
        />
        <Button isIconOnly size="sm" variant="light" onPress={copyReadCode} title="复制 SAPUI5 代码"><Copy size={16} /></Button>
        <Button color="primary" size="sm" onPress={executeQuery} isLoading={loading} startContent={<Play size={16} />}>
            运行查询
        </Button>
      </div>

      {/* 3. 结果展示区 (Tabs 布局) */}
      <div className="flex-1 min-h-0 bg-content1 rounded-xl border border-divider overflow-hidden flex flex-col shadow-sm">
         <Tabs 
            aria-label="Result Options" 
            color="primary" 
            variant="underlined"
            classNames={{
                tabList: "gap-6 w-full relative rounded-none p-0 border-b border-divider px-4 bg-default-100",
                cursor: "w-full bg-primary",
                tab: "max-w-fit px-2 h-10 text-sm",
                tabContent: "group-data-[selected=true]:font-bold",
                panel: "flex-1 p-0 overflow-hidden h-full flex flex-col" 
            }}
        >
            {/* Tab 1: 表格预览 */}
            <Tab
                key="table"
                title={
                    <div className="flex items-center space-x-2">
                        <TableIcon size={14} />
                        <span>表格预览</span>
                        <Chip size="sm" variant="flat" className="h-4 text-[10px] px-1 ml-1">{queryResult.length}</Chip>
                    </div>
                }
            >
                <div className="h-full flex flex-col">
                    <div className="bg-default-50 p-2 flex gap-2 border-b border-divider items-center justify-end shrink-0">
                        <div className="flex gap-2">
                            <Button size="sm" color="danger" variant="light" onPress={handleDelete} startContent={<Trash size={14}/>}>删除 (Delete)</Button>
                            <Button size="sm" color="primary" variant="light" startContent={<Save size={14}/>}>导出 (Export)</Button>
                        </div>
                    </div>
                    
                    <div className="overflow-auto flex-1 w-full">
                        <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 z-10">
                            {table.getHeaderGroups().map(headerGroup => (
                            <tr key={headerGroup.id}>
                                {headerGroup.headers.map(header => (
                                <th key={header.id} className="border-b border-divider p-3 text-xs font-semibold bg-content2 whitespace-nowrap text-default-600">
                                    {flexRender(header.column.columnDef.header, header.getContext())}
                                </th>
                                ))}
                            </tr>
                            ))}
                        </thead>
                        <tbody>
                            {table.getRowModel().rows.map(row => (
                            <tr key={row.id} className="hover:bg-content2/50 transition-colors border-b border-divider/50 last:border-0">
                                {row.getVisibleCells().map(cell => (
                                <td key={cell.id} className="p-3 text-sm whitespace-nowrap text-default-700">
                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                </td>
                                ))}
                            </tr>
                            ))}
                        </tbody>
                        </table>
                        {queryResult.length === 0 && !loading && (
                        <div className="flex flex-col items-center justify-center h-40 text-default-400">
                            <p>暂无数据</p>
                        </div>
                        )}
                    </div>
                </div>
            </Tab>

            {/* Tab 2: JSON 预览 (CodeMirror) */}
            <Tab
                key="json"
                title={
                    <div className="flex items-center space-x-2">
                        <Braces size={14} />
                        <span>JSON 预览</span>
                    </div>
                }
            >
                <div className="h-full flex flex-col">
                    <div className="p-2 border-b border-divider flex justify-between items-center shrink-0 bg-content2">
                        <span className="text-xs font-bold px-2 text-warning-500">JSON 响应结果</span>
                        <Button isIconOnly size="sm" variant="light" onPress={() => navigator.clipboard.writeText(rawJsonResult)}>
                            <Copy size={14} />
                        </Button>
                    </div>
                    <div className="flex-1 overflow-hidden relative text-sm">
                        <CodeMirror 
                            value={rawJsonResult || '// 请先运行查询以获取结果'} 
                            height="100%" 
                            extensions={[json()]} 
                            theme={editorTheme}
                            readOnly={true}
                            editable={false}
                            basicSetup={{
                                lineNumbers: true,
                                foldGutter: true, 
                                highlightActiveLine: false
                            }}
                        />
                    </div>
                </div>
            </Tab>

             {/* Tab 3: XML 预览 (CodeMirror) */}
             <Tab
                key="xml"
                title={
                    <div className="flex items-center space-x-2">
                        <FileCode size={14} />
                        <span>XML 预览</span>
                    </div>
                }
            >
                <div className="h-full flex flex-col">
                    <div className="p-2 border-b border-divider flex justify-between items-center shrink-0 bg-content2">
                        <span className="text-xs font-bold px-2 text-primary-500">XML / Atom 响应结果</span>
                        <Button isIconOnly size="sm" variant="light" onPress={() => navigator.clipboard.writeText(rawXmlResult)}>
                            <Copy size={14} />
                        </Button>
                    </div>
                    <div className="flex-1 overflow-hidden relative text-sm">
                         <CodeMirror 
                            value={rawXmlResult || '// 请先运行查询以获取结果'} 
                            height="100%" 
                            extensions={[xml()]} 
                            theme={editorTheme}
                            readOnly={true}
                            editable={false}
                            basicSetup={{
                                lineNumbers: true,
                                foldGutter: true,
                                highlightActiveLine: false
                            }}
                        />
                    </div>
                </div>
            </Tab>
        </Tabs>
      </div>

      {/* 代码生成模态框 */}
      <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="3xl">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex gap-2 items-center">
                <FileCode className="text-primary" />
                SAPUI5 {modalAction === 'delete' ? '删除(Delete)' : '更新(Update)'} 代码
              </ModalHeader>
              <ModalBody>
                <div className="bg-[#1e1e1e] rounded-lg overflow-hidden border border-white/10">
                   <CodeMirror 
                        value={codePreview} 
                        height="400px" 
                        extensions={[json()]} 
                        theme={vscodeDark}
                        readOnly={true}
                        editable={false}
                   />
                </div>
              </ModalBody>
              <ModalFooter>
                <Button color="default" variant="light" onPress={onClose}>关闭</Button>
                <Button color="primary" onPress={() => { navigator.clipboard.writeText(codePreview); onClose(); }}>
                  复制到剪贴板
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
};

export default QueryBuilder;