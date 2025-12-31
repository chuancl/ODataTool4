import React, { useCallback, useEffect, useState, useRef } from 'react';
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
  useUpdateNodeInternals
} from 'reactflow';
import 'reactflow/dist/style.css';
import ELK from 'elkjs/lib/elk.bundled.js';
import { parseMetadataToSchema } from '@/utils/odata-helper';
import { Button, Spinner } from "@nextui-org/react";
import { Key, Link2 } from 'lucide-react';

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

// --- 新增：动态 Handle 配置接口 ---
interface DynamicHandleConfig {
  id: string;
  type: 'source' | 'target';
  position: Position;
  offset: number; // 0-100%
}

// --------------------------------------------------------
// Core Logic: 动态布局计算函数 (提取到组件外)
// --------------------------------------------------------
const calculateDynamicLayout = (nodes: Node[], edges: Edge[]) => {
  // 1. 建立索引
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  
  // 存储连接信息用于排序
  // NodeID -> Position -> List of connections
  const connections: Record<string, Record<string, any[]>> = {};

  // 初始化结构
  nodes.forEach(n => {
    connections[n.id] = {
        [Position.Top]: [],
        [Position.Right]: [],
        [Position.Bottom]: [],
        [Position.Left]: []
    };
  });

  // 2. 遍历边，确定每一条边的最佳连接方向
  // 这一步决定了边是从哪个面出来的
  const updatedEdges = edges.map(edge => {
      const sourceNode = nodeMap.get(edge.source);
      const targetNode = nodeMap.get(edge.target);
      
      if (!sourceNode || !targetNode) return { ...edge };

      // 使用当前位置计算中心点
      // 注意：如果 width/height 缺失，使用默认值
      const sW = sourceNode.width || 220;
      const sH = sourceNode.height || 150;
      const tW = targetNode.width || 220;
      const tH = targetNode.height || 150;

      const sx = sourceNode.position.x + sW / 2;
      const sy = sourceNode.position.y + sH / 2;
      const tx = targetNode.position.x + tW / 2;
      const ty = targetNode.position.y + tH / 2;

      const dx = tx - sx;
      const dy = ty - sy;
      
      let sourcePos: Position, targetPos: Position;

      // 简单的方向判定逻辑: 哪个轴距离更远，就用哪个轴连接
      if (Math.abs(dx) > Math.abs(dy)) {
          // 水平距离大，左右连接
          sourcePos = dx > 0 ? Position.Right : Position.Left;
          targetPos = dx > 0 ? Position.Left : Position.Right;
      } else {
          // 垂直距离大，上下连接
          sourcePos = dy > 0 ? Position.Bottom : Position.Top;
          targetPos = dy > 0 ? Position.Top : Position.Bottom;
      }

      // 记录连接，用于后续排序
      // 我们需要知道"对方"的坐标，以便让线不交叉
      connections[sourceNode.id]?.[sourcePos]?.push({
          edgeId: edge.id,
          type: 'source',
          otherX: tx,
          otherY: ty
      });

      connections[targetNode.id]?.[targetPos]?.push({
          edgeId: edge.id,
          type: 'target',
          otherX: sx,
          otherY: sy
      });

      return { ...edge }; // 返回副本
  });

  // 3. 对每个节点的每个面进行排序，并生成 Handle
  const updatedNodes = nodes.map(node => {
      const dynamicHandles: DynamicHandleConfig[] = [];
      const nodeConns = connections[node.id];

      if (nodeConns) {
          Object.values(Position).forEach(pos => {
              const list = nodeConns[pos];
              if (list && list.length > 0) {
                  // 排序逻辑：
                  // 如果是 Top/Bottom (垂直面)，按对方的 X 坐标排序 -> 保证线平行不交叉
                  // 如果是 Left/Right (水平面)，按对方的 Y 坐标排序
                  list.sort((a, b) => {
                      if (pos === Position.Top || pos === Position.Bottom) {
                          return a.otherX - b.otherX;
                      } else {
                          return a.otherY - b.otherY;
                      }
                  });

                  // 生成均匀分布的 Handle
                  list.forEach((conn, index) => {
                      const count = list.length;
                      // 均匀分布算法：(index + 1) / (count + 1) * 100%
                      const offset = ((index + 1) * 100) / (count + 1);
                      
                      // [CRITICAL FIX]: 
                      // Handle ID 必须是确定的，不能依赖 Position 或 Index，否则拖动时 ID 变化会导致连线断裂。
                      // 我们使用 Edge ID + Role 作为唯一标识。
                      // 这样即使 Handle 从 Top 移动到 Left，它的 ID 仍然不变，React Flow 就能保持连接。
                      const handleId = `${conn.edgeId}-${conn.type}`;
                      
                      dynamicHandles.push({
                          id: handleId,
                          type: conn.type, // 'source' or 'target'
                          position: pos,
                          offset: offset
                      });

                      // 回填 Edge 的 handle ID
                      const edge = updatedEdges.find((e: any) => e.id === conn.edgeId);
                      if (edge) {
                          if (conn.type === 'source') {
                              edge.sourceHandle = handleId;
                          } else {
                              edge.targetHandle = handleId;
                          }
                      }
                  });
              }
          });
      }
      
      return {
          ...node,
          data: { ...node.data, dynamicHandles }
      };
  });

  return { nodes: updatedNodes, edges: updatedEdges };
};


// 实体节点组件
const EntityNode = ({ id, data, selected }: NodeProps) => {
  // 必须引入此 Hook 通知 React Flow 更新内部句柄位置
  const updateNodeInternals = useUpdateNodeInternals();
  
  // 从 data 中获取动态计算好的 handles
  const dynamicHandles: DynamicHandleConfig[] = data.dynamicHandles || [];

  // 当 dynamicHandles 变化时，触发重绘
  useEffect(() => {
    updateNodeInternals(id);
  }, [id, updateNodeInternals, JSON.stringify(dynamicHandles)]);

  return (
    <div className={`border-2 rounded-lg min-w-[200px] bg-content1 transition-all ${selected ? 'border-primary shadow-xl ring-2 ring-primary/20' : 'border-divider shadow-sm'}`}>
      
      {/* 动态渲染 Handles，均匀分布在边框上 */}
      {dynamicHandles.map((handle) => {
        const isVertical = handle.position === Position.Top || handle.position === Position.Bottom;
        const style: React.CSSProperties = {
          position: 'absolute',
          // 根据方向设置偏移量，实现均匀分布
          [isVertical ? 'left' : 'top']: `${handle.offset}%`,
          // 样式微调，使其不可见或为小点，避免视觉干扰，这里设为透明但保留交互区域
          opacity: 0, 
          width: '8px', 
          height: '8px',
          background: 'var(--nextui-colors-primary)',
          zIndex: 10,
        };

        // 修正位置偏移，让其正好骑在边线上
        if (handle.position === Position.Top) style.top = '-4px';
        if (handle.position === Position.Bottom) style.bottom = '-4px';
        if (handle.position === Position.Left) style.left = '-4px';
        if (handle.position === Position.Right) style.right = '-4px';

        return (
          <Handle 
            key={handle.id} // Stable Key based on stable ID
            id={handle.id}
            type={handle.type}
            position={handle.position}
            style={style}
          />
        );
      })}

      {/* 标题栏 */}
      <div className="bg-primary/10 p-2 font-bold text-center border-b border-divider text-sm text-primary rounded-t-md">
         {data.label}
      </div>

      {/* 内容区域 */}
      <div className="p-2 flex flex-col gap-0.5 bg-content1 rounded-b-md">
        
        {/* 普通属性 */}
        {data.properties.slice(0, 12).map((prop: any) => {
          const fieldColor = data.fieldColors?.[prop.name];
          
          return (
            <div 
              key={prop.name} 
              className={`text-[10px] flex items-center justify-between p-1 rounded-sm border-l-2 transition-colors
                ${data.keys.includes(prop.name) ? 'bg-warning/10 text-warning-700 font-semibold' : 'text-default-600'}
                ${fieldColor ? '' : 'border-transparent'}
              `}
              style={fieldColor ? { borderColor: fieldColor, backgroundColor: `${fieldColor}15` } : {}}
            >
               <span className="flex items-center gap-1 truncate max-w-[130px]" title={prop.name}>
                 {data.keys.includes(prop.name) && <Key size={8} className="shrink-0" />}
                 <span style={fieldColor ? { color: fieldColor, fontWeight: 700 } : {}}>{prop.name}</span>
               </span>
               <span className="text-[9px] text-default-400 ml-1 opacity-70">{prop.type.split('.').pop()}</span>
            </div>
          );
        })}
        {data.properties.length > 12 && (
            <div className="text-[9px] text-default-300 text-center pt-1 italic">
                + {data.properties.length - 12} properties
            </div>
        )}

        {/* 导航属性 */}
        {data.navigationProperties && data.navigationProperties.length > 0 && (
            <>
                <div className="h-px bg-divider my-1 mx-1 opacity-50" />
                {data.navigationProperties.slice(0, 8).map((nav: any) => {
                    const cleanType = nav.targetType?.replace('Collection(', '').replace(')', '').split('.').pop();
                    return (
                        <div key={nav.name} className="text-[10px] flex items-center justify-between p-1 rounded-sm text-default-500 hover:text-primary transition-colors">
                            <span className="flex items-center gap-1 truncate max-w-[130px]" title={`Navigation: ${nav.name}`}>
                                <Link2 size={8} className="shrink-0 opacity-70" />
                                <span className="italic font-medium">{nav.name}</span>
                            </span>
                            <span className="text-[9px] opacity-50 truncate max-w-[60px]">{cleanType}</span>
                        </div>
                    );
                })}
                 {data.navigationProperties.length > 8 && (
                    <div className="text-[9px] text-default-300 text-center pt-1 italic">
                        + {data.navigationProperties.length - 8} nav props
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

const ODataERDiagram: React.FC<Props> = ({ url }) => {
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

        // 2. 重新计算布局
        const { nodes: newNodes, edges: newEdges } = calculateDynamicLayout(mergedNodes, currentEdges);
        
        // 3. 更新状态
        setNodes(newNodes);
        // 重要优化：如果 Edge ID 和 Handle ID 逻辑不变，其实 setEdges 是可选的。
        // 但为了确保首次拖动初始化等情况，我们还是调用它。
        // 由于 Handle ID 现在是稳定的（基于 Edge ID），这一步不会引起 Edge 重建，只会更新引用。
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
        const { entities } = parseMetadataToSchema(xml);

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

                    if (processedPairs.has(pairKey)) {
                        return;
                    }
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

        // 2. 初始化节点 (先不带 Handles)
        const initialNodesRaw = entities.map((e) => ({
          id: e.name,
          type: 'entity',
          data: { 
            label: e.name, 
            properties: e.properties, 
            keys: e.keys,
            navigationProperties: e.navigationProperties,
            fieldColors: fieldColorMap[e.name] || {},
            dynamicHandles: [] 
          },
          position: { x: 0, y: 0 }
        }));

        const getNodeDimensions = (propCount: number, navCount: number) => {
            const visibleProps = Math.min(propCount, 12);
            const visibleNavs = Math.min(navCount, 8);
            const extraHeight = (navCount > 0 ? 10 : 0) + (propCount > 12 ? 20 : 0) + (navCount > 8 ? 20 : 0);
            const height = 45 + (visibleProps * 24) + (visibleNavs * 24) + extraHeight + 50; 
            return { width: 350, height: height };
        };

        // 3. ELK 布局计算
        const elkGraph = {
          id: 'root',
          layoutOptions: {
            'elk.algorithm': 'layered',
            'elk.direction': 'RIGHT',
            'elk.spacing.nodeNode': '150', 
            'elk.layered.spacing.nodeNodeBetweenLayers': '300',
            'elk.edgeRouting': 'SPLINES', 
            'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
            'elk.spacing.componentComponent': '200',
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
            width: 220, 
            height: elkNode?.height ? elkNode.height - 30 : 200
          };
        });

        const preCalcEdges: Edge[] = rawEdges.map((e: any) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            sourceHandle: undefined, // 待计算
            targetHandle: undefined, // 待计算
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

        // 4. --- 核心优化：调用统一的布局计算函数 ---
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
    // 阻止事件冒泡，防止触发背景点击
    event.stopPropagation();

    const isCtrlPressed = event.ctrlKey || event.metaKey;
    const currentEdges = edgesRef.current; // 使用 ref 确保获取最新边数据

    setHighlightedIds((prev) => {
        // 如果是按住 Ctrl，则在原有基础上修改（复制一份 Set）
        // 如果没有按住 Ctrl，则创建一个新的 Set（重置选择）
        const next = new Set(isCtrlPressed ? prev : []);

        if (isCtrlPressed && prev.has(node.id)) {
            // Case: Ctrl + 点击已高亮的节点 -> 仅移除该节点（变暗），不影响其他节点
            next.delete(node.id);
        } else {
            // Case: 普通点击 OR Ctrl + 点击未高亮的节点 -> 添加该节点及其邻居
            next.add(node.id);
            // 查找所有与该节点直接相连的节点
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
      // 1. 如果没有高亮节点，则全部恢复默认显示
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

      // 2. 有高亮节点时，应用样式
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
          // 只有当源节点和目标节点都在高亮集合中时，边才高亮
          const isVisible = highlightedIds.has(e.source) && highlightedIds.has(e.target);
          const color = isVisible ? (e.data?.originalColor || '#0070f3') : '#999';
          
          return {
              ...e,
              animated: isVisible,
              style: { 
                  ...e.style, 
                  stroke: color,
                  strokeWidth: isVisible ? 2.5 : 1,
                  opacity: isVisible ? 1 : 0.05, // 稍微降低未选中边的透明度以突出主体
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