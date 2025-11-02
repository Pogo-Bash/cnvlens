#!/usr/bin/env node

/**
 * Production server for lungseq-analyzer
 * Serves static files with proper CORS headers for Pyodide/WASM
 */

import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT || 3000;
const DIST_DIR = join(__dirname, 'dist');

// MIME types - Use text/javascript for better worker compatibility
const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',      // Changed to text/javascript for worker compatibility
  '.mjs': 'text/javascript',     // Changed to text/javascript for worker compatibility
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.zip': 'application/zip',
  '.data': 'application/octet-stream',
};

const server = createServer(async (req, res) => {
  // Set CORS headers for Pyodide/WASM
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Only handle GET requests
  if (req.method !== 'GET') {
    res.writeHead(405);
    res.end('Method Not Allowed');
    return;
  }

  // Get file path
  let filePath = req.url === '/' ? '/index.html' : req.url;

  // Remove query string
  const queryIndex = filePath.indexOf('?');
  if (queryIndex !== -1) {
    filePath = filePath.substring(0, queryIndex);
  }

  const fullPath = join(DIST_DIR, filePath);

  try {
    const data = await readFile(fullPath);
    const ext = extname(filePath).toLowerCase();

    // Get MIME type - be very explicit for worker files
    let mimeType = MIME_TYPES[ext];

    // Special handling for worker files - browsers are VERY strict
    if (filePath.includes('worker') && (ext === '.js' || ext === '.mjs')) {
      mimeType = 'text/javascript'; // Use text/javascript for maximum compatibility
      console.log(`[WORKER] Serving worker file: ${filePath} with MIME: ${mimeType}`);
    }

    // Fallback if no MIME type found
    if (!mimeType) {
      mimeType = 'application/octet-stream';
      console.log(`[WARN] No MIME type for extension '${ext}', using default: ${filePath}`);
    }

    // ALWAYS set Content-Type - never leave it undefined
    res.setHeader('Content-Type', mimeType);

    console.log(`[${new Date().toISOString()}] 200 ${filePath} (${mimeType})`);

    // Cache static assets based on type
    if (ext === '.js' || ext === '.css' || ext === '.mjs') {
      // JS/CSS have hashed filenames from Vite - cache forever
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (ext === '.html') {
      // HTML should NOT be cached - always fetch fresh
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    } else if (ext === '.wasm' || ext === '.data' || ext === '.zip') {
      // WASM/Data files - cache for a long time
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      // Other files - short cache
      res.setHeader('Cache-Control', 'public, max-age=300'); // 5 minutes
    }

    res.writeHead(200);
    res.end(data);
  } catch (err) {
    // If file not found and not an asset, serve index.html (SPA routing)
    if (err.code === 'ENOENT' && !extname(filePath)) {
      try {
        console.log(`[${new Date().toISOString()}] 200 ${filePath} -> /index.html (SPA routing)`);
        const indexData = await readFile(join(DIST_DIR, 'index.html'));
        res.setHeader('Content-Type', 'text/html');
        // Never cache HTML - always serve fresh
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.writeHead(200);
        res.end(indexData);
      } catch (indexErr) {
        console.error(`[${new Date().toISOString()}] 500 Error serving index.html:`, indexErr);
        res.writeHead(500);
        res.end('Internal Server Error');
      }
    } else {
      console.error(`[${new Date().toISOString()}] 404 ${filePath} - ${err.message}`);
      res.writeHead(404);
      res.end('Not Found');
    }
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running at http://0.0.0.0:${PORT}/`);
  console.log(`📁 Serving from: ${DIST_DIR}`);
  console.log(`🔒 CORS headers enabled for Pyodide/WASM`);
});
