import { Node, Edge, Position } from 'reactflow';

// --- 动态 Handle 配置接口 ---
export interface DynamicHandleConfig {
  id: string;
  type: 'source' | 'target';
  position: Position;
  offset: number; // 0-100%
}

// --------------------------------------------------------
// Helper: Calculate Dynamic Layout (Handles & Edges)
// --------------------------------------------------------
export const calculateDynamicLayout = (nodes: Node[], edges: Edge[]) => {
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
