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
import { parseMetadataToSchema } from '@/utils/odata-helper';
import { Button, Spinner, Popover, PopoverTrigger, PopoverContent, ScrollShadow, Divider, Badge, Chip } from "@nextui-org/react";
import { Key, Link2, Info, X, ChevronDown, ChevronUp, ArrowRightCircle, Table2, Database } from 'lucide-react';

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

      // 如果节点尚未渲染（例如刚展开），可能没有 width/height，使用估算值
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
const EntityNode = ({ id, data, selected }: NodeProps) => {
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
    // 稍微延迟一下，等待 DOM 渲染完成高度变化
    const timer = setTimeout(() => updateNodeInternals(id), 50);
    return () => clearTimeout(timer);
  }, [isExpanded, id, updateNodeInternals]);

  // 处理导航跳转
  const handleJumpToEntity = (e: React.MouseEvent, targetEntityName: string) => {
    e.stopPropagation();
    // 尝试找到目标节点
    // 假设 ID 就是 Entity Name (目前的逻辑是这样的)
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
  };

  // 查找某个属性是否是外键，并返回关联信息
  const getForeignKeyInfo = (propName: string) => {
    if (!data.navigationProperties) return null;
    
    for (const nav of data.navigationProperties) {
      if (nav.constraints) {
        const constraint = nav.constraints.find((c: any) => c.sourceProperty === propName);
        if (constraint) {
          // 清理 Target Type 名称
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
  };

  const visibleProperties = isExpanded ? data.properties : data.properties.slice(0, 12);
  const hiddenCount = data.properties.length - 12;

  return (
    <div className={`
      relative flex flex-col
      border-2 rounded-lg min-w-[240px] max-w-[300px] bg-content1 transition-all
      ${selected ? 'border-primary shadow-2xl ring-2 ring-primary/30 z-50' : 'border-divider shadow-sm'}
    `}>
      
      {/* Dynamic Handles */}
      {dynamicHandles.map((handle) => {
        const isVertical = handle.position === Position.Top || handle.position === Position.Bottom;
        const style: React.CSSProperties = {
          position: 'absolute',
          [isVertical ? 'left' : 'top']: `${handle.offset}%`,
          opacity: 0, 
          width: '12px', height: '12px', // 稍微加大一点交互区域
          zIndex: 10,
        };

        if (handle.position === Position.Top) style.top = '-6px';
        if (handle.position === Position.Bottom) style.bottom = '-6px';
        if (handle.position === Position.Left) style.left = '-6px';
        if (handle.position === Position.Right) style.right = '-6px';

        return <Handle key={handle.id} id={handle.id} type={handle.type} position={handle.position} style={style} />;
      })}

      {/* --- Entity Title Popover --- */}
      <Popover 
        isOpen={showEntityDetails} 
        onOpenChange={setShowEntityDetails}
        placement="right-start" 
        offset={20}
        shouldFlip
        isDismissable={false} // 手动关闭
        shouldCloseOnBlur={false} // 点击外部不关闭? 需求说 "鼠标移开pop不消失，需手动关闭" -> 所以用受控模式 + 按钮
        motionProps={{
            variants: {
            enter: { y: 0, opacity: 1, scale: 1, transition: { duration: 0.15, ease: "easeOut" } },
            exit: { y: 10, opacity: 0, scale: 0.95, transition: { duration: 0.1, ease: "easeIn" } },
            },
        }}
      >
        <PopoverTrigger>
          <div 
            className="bg-primary/10 p-2 font-bold text-center border-b border-divider text-sm text-primary rounded-t-md cursor-pointer hover:bg-primary/20 transition-colors flex items-center justify-center gap-2 group"
            onClick={(e) => { e.stopPropagation(); setShowEntityDetails(true); }}
          >
             <Table2 size={14} />
             <span>{data.label}</span>
             <Info size={12} className="opacity-0 group-hover:opacity-50 transition-opacity" />
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-[320px] p-0">
            <div className="bg-content1 rounded-lg shadow-lg border border-divider overflow-hidden">
                <div className="flex justify-between items-center p-3 bg-default-100 border-b border-divider">
                    <div className="flex items-center gap-2 font-bold text-default-700">
                        <Database size={16} className="text-primary"/>
                        {data.label}
                    </div>
                    <Button isIconOnly size="sm" variant="light" onPress={() => setShowEntityDetails(false)}>
                        <X size={16} />
                    </Button>
                </div>
                <div className="p-4 flex flex-col gap-3 text-sm">
                    <div className="grid grid-cols-3 gap-2">
                        <div className="text-default-500">Namespace</div>
                        <div className="col-span-2 font-mono text-xs bg-default-50 p-1 rounded">{data.namespace || 'N/A'}</div>
                        
                        <div className="text-default-500">Keys</div>
                        <div className="col-span-2 flex flex-wrap gap-1">
                            {data.keys.map((k: string) => (
                                <Badge key={k} color="warning" variant="flat" size="sm" className="static">{k}</Badge>
                            ))}
                        </div>

                        <div className="text-default-500">Properties</div>
                        <div className="col-span-2 text-default-700">{data.properties.length} fields</div>

                        <div className="text-default-500">Relations</div>
                        <div className="col-span-2 text-default-700">{data.navigationProperties?.length || 0} links</div>
                    </div>
                </div>
                <div className="bg-default-50 p-2 text-xs text-default-400 text-center border-t border-divider">
                    Entity Type Details
                </div>
            </div>
        </PopoverContent>
      </Popover>

      {/* Content Area */}
      <div className="p-2 flex flex-col gap-0.5 bg-content1 rounded-b-md">
        
        {/* --- Properties --- */}
        {visibleProperties.map((prop: any) => {
          const fieldColor = data.fieldColors?.[prop.name];
          const isKey = data.keys.includes(prop.name);
          const fkInfo = getForeignKeyInfo(prop.name);

          return (
            <Popover key={prop.name} placement="right" showArrow offset={10}>
                <PopoverTrigger>
                    <div 
                      className={`
                        text-[10px] flex items-center justify-between p-1.5 rounded-sm border-l-2 transition-colors cursor-pointer group
                        ${isKey ? 'bg-warning/10 text-warning-700 font-semibold' : 'text-default-600 hover:bg-default-100'}
                        ${fieldColor ? '' : 'border-transparent'}
                      `}
                      style={fieldColor ? { borderColor: fieldColor, backgroundColor: `${fieldColor}15` } : {}}
                      onClick={(e) => e.stopPropagation()} // 阻止触发节点点击
                    >
                       <span className="flex items-center gap-1.5 truncate max-w-[140px]">
                         {isKey && <Key size={8} className="shrink-0 text-warning" />}
                         {fkInfo && <Link2 size={8} className="shrink-0 text-secondary" />}
                         <span style={fieldColor ? { color: fieldColor, fontWeight: 700 } : {}}>{prop.name}</span>
                       </span>
                       <span className="text-[9px] text-default-400 ml-1 opacity-70 font-mono group-hover:opacity-100">{prop.type.split('.').pop()}</span>
                    </div>
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
            <>
                <div className="h-px bg-divider my-2 mx-1 opacity-50" />
                <div className="px-1 mb-1 text-[9px] font-bold text-default-400 uppercase tracking-wider">Navigation</div>
                {data.navigationProperties.slice(0, isExpanded ? undefined : 8).map((nav: any) => {
                    const cleanType = nav.targetType?.replace('Collection(', '').replace(')', '').split('.').pop();
                    const isCollection = nav.targetType?.startsWith('Collection');
                    
                    return (
                        <div 
                            key={nav.name} 
                            className="text-[10px] flex items-center justify-between p-1.5 rounded-sm text-secondary-600 bg-secondary/5 hover:bg-secondary/20 border border-transparent hover:border-secondary/30 transition-all cursor-pointer group mb-0.5"
                            onClick={(e) => handleJumpToEntity(e, cleanType)}
                            title={`Jump to ${cleanType}`}
                        >
                            <span className="flex items-center gap-1.5 truncate max-w-[130px]">
                                <ArrowRightCircle size={10} className="shrink-0 opacity-50 group-hover:opacity-100 transition-opacity" />
                                <span className="font-medium">{nav.name}</span>
                            </span>
                            <div className="flex items-center gap-1">
                                <span className="text-[8px] opacity-50 font-mono">{isCollection ? '1..N' : '1..1'}</span>
                                <span className="text-[9px] opacity-70 truncate max-w-[60px] font-bold">{cleanType}</span>
                            </div>
                        </div>
                    );
                })}
                 {data.navigationProperties.length > 8 && !isExpanded && (
                    <div className="text-[9px] text-default-300 text-center pt-1 italic">
                        + {data.navigationProperties.length - 8} relations
                    </div>
                )}
            </>
        )}
      </div>
    </div>
  );
};

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
  const lastDragTime = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);

  // 节点拖拽处理函数 (Throttled)
  const onNodeDrag = useCallback((event: React.MouseEvent, node: Node, draggedNodes: Node[]) => {
    const now = Date.now();
    // 节流: 限制执行频率 (30ms 约等于 33FPS)，给渲染留出时间
    if (now - lastDragTime.current < 30) {
      return;
    }
    lastDragTime.current = now;

    if (rafRef.current) cancelAnimationFrame(rafRef.current);

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

        // 2. 重新计算布局
        const { nodes: newNodes, edges: newEdges } = calculateDynamicLayout(mergedNodes, currentEdges);
        
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