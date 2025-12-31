import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { NextUIProvider, Tabs, Tab, Input, Button, Chip } from "@nextui-org/react";
import { detectODataVersion, ODataVersion } from '@/utils/odata-helper';
import ODataERDiagram from '@/components/ODataERDiagram';
import QueryBuilder from '@/components/QueryBuilder';
import MockDataGenerator from '@/components/MockDataGenerator';
import { Moon, Sun, Search, RotateCw } from 'lucide-react';
// 使用相对路径引入样式
import '../../assets/main.css';

const App: React.FC = () => {
  const [isDark, setIsDark] = useState(true);
  const [url, setUrl] = useState('');
  const [odataVersion, setOdataVersion] = useState<ODataVersion>('Unknown');
  const [isValidating, setIsValidating] = useState(false);

  useEffect(() => {
    // 从 Hash 读取 URL
    const hash = window.location.hash;
    if (hash.includes('url=')) {
      const targetUrl = decodeURIComponent(hash.split('url=')[1]);
      setUrl(targetUrl);
      validateAndLoad(targetUrl);
    } else {
      // 默认尝试读取一次 clipboard 或者 storage? 暂时留空
    }
  }, []);

  const validateAndLoad = async (targetUrl: string) => {
    if (!targetUrl) return;
    setIsValidating(true);
    const ver = await detectODataVersion(targetUrl);
    setOdataVersion(ver);
    setIsValidating(false);
  };

  const handleUrlChange = (val: string) => setUrl(val);

  return (
    <NextUIProvider>
      <div className={`${isDark ? 'dark' : ''} text-foreground bg-background h-screen w-screen flex flex-col overflow-hidden font-sans antialiased`}>
        
        {/* 顶部导航栏 */}
        <nav className="h-16 border-b border-divider px-6 flex items-center justify-between bg-content1 shrink-0 z-50 shadow-sm gap-4">
          <div className="flex items-center gap-4 shrink-0">
            <span className="text-xl md:text-2xl font-bold bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent whitespace-nowrap">
              OData Master
            </span>
            <Chip color={odataVersion === 'Unknown' ? 'default' : 'success'} variant="flat" size="sm">
              {odataVersion}
            </Chip>
          </div>
          
          <div className="flex items-center gap-2 flex-1 max-w-4xl mx-auto">
            <Input 
              placeholder="Enter OData Service URL (e.g. https://services.odata.org/Northwind/Northwind.svc/)" 
              value={url}
              onValueChange={handleUrlChange}
              size="sm"
              variant="bordered"
              isClearable
              onClear={() => setUrl('')}
              startContent={<Search className="text-default-400" size={16} />}
              className="flex-1"
              classNames={{
                inputWrapper: "bg-content2 hover:bg-content3 transition-colors group-data-[focus=true]:bg-content2"
              }}
            />
            <Button 
              size="sm" 
              color="primary" 
              isLoading={isValidating} 
              onPress={() => validateAndLoad(url)}
              className="font-medium shrink-0"
              startContent={!isValidating && <RotateCw size={16} />}
            >
              Parse
            </Button>
          </div>

          <Button isIconOnly variant="light" onPress={() => setIsDark(!isDark)} className="text-default-500 shrink-0">
            {isDark ? <Sun size={20} /> : <Moon size={20} />}
          </Button>
        </nav>

        {/* 主内容区域 */}
        <main className="flex-1 w-full h-full relative overflow-hidden bg-content2/50 p-2 md:p-4">
          {odataVersion === 'Unknown' && !isValidating ? (
            <div className="flex flex-col items-center justify-center h-full text-default-400 gap-4">
              <div className="w-20 h-20 bg-content3 rounded-full flex items-center justify-center mb-2 shadow-inner">
                <Search size={32} className="opacity-50" />
              </div>
              <h2 className="text-xl font-semibold text-default-600">No OData Service Loaded</h2>
              <p className="max-w-md text-center text-sm opacity-70">
                Enter a valid OData Service URL (V2, V3, or V4) in the address bar above and click "Parse" to start visualizing and analyzing.
              </p>
            </div>
          ) : (
            <div className="h-full w-full flex flex-col bg-content1 rounded-xl shadow-sm border border-divider overflow-hidden">
               <Tabs 
                aria-label="Features" 
                color="primary" 
                variant="underlined"
                classNames={{
                  base: "w-full border-b border-divider",
                  tabList: "p-0 gap-6 px-4 relative", 
                  cursor: "w-full bg-primary",
                  tab: "max-w-fit px-2 h-12 data-[selected=true]:font-bold",
                  panel: "flex-1 w-full h-full p-0 overflow-hidden bg-content1" 
                }}
              >
                <Tab key="er" title={<div className="flex items-center gap-2"><span>ER Diagram</span></div>}>
                  <div className="h-full w-full relative overflow-hidden">
                     <ODataERDiagram url={url} />
                  </div>
                </Tab>
                <Tab key="query" title={<div className="flex items-center gap-2"><span>Query Builder</span></div>}>
                  <div className="h-full w-full p-0">
                    <QueryBuilder url={url} version={odataVersion} />
                  </div>
                </Tab>
                <Tab key="mock" title={<div className="flex items-center gap-2"><span>Mock Data</span></div>}>
                  <div className="h-full w-full p-4 overflow-y-auto">
                    <MockDataGenerator url={url} version={odataVersion} />
                  </div>
                </Tab>
              </Tabs>
            </div>
          )}
        </main>
      </div>
    </NextUIProvider>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<React.StrictMode><App /></React.StrictMode>);