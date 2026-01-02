import { useState, useCallback } from 'react';
import xmlFormat from 'xml-formatter';
import { ODataVersion } from '@/utils/odata-helper';

export const useODataQuery = (version: ODataVersion) => {
    const [loading, setLoading] = useState(false);
    const [queryResult, setQueryResult] = useState<any[]>([]); 
    const [rawJsonResult, setRawJsonResult] = useState('');    
    const [rawXmlResult, setRawXmlResult] = useState('');

    const executeQuery = useCallback(async (generatedUrl: string) => {
        setLoading(true);
        setRawXmlResult('// 正在加载 XML...');
        setRawJsonResult('// 正在加载 JSON...');
        setQueryResult([]);

        try {
            // --- 强制缓存穿透 (Cache Busting) ---
            // 追加唯一的 _t 时间戳参数，强制每次请求都视为新请求
            // 这有助于解决部分 OData 服务端对相同 URL 返回旧缓存的问题
            const separator = generatedUrl.includes('?') ? '&' : '?';
            const fetchUrl = `${generatedUrl}${separator}_t=${new Date().getTime()}`;

            const [jsonRes, xmlRes] = await Promise.allSettled([
                fetch(fetchUrl, { 
                    headers: { 'Accept': 'application/json' },
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
                        // 兼容多种 OData 返回格式
                        const results = data.d?.results || data.value || (Array.isArray(data) ? data : []);
                        setQueryResult(results);
                        setRawJsonResult(JSON.stringify(data, null, 2));
                    } catch (e) {
                        setRawJsonResult(`// JSON 解析失败: \n${text}`);
                    }
                } else {
                    let errorBody = text;
                    try {
                        const jsonError = JSON.parse(text);
                        errorBody = JSON.stringify(jsonError, null, 2);
                    } catch (e) {}
                    setRawJsonResult(`// HTTP Error: ${response.status} ${response.statusText}\n// 详细信息 (Details):\n${errorBody}`);
                }
            } else {
                setRawJsonResult(`// 请求失败 (Network Error): ${jsonRes.reason}`);
            }

            // --- XML 处理 ---
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
            setRawJsonResult(`错误: ${e.message || e}`);
        } finally {
            setLoading(false);
        }
    }, []);

    return {
        loading,
        queryResult,
        setQueryResult, // 允许外部修改 (例如删除后清空)
        rawJsonResult,
        setRawJsonResult,
        rawXmlResult,
        setRawXmlResult,
        executeQuery
    };
};