import { useState, useCallback } from 'react';
import xmlFormat from 'xml-formatter';
import { ODataVersion } from '@/utils/odata-helper';
import { useToast } from '@/components/ui/ToastContext';

export const useODataQuery = (version: ODataVersion) => {
    const [loading, setLoading] = useState(false);
    const [queryResult, setQueryResult] = useState<any[]>([]); 
    const [rawJsonResult, setRawJsonResult] = useState('');    
    const [rawXmlResult, setRawXmlResult] = useState('');
    
    // 集成 Toast
    const toast = useToast();

    const executeQuery = useCallback(async (generatedUrl: string) => {
        setLoading(true);
        setRawXmlResult('// 正在加载 XML...');
        setRawJsonResult('// 正在加载 JSON...');
        setQueryResult([]);

        try {
            const fetchUrl = generatedUrl;

            // --- 构建查询 Headers ---
            const headers: Record<string, string> = {};

            if (version === 'V4') {
                headers['Accept'] = 'application/json';
                headers['OData-Version'] = '4.0';
                headers['OData-MaxVersion'] = '4.0';
            } else if (version === 'V3') {
                headers['Accept'] = 'application/json;odata=verbose';
                headers['DataServiceVersion'] = '3.0';
                headers['MaxDataServiceVersion'] = '3.0';
            } else {
                // V2
                headers['Accept'] = 'application/json';
                headers['DataServiceVersion'] = '2.0';
                headers['MaxDataServiceVersion'] = '2.0';
            }

            const [jsonRes, xmlRes] = await Promise.allSettled([
                fetch(fetchUrl, { 
                    headers: headers,
                    cache: 'no-store' 
                }),
                fetch(fetchUrl, { 
                    headers: { 'Accept': 'application/xml, application/atom+xml' },
                    cache: 'no-store'
                })
            ]);

            // --- JSON / Binary 处理 ---
            if (jsonRes.status === 'fulfilled') {
                const response = jsonRes.value;
                const contentType = response.headers.get('Content-Type') || '';

                // 1. 检查是否为直接的二进制媒体流 (图片/视频/PDF)
                if (response.ok && (
                    contentType.startsWith('image/') || 
                    contentType.startsWith('audio/') || 
                    contentType.startsWith('video/') || 
                    contentType === 'application/pdf'
                )) {
                    try {
                        const blob = await response.blob();
                        const base64data = await new Promise<string>((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onloadend = () => resolve(reader.result as string);
                            reader.onerror = reject;
                            reader.readAsDataURL(blob);
                        });
                        
                        // 生成合成结果供表格显示
                        setQueryResult([{ "Media Content": base64data }]);
                        setRawJsonResult(`// Detected Binary Content: ${contentType}\n// Size: ${blob.size} bytes\n// Preview available in Table view.`);
                        
                        toast.success(`成功加载媒体文件: ${contentType}\n(Media loaded successfully)`);
                    } catch (e) {
                        const msg = "读取媒体文件流失败 (Failed to read media stream)";
                        setRawJsonResult(`// Error: ${msg}`);
                        toast.error(msg);
                    }
                } 
                // 2. 标准 JSON 处理
                else {
                    const text = await response.text();
                    if (response.ok) {
                        try {
                            const data = JSON.parse(text);
                            // 兼容多种 OData 返回格式
                            const results = data.d?.results || data.value || (Array.isArray(data) ? data : []);
                            
                            // 如果结果是单一对象（非数组），包裹为数组以便表格显示
                            const finalResults = Array.isArray(results) ? results : [results];

                            setQueryResult(finalResults);
                            setRawJsonResult(JSON.stringify(data, null, 2));
                            
                            if (finalResults.length === 0) {
                                toast.info("查询成功，但返回结果为空 (Query returned no data)");
                            }
                        } catch (e) {
                            // 如果不是 JSON，但也不是上面捕获的媒体类型
                            const msg = `JSON 解析失败 (JSON Parse Error)`;
                            setRawJsonResult(`// ${msg}: \n${text.substring(0, 1000)}...`);
                            toast.error(msg);
                        }
                    } else {
                        let errorBody = text;
                        try {
                            const jsonError = JSON.parse(text);
                            errorBody = JSON.stringify(jsonError, null, 2);
                        } catch (e) {}
                        setRawJsonResult(`// HTTP Error: ${response.status} ${response.statusText}\n// 详细信息 (Details):\n${errorBody}`);
                        toast.error(`查询失败: ${response.status} ${response.statusText}\n请查看下方 JSON 预览获取详细信息。`);
                    }
                }
            } else {
                setRawJsonResult(`// 请求失败 (Network Error): ${jsonRes.reason}`);
                toast.error(`网络错误 (Network Error): ${jsonRes.reason}`);
            }

            // --- XML 处理 (仅作辅助显示) ---
            if (xmlRes.status === 'fulfilled') {
                const response = xmlRes.value;
                // 如果是媒体流，text() 可能会乱码，简单 try catch
                try {
                    const text = await response.text();
                    if (response.ok) {
                         const formatted = xmlFormat(text, { 
                             indentation: '  ', 
                             filter: (node) => node.type !== 'Comment', 
                             collapseContent: true, 
                             lineSeparator: '\n' 
                         });
                         setRawXmlResult(formatted);
                    } else {
                        setRawXmlResult(`<!-- HTTP Error: ${response.status} ${response.statusText} -->\n${text}`);
                    }
                } catch (e) {
                    setRawXmlResult(`<!-- Binary or Unreadable content -->`);
                }
            } else {
                setRawXmlResult(`<!-- 请求失败 (Network Error): ${xmlRes.reason} -->`);
            }

        } catch (e: any) {
            console.error(e);
            const msg = `执行错误: ${e.message || e}`;
            setRawJsonResult(msg);
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    }, [version, toast]);

    return {
        loading,
        queryResult,
        setQueryResult, 
        rawJsonResult,
        setRawJsonResult,
        rawXmlResult,
        setRawXmlResult,
        executeQuery
    };
};