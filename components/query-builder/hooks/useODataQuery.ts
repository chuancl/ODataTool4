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
            // 使用原始生成的 URL，不添加非标准参数
            const fetchUrl = generatedUrl;

            // --- 关键修改：针对 OData V3 强制使用 Verbose 模式 ---
            // 这样返回的数据才会包含 __metadata 字段，确保后续 Update/Delete 操作能获取到 Type 信息
            const jsonAccept = version === 'V3' 
                ? 'application/json;odata=verbose' 
                : 'application/json';

            const [jsonRes, xmlRes] = await Promise.allSettled([
                fetch(fetchUrl, { 
                    headers: { 
                        'Accept': jsonAccept,
                        // 对于 V3，明确告知服务端版本是个好习惯
                        ...(version === 'V3' ? { 'DataServiceVersion': '3.0', 'MaxDataServiceVersion': '3.0' } : {})
                    },
                    // 仅依靠浏览器层面的 no-store
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
    }, [version]); // 添加 version 依赖

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