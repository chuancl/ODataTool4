import { defineConfig } from 'wxt';
import react from '@vitejs/plugin-react';

export default defineConfig({
  manifest: {
    name: "OData Master DevTools",
    description: "Visualizer, Query Builder & Mock Data for OData Services",
    version: "1.0.0",
    permissions: ["storage", "tabs", "activeTab"],
    host_permissions: ["<all_urls>"]
  },
  vite: () => ({
    plugins: [react()],
  }),
});