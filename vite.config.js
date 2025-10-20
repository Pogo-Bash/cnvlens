import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],

  server: {
    host: '0.0.0.0', // Bind to all interfaces for Render
    port: process.env.PORT || 3000, // Use Render's PORT env variable
    // Enable SharedArrayBuffer for WASM threading
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    // Proxy for TCGA/ICGC APIs (avoid CORS)
    proxy: {
      '/api/gdc': {
        target: 'https://api.gdc.cancer.gov',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/gdc/, ''),
      },
      '/api/icgc': {
        target: 'https://dcc.icgc.org/api',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/icgc/, ''),
      },
    },
  },

  preview: {
    host: '0.0.0.0', // Also for production preview
    port: process.env.PORT || 3000,
    strictPort: true, // Exit if port is already in use
    // Allow Render and other hosting platforms
    allowedHosts: [
      '.onrender.com', // Render domains
      'localhost',
      '127.0.0.1',
    ],
    // Enable CORS headers for WebAssembly
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  
  optimizeDeps: {
    exclude: ['biowasm'], // Will create this later
  },
  
  build: {
    target: 'esnext',
    // Don't inline WASM files
    assetsInlineLimit: 0,
  },
  
  worker: {
    format: 'es',
  },
})
