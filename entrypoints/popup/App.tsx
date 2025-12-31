import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { NextUIProvider, Button, Input, Switch, Card, CardBody, Divider, ScrollShadow } from "@nextui-org/react";
import { getSettings, saveSettings, AppSettings } from '@/utils/storage';
import { Settings, ExternalLink, Plus, Trash2, Globe } from 'lucide-react';
import { browser } from 'wxt/browser';
import '../../assets/main.css';

const App: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [newUrl, setNewUrl] = useState('');
  const [manualInput, setManualInput] = useState('');

  useEffect(() => {
    getSettings().then(setSettings);
  }, []);

  const toggleAutoDetect = (val: boolean) => {
    if (!settings) return;
    const newSettings = { ...settings, autoDetect: val };
    setSettings(newSettings);
    saveSettings(newSettings);
  };

  const addToWhitelist = () => {
    if (!settings || !newUrl) return;
    const newSettings = { ...settings, whitelist: [...settings.whitelist, newUrl] };
    setSettings(newSettings);
    saveSettings(newSettings);
    setNewUrl('');
  };

  const removeFromWhitelist = (url: string) => {
    if (!settings) return;
    const newSettings = { ...settings, whitelist: settings.whitelist.filter(u => u !== url) };
    setSettings(newSettings);
    saveSettings(newSettings);
  };

  const openDashboard = (url?: string) => {
    const targetUrl = url || manualInput;
    const pagePath = 'dashboard.html';
    
    if (targetUrl) {
      const dashboardUrl = browser.runtime.getURL(`${pagePath}#url=${encodeURIComponent(targetUrl)}`);
      browser.tabs.create({ url: dashboardUrl });
    } else {
      const dashboardUrl = browser.runtime.getURL(pagePath);
      browser.tabs.create({ url: dashboardUrl });
    }
  };

  if (!settings) return <div className="p-4">Loading...</div>;

  return (
    <NextUIProvider>
      <div className="w-[360px] bg-background text-foreground flex flex-col h-fit max-h-[600px] border border-divider">
        {/* Header */}
        <header className="px-4 py-3 border-b border-divider flex items-center justify-between bg-content1">
          <div className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-primary" />
            <h1 className="text-base font-bold">OData Master</h1>
          </div>
          <Settings className="w-4 h-4 text-default-400" />
        </header>

        <div className="p-4 flex flex-col gap-4">
          {/* Main Action */}
          <section>
            <Input 
              label="Quick Access URL" 
              placeholder="https://..." 
              size="sm" 
              variant="bordered"
              value={manualInput} 
              onValueChange={setManualInput}
              className="mb-2"
            />
            <Button 
              color="primary" 
              fullWidth 
              endContent={<ExternalLink size={16}/>} 
              onPress={() => openDashboard()}
              className="font-medium"
            >
              Analyze & Visualize
            </Button>
          </section>

          <Divider />

          {/* Settings */}
          <section className="flex justify-between items-center">
            <div className="flex flex-col">
              <span className="text-sm font-medium">Auto-Detect OData</span>
              <span className="text-xs text-default-400">Scan metadata on page load</span>
            </div>
            <Switch size="sm" isSelected={settings.autoDetect} onValueChange={toggleAutoDetect} />
          </section>

          <Divider />

          {/* Whitelist */}
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-bold flex items-center gap-2">
              Whitelist <span className="text-xs font-normal text-default-400">(Always Active)</span>
            </h3>
            <div className="flex gap-2">
              <Input 
                size="sm" 
                placeholder="domain.com" 
                value={newUrl} 
                onValueChange={setNewUrl} 
                className="flex-1"
              />
              <Button isIconOnly size="sm" color="success" variant="flat" onPress={addToWhitelist}>
                <Plus size={16} />
              </Button>
            </div>
            
            <ScrollShadow className="max-h-[120px] w-full flex flex-col gap-2 mt-1">
              {settings.whitelist.length === 0 && (
                <div className="text-xs text-default-400 text-center py-2">No domains whitelisted</div>
              )}
              {settings.whitelist.map((url, idx) => (
                <div key={idx} className="flex justify-between items-center p-2 rounded-lg bg-content2 hover:bg-content3 transition-colors group">
                  <span className="text-xs truncate max-w-[240px]">{url}</span>
                  <button 
                    className="opacity-0 group-hover:opacity-100 text-danger hover:bg-danger/20 p-1 rounded transition-all"
                    onClick={() => removeFromWhitelist(url)}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </ScrollShadow>
          </section>
        </div>
        
        <footer className="p-2 text-center text-[10px] text-default-300 border-t border-divider bg-content1">
          OData Master DevTools v1.0
        </footer>
      </div>
    </NextUIProvider>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<React.StrictMode><App /></React.StrictMode>);