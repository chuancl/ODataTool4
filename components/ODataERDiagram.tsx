import React, { useCallback, useEffect, useState, useRef, useMemo, useContext } from 'react';
import ReactFlow, { 
  Controls, 
  Background, 
  useNodesState, 
  useEdgesState, 
  MarkerType,
  Handle,
  Position,
  NodeProps,
  Edge,
  Node,
  useUpdateNodeInternals,
  useReactFlow,
  ReactFlowProvider
} from 'reactflow';
import 'reactflow/dist/style.css';
import ELK from 'elkjs/lib/elk.bundled.js';
import { parseMetadataToSchema, EntityProperty } from '@/utils/odata-helper';
import { Button, Spinner, Popover, PopoverTrigger, PopoverContent, ScrollShadow, Divider, Chip, Switch } from "@nextui-org/react";
import { Key, Link2, Info, X, ChevronDown, ChevronUp, ArrowRightCircle, Table2, Database, Zap, ArrowUpDown, AlignJustify, Hash, CaseSensitive, GripVertical, Download } from 'lucide-react';
import { useReactTable, getCoreRowModel, getSortedRowModel, flexRender, createColumnHelper, SortingState, ColumnOrderState } from '@tanstack/react-table';

const elk = new ELK();

// --- Context for Managing Active Popover State ---
type DiagramContextType = {
  activeEntityId: string | null;
  setActiveEntityId: (id: string | null) => void;
};
const DiagramContext = React.createContext<DiagramContextType>({ activeEntityId: null, setActiveEntityId: () => {} });

// 生成字符串 Hash
const generateHashCode = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return hash;
};

// 预定义一组好看的颜色作为 fallback
const PALETTE = [
  '#F5A524', '#F31260', '#9353D3', '#006FEE', '#17C964', 
  '#06B6D4', '#F97316', '#EC4899', '#8B5CF6', '#10B981'
];

const getColor = (index: number) => PALETTE[index % PALETTE.length];

// --- 动态 Handle 配置接口 ---
interface DynamicHandleConfig {
  id: string;
  type: 'source' | 'target';
  position: Position;
  offset: number; // 0-100%
}

// --------------------------------------------------------
// Helper: Calculate Dynamic Layout (Handles & Edges)
// --------------------------------------------------------
const calculateDynamicLayout = (nodes: Node[], edges: Edge[]) => {
  // Deep copy nodes to avoid mutating state directly during calculation
  const nextNodes = nodes.map(n => ({
    ...n,
    data: { ...n.data, dynamicHandles: [] as DynamicHandleConfig[] }
  }));
  const nextEdges = [...edges];

  const nodeMap = new Map(nextNodes.map(n => [n.id, n]));

  nextEdges.forEach(edge => {
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);
    if (!sourceNode || !targetNode) return;

    // Calculate centers
    const sx = sourceNode.position.x + (sourceNode.width ?? 250) / 2;
    const sy = sourceNode.position.y + (sourceNode.height ?? 200) / 2;
    const tx = targetNode.position.x + (targetNode.width ?? 250) / 2;
    const ty = targetNode.position.y + (targetNode.height ?? 200) / 2;

    const dx = tx - sx;
    const dy = ty - sy;

    // Determine Handle Position
    let sourcePos = Position.Right;
    let targetPos = Position.Left;

    if (Math.abs(dx) > Math.abs(dy)) {
        if (dx > 0) {
            sourcePos = Position.Right;
            targetPos = Position.Left;
        } else {
            sourcePos = Position.Left;
            targetPos = Position.Right;
        }
    } else {
        if (dy > 0) {
            sourcePos = Position.Bottom;
            targetPos = Position.Top;
        } else {
            sourcePos = Position.Top;
            targetPos = Position.Bottom;
        }
    }

    const sourceHandleId = `s-${edge.source}-${edge.target}-${edge.id}`;
    const targetHandleId = `t-${edge.target}-${edge.source}-${edge.id}`;

    sourceNode.data.dynamicHandles.push({
        id: sourceHandleId,
        type: 'source',
        position: sourcePos,
        offset: 50
    });

    targetNode.data.dynamicHandles.push({
        id: targetHandleId,
        type: 'target',
        position: targetPos,
        offset: 50
    });

    edge.sourceHandle = sourceHandleId;
    edge.targetHandle = targetHandleId;
  });

  // Distribute handles
  nextNodes.forEach(node => {
     const handles = node.data.dynamicHandles as DynamicHandleConfig[];
     const groups: Record<string, DynamicHandleConfig[]> = {
         [Position.Top]: [], [Position.Bottom]: [], [Position.Left]: [], [Position.Right]: []
     };
     handles.forEach(h => groups[h.position]?.push(h));
     
     Object.values(groups).forEach(group => {
         if (group && group.length > 0) {
             const step = 100 / (group.length + 1);
             group.forEach((h, i) => h.offset = step * (i + 1));
         }
     });
  });

  return { nodes: nextNodes, edges: nextEdges };
};

// --------------------------------------------------------
// Sub-Component: Entity Details Table
// --------------------------------------------------------
const EntityDetailsTable = ({ 
    properties, 
    keys, 
    getFkInfo,
    onJumpToEntity
}: { 
    properties: EntityProperty[], 
    keys: string[], 
    getFkInfo: (name: string) => any,
    onJumpToEntity: (name: string) => void
}) => {
    const [sorting, setSorting] = useState<SortingState>([]);
    const [columnOrder, setColumnOrder] = useState<ColumnOrderState>(['name', 'type', 'size', 'attributes', 'defaultValue', 'relation']);
    const [draggingColumn, setDraggingColumn] = useState<string | null>(null);

    const columnHelper = createColumnHelper<EntityProperty>();

    const columns = useMemo(() => [
        // 1. Name Column
        columnHelper.accessor('name', {
            id: 'name',
            header: 'Field',
            enableSorting: true,
            minSize: 110,
            cell: info => {
                const isKey = keys.includes(info.getValue());
                return (
                    <div className="flex items-center gap-2">
                        {isKey ? <Key size={14} className="text-warning shrink-0" /> : <div className="w-3.5" />}
                        <span className={`${isKey ? "font-bold text-foreground" : "text-default-700"} text-xs`}>
                            {info.getValue()}
                        </span>
                    </div>
                );
            }
        }),

        // 2. Type Column
        columnHelper.accessor('type', {
            id: 'type',
            header: 'Type',
            enableSorting: true,
            size: 100,
            cell: info => <span className="font-mono text-xs text-primary/80">{info.getValue().split('.').pop()}</span>
        }),

        // 3. Size/Precision Column
        columnHelper.accessor(row => row.maxLength || row.precision || 0, {
            id: 'size',
            header: 'Size',
            enableSorting: true,
            size: 70,
            cell: info => {
                const p = info.row.original;
                if (p.maxLength) return <span className="font-mono text-xs text-default-500">{p.maxLength}</span>;
                if (p.precision) return <span className="font-mono text-xs text-default-500">{p.precision}{p.scale !== undefined ? `,${p.scale}` : ''}</span>;
                return <span className="text-default-300 text-xs">-</span>;
            }
        }),

        // 4. Attributes Column
        columnHelper.accessor(row => `${row.nullable}${row.unicode}${row.fixedLength}${row.concurrencyMode}`, {
            id: 'attributes',
            header: 'Attributes',
            enableSorting: false, 
            size: 180,
            cell: info => {
                const p = info.row.original;
                return (
                    <div className="flex items-center gap-1.5 flex-wrap">
                        {/* Nullable status */}
                        {!p.nullable && (
                            <span title="Field is Required (Not Null)" className="px-1.5 py-0.5 rounded-[4px] bg-danger/10 text-danger text-[10px] font-semibold border border-danger/20">Required</span>
                        )}
                        
                        {/* Fixed Length */}
                        {p.fixedLength && (
                             <span title="Fixed Length String/Binary" className="px-1.5 py-0.5 rounded-[4px] bg-default-100 text-default-600 text-[10px] font-medium border border-default-200">Fixed Length</span>
                        )}

                        {/* Unicode Status */}
                        {p.unicode === false ? (
                             <span title="Non-Unicode (ANSI)" className="px-1.5 py-0.5 rounded-[4px] bg-warning/10 text-warning-700 text-[10px] font-medium border border-warning/20">Non-Unicode</span>
                        ) : (
                             <span title="Unicode Enabled" className="px-1.5 py-0.5 rounded-[4px] bg-primary/5 text-primary/70 text-[10px] font-medium border border-primary/10">Unicode</span>
                        )}

                        {/* Concurrency */}
                        {p.concurrencyMode === 'Fixed' && (
                            <span title="Optimistic Concurrency Control" className="px-1.5 py-0.5 rounded-[4px] bg-success/10 text-success-700 text-[10px] font-medium border border-success/20">Concurrency</span>
                        )}
                    </div>
                );
            }
        }),

        // 5. Default Value
        columnHelper.accessor('defaultValue', {
            id: 'defaultValue',
            header: 'Default',
            enableSorting: true,
            size: 90,
            cell: info => info.getValue() ? <span className="font-mono text-xs bg-default-50 px-1 rounded border border-default-100 text-default-600 max-w-[80px] truncate block" title={info.getValue()}>{info.getValue()}</span> : <span className="text-default-200 text-xs">-</span>
        }),

        // 6. Relation Column
        columnHelper.display({
            id: 'relation',
            header: 'Relation',
            size: 200,
            cell: info => {
                const fk = getFkInfo(info.row.original.name);
                if (!fk) return null;
                return (
                    <div className="flex items-center gap-1 text-xs w-full group">
                        <Link2 size={12} className="text-secondary shrink-0" />
                        <div className="flex items-center gap-0.5 overflow-hidden">
                            <span 
                                className="font-bold text-secondary cursor-pointer hover:underline hover:text-secondary-600 truncate" 
                                onClick={(e) => { e.stopPropagation(); onJumpToEntity(fk.targetEntity); }}
                                title={`Jump to Entity: ${fk.targetEntity}`}
                            >
                                {fk.targetEntity}
                            </span>
                            <span className="text-default-400">.</span>
                            <span className="font-mono text-default-600 truncate" title={`Target Field: ${fk.targetProperty}`}>{fk.targetProperty}</span>
                        </div>
                    </div>
                );
            }
        })

    ], [keys, getFkInfo, onJumpToEntity]);

    const table = useReactTable({
        data: properties,
        columns,
        state: { sorting, columnOrder },
        onSortingChange: setSorting,
        onColumnOrderChange: setColumnOrder,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        enableColumnResizing: true,
        columnResizeMode: 'onChange',
    });

    return (
        <div className="w-full h-full flex flex-col">
            <table className="w-full text-left border-collapse table-fixed">
                <thead className="sticky top-0 z-20 bg-default-50/90 backdrop-blur-md shadow-sm border-b border-divider">
                    {table.getHeaderGroups().map(headerGroup => (
                        <tr key={headerGroup.id}>
                            {headerGroup.headers.map(header => (
                                <th 
                                    key={header.id} 
                                    className="relative p-2 py-3 text-xs font-bold text-default-600 uppercase tracking-wider select-none group border-r border-divider/10 hover:bg-default-100 transition-colors"
                                    style={{ width: header.getSize() }}
                                    draggable={!header.isPlaceholder}
                                    onDragStart={(e) => {
                                        setDraggingColumn(header.column.id);
                                        e.dataTransfer.effectAllowed = 'move';
                                    }}
                                    onDragOver={(e) => e.preventDefault()}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        if (draggingColumn && draggingColumn !== header.column.id) {
                                            const newOrder = [...columnOrder];
                                            const dragIndex = newOrder.indexOf(draggingColumn);
                                            const dropIndex = newOrder.indexOf(header.column.id);
                                            if (dragIndex !== -1 && dropIndex !== -1) {
                                                newOrder.splice(dragIndex, 1);
                                                newOrder.splice(dropIndex, 0, draggingColumn);
                                                setColumnOrder(newOrder);
                                            }
                                            setDraggingColumn(null);
                                        }
                                    }}
                                >
                                    <div className="flex items-center gap-1 w-full">
                                        <GripVertical size={12} className="text-default-300 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity" />
                                        
                                        <div 
                                            className="flex items-center gap-1 cursor-pointer flex-1 overflow-hidden"
                                            onClick={header.column.getToggleSortingHandler()}
                                        >
                                            <span className="truncate">{flexRender(header.column.columnDef.header, header.getContext())}</span>
                                            {{
                                                asc: <ChevronUp size={12} className="text-primary shrink-0" />,
                                                desc: <ChevronDown size={12} className="text-primary shrink-0" />,
                                            }[header.column.getIsSorted() as string] ?? null}
                                        </div>
                                    </div>
                                    
                                    {/* Resizer Handle */}
                                    <div
                                        onMouseDown={header.getResizeHandler()}
                                        onTouchStart={header.getResizeHandler()}
                                        className={`absolute right-0 top-0 h-full w-1 cursor-col-resize touch-none select-none hover:bg-primary/50 ${
                                            header.column.getIsResizing() ? 'bg-primary w-1.5' : 'bg-transparent'
                                        }`}
                                    />
                                </th>
                            ))}
                        </tr>
                    ))}
                </thead>
                <tbody>
                    {table.getRowModel().rows.map((row, idx) => (
                        <tr 
                            key={row.id} 
                            className={`
                                border-b border-divider/40 last:border-0 transition-colors
                                hover:bg-primary/5
                                ${idx % 2 === 0 ? 'bg-transparent' : 'bg-default-50/30'}
                            `}
                        >
                            {row.getVisibleCells().map(cell => (
                                <td key={cell.id} className="p-2 text-xs h-10 border-r border-divider/20 last:border-r-0 align-middle overflow-hidden text-ellipsis">
                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
            {properties.length === 0 && <div className="p-8 text-center text-sm text-default-400">No properties found for this entity.</div>}
        </div>
    );
};

// --------------------------------------------------------
// Component: EntityNode
// --------------------------------------------------------
const EntityNode = React.memo(({ id, data, selected }: NodeProps) => {
  const updateNodeInternals = useUpdateNodeInternals();
  const { fitView, getNodes } = useReactFlow();
  const [isExpanded, setIsExpanded] = useState(false);
  const { activeEntityId, setActiveEntityId } = useContext(DiagramContext);

  // Determine if this entity popover should be open
  const showEntityDetails = activeEntityId === id;

  const setShowEntityDetails = (open: boolean) => {
    if (open) setActiveEntityId(id);
    else if (activeEntityId === id) setActiveEntityId(null);
  };

  // 监听 Handles 变化
  const dynamicHandles: DynamicHandleConfig[] = data.dynamicHandles || [];
  useEffect(() => {
    updateNodeInternals(id);
  }, [id, updateNodeInternals, JSON.stringify(dynamicHandles)]);

  // 当展开状态变化时，也需要更新内部布局
  useEffect(() => {
    const timer = setTimeout(() => updateNodeInternals(id), 50);
    return () => clearTimeout(timer);
  }, [isExpanded, id, updateNodeInternals]);

  // 处理导航跳转 - 核心逻辑：Fit View + Update Context
  const handleJumpToEntity = useCallback((targetEntityName: string) => {
    const nodes = getNodes();
    const targetNode = nodes.find(n => n.id === targetEntityName);

    if (targetNode) {
      // 1. Zoom to node
      fitView({
        nodes: [{ id: targetEntityName }],
        padding: 0.5,
        duration: 800,
      });
      // 2. Open target popover (closes current one automatically via Context)
      setTimeout(() => setActiveEntityId(targetEntityName), 100); 
    }
  }, [getNodes, fitView, setActiveEntityId]);

  // Export CSV Function
  const handleExportCSV = () => {
    const headers = ['Name', 'Type', 'Nullable', 'MaxLength', 'Precision', 'Scale', 'Unicode', 'FixedLength', 'DefaultValue', 'ConcurrencyMode'];
    const rows = data.properties.map((p: EntityProperty) => [
      p.name, p.type, p.nullable, p.maxLength, p.precision, p.scale, p.unicode, p.fixedLength, p.defaultValue, p.concurrencyMode
    ].map((v: any) => v === undefined || v === null ? '' : String(v)));

    const csvContent = [headers.join(','), ...rows.map((r: any[]) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${data.label}_Schema.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 查找某个属性是否是外键，并返回关联信息
  const getForeignKeyInfo = useCallback((propName: string) => {
    if (!data.navigationProperties) return null;
    
    for (const nav of data.navigationProperties) {
      if (nav.constraints) {
        const constraint = nav.constraints.find((c: any) => c.sourceProperty === propName);
        if (constraint) {
          let targetTypeClean = nav.targetType;
          if (targetTypeClean?.startsWith('Collection(')) targetTypeClean = targetTypeClean.slice(11, -1);
          targetTypeClean = targetTypeClean?.split('.').pop();

          return {
            targetEntity: targetTypeClean,
            targetProperty: constraint.targetProperty,
            navName: nav.name
          };
        }
      }
    }
    return null;
  }, [data.navigationProperties]);

  const visibleProperties = isExpanded ? data.properties : data.properties.slice(0, 12);
  const hiddenCount = data.properties.length - 12;

  return (
    <div className={`
      relative flex flex-col
      border-2 rounded-lg min-w-[240px] max-w-[300px] bg-content1 transition-all
      ${selected ? 'border-primary shadow-2xl ring-2 ring-primary/30 z-50' : 'border-divider shadow-sm'}
    `}>
      
      {dynamicHandles.map((handle) => {
        const isVertical = handle.position === Position.Top || handle.position === Position.Bottom;
        const style: React.CSSProperties = {
          position: 'absolute',
          [isVertical ? 'left' : 'top']: `${handle.offset}%`,
          opacity: 0, 
          width: '12px', height: '12px',
          zIndex: 10,
        };

        if (handle.position === Position.Top) style.top = '-6px';
        if (handle.position === Position.Bottom) style.bottom = '-6px';
        if (handle.position === Position.Left) style.left = '-6px';
        if (handle.position === Position.Right) style.right = '-6px';

        return <Handle key={handle.id} id={handle.id} type={handle.type} position={handle.position} style={style} />;
      })}

      {/* --- Entity Title Header --- */}
      <div className="bg-primary/10 p-2 font-bold text-center border-b border-divider text-sm text-primary rounded-t-md flex items-center justify-center gap-2 group">
         <Table2 size={14} />
         
         <Popover 
            isOpen={showEntityDetails} 
            onOpenChange={setShowEntityDetails}
            placement="right-start" 
            offset={20}
            shouldFlip
            isDismissable={false} 
            shouldCloseOnBlur={false}
         >
            <PopoverTrigger>
                {/* 仅点击文字触发 Popover，同时阻止冒泡防止选中节点 */}
                <span 
                    className="cursor-pointer hover:underline underline-offset-2 decoration-primary/50"
                    onClick={(e) => { e.stopPropagation(); setShowEntityDetails(true); }}
                >
                    {data.label}
                </span>
            </PopoverTrigger>
            <PopoverContent 
                className="w-[850px] p-0" 
                // 防止 Popover 内部点击冒泡导致 ReactFlow 画布暗化
                onMouseDown={(e) => e.stopPropagation()} 
                onClick={(e) => e.stopPropagation()}
            >
                <div className="bg-content1 rounded-lg shadow-lg border border-divider overflow-hidden flex flex-col max-h-[600px]">
                    <div className="flex justify-between items-center p-3 bg-default-100 border-b border-divider shrink-0">
                        <div className="flex items-center gap-3 font-bold text-default-700 text-sm">
                            <Database size={18} className="text-primary"/>
                            {data.label}
                            <span className="text-xs font-normal text-default-500 bg-white px-1.5 rounded border border-divider">{data.namespace}</span>
                        </div>
                        <div className="flex items-center gap-2">
                           <Button size="sm" variant="flat" color="primary" onPress={handleExportCSV} startContent={<Download size={14} />}>
                              Export CSV
                           </Button>
                           <Button isIconOnly size="sm" variant="light" onPress={() => setShowEntityDetails(false)}>
                               <X size={18} />
                           </Button>
                        </div>
                    </div>
                    
                    <ScrollShadow className="flex-1 overflow-auto bg-content1" size={10}>
                         <EntityDetailsTable 
                            properties={data.properties} 
                            keys={data.keys} 
                            getFkInfo={getForeignKeyInfo}
                            onJumpToEntity={(name) => {
                                handleJumpToEntity(name);
                            }}
                         />
                    </ScrollShadow>
                    
                    <div className="bg-default-50 p-2 text-xs text-default-500 text-center border-t border-divider shrink-0 flex justify-between px-4">
                        <span>{data.properties.length} Properties</span>
                        <span>{data.navigationProperties?.length || 0} Relations</span>
                    </div>
                </div>
            </PopoverContent>
         </Popover>

         <Info size={12} className="opacity-0 group-hover:opacity-50 transition-opacity" />
      </div>

      {/* Content Area */}
      <div className="p-2 flex flex-col gap-0.5 bg-content1 rounded-b-md">
        
        {/* --- Properties --- */}
        {visibleProperties.map((prop: EntityProperty) => {
          const fieldColor = data.fieldColors?.[prop.name];
          const isKey = data.keys.includes(prop.name);
          const fkInfo = getForeignKeyInfo(prop.name);

          return (
            <div 
              key={prop.name} 
              className={`
                text-[10px] flex items-center justify-between p-1.5 rounded-sm border-l-2 transition-colors group
                ${isKey ? 'bg-warning/10 text-warning-700 font-semibold' : 'text-default-600'}
                ${fieldColor ? '' : 'border-transparent'}
              `}
              style={fieldColor ? { borderColor: fieldColor, backgroundColor: `${fieldColor}15` } : {}}
            >
               <span className="flex items-center gap-1.5 truncate max-w-[140px]">
                 {isKey && <Key size={8} className="shrink-0 text-warning" />}
                 {fkInfo && <Link2 size={8} className="shrink-0 text-secondary" />}
                 
                 {/* 仅点击属性名触发 Popover - Single Property Details */}
                 <Popover placement="right" showArrow offset={10}>
                    <PopoverTrigger>
                        <span 
                            className="cursor-pointer hover:text-primary transition-colors hover:underline decoration-dotted" 
                            style={fieldColor ? { color: fieldColor, fontWeight: 700 } : {}}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {prop.name}
                        </span>
                    </PopoverTrigger>
                    <PopoverContent className="p-3 w-[280px]" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                        <div className="text-xs flex flex-col gap-3">
                            {/* Header */}
                            <div className="font-bold flex items-center justify-between border-b border-divider pb-2">
                                <span className="flex items-center gap-2 text-sm">
                                    {prop.name}
                                    {isKey && <Chip size="sm" color="warning" variant="flat" className="h-4 text-[9px] px-1">PK</Chip>}
                                    {fkInfo && <Chip size="sm" color="secondary" variant="flat" className="h-4 text-[9px] px-1">FK</Chip>}
                                </span>
                            </div>
                            
                            {/* Grid Info */}
                            <div className="grid grid-cols-[60px_1fr] gap-x-2 gap-y-2 text-default-600">
                                <span className="text-default-400">Type</span>
                                <span className="font-mono bg-default-100 px-1 rounded w-fit">{prop.type}</span>
                                
                                <span className="text-default-400">Required</span>
                                <span className={!prop.nullable ? "text-danger font-medium" : "text-default-500"}>
                                    {!prop.nullable ? 'Yes (Not Null)' : 'No (Nullable)'}
                                </span>
                                
                                {prop.defaultValue && (
                                    <>
                                        <span className="text-default-400">Default</span>
                                        <span className="font-mono bg-default-50 px-1 rounded border border-default-200">{prop.defaultValue}</span>
                                    </>
                                )}
                            </div>

                            <Divider className="opacity-50"/>
                            
                            {/* Constraints & Facets */}
                            <div className="flex flex-wrap gap-2">
                                {/* Size/Precision */}
                                {prop.maxLength !== undefined && (
                                    <div className="flex flex-col bg-content2 p-1.5 rounded min-w-[50px] border border-divider">
                                        <span className="text-[9px] text-default-400 flex items-center gap-1"><AlignJustify size={10}/> MaxLen</span>
                                        <span className="font-mono font-bold">{prop.maxLength}</span>
                                    </div>
                                )}
                                {(prop.precision !== undefined || prop.scale !== undefined) && (
                                    <div className="flex flex-col bg-content2 p-1.5 rounded min-w-[50px] border border-divider">
                                        <span className="text-[9px] text-default-400 flex items-center gap-1"><Hash size={10}/> Scale</span>
                                        <span className="font-mono font-bold">{prop.precision || '-'}/{prop.scale || '-'}</span>
                                    </div>
                                )}

                                {/* Boolean Flags */}
                                {prop.fixedLength && (
                                    <div className="flex flex-col bg-default-100 p-1.5 rounded min-w-[50px] border border-divider">
                                        <span className="text-[9px] text-default-400 flex items-center gap-1"><AlignJustify size={10}/> Fixed</span>
                                        <span className="font-bold text-default-700 text-[10px]">Yes</span>
                                    </div>
                                )}
                                
                                <div className="flex flex-col bg-default-100 p-1.5 rounded min-w-[50px] border border-divider">
                                    <span className="text-[9px] text-default-400 flex items-center gap-1"><CaseSensitive size={10}/> Unicode</span>
                                    <span className={`font-bold text-[10px] ${prop.unicode === false ? 'text-warning-700' : 'text-primary'}`}>
                                        {prop.unicode === false ? 'False (ANSI)' : 'True'}
                                    </span>
                                </div>

                                {prop.concurrencyMode && (
                                    <div className="flex flex-col bg-warning/10 p-1.5 rounded min-w-[50px] border border-warning/20">
                                        <span className="text-[9px] text-warning-600 flex items-center gap-1"><Zap size={10}/> Mode</span>
                                        <span className="font-bold text-warning-800 text-[10px]">{prop.concurrencyMode}</span>
                                    </div>
                                )}
                            </div>
                            
                            {/* FK Relation Section */}
                            {fkInfo && (
                                <div className="bg-secondary/10 p-2 rounded border border-secondary/20 mt-1 cursor-pointer hover:bg-secondary/20 transition-colors"
                                     onClick={(e) => { e.stopPropagation(); handleJumpToEntity(fkInfo.targetEntity); }}
                                >
                                    <div className="text-[10px] text-secondary font-bold mb-1 flex items-center gap-1">
                                        <Link2 size={10} /> Foreign Key Relation
                                    </div>
                                    <div className="grid grid-cols-[40px_1fr] gap-1 text-[10px]">
                                        <span className="opacity-70">To:</span> <span className="font-bold">{fkInfo.targetEntity}</span>
                                        <span className="opacity-70">Field:</span> <span className="font-mono">{fkInfo.targetProperty}</span>
                                        <span className="opacity-70">Via:</span> <span className="italic opacity-80">{fkInfo.navName}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </PopoverContent>
                 </Popover>
               </span>
               <span className="text-[9px] text-default-400 ml-1 opacity-70 font-mono">{prop.type.split('.').pop()}</span>
            </div>
          );
        })}

        {/* --- Expand Button --- */}
        {!isExpanded && hiddenCount > 0 && (
            <div 
                className="text-[9px] text-primary cursor-pointer hover:bg-primary/5 p-1 rounded text-center flex items-center justify-center gap-1 transition-colors mt-1 border border-dashed border-divider hover:border-primary/50"
                onClick={(e) => { e.stopPropagation(); setIsExpanded(true); }}
            >
                <ChevronDown size={10} />
                <span>Show {hiddenCount} hidden properties</span>
            </div>
        )}
         {isExpanded && hiddenCount > 0 && (
            <div 
                className="text-[9px] text-default-400 cursor-pointer hover:bg-default-100 p-1 rounded text-center flex items-center justify-center gap-1 transition-colors mt-1"
                onClick={(e) => { e.stopPropagation(); setIsExpanded(false); }}
            >
                <ChevronUp size={10} />
                <span>Collapse properties</span>
            </div>
        )}

        {/* --- Navigation Properties --- */}
        {data.navigationProperties && data.navigationProperties.length > 0 && (
            <div className="mt-2 pt-2 border-t border-divider/50">
                <div className="text-[9px] font-bold text-default-400 mb-1.5 px-1 uppercase tracking-wider flex items-center gap-2">
                    <span>Navigation</span>
                    <div className="h-px bg-divider flex-1"></div>
                </div>
                <div className="bg-secondary/10 rounded-md p-1 border border-secondary/10 flex flex-col gap-1">
                    {data.navigationProperties.slice(0, 8).map((nav: any) => {
                        const cleanType = nav.targetType?.replace('Collection(', '').replace(')', '').split('.').pop();
                        return (
                            <div 
                                key={nav.name} 
                                className="group flex items-center justify-start gap-2 p-1.5 rounded-sm bg-content1/50 hover:bg-content1 hover:shadow-sm border border-transparent hover:border-secondary/20 transition-all cursor-pointer text-secondary-700"
                                onClick={(e) => { e.stopPropagation(); handleJumpToEntity(cleanType); }}
                                title={`Jump to ${cleanType}`}
                            >
                                <span className="flex items-center gap-1.5 truncate w-full">
                                    <ArrowRightCircle size={10} className="shrink-0 text-secondary opacity-70 group-hover:opacity-100 transition-opacity" />
                                    <span className="font-medium text-[10px]">{nav.name}</span>
                                </span>
                            </div>
                        );
                    })}
                    {data.navigationProperties.length > 8 && (
                        <div className="text-[9px] text-secondary-400 text-center pt-1 italic">
                            + {data.navigationProperties.length - 8} more relations
                        </div>
                    )}
                </div>
            </div>
        )}
      </div>
    </div>
  );
});

const nodeTypes = { entity: EntityNode };

interface Props {
  url: string;
}

// --------------------------------------------------------
// Main Component Wrapper (Required for ReactFlowProvider)
// --------------------------------------------------------
const ODataERDiagram: React.FC<Props> = (props) => {
    return (
        <ReactFlowProvider>
            <ODataERDiagramContent {...props} />
        </ReactFlowProvider>
    );
};


const ODataERDiagramContent: React.FC<Props> = ({ url }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loading, setLoading] = useState(false);
  const [hasData, setHasData] = useState(false);
  const [isPerformanceMode, setIsPerformanceMode] = useState(false); // 默认关闭性能模式
  const [activeEntityId, setActiveEntityId] = useState<string | null>(null); // Global Active Entity for Popovers

  // 用于管理高亮节点 ID 的集合
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());

  // Refs for stable state access during callbacks
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);

  // 提取布局更新逻辑
  const performLayoutUpdate = useCallback((draggedNodes: Node[] = []) => {
      const currentNodes = nodesRef.current;
      const currentEdges = edgesRef.current;
      
      const draggedMap = new Map(draggedNodes.map(n => [n.id, n]));
      const mergedNodes = currentNodes.map(n => {
          const dragged = draggedMap.get(n.id);
          if (dragged) {
              return { ...n, position: dragged.position, positionAbsolute: dragged.positionAbsolute };
          }
          return n;
      });

      const { nodes: newNodes, edges: newEdges } = calculateDynamicLayout(mergedNodes, currentEdges);
      setNodes(newNodes);
      setEdges(newEdges);
  }, [setNodes, setEdges]);

  // [REAL-TIME DRAG]
  // 实时拖动处理：如果开启性能模式，则跳过计算，仅由 ReactFlow 处理节点位移
  const onNodeDrag = useCallback((event: React.MouseEvent, node: Node, draggedNodes: Node[]) => {
    if (isPerformanceMode) return; 
    performLayoutUpdate(draggedNodes);
  }, [isPerformanceMode, performLayoutUpdate]); 

  // [DRAG STOP]
  // 拖动结束：强制进行一次完整布局计算，确保连线和端口位置正确（尤其是在性能模式下）
  const onNodeDragStop = useCallback((event: React.MouseEvent, node: Node, draggedNodes: Node[]) => {
      performLayoutUpdate(draggedNodes);
  }, [performLayoutUpdate]);

  useEffect(() => {
    if (!url) return;
    setLoading(true);

    const loadData = async () => {
      try {
        const metadataUrl = url.endsWith('$metadata') ? url : `${url.replace(/\/$/, '')}/$metadata`;
        const res = await fetch(metadataUrl);
        if (!res.ok) throw new Error("Fetch failed");
        
        const xml = await res.text();
        const { entities, namespace } = parseMetadataToSchema(xml);

        if (entities.length === 0) {
            setHasData(false);
            setLoading(false);
            return;
        }

        // 1. 数据准备
        const fieldColorMap: Record<string, Record<string, string>> = {}; 
        const rawEdges: any[] = [];
        const processedPairs = new Set<string>();

        const setFieldColor = (entityName: string, fieldName: string, color: string) => {
            if (!fieldColorMap[entityName]) fieldColorMap[entityName] = {};
            fieldColorMap[entityName][fieldName] = color;
        };

        entities.forEach(entity => {
          entity.navigationProperties.forEach((nav: any) => {
            if (nav.targetType) {
                let targetName = nav.targetType;
                if (targetName.startsWith('Collection(')) targetName = targetName.slice(11, -1);
                targetName = targetName.split('.').pop();
                
                if (entity.name === targetName) return;

                if (targetName && entities.find(n => n.name === targetName)) {
                    const pairKey = [entity.name, targetName].sort().join('::');
                    const colorIndex = Math.abs(generateHashCode(pairKey));
                    const edgeColor = getColor(colorIndex);
                    
                    if (nav.constraints && nav.constraints.length > 0) {
                        nav.constraints.forEach((c: any) => {
                            setFieldColor(entity.name, c.sourceProperty, edgeColor);
                            setFieldColor(targetName, c.targetProperty, edgeColor);
                        });
                    }

                    if (processedPairs.has(pairKey)) return;
                    processedPairs.add(pairKey);

                    const sMult = nav.sourceMultiplicity || '?';
                    const tMult = nav.targetMultiplicity || '?';
                    const label = `${entity.name} (${sMult} - ${tMult}) ${targetName}`;

                    rawEdges.push({
                        id: `${entity.name}-${targetName}-${nav.name}`,
                        source: entity.name,
                        target: targetName,
                        label: label,
                        color: edgeColor
                    });
                }
            }
          });
        });

        // 2. 初始化节点
        const initialNodesRaw = entities.map((e) => ({
          id: e.name,
          type: 'entity',
          data: { 
            label: e.name, 
            namespace, // Pass namespace for details
            properties: e.properties, 
            keys: e.keys,
            navigationProperties: e.navigationProperties,
            fieldColors: fieldColorMap[e.name] || {},
            dynamicHandles: [] 
          },
          position: { x: 0, y: 0 }
        }));

        const getNodeDimensions = (propCount: number, navCount: number) => {
            // Initial dimensions estimation
            const visibleProps = Math.min(propCount, 12);
            const visibleNavs = Math.min(navCount, 8);
            const extraHeight = (navCount > 0 ? 30 : 0) + (propCount > 12 ? 20 : 0) + (navCount > 8 ? 20 : 0);
            const height = 45 + (visibleProps * 24) + (visibleNavs * 28) + extraHeight + 30; 
            return { width: 300, height: height };
        };

        // 3. ELK 布局计算
        const elkGraph = {
          id: 'root',
          layoutOptions: {
            'elk.algorithm': 'layered',
            'elk.direction': 'RIGHT',
            'elk.spacing.nodeNode': '100', 
            'elk.layered.spacing.nodeNodeBetweenLayers': '250',
            'elk.edgeRouting': 'SPLINES', 
            'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
          },
          children: initialNodesRaw.map(n => ({ 
              id: n.id, 
              ...getNodeDimensions(n.data.properties.length, n.data.navigationProperties?.length || 0) 
          })), 
          edges: rawEdges.map(e => ({ id: e.id, sources: [e.source], targets: [e.target] }))
        };

        const layoutedGraph = await elk.layout(elkGraph);
        
        // 构造基础 ReactFlow Node/Edge 对象
        const preCalcNodes: Node[] = initialNodesRaw.map(node => {
          const elkNode = layoutedGraph.children?.find(n => n.id === node.id);
          return {
            ...node,
            position: { x: elkNode?.x || 0, y: elkNode?.y || 0 },
            width: 250, 
            height: elkNode?.height || 200
          };
        });

        const preCalcEdges: Edge[] = rawEdges.map((e: any) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            sourceHandle: undefined, 
            targetHandle: undefined, 
            type: 'smoothstep', 
            pathOptions: { borderRadius: 20 },
            markerStart: { type: MarkerType.ArrowClosed, color: e.color },
            markerEnd: { type: MarkerType.ArrowClosed, color: e.color },
            animated: false,
            style: { stroke: e.color, strokeWidth: 1.5, opacity: 0.8 },
            label: e.label,
            labelStyle: { fill: e.color, fontWeight: 700, fontSize: 10 },
            labelBgStyle: { fill: '#ffffff', fillOpacity: 0.7, rx: 4, ry: 4 },
            data: { originalColor: e.color }
        }));

        const { nodes: finalNodes, edges: finalEdges } = calculateDynamicLayout(preCalcNodes, preCalcEdges);

        setNodes(finalNodes);
        setEdges(finalEdges);
        setHasData(true);
      } catch (err) {
        console.error("ER Diagram generation failed", err);
        setHasData(false);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [url]);

  // 处理节点点击事件：多选/反选逻辑
  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    event.stopPropagation();
    const isCtrlPressed = event.ctrlKey || event.metaKey;
    const currentEdges = edgesRef.current; 

    setHighlightedIds((prev) => {
        const next = new Set(isCtrlPressed ? prev : []);

        if (isCtrlPressed && prev.has(node.id)) {
            next.delete(node.id);
        } else {
            next.add(node.id);
            currentEdges.forEach(edge => {
                if (edge.source === node.id) next.add(edge.target);
                if (edge.target === node.id) next.add(edge.source);
            });
        }
        return next;
    });
  }, []);

  // 监听 background 点击，重置视图
  const onPaneClick = useCallback(() => {
      setHighlightedIds(new Set());
      setActiveEntityId(null); // Close any active popover
  }, []);

  // 监听 highlightedIds 变化，批量更新节点和边的样式
  useEffect(() => {
      if (highlightedIds.size === 0) {
          setNodes((nds) => nds.map(n => ({
              ...n,
              style: { ...n.style, opacity: 1, filter: 'none' }
          })));
          setEdges((eds) => eds.map(e => ({
              ...e, 
              animated: false, 
              style: { stroke: e.data?.originalColor, strokeWidth: 1.5, opacity: 0.8 }, 
              markerStart: { type: MarkerType.ArrowClosed, color: e.data?.originalColor },
              markerEnd: { type: MarkerType.ArrowClosed, color: e.data?.originalColor },
              labelStyle: { ...e.labelStyle, fill: e.data?.originalColor, opacity: 1 },
              labelBgStyle: { ...e.labelBgStyle, fillOpacity: 0.7 },
              zIndex: 0
          })));
          return;
      }

      setNodes((nds) => nds.map((n) => {
          const isHighlighted = highlightedIds.has(n.id);
          return {
            ...n,
            style: { 
              ...n.style,
              opacity: isHighlighted ? 1 : 0.1, 
              filter: isHighlighted ? 'none' : 'grayscale(100%)',
              transition: 'all 0.3s ease'
            }
          };
      }));

      setEdges((eds) => eds.map(e => {
          const isVisible = highlightedIds.has(e.source) && highlightedIds.has(e.target);
          const color = isVisible ? (e.data?.originalColor || '#0070f3') : '#999';
          
          return {
              ...e,
              animated: isVisible,
              style: { 
                  ...e.style, 
                  stroke: color,
                  strokeWidth: isVisible ? 2.5 : 1,
                  opacity: isVisible ? 1 : 0.05, 
                  zIndex: isVisible ? 10 : 0
              },
              markerStart: { type: MarkerType.ArrowClosed, color: color },
              markerEnd: { type: MarkerType.ArrowClosed, color: color },
              labelStyle: { ...e.labelStyle, fill: color, opacity: isVisible ? 1 : 0 },
              labelBgStyle: { ...e.labelBgStyle, fillOpacity: isVisible ? 0.9 : 0 }
          };
      }));
  }, [highlightedIds, setNodes, setEdges]);

  const resetView = () => {
     setHighlightedIds(new Set());
     setActiveEntityId(null);
  };

  return (
    <div className="w-full h-full relative bg-content2/30">
      {loading && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm gap-4">
          <Spinner size="lg" color="primary" />
          <p className="text-default-500 font-medium">Analyzing OData Metadata...</p>
        </div>
      )}
      
      {!loading && !hasData && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-default-400">
           <p>No Entities found or Metadata parse error.</p>
           <Button size="sm" variant="light" color="primary" onPress={() => window.location.reload()}>Retry</Button>
        </div>
      )}

      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2 items-end">
        <div className="flex items-center gap-2 bg-content1/90 backdrop-blur-md p-1.5 px-3 rounded-lg border border-divider shadow-sm">
            <span className="text-xs font-medium text-default-500 flex items-center gap-1">
                <Zap size={14} className={isPerformanceMode ? "text-warning" : "text-default-400"} fill={isPerformanceMode ? "currentColor" : "none"} />
                性能模式
            </span>
            <Switch size="sm" isSelected={isPerformanceMode} onValueChange={setIsPerformanceMode} aria-label="性能模式" />
        </div>
        <Button size="sm" color="primary" variant="flat" onPress={resetView}>重置视图</Button>
      </div>
      
      {/* Provide DiagramContext to all Nodes */}
      <DiagramContext.Provider value={{ activeEntityId, setActiveEntityId }}>
        <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeDrag={onNodeDrag}
            onNodeDragStop={onNodeDragStop}
            nodeTypes={nodeTypes}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            fitView
            attributionPosition="bottom-right"
            minZoom={0.1}
            maxZoom={1.5}
        >
            <Controls className="bg-content1 border border-divider shadow-sm" />
            <Background color="#888" gap={24} size={1} />
        </ReactFlow>
      </DiagramContext.Provider>
    </div>
  );
};

export default ODataERDiagram;