import React, { useCallback, useEffect, useState, useContext } from 'react';
import { Handle, Position, NodeProps, useUpdateNodeInternals, useReactFlow } from 'reactflow';
import { Button, Popover, PopoverTrigger, PopoverContent, ScrollShadow, Divider, Chip } from "@nextui-org/react";
import { Key, Link2, Info, X, ChevronDown, ChevronUp, ArrowRightCircle, Table2, Database, Zap, AlignJustify, Hash, CaseSensitive, Download } from 'lucide-react';
import { EntityProperty } from '@/utils/odata-helper';
import { EntityDetailsTable } from './EntityDetailsTable';
import { DiagramContext } from './DiagramContext';
import { DynamicHandleConfig } from './layout';

// --------------------------------------------------------
// Component: EntityNode
// --------------------------------------------------------
export const EntityNode = React.memo(({ id, data, selected }: NodeProps) => {
  const updateNodeInternals = useUpdateNodeInternals();
  const { fitView, getNodes } = useReactFlow();
  const [isExpanded, setIsExpanded] = useState(false);
  const { activeEntityIds, addActiveEntity, removeActiveEntity, switchActiveEntity } = useContext(DiagramContext);

  // Determine if this entity popover should be open
  const showEntityDetails = activeEntityIds.includes(id);

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

  // 处理导航跳转 - 核心逻辑：Fit View + Optional Context Switch
  // shouldOpenPopover: true = 跳转并打开新表格(关闭旧的); false = 仅跳转视角
  const handleJumpToEntity = useCallback((targetEntityName: string, shouldOpenPopover: boolean = false) => {
    if (!targetEntityName) return;
    const safeTargetName = targetEntityName.trim();
    const nodes = getNodes();
    
    // 1. 尝试精确匹配 ID
    let targetNode = nodes.find(n => n.id === safeTargetName);
    
    // 2. 如果没找到，尝试忽略大小写匹配 (增加容错)
    if (!targetNode) {
        targetNode = nodes.find(n => n.id.toLowerCase() === safeTargetName.toLowerCase());
    }

    if (targetNode) {
      const targetId = targetNode.id;
      console.log(`[EntityNode] Jumping to: ${targetId} (Popover: ${shouldOpenPopover})`);

      // 1. Zoom to node (移动视角)
      fitView({
        nodes: [{ id: targetId }],
        padding: 0.5,
        duration: 800,
      });
      
      // 2. Switch active entity ONLY if requested (e.g. from inside the table)
      // 从卡片底部导航点击时，shouldOpenPopover 为 false，仅移动视角
      // 从Pop表格内点击时，shouldOpenPopover 为 true，执行切换逻辑
      if (shouldOpenPopover) {
        switchActiveEntity(id, targetId);
      }
    } else {
        console.warn(`[EntityNode] Target entity not found: "${safeTargetName}"`);
    }
  }, [getNodes, fitView, switchActiveEntity, id]);

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
    // Root Wrapper: Manages Z-Index. 
    // If details are shown, set a very high z-index (2000) so the absolute table overlays other nodes.
    <div 
        className="relative group" 
        style={{ zIndex: showEntityDetails ? 2000 : undefined }}
    >
      {/* --- Main Node Card --- */}
      <div className={`
        relative flex flex-col
        border-2 rounded-lg min-w-[240px] max-w-[300px] bg-content1 transition-all
        ${selected ? 'border-primary shadow-2xl ring-2 ring-primary/30' : 'border-divider shadow-sm'}
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
        <div 
            className="bg-primary/10 p-2 font-bold text-center border-b border-divider text-sm text-primary rounded-t-md flex items-center justify-center gap-2 group cursor-pointer hover:bg-primary/15 transition-colors"
            onClick={(e) => { e.stopPropagation(); addActiveEntity(id); }}
        >
          <Table2 size={14} />
          <span className="hover:underline underline-offset-2 decoration-primary/50">
             {data.label}
          </span>
          <Info size={12} className="opacity-0 group-hover:opacity-50 transition-opacity" />
        </div>

        {/* --- Entity Content Area --- */}
        <div className="p-2 flex flex-col gap-0.5 bg-content1 rounded-b-md">
          {/* Properties */}
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
                  
                  {/* Property Details Popover (Keep as standard Popover for hover interactions) */}
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
                                      onClick={(e) => { e.stopPropagation(); handleJumpToEntity(fkInfo.targetEntity, false); }}
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

          {/* Expand/Collapse */}
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

          {/* Navigation Properties */}
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
                                  onClick={(e) => { e.stopPropagation(); handleJumpToEntity(cleanType, false); }}
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

      {/* --- ATTACHED DETAILS TABLE (Replacing Popover) --- */}
      {/* This renders INSIDE the node container, moving with it, but positioned absolutely to the right. */}
      {showEntityDetails && (
        <div 
            // Important: 'nodrag' prevents ReactFlow from dragging the node when interacting with the table.
            // 'nowheel' prevents the canvas from zooming when scrolling the table.
            // onMouseDown: Stop propagation so we don't drag the node, AND triggers 'addActiveEntity' to bring node to front.
            // onClick: Stop propagation so we DON'T trigger 'onNodeClick' (highlighting logic) in the parent graph.
            className="absolute left-[100%] top-0 ml-5 w-[850px] cursor-default z-[2000] animate-appearance-in nodrag nowheel"
            onMouseDown={(e) => {
                e.stopPropagation(); // Block drag/selection of the underlying node
                addActiveEntity(id); // Bring this entity stack to the top (Z-Index)
            }}
            onClick={(e) => {
                e.stopPropagation(); // Block 'highlight connected entities' logic
            }}
        >
            <div className="bg-content1 rounded-lg shadow-2xl border border-divider overflow-hidden flex flex-col max-h-[600px] ring-1 ring-black/5">
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
                        <Button isIconOnly size="sm" variant="light" onPress={() => removeActiveEntity(id)}>
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
                            // Link inside Table -> Jump AND Open Popover (Close current, open target)
                            handleJumpToEntity(name, true);
                        }}
                        />
                </ScrollShadow>
                
                <div className="bg-default-50 p-2 text-xs text-default-500 text-center border-t border-divider shrink-0 flex justify-between px-4">
                    <span>{data.properties.length} Properties</span>
                    <span>{data.navigationProperties?.length || 0} Relations</span>
                </div>
            </div>
        </div>
      )}
    </div>
  );
});
