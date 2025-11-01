import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [
    vue(),
    // Custom plugin to ensure CORS headers on all responses
    {
      name: 'configure-cors-headers',
      configurePreviewServer(server) {
        server.middlewares.use((req, res, next) => {
          res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
          res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless')
          next()
        })
      },
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
          res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless')
          next()
        })
      }
    }
  ],

  server: {
    host: '0.0.0.0', // Bind to all interfaces for Render
    port: process.env.PORT || 3000, // Use Render's PORT env variable
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
  },
  
  optimizeDeps: {
    exclude: ['pyodide'] // Don't pre-bundle Pyodide
  },
  
  build: {
    target: 'esnext',
    // Don't inline WASM files
    assetsInlineLimit: 0,
  },
  
  // IMPORTANT: Workers MUST use IIFE format for importScripts() to work
  // Classic workers (non-module) require this setting
  worker: {
    format: 'iife',
  },
})
