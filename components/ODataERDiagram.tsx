import React, { useCallback, useEffect, useState, useRef, useMemo } from 'react';
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
  useStore,
  useUpdateNodeInternals,
  useReactFlow,
  ReactFlowProvider
} from 'reactflow';
import 'reactflow/dist/style.css';
import ELK from 'elkjs/lib/elk.bundled.js';
import { parseMetadataToSchema, EntityProperty } from '@/utils/odata-helper';
import { Button, Spinner, Popover, PopoverTrigger, PopoverContent, ScrollShadow, Divider, Badge, Chip } from "@nextui-org/react";
import { Key, Link2, Info, X, ChevronDown, ChevronUp, ArrowRightCircle, Table2, Database, Check, Minus } from 'lucide-react';
import { useReactTable, getCoreRowModel, flexRender, createColumnHelper } from '@tanstack/react-table';

const elk = new ELK();

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
// Sub-Component: Entity Details Table
// --------------------------------------------------------
const EntityDetailsTable = ({ 
    properties, 
    keys, 
    getFkInfo 
}: { 
    properties: EntityProperty[], 
    keys: string[], 
    getFkInfo: (name: string) => any 
}) => {
    const columnHelper = createColumnHelper<EntityProperty>();

    const columns = useMemo(() => [
        columnHelper.accessor('name', {
            header: 'Field',
            cell: info => {
                const isKey = keys.includes(info.getValue());
                return (
                    <div className="flex items-center gap-1">
                        {isKey && <Key size={10} className="text-warning shrink-0" />}
                        <span className={isKey ? "font-bold text-foreground" : "text-default-700"}>
                            {info.getValue()}
                        </span>
                    </div>
                );
            }
        }),
        columnHelper.accessor('type', {
            header: 'Type',
            cell: info => <span className="font-mono text-xs text-default-500">{info.getValue().split('.').pop()}</span>
        }),
        columnHelper.accessor('nullable', {
            header: 'Null',
            cell: info => info.getValue() ? <Check size={12} className="text-success opacity-50"/> : <Minus size={12} className="text-default-300"/>
        }),
        columnHelper.display({
            id: 'relation',
            header: 'Relation',
            cell: info => {
                const fk = getFkInfo(info.row.original.name);
                if (!fk) return null;
                return (
                    <div className="flex flex-col text-[9px] leading-tight">
                        <div className="flex items-center gap-1 text-secondary">
                            <Link2 size={8} />
                            <span className="font-bold">{fk.targetEntity}</span>
                        </div>
                        <span className="opacity-60 pl-3">.{fk.targetProperty}</span>
                    </div>
                );
            }
        })
    ], [keys, getFkInfo]);

    const table = useReactTable({
        data: properties,
        columns,
        getCoreRowModel: getCoreRowModel(),
    });

    return (
        <div className="w-full">
            <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 z-20 bg-default-100 shadow-sm">
                    {table.getHeaderGroups().map(headerGroup => (
                        <tr key={headerGroup.id}>
                            {headerGroup.headers.map(header => (
                                <th key={header.id} className="p-2 text-[10px] font-bold text-default-500 uppercase tracking-wider border-b border-divider">
                                    {flexRender(header.column.columnDef.header, header.getContext())}
                                </th>
                            ))}
                        </tr>
                    ))}
                </thead>
                <tbody>
                    {table.getRowModel().rows.map((row, idx) => (
                        <tr key={row.id} className={`border-b border-divider/50 last:border-0 ${idx % 2 === 0 ? 'bg-transparent' : 'bg-default-50/50'}`}>
                            {row.getVisibleCells().map(cell => (
                                <td key={cell.id} className="p-2 text-[10px]">
                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

// --------------------------------------------------------
// Core Logic: 动态布局计算函数
// --------------------------------------------------------
const calculateDynamicLayout = (nodes: Node[], edges: Edge[]) => {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const connections: Record<string, Record<string, any[]>> = {};

  nodes.forEach(n => {
    connections[n.id] = {
        [Position.Top]: [], [Position.Right]: [], [Position.Bottom]: [], [Position.Left]: []
    };
  });

  const updatedEdges = edges.map(edge => {
      const sourceNode = nodeMap.get(edge.source);
      const targetNode = nodeMap.get(edge.target);
      if (!sourceNode || !targetNode) return { ...edge };

      const sW = sourceNode.width || 250;
      const sH = sourceNode.height || 200;
      const tW = targetNode.width || 250;
      const tH = targetNode.height || 200;

      const sx = sourceNode.position.x + sW / 2;
      const sy = sourceNode.position.y + sH / 2;
      const tx = targetNode.position.x + tW / 2;
      const ty = targetNode.position.y + tH / 2;

      const dx = tx - sx;
      const dy = ty - sy;
      
      let sourcePos: Position, targetPos: Position;
      if (Math.abs(dx) > Math.abs(dy)) {
          sourcePos = dx > 0 ? Position.Right : Position.Left;
          targetPos = dx > 0 ? Position.Left : Position.Right;
      } else {
          sourcePos = dy > 0 ? Position.Bottom : Position.Top;
          targetPos = dy > 0 ? Position.Top : Position.Bottom;
      }

      connections[sourceNode.id]?.[sourcePos]?.push({
          edgeId: edge.id, type: 'source', otherX: tx, otherY: ty
      });

      connections[targetNode.id]?.[targetPos]?.push({
          edgeId: edge.id, type: 'target', otherX: sx, otherY: sy
      });

      return { ...edge };
  });

  const updatedNodes = nodes.map(node => {
      const dynamicHandles: DynamicHandleConfig[] = [];
      const nodeConns = connections[node.id];

      if (nodeConns) {
          Object.values(Position).forEach(pos => {
              const list = nodeConns[pos];
              if (list && list.length > 0) {
                  list.sort((a, b) => {
                      if (pos === Position.Top || pos === Position.Bottom) return a.otherX - b.otherX;
                      else return a.otherY - b.otherY;
                  });

                  list.forEach((conn, index) => {
                      const count = list.length;
                      const offset = ((index + 1) * 100) / (count + 1);
                      const handleId = `${conn.edgeId}-${conn.type}`;
                      
                      dynamicHandles.push({
                          id: handleId, type: conn.type, position: pos, offset: offset
                      });

                      const edge = updatedEdges.find((e: any) => e.id === conn.edgeId);
                      if (edge) {
                          if (conn.type === 'source') edge.sourceHandle = handleId;
                          else edge.targetHandle = handleId;
                      }
                  });
              }
          });
      }
      return { ...node, data: { ...node.data, dynamicHandles } };
  });

  return { nodes: updatedNodes, edges: updatedEdges };
};


// --------------------------------------------------------
// Component: EntityNode
// --------------------------------------------------------
const EntityNode = React.memo(({ id, data, selected }: NodeProps) => {
  const updateNodeInternals = useUpdateNodeInternals();
  const { fitView, getNodes } = useReactFlow();
  const [isExpanded, setIsExpanded] = useState(false);
  const [showEntityDetails, setShowEntityDetails] = useState(false);

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

  // 处理导航跳转
  const handleJumpToEntity = useCallback((e: React.MouseEvent, targetEntityName: string) => {
    e.stopPropagation();
    const targetId = targetEntityName;
    const nodes = getNodes();
    const targetNode = nodes.find(n => n.id === targetId);

    if (targetNode) {
      fitView({
        nodes: [{ id: targetId }],
        padding: 0.5,
        duration: 1000,
      });
    } else {
      console.warn(`Target node ${targetId} not found.`);
    }
  }, [getNodes, fitView]);

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
                {/* 仅点击文字触发 Popover，同时阻止冒泡防止选中节点（或者允许选中？通常文字点击不应选中节点如果它触发了Pop） */}
                <span 
                    className="cursor-pointer hover:underline underline-offset-2 decoration-primary/50"
                    onClick={(e) => { e.stopPropagation(); setShowEntityDetails(true); }}
                >
                    {data.label}
                </span>
            </PopoverTrigger>
            <PopoverContent className="w-[400px] p-0">
                <div className="bg-content1 rounded-lg shadow-lg border border-divider overflow-hidden flex flex-col max-h-[500px]">
                    <div className="flex justify-between items-center p-3 bg-default-100 border-b border-divider shrink-0">
                        <div className="flex items-center gap-2 font-bold text-default-700">
                            <Database size={16} className="text-primary"/>
                            {data.label}
                            <span className="text-[10px] font-normal text-default-400 bg-white px-1 rounded border border-divider">{data.namespace}</span>
                        </div>
                        <Button isIconOnly size="sm" variant="light" onPress={() => setShowEntityDetails(false)}>
                            <X size={16} />
                        </Button>
                    </div>
                    
                    <ScrollShadow className="flex-1 overflow-auto">
                         <EntityDetailsTable 
                            properties={data.properties} 
                            keys={data.keys} 
                            getFkInfo={getForeignKeyInfo}
                         />
                    </ScrollShadow>
                    
                    <div className="bg-default-50 p-2 text-[10px] text-default-400 text-center border-t border-divider shrink-0 flex justify-between px-4">
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
                 
                 {/* 仅点击属性名触发 Popover */}
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
                    <PopoverContent className="p-3">
                        <div className="text-xs flex flex-col gap-2 min-w-[200px]">
                            <div className="font-bold flex items-center gap-2 border-b border-divider pb-1">
                                {prop.name}
                                {isKey && <Chip size="sm" color="warning" variant="flat" className="h-5 text-[9px] px-1">PK</Chip>}
                                {fkInfo && <Chip size="sm" color="secondary" variant="flat" className="h-5 text-[9px] px-1">FK</Chip>}
                            </div>
                            <div className="grid grid-cols-[60px_1fr] gap-1 text-default-600">
                                <span className="text-default-400">Type:</span> 
                                <span className="font-mono">{prop.type}</span>
                                <span className="text-default-400">Nullable:</span>
                                <span>{prop.nullable ? 'True' : 'False'}</span>
                                {prop.maxLength && (
                                    <>
                                        <span className="text-default-400">Length:</span>
                                        <span>{prop.maxLength}</span>
                                    </>
                                )}
                            </div>
                            
                            {fkInfo && (
                                <div className="bg-secondary/10 p-2 rounded border border-secondary/20 mt-1">
                                    <div className="text-[10px] text-secondary font-bold mb-1 flex items-center gap-1">
                                        <Link2 size={10} /> Foreign Key Relation
                                    </div>
                                    <div className="grid grid-cols-[50px_1fr] gap-1 text-[10px]">
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
                                onClick={(e) => handleJumpToEntity(e, cleanType)}
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

  // 用于管理高亮节点 ID 的集合
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());

  // Refs for stable state access during callbacks
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  
  // Throttle state
  const lastDragTime = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);

  // [REAL-TIME DRAG]
  // 在拖拽过程中实时计算布局，带有节流保护（约30FPS）
  const onNodeDrag = useCallback((event: React.MouseEvent, node: Node, draggedNodes: Node[]) => {
    const now = Date.now();
    // 节流: 限制执行频率 (30ms 约等于 33FPS)，避免过高频率计算导致卡顿
    if (now - lastDragTime.current < 30) {
      return;
    }
    lastDragTime.current = now;

    // 取消上一次未执行的 RAF，避免堆积
    if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
    }

    // 在下一次重绘前执行计算
    rafRef.current = requestAnimationFrame(() => {
        const currentNodes = nodesRef.current;
        const currentEdges = edgesRef.current;
        
        // 1. 合并位置数据
        const draggedMap = new Map(draggedNodes.map(n => [n.id, n]));
        const mergedNodes = currentNodes.map(n => {
            const dragged = draggedMap.get(n.id);
            if (dragged) {
                return { ...n, position: dragged.position, positionAbsolute: dragged.positionAbsolute };
            }
            return n;
        });

        // 2. 重新计算布局 (Handle位置和连接方向)
        const { nodes: newNodes, edges: newEdges } = calculateDynamicLayout(mergedNodes, currentEdges);
        
        // 3. 更新状态
        setNodes(newNodes);
        setEdges(newEdges); 
    });
  }, [setNodes, setEdges]); 

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

      <div className="absolute top-4 right-4 z-10">
        <Button size="sm" color="primary" variant="flat" onPress={resetView}>Reset View</Button>
      </div>
      
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDrag={onNodeDrag}
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
    </div>
  );
};

export default ODataERDiagram;