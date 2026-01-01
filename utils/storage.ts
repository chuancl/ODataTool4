import { storage } from 'wxt/storage';

export interface AppSettings {
  autoDetect: boolean;
  theme: 'light' | 'dark';
  whitelist: string[];
}

export interface ComponentGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
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

// --- 通用 UI 状态存储 ---

/**
 * 保存组件的位置和大小信息
 * @param key 组件唯一标识 (ID)
 * @param geometry 几何信息对象 {x, y, width, height}
 */
export const saveComponentGeometry = async (key: string, geometry: ComponentGeometry) => {
  // 使用 sync 前缀以便在浏览器间同步（如果支持），添加 ui_geometry 命名空间避免冲突
  await storage.setItem(`sync:ui_geometry:${key}`, geometry);
};

/**
 * 获取组件的位置和大小信息
 * @param key 组件唯一标识 (ID)
 * @param defaultGeometry 默认值
 */
export const getComponentGeometry = async (key: string, defaultGeometry: ComponentGeometry): Promise<ComponentGeometry> => {
  const stored = await storage.getItem<ComponentGeometry>(`sync:ui_geometry:${key}`);
  if (stored && typeof stored === 'object' && 'x' in stored && 'y' in stored) {
    return stored;
  }
  return defaultGeometry;
};
