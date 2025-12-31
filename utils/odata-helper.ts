export type ODataVersion = 'V2' | 'V3' | 'V4' | 'Unknown';

interface EntityType {
  name: string;
  keys: string[];
  properties: { name: string; type: string }[];
  navigationProperties: { 
    name: string; 
    targetType: string | null; 
    relationship?: string;
    sourceMultiplicity?: string; // e.g. "1", "0..1"
    targetMultiplicity?: string; // e.g. "*"
    constraints?: { sourceProperty: string; targetProperty: string }[]; // FK mappings
  }[];
}

interface AssociationEnd {
    role: string;
    type: string;
    multiplicity: string;
}

interface AssociationConstraint {
    principal: { role: string; propertyRef: string };
    dependent: { role: string; propertyRef: string };
}

// 1. OData 检测与版本识别
export const detectODataVersion = async (url: string): Promise<ODataVersion> => {
  try {
    let metadataUrl = url;
    if (!url.endsWith('$metadata')) {
        metadataUrl = url.endsWith('/') ? `${url}$metadata` : `${url}/$metadata`;
    }

    const response = await fetch(metadataUrl);
    const text = await response.text();
    
    if (text.includes('Version="4.0"')) return 'V4';
    if (text.includes('Version="2.0"')) return 'V2';
    if (text.includes('Version="3.0"')) return 'V3';
    
    const versionHeader = response.headers.get('DataServiceVersion');
    if (versionHeader?.startsWith('2.0')) return 'V2';
    
    return 'Unknown';
  } catch (e) {
    console.error("Failed to detect OData version", e);
    return 'Unknown';
  }
};

// 2. 解析 Metadata
export const parseMetadataToSchema = (xmlText: string) => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "application/xml");
  const schemas = doc.getElementsByTagName("Schema"); 
  
  if (!schemas || schemas.length === 0) return { entities: [], namespace: '' };

  const schema = schemas[0];
  const namespace = schema.getAttribute("Namespace") || "";

  // 存储 Association 详情: Roles 和 Constraints
  const associationMap: Record<string, { 
      roles: Record<string, AssociationEnd>,
      constraint?: AssociationConstraint 
  }> = {};
  
  const assocTypes = schema.getElementsByTagName("Association");
  for (let i = 0; i < assocTypes.length; i++) {
    const at = assocTypes[i];
    const name = at.getAttribute("Name");
    if (!name) continue;

    const fullName = namespace ? `${namespace}.${name}` : name;
    
    // 解析 Ends
    const roles: Record<string, AssociationEnd> = {};
    const ends = at.getElementsByTagName("End");
    for (let j = 0; j < ends.length; j++) {
        const role = ends[j].getAttribute("Role");
        const type = ends[j].getAttribute("Type") || "";
        const multiplicity = ends[j].getAttribute("Multiplicity") || "1";
        if (role) roles[role] = { role, type, multiplicity };
    }

    // 解析 ReferentialConstraint (V2/V3)
    let constraint: AssociationConstraint | undefined;
    const refConst = at.getElementsByTagName("ReferentialConstraint")[0];
    if (refConst) {
        const principal = refConst.getElementsByTagName("Principal")[0];
        const dependent = refConst.getElementsByTagName("Dependent")[0];
        if (principal && dependent) {
            const pRole = principal.getAttribute("Role");
            const pRef = principal.getElementsByTagName("PropertyRef")[0]?.getAttribute("Name");
            const dRole = dependent.getAttribute("Role");
            const dRef = dependent.getElementsByTagName("PropertyRef")[0]?.getAttribute("Name");
            
            if (pRole && pRef && dRole && dRef) {
                constraint = {
                    principal: { role: pRole, propertyRef: pRef },
                    dependent: { role: dRole, propertyRef: dRef }
                };
            }
        }
    }

    const assocData = { roles, constraint };
    associationMap[fullName] = assocData;
    associationMap[name] = assocData; // Fallback without namespace
  }

  const entities: EntityType[] = [];
  const entityTypes = schema.getElementsByTagName("EntityType");

  for (let i = 0; i < entityTypes.length; i++) {
    const et = entityTypes[i];
    const name = et.getAttribute("Name") || "Unknown";
    
    // Keys
    const keys: string[] = [];
    const keyNode = et.getElementsByTagName("Key")[0];
    if (keyNode) {
        const propRefs = keyNode.getElementsByTagName("PropertyRef");
        for (let k = 0; k < propRefs.length; k++) keys.push(propRefs[k].getAttribute("Name") || "");
    }

    // Properties
    const properties: { name: string; type: string }[] = [];
    const props = et.getElementsByTagName("Property");
    for (let p = 0; p < props.length; p++) {
        properties.push({
            name: props[p].getAttribute("Name") || "",
            type: props[p].getAttribute("Type") || ""
        });
    }

    // NavigationProperties
    const navProps: EntityType['navigationProperties'] = [];
    const navs = et.getElementsByTagName("NavigationProperty");
    
    for (let n = 0; n < navs.length; n++) {
        const navName = navs[n].getAttribute("Name") || "Unknown";
        const v4Type = navs[n].getAttribute("Type"); 
        const relationship = navs[n].getAttribute("Relationship");
        const toRole = navs[n].getAttribute("ToRole"); 
        const fromRole = navs[n].getAttribute("FromRole");

        let targetType: string | null = null;
        let sourceMult = "";
        let targetMult = "";
        let constraints: { sourceProperty: string; targetProperty: string }[] = [];

        if (v4Type) {
            // V4 Logic (Simplified)
            if (v4Type.startsWith("Collection(")) {
                targetType = v4Type.slice(11, -1);
                targetMult = "*";
            } else {
                targetType = v4Type;
                targetMult = "1";
            }
            // V4 referential constraints are inside NavigationProperty
            const v4Ref = navs[n].getElementsByTagName("ReferentialConstraint");
            for(let r=0; r<v4Ref.length; r++) {
                const prop = v4Ref[r].getAttribute("Property");
                const refProp = v4Ref[r].getAttribute("ReferencedProperty");
                if(prop && refProp) constraints.push({ sourceProperty: prop, targetProperty: refProp });
            }
        } else if (relationship && toRole && fromRole) {
            // V2/V3 Logic
            const assocData = associationMap[relationship] || associationMap[relationship.split('.').pop() || ''];
            if (assocData) {
                const toEnd = assocData.roles[toRole];
                const fromEnd = assocData.roles[fromRole];
                
                if (toEnd) {
                    targetType = toEnd.type;
                    targetMult = toEnd.multiplicity;
                }
                if (fromEnd) {
                    sourceMult = fromEnd.multiplicity;
                }

                // Resolve Constraints
                if (assocData.constraint) {
                    const c = assocData.constraint;
                    // Check if current entity (FromRole) is Principal or Dependent
                    if (c.principal.role === fromRole && c.dependent.role === toRole) {
                         // Source is Principal
                         constraints.push({ sourceProperty: c.principal.propertyRef, targetProperty: c.dependent.propertyRef });
                    } else if (c.dependent.role === fromRole && c.principal.role === toRole) {
                         // Source is Dependent
                         constraints.push({ sourceProperty: c.dependent.propertyRef, targetProperty: c.principal.propertyRef });
                    }
                }
            }
        }

        navProps.push({
            name: navName,
            targetType, 
            relationship: relationship || undefined,
            sourceMultiplicity: sourceMult,
            targetMultiplicity: targetMult,
            constraints
        });
    }

    entities.push({ name, keys, properties, navigationProperties: navProps });
  }

  return { entities, namespace };
};

// 3. SAPUI5 Code Generator (Unchanged)
export const generateSAPUI5Code = (op: any, es: string, p: any, v: any) => {
    // ... (Code omitted for brevity, logic remains the same)
    return `// Code for ${op} on ${es}`; 
};