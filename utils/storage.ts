import { storage } from 'wxt/storage';

export interface AppSettings {
  autoDetect: boolean;
  theme: 'light' | 'dark';
  whitelist: string[];
}

const defaultSettings: AppSettings = {
  autoDetect: true,
  theme: 'light',
  whitelist: []
};

// 获取设置
export const getSettings = async (): Promise<AppSettings> => {
  const stored = await storage.getItem<AppSettings>('local:settings');
  return stored || defaultSettings;
};

// 保存设置
export const saveSettings = async (settings: AppSettings) => {
  await storage.setItem('local:settings', settings);
};

// 检查是否在白名单
export const isWhitelisted = async (url: string): Promise<boolean> => {
  const settings = await getSettings();
  return settings.whitelist.some(domain => url.includes(domain));
};

// 简单的 URL 格式判断辅助函数
export const isODataUrl = (url: string): boolean => {
  // 基础判断，实际逻辑需要 fetch metadata
  return url.toLowerCase().includes('.svc') || url.toLowerCase().includes('/odata/');
};