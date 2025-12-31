import { defineBackground } from 'wxt/sandbox';
import { browser } from 'wxt/browser';
import { isODataUrl, getSettings, isWhitelisted } from '@/utils/storage';
import { detectODataVersion } from '@/utils/odata-helper';

export default defineBackground(() => {
  console.log('OData Master Background Service Started');

  // 监听 Tab 更新
  browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    // 确保 URL 存在且页面加载完成
    if (changeInfo.status === 'complete' && tab.url) {
      
      // 忽略浏览器扩展页面，防止死循环
      if (tab.url.startsWith('chrome-extension:') || tab.url.startsWith('moz-extension:')) {
        return;
      }

      const settings = await getSettings();
      const isInWhitelist = await isWhitelisted(tab.url);

      // 如果禁用了自动检测且不在白名单中，直接返回
      if (!settings.autoDetect && !isInWhitelist) {
        return;
      }

      // 1. 初步筛选：检查 URL 是否包含典型 OData 特征或在白名单中
      // 这是为了避免对每个网页都发起 fetch 请求
      const isPotentialOData = tab.url.toLowerCase().includes('$metadata') || 
                               tab.url.toLowerCase().includes('.svc') || 
                               tab.url.toLowerCase().includes('/odata/') || 
                               isInWhitelist;

      if (isPotentialOData) {
        console.log(`Checking Potential OData URL: ${tab.url}`);
        
        try {
          // 2. 深度验证：尝试探测 OData 版本
          // 这会发送一个请求（通常是 $metadata）来确认是否返回 OData XML
          const version = await detectODataVersion(tab.url);

          if (version !== 'Unknown') {
             console.log(`Confirmed OData ${version}. Redirecting to Dashboard...`);
             
             // 3. 构建 Dashboard URL
             // 注意：这里使用 dashboard.html，这是 WXT 编译 entrypoints/dashboard/index.html 后的输出文件名
             const dashboardUrl = browser.runtime.getURL(`dashboard.html#url=${encodeURIComponent(tab.url)}`);

             // 4. 更新当前标签页跳转到插件页面
             await browser.tabs.update(tabId, { url: dashboardUrl });
          }
        } catch (error) {
          console.error("Verification failed for URL:", tab.url, error);
        }
      }
    }
  });
});