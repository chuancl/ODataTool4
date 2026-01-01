
export type ODataVersion = 'V2' | 'V3' | 'V4' | 'Unknown';

export interface EntityProperty {
  name: string;
  type: string;
  nullable: boolean;
  maxLength?: number;
  fixedLength?: boolean;
  precision?: number;
  scale?: number;
  unicode?: boolean;
  defaultValue?: string;
  concurrencyMode?: string;
}

export interface EntityType {
  name: string;
  keys: string[];
  properties: EntityProperty[];
  navigationProperties: { 
    name: string; 
    targetType: string | null; 
    relationship?: string;
    sourceMultiplicity?: string; // e.g. "1", "0..1"
    targetMultiplicity?: string; // e.g. "*"
    constraints?: { sourceProperty: string; targetProperty: string }[]; // FK mappings
  }[];
}

export interface EntitySet {
    name: string;
    entityType: string;
}

export interface ParsedSchema {
    entities: EntityType[];
    entitySets: EntitySet[];
    namespace: string;
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

// 1. OData 检测与版本识别 (优化：支持传入文本直接判断，减少重复请求)
export const detectODataVersion = async (urlOrXml: string, isXmlContent: boolean = false): Promise<ODataVersion> => {
  try {
    let text = urlOrXml;
    
    if (!isXmlContent) {
        let metadataUrl = urlOrXml;
        if (!urlOrXml.endsWith('$metadata')) {
            metadataUrl = urlOrXml.endsWith('/') ? `${urlOrXml}$metadata` : `${urlOrXml}/$metadata`;
        }
        const response = await fetch(metadataUrl);
        text = await response.text();
    }
    
    if (text.includes('Version="4.0"')) return 'V4';
    if (text.includes('Version="2.0"')) return 'V2';
    if (text.includes('Version="3.0"')) return 'V3';
    
    // 如果是 fetch 响应头判断逻辑比较复杂，这里主要依赖 XML 内容判断
    return 'Unknown';
  } catch (e) {
    console.error("Failed to detect OData version", e);
    return 'Unknown';
  }
};

// 2. 解析 Metadata
export const parseMetadataToSchema = (xmlText: string): ParsedSchema => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "application/xml");
  const schemas = doc.getElementsByTagName("Schema"); 
  
  if (!schemas || schemas.length === 0) return { entities: [], entitySets: [], namespace: '' };

  const schema = schemas[0];
  const namespace = schema.getAttribute("Namespace") || "";

  // 存储 Association 详情
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
    
    const roles: Record<string, AssociationEnd> = {};
    const ends = at.getElementsByTagName("End");
    for (let j = 0; j < ends.length; j++) {
        const role = ends[j].getAttribute("Role");
        const type = ends[j].getAttribute("Type") || "";
        const multiplicity = ends[j].getAttribute("Multiplicity") || "1";
        if (role) roles[role] = { role, type, multiplicity };
    }

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
    associationMap[name] = assocData; 
  }

  // 解析 EntitySets
  const entitySets: EntitySet[] = [];
  const entityContainers = doc.getElementsByTagName("EntityContainer");
  for (let i = 0; i < entityContainers.length; i++) {
      const sets = entityContainers[i].getElementsByTagName("EntitySet");
      for (let j = 0; j < sets.length; j++) {
          const name = sets[j].getAttribute("Name");
          const type = sets[j].getAttribute("EntityType");
          if (name && type) {
              entitySets.push({ name, entityType: type });
          }
      }
  }

  // 解析 EntityTypes
  const entities: EntityType[] = [];
  const entityTypes = schema.getElementsByTagName("EntityType");

  for (let i = 0; i < entityTypes.length; i++) {
    const et = entityTypes[i];
    const name = et.getAttribute("Name") || "Unknown";
    
    const keys: string[] = [];
    const keyNode = et.getElementsByTagName("Key")[0];
    if (keyNode) {
        const propRefs = keyNode.getElementsByTagName("PropertyRef");
        for (let k = 0; k < propRefs.length; k++) keys.push(propRefs[k].getAttribute("Name") || "");
    }

    const properties: EntityProperty[] = [];
    const props = et.getElementsByTagName("Property");
    for (let p = 0; p < props.length; p++) {
        const propNode = props[p];
        properties.push({
            name: propNode.getAttribute("Name") || "",
            type: propNode.getAttribute("Type") || "",
            nullable: propNode.getAttribute("Nullable") !== "false",
            maxLength: propNode.getAttribute("MaxLength") ? parseInt(propNode.getAttribute("MaxLength")!) : undefined,
            fixedLength: propNode.getAttribute("FixedLength") === "true",
            precision: propNode.getAttribute("Precision") ? parseInt(propNode.getAttribute("Precision")!) : undefined,
            scale: propNode.getAttribute("Scale") ? parseInt(propNode.getAttribute("Scale")!) : undefined,
            unicode: propNode.getAttribute("Unicode") !== "false",
            defaultValue: propNode.getAttribute("DefaultValue") || undefined,
            concurrencyMode: propNode.getAttribute("ConcurrencyMode") || undefined
        });
    }

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
            // V4 Logic
            if (v4Type.startsWith("Collection(")) {
                targetType = v4Type.slice(11, -1);
                targetMult = "*";
            } else {
                targetType = v4Type;
                targetMult = "1";
            }
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

                if (assocData.constraint) {
                    const c = assocData.constraint;
                    if (c.principal.role === fromRole && c.dependent.role === toRole) {
                         constraints.push({ sourceProperty: c.principal.propertyRef, targetProperty: c.dependent.propertyRef });
                    } else if (c.dependent.role === fromRole && c.principal.role === toRole) {
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

  return { entities, entitySets, namespace };
};

// 3. SAPUI5 Code Generator
export const generateSAPUI5Code = (op: any, es: string, p: any, v: any) => {
    // 简单的 SAPUI5 代码生成示例
    let code = `// SAPUI5 OData ${v} Code for ${op} on ${es}\n`;
    code += `var oModel = this.getView().getModel();\n`;
    
    if (op === 'read') {
        const filters = p.filters?.map((f: any) => `new Filter("${f.field}", FilterOperator.${f.operator}, "${f.value}")`).join(', ');
        const urlParams: any = {};
        if (p.expand) urlParams.$expand = p.expand;
        if (p.select) urlParams.$select = p.select;
        if (p.orderby) urlParams.$orderby = p.orderby;
        if (p.top) urlParams.$top = p.top;
        if (p.skip) urlParams.$skip = p.skip;
        if (p.inlinecount) urlParams.$inlinecount = 'allpages';
        
        code += `oModel.read("/${es}", {\n`;
        if (filters) code += `  filters: [${filters}],\n`;
        if (Object.keys(urlParams).length > 0) code += `  urlParameters: ${JSON.stringify(urlParams, null, 2)},\n`;
        code += `  success: function(oData, response) { console.log(oData); },\n`;
        code += `  error: function(oError) { console.error(oError); }\n`;
        code += `});`;
    } else if (op === 'delete') {
         code += `// Delete ${p.keyPredicates?.length || 1} items\n`;
         code += `var mParameters = {\n`;
         code += `    success: function() { console.log("Delete success"); },\n`;
         code += `    error: function(oError) { console.error("Delete failed", oError); }\n`;
         code += `};\n\n`;
         
         const predicates = p.keyPredicates || [p.key];
         predicates.forEach((pred: string) => {
             code += `oModel.remove("/${es}${pred}", mParameters);\n`;
         });
    } else if (op === 'create') {
        code += `var oData = ${JSON.stringify(p.data, null, 2)};\n`;
        code += `oModel.create("/${es}", oData, {\n`;
        code += `  success: function(oData, response) { console.log("Created"); },\n`;
        code += `  error: function(oError) { console.error(oError); }\n`;
        code += `});`;
    }

    return code; 
};

// 4. C# Code Generator
export const generateCSharpDeleteCode = (entitySet: string, keyPredicates: string[], baseUrl: string, version: ODataVersion) => {
    const cleanUrl = baseUrl.replace(/\/$/, '');
    let sb = `// C# HttpClient Example for deleting from ${entitySet} (${version})\n`;
    sb += `using System;\nusing System.Net.Http;\nusing System.Threading.Tasks;\n\n`;
    sb += `public async Task DeleteItemsAsync()\n{\n`;
    sb += `    using (var client = new HttpClient())\n    {\n`;
    sb += `        client.BaseAddress = new Uri("${cleanUrl}/");\n`;
    
    if (version === 'V4') {
        sb += `        client.DefaultRequestHeaders.Add("OData-Version", "4.0");\n`;
        sb += `        client.DefaultRequestHeaders.Add("OData-MaxVersion", "4.0");\n`;
    } else {
        sb += `        client.DefaultRequestHeaders.Add("DataServiceVersion", "2.0");\n`;
        sb += `        client.DefaultRequestHeaders.Add("MaxDataServiceVersion", "2.0");\n`;
    }
    sb += `\n`;
    
    keyPredicates.forEach(pred => {
        sb += `        // DELETE ${entitySet}${pred}\n`;
        sb += `        var response = await client.DeleteAsync("${entitySet}${pred}");\n`;
        sb += `        response.EnsureSuccessStatusCode();\n`;
    });
    
    sb += `    }\n}`;
    return sb;
};

// 5. Java Olingo Code Generator
export const generateJavaDeleteCode = (entitySet: string, keyPredicates: string[], version: ODataVersion, baseUrl: string) => {
    // For V2/V3, we default to using the Olingo V3 Client (via V4 wrapper or directly).
    // Olingo V2 native library is deprecated/server-side focused, so V3 client is the closest "native" client.
    let sb = '';
    let clientMethod = 'getClient()'; // Default V4

    if (version === 'V4') {
        sb += `// Java Olingo V4 Client Example\n`;
        clientMethod = 'getClient()';
    } else {
        // Handle V2 and V3 using getV3() for compatibility
        sb += `// Java Olingo Client Example (V2/V3 Compatible)\n`;
        sb += `// Note: Uses Olingo V3 Client API which is compatible with V2 for standard CRUD.\n`;
        clientMethod = 'getV3()';
    }

    sb += `// Dependencies: org.apache.olingo:odata-client-core:4.x, org.apache.olingo:odata-client-api:4.x\n`;
    sb += `import org.apache.olingo.client.api.ODataClient;\n`;
    sb += `import org.apache.olingo.client.core.ODataClientFactory;\n`;
    sb += `import org.apache.olingo.client.api.communication.request.cud.ODataDeleteRequest;\n`;
    sb += `import org.apache.olingo.client.api.communication.response.ODataDeleteResponse;\n`;
    sb += `import java.net.URI;\n\n`;
    
    sb += `public void deleteItems() {\n`;
    sb += `    String serviceRoot = "${baseUrl}";\n`;
    sb += `    ODataClient client = ODataClientFactory.${clientMethod};\n\n`;
    
    keyPredicates.forEach(pred => {
        sb += `    try {\n`;
        sb += `        URI uri = client.newURIBuilder(serviceRoot)\n`;
        sb += `            .appendEntitySetSegment("${entitySet}")\n`;
        
        // Handle predicate
        const keyVal = pred.replace(/^\(/, '').replace(/\)$/, '');
        // For simple single keys, we can use appendKeySegment(value). 
        if (keyVal.includes('=')) {
                sb += `            .appendKeySegment(${pred}) // Check key format if composite\n`;
        } else {
                sb += `            .appendKeySegment(${keyVal})\n`;
        }

        sb += `            .build();\n\n`;
        sb += `        ODataDeleteRequest request = client.getCUDRequestFactory().getDeleteRequest(uri);\n`;
        // For V2, we might want to manually set headers if strict V2 is required, but client usually handles it.
        if (version === 'V2') {
             sb += `        request.addCustomHeader("DataServiceVersion", "2.0");\n`;
             sb += `        request.addCustomHeader("MaxDataServiceVersion", "2.0");\n`;
        }

        sb += `        ODataDeleteResponse response = request.execute();\n`;
        sb += `        if (response.getStatusCode() == 204) {\n`;
        sb += `            System.out.println("Deleted: " + uri);\n`;
        sb += `        }\n`;
        sb += `    } catch (Exception e) {\n`;
        sb += `        e.printStackTrace();\n`;
        sb += `    }\n`;
    });
    sb += `}\n`;
    return sb;
};
