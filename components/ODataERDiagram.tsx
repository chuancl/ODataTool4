import React, { useCallback, useEffect, useState } from 'react';
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
  useStore
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

// 实体节点组件
const EntityNode = ({ data, selected }: NodeProps) => {
  // 从 data 中获取动态计算好的 handles
  const dynamicHandles: DynamicHandleConfig[] = data.dynamicHandles || [];

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
            key={handle.id}
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
        const initialNodes = entities.map((e) => ({
          id: e.name,
          type: 'entity',
          data: { 
            label: e.name, 
            properties: e.properties, 
            keys: e.keys,
            navigationProperties: e.navigationProperties,
            fieldColors: fieldColorMap[e.name] || {},
            dynamicHandles: [] // 先置空，布局后再计算
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
            'elk.edgeRouting': 'SPLINES', // 使用样条曲线路由可能更顺滑
            'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
            'elk.spacing.componentComponent': '200',
          },
          children: initialNodes.map(n => ({ 
              id: n.id, 
              ...getNodeDimensions(n.data.properties.length, n.data.navigationProperties?.length || 0) 
          })), 
          edges: rawEdges.map(e => ({ id: e.id, sources: [e.source], targets: [e.target] }))
        };

        const layoutedGraph = await elk.layout(elkGraph);

        // 4. --- 核心优化：动态 Port 分配与排序 ---
        // 这一步的目的是确定每个边具体连接到节点的哪个位置，并保证不交叉
        
        // 存储每个节点每个方向上的连接请求
        // 结构: Map<NodeId, { Top: Connection[], Right: Connection[], ... }>
        const nodeConnections: Record<string, Record<string, any[]>> = {};
        const getConnections = (nodeId: string, side: Position) => {
          if (!nodeConnections[nodeId]) nodeConnections[nodeId] = { [Position.Top]: [], [Position.Right]: [], [Position.Bottom]: [], [Position.Left]: [] };
          return nodeConnections[nodeId][side];
        };

        // 最终的节点 Map，方便快速查找
        const layoutedNodesMap = new Map();
        
        const finalNodes = initialNodes.map(node => {
          const elkNode = layoutedGraph.children?.find(n => n.id === node.id);
          const newNode = {
            ...node,
            position: { x: elkNode?.x || 0, y: elkNode?.y || 0 },
            width: 220, // 实际渲染宽度
            height: elkNode?.height ? elkNode.height - 30 : 200 // 修正一下高度
          };
          layoutedNodesMap.set(node.id, newNode);
          return newNode;
        });

        // 4.1 遍历所有边，决定连接方向并加入列表
        const finalEdges = rawEdges.map(e => {
            const sourceNode = layoutedNodesMap.get(e.source);
            const targetNode = layoutedNodesMap.get(e.target);
            if (!sourceNode || !targetNode) return null;

            const sx = sourceNode.position.x + sourceNode.width / 2;
            const sy = sourceNode.position.y + sourceNode.height / 2;
            const tx = targetNode.position.x + targetNode.width / 2;
            const ty = targetNode.position.y + targetNode.height / 2;

            const dx = tx - sx;
            const dy = ty - sy;
            
            let sourcePos: Position, targetPos: Position;

            // 简单的方向判定逻辑 (可以根据需要调整阈值)
            if (Math.abs(dx) > Math.abs(dy)) {
                // 水平距离大，左右连接
                sourcePos = dx > 0 ? Position.Right : Position.Left;
                targetPos = dx > 0 ? Position.Left : Position.Right;
            } else {
                // 垂直距离大，上下连接
                sourcePos = dy > 0 ? Position.Bottom : Position.Top;
                targetPos = dy > 0 ? Position.Top : Position.Bottom;
            }

            // 记录连接信息，用于后续排序
            // 保存对方的坐标，这是排序的关键：
            // 如果是在左右两侧的边，我们希望根据对方的 Y 坐标排序
            // 如果是在上下两侧的边，我们希望根据对方的 X 坐标排序
            getConnections(e.source, sourcePos).push({
                edgeId: e.id,
                type: 'source',
                otherX: tx,
                otherY: ty
            });

            getConnections(e.target, targetPos).push({
                edgeId: e.id,
                type: 'target',
                otherX: sx,
                otherY: sy
            });

            // 暂时返回不完整的 edge，后面会填入 handle id
            return {
                id: e.id,
                source: e.source,
                target: e.target,
                data: { label: e.label, originalColor: e.color },
                // 这里的 handle id 稍后生成
                tempSourcePos: sourcePos,
                tempTargetPos: targetPos,
                sourceHandle: undefined as string | undefined,
                targetHandle: undefined as string | undefined
            };
        }).filter(Boolean);

        // 4.2 对连接进行排序并生成 Handle Config
        finalNodes.forEach(node => {
            const dynamicHandles: DynamicHandleConfig[] = [];
            const connections = nodeConnections[node.id];

            if (connections) {
                Object.values(Position).forEach(pos => {
                    const list = connections[pos];
                    if (list && list.length > 0) {
                        // 排序逻辑：
                        // 如果是 Top/Bottom，按对方的 X 坐标从小到大排 (从左到右)
                        // 如果是 Left/Right，按对方的 Y 坐标从小到大排 (从上到下)
                        list.sort((a, b) => {
                            if (pos === Position.Top || pos === Position.Bottom) {
                                return a.otherX - b.otherX;
                            } else {
                                return a.otherY - b.otherY;
                            }
                        });

                        // 生成 Handle
                        list.forEach((conn, index) => {
                            const count = list.length;
                            // 均匀分布算法：(index + 1) * 100 / (count + 1)
                            // 比如 count=1 -> 50%
                            // count=2 -> 33%, 66%
                            const offset = ((index + 1) * 100) / (count + 1);
                            
                            // 构造唯一的 Handle ID
                            const handleId = `${pos}-${index}-${conn.type}`; // e.g. Right-0-source
                            
                            dynamicHandles.push({
                                id: handleId,
                                type: conn.type, // 'source' or 'target'
                                position: pos,
                                offset: offset
                            });

                            // 回填 Edge 的 handle ID
                            const edge = finalEdges.find((e: any) => e.id === conn.edgeId);
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
            node.data.dynamicHandles = dynamicHandles;
        });

        // 4.3 生成最终的 Edge 对象
        const realEdges: Edge[] = finalEdges.map((e: any) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            sourceHandle: e.sourceHandle,
            targetHandle: e.targetHandle,
            type: 'smoothstep', // 使用平滑阶梯线，配合分散的端口效果最好
            pathOptions: { borderRadius: 20 },
            markerStart: { type: MarkerType.ArrowClosed, color: e.data.originalColor },
            markerEnd: { type: MarkerType.ArrowClosed, color: e.data.originalColor },
            animated: false,
            style: { stroke: e.data.originalColor, strokeWidth: 1.5, opacity: 0.8 },
            label: e.data.label,
            labelStyle: { fill: e.data.originalColor, fontWeight: 700, fontSize: 10 },
            labelBgStyle: { fill: '#ffffff', fillOpacity: 0.7, rx: 4, ry: 4 },
            data: e.data
        }));

        setNodes(finalNodes);
        setEdges(realEdges);
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

  const onNodeClick = useCallback((event: any, node: any) => {
    const connectedEdgeIds = edges.filter(e => e.source === node.id || e.target === node.id);
    const connectedNodeIds = new Set(connectedEdgeIds.flatMap(e => [e.source, e.target]));
    
    setNodes((nds) => nds.map((n) => {
      const isRelated = connectedNodeIds.has(n.id) || n.id === node.id;
      return {
        ...n,
        style: { 
          opacity: isRelated ? 1 : 0.1, 
          filter: isRelated ? 'none' : 'grayscale(100%)',
          transition: 'all 0.3s ease'
        }
      };
    }));

    setEdges((eds) => eds.map(e => {
        const isDirectlyConnected = e.source === node.id || e.target === node.id;
        const color = isDirectlyConnected ? (e.data?.originalColor || '#0070f3') : '#999';
        
        return {
            ...e,
            animated: isDirectlyConnected,
            style: { 
                ...e.style, 
                stroke: color,
                strokeWidth: isDirectlyConnected ? 2.5 : 1,
                opacity: isDirectlyConnected ? 1 : 0.1, 
                zIndex: isDirectlyConnected ? 10 : 0
            },
            markerStart: { type: MarkerType.ArrowClosed, color: color },
            markerEnd: { type: MarkerType.ArrowClosed, color: color },
            labelStyle: { ...e.labelStyle, fill: color, opacity: isDirectlyConnected ? 1 : 0 },
            labelBgStyle: { ...e.labelBgStyle, fillOpacity: isDirectlyConnected ? 0.9 : 0 }
        };
    }));
  }, [edges, setNodes, setEdges]);

  const resetView = () => {
     setNodes((nds) => nds.map(n => ({...n, style: { opacity: 1, filter: 'none' }})));
     setEdges((eds) => eds.map(e => ({
         ...e, 
         animated: false, 
         style: { stroke: e.data?.originalColor, strokeWidth: 1.5, opacity: 0.8 }, 
         markerStart: { type: MarkerType.ArrowClosed, color: e.data?.originalColor },
         markerEnd: { type: MarkerType.ArrowClosed, color: e.data?.originalColor },
         labelStyle: { ...e.labelStyle, fill: e.data?.originalColor, opacity: 1 },
         labelBgStyle: { ...e.labelBgStyle, fillOpacity: 0.7 }
     })));
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
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
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