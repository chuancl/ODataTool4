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
            const fetchUrl = generatedUrl;

            // --- 构建查询 Headers ---
            // 必须与 Update/Delete 保持一致，以确保上下文一致性 (如 V3 verbose)
            const headers: Record<string, string> = {};

            if (version === 'V4') {
                headers['Accept'] = 'application/json';
                headers['OData-Version'] = '4.0';
                headers['OData-MaxVersion'] = '4.0';
            } else if (version === 'V3') {
                // V3: 必须显式要求 verbose 才能拿到 __metadata
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
                // XML 请求保持标准头
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
    }, [version]);

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