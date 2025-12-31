import React, { useState, useEffect } from 'react';
import { 
  Input, Button, Select, SelectItem, Checkbox, 
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure,
  Code, ScrollShadow, Selection, Chip
} from "@nextui-org/react";
import { useReactTable, getCoreRowModel, flexRender, createColumnHelper } from '@tanstack/react-table';
import { generateSAPUI5Code, ODataVersion } from '@/utils/odata-helper';
import { Copy, Play, Trash, Save, FileCode } from 'lucide-react';

interface Props {
  url: string;
  version: ODataVersion;
}

const QueryBuilder: React.FC<Props> = ({ url, version }) => {
  const [entitySets, setEntitySets] = useState<string[]>([]);
  const [selectedEntity, setSelectedEntity] = useState<string>('');
  
  // Params State
  const [filter, setFilter] = useState('');
  const [select, setSelect] = useState('');
  const [expand, setExpand] = useState('');
  const [top, setTop] = useState('20');
  const [skip, setSkip] = useState('0');
  const [count, setCount] = useState(false);
  
  // Results
  const [loading, setLoading] = useState(false);
  const [queryResult, setQueryResult] = useState<any[]>([]);
  const [rawResult, setRawResult] = useState(''); // JSON string
  const [generatedUrl, setGeneratedUrl] = useState('');

  // Modals
  const { isOpen, onOpen, onOpenChange } = useDisclosure(); // Code Gen Modal
  const [codePreview, setCodePreview] = useState('');
  const [modalAction, setModalAction] = useState<'delete'|'update'>('delete');

  useEffect(() => {
    if(!url) return;
    const baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
    // 获取 Metadata 列表
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
        if (data && data.d && Array.isArray(data.d.EntitySets)) {
             sets = data.d.EntitySets; // V2
        } else if (data && data.value && Array.isArray(data.value)) {
             sets = data.value.map((v: any) => v.name); // V4
        } else {
             sets = ['Products', 'Orders', 'Customers', 'Employees', 'Suppliers', 'Categories']; 
        }
        setEntitySets(sets);
        if (sets.length > 0) setSelectedEntity(sets[0]);
      });
  }, [url]);

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

  const executeQuery = async () => {
    setLoading(true);
    try {
      const res = await fetch(generatedUrl, { headers: { 'Accept': 'application/json' }});
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("Invalid JSON Response");
      }

      // 兼容不同版本的返回结构
      const results = data.d?.results || data.value || (Array.isArray(data) ? data : []);
      setQueryResult(results);
      setRawResult(JSON.stringify(data, null, 2));
    } catch (e: any) {
      console.error(e);
      setRawResult(`Error: ${e.message || e}`);
      setQueryResult([]);
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
    alert("SAPUI5 Read Code Copied!");
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

  const columnHelper = createColumnHelper<any>();
  const columns = queryResult.length > 0 ? Object.keys(queryResult[0])
    .filter(key => typeof queryResult[0][key] !== 'object') 
    .map(key => 
      columnHelper.accessor(key, { header: key, cell: info => String(info.getValue()) })
  ) : [];

  const table = useReactTable({
    data: queryResult,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* 参数构建区 */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 p-4 rounded-xl bg-content1 shadow-sm border border-divider">
        <div className="md:col-span-3">
           <Select 
            label="Entity Set" 
            placeholder="Select Entity"
            selectedKeys={selectedEntity ? [selectedEntity] : []} 
            onSelectionChange={handleEntityChange}
            variant="bordered"
            size="sm"
          >
            {entitySets.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
          </Select>
        </div>
        
        <div className="md:col-span-9 grid grid-cols-2 md:grid-cols-4 gap-4">
          <Input label="$filter" placeholder="e.g. Price gt 20" value={filter} onValueChange={setFilter} size="sm" variant="bordered" />
          <Input label="$select" placeholder="e.g. Name,Price" value={select} onValueChange={setSelect} size="sm" variant="bordered" />
          <Input label="$expand" placeholder="e.g. Category" value={expand} onValueChange={setExpand} size="sm" variant="bordered" />
          <div className="flex gap-2 items-center">
             <Input label="$top" value={top} onValueChange={setTop} size="sm" variant="bordered" className="w-16" />
             <Input label="$skip" value={skip} onValueChange={setSkip} size="sm" variant="bordered" className="w-16" />
             <Checkbox isSelected={count} onValueChange={setCount} size="sm">Count</Checkbox>
          </div>
        </div>
      </div>

      {/* URL 预览和操作 */}
      <div className="flex gap-2 items-center bg-content2 p-2 rounded-lg border border-divider">
        <Chip size="sm" color="primary" variant="flat" className="shrink-0">GET</Chip>
        <Input 
          value={generatedUrl} 
          readOnly 
          size="sm" 
          variant="flat" 
          className="font-mono text-sm"
          classNames={{ inputWrapper: "bg-transparent shadow-none" }}
        />
        <Button isIconOnly size="sm" variant="light" onPress={copyReadCode} title="Copy SAPUI5 Code"><Copy size={16} /></Button>
        <Button color="primary" size="sm" onPress={executeQuery} isLoading={loading} startContent={<Play size={16} />}>Run Query</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0 overflow-hidden">
        {/* 数据表格区域 */}
        <div className="border border-divider rounded-xl overflow-hidden bg-content1 flex flex-col shadow-sm">
           <div className="bg-default-100 p-2 flex gap-2 border-b border-divider items-center justify-between shrink-0">
             <span className="text-xs font-bold text-default-500 uppercase px-2">Table View ({queryResult.length})</span>
             <div className="flex gap-2">
               <Button size="sm" color="danger" variant="light" onPress={handleDelete} startContent={<Trash size={14}/>}>Delete</Button>
               <Button size="sm" color="primary" variant="light" startContent={<Save size={14}/>}>Export</Button>
             </div>
           </div>
           
           <div className="overflow-auto flex-1">
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
                 <p>No data loaded</p>
               </div>
             )}
           </div>
        </div>

        {/* JSON 展示区域 */}
        <div className="border border-divider rounded-xl overflow-hidden bg-[#1e1e1e] text-default-200 flex flex-col shadow-sm">
          <div className="p-2 border-b border-white/10 flex justify-between items-center shrink-0 bg-[#252526]">
            <span className="text-xs font-bold px-2">JSON Response</span>
            <Button isIconOnly size="sm" variant="light" className="text-white/70 hover:text-white" onPress={() => navigator.clipboard.writeText(rawResult)}>
              <Copy size={14} />
            </Button>
          </div>
          <ScrollShadow className="flex-1 p-4">
            <pre className="text-xs font-mono whitespace-pre leading-relaxed">{rawResult || '// Response will appear here'}</pre>
          </ScrollShadow>
        </div>
      </div>

      <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="3xl">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex gap-2 items-center">
                <FileCode className="text-primary" />
                SAPUI5 {modalAction === 'delete' ? 'Delete' : 'Update'} Code
              </ModalHeader>
              <ModalBody>
                <div className="bg-[#1e1e1e] p-4 rounded-lg text-white font-mono text-sm overflow-auto max-h-[400px]">
                  <pre>{codePreview}</pre>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button color="default" variant="light" onPress={onClose}>Close</Button>
                <Button color="primary" onPress={() => { navigator.clipboard.writeText(codePreview); onClose(); }}>
                  Copy to Clipboard
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