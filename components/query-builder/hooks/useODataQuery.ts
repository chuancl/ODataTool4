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

            // --- JSON 处理 ---
            if (jsonRes.status === 'fulfilled') {
                const response = jsonRes.value;
                const text = await response.text();

                if (response.ok) {
                    try {
                        const data = JSON.parse(text);
                        
                        // --- 兼容多种 OData 返回格式 (Robust Parsing) ---
                        let results: any[] = [];

                        if (data.value && Array.isArray(data.value)) {
                            // V4 Standard: { value: [...] }
                            results = data.value;
                        } else if (data.d) {
                            // V2/V3 Wrapper
                            if (Array.isArray(data.d)) {
                                // V3/JSON Light: { d: [...] }
                                results = data.d;
                            } else if (data.d.results && Array.isArray(data.d.results)) {
                                // V2/V3 Verbose: { d: { results: [...] } }
                                results = data.d.results;
                            }
                        } else if (Array.isArray(data)) {
                            // Raw Array: [...]
                            results = data;
                        }
                        
                        setQueryResult(results);
                        setRawJsonResult(JSON.stringify(data, null, 2));
                        
                        // 成功提示 (可选，过于频繁可能打扰用户，这里仅在数据为空时提示)
                        if (results.length === 0) {
                            toast.info("查询成功，但返回结果为空 (Query returned no data)");
                        }
                    } catch (e) {
                        const msg = `JSON 解析失败 (JSON Parse Error)`;
                        setRawJsonResult(`// ${msg}: \n${text}`);
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
            } else {
                setRawJsonResult(`// 请求失败 (Network Error): ${jsonRes.reason}`);
                toast.error(`网络错误 (Network Error): ${jsonRes.reason}`);
            }

            // --- XML 处理 (仅作辅助显示，不触发 Toast) ---
            if (xmlRes.status === 'fulfilled') {
                const response = xmlRes.value;
                const text = await response.text();
                if (response.ok) {
                    try {
                        const formatted = xmlFormat(text, { 
                            indentation: '  ', 
                            filter: (node) => node.type !== 'Comment', 
                            collapseContent: true, 
                            lineSeparator: '\n' 
                        });
                        setRawXmlResult(formatted);
                    } catch (err) {
                        setRawXmlResult(text);
                    }
                } else {
                    setRawXmlResult(`<!-- HTTP Error: ${response.status} ${response.statusText} -->\n${text}`);
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