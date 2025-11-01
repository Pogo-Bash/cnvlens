import { cpSync, existsSync, mkdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

const source = join(projectRoot, 'node_modules/pyodide');
const dest = join(projectRoot, 'public/pyodide');

console.log('📦 Copying Pyodide to public directory...');
console.log(`   Source: ${source}`);
console.log(`   Destination: ${dest}`);

// Create destination
if (!existsSync(dest)) {
  mkdirSync(dest, { recursive: true });
}

// Core Pyodide files to copy
const coreFiles = [
  'pyodide.js',
  'pyodide.mjs',
  'pyodide.asm.js',
  'pyodide.asm.wasm',
  'python_stdlib.zip',
  'pyodide-lock.json'
];

console.log('📋 Copying core Pyodide files...');
let totalSize = 0;

coreFiles.forEach(file => {
  const srcPath = join(source, file);
  const destPath = join(dest, file);

  if (existsSync(srcPath)) {
    cpSync(srcPath, destPath);

    // Get file size
    const stats = statSync(destPath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    totalSize += stats.size;

    console.log(`   ✓ ${file} (${sizeMB} MB)`);
  } else {
    console.warn(`   ⚠ ${file} not found`);
  }
});

const totalSizeMB = (totalSize / 1024 / 1024).toFixed(2);

console.log('');
console.log('✅ Pyodide copied successfully!');
console.log(`📊 Total size: ${totalSizeMB} MB`);
console.log('');
console.log('ℹ️  Python packages (pysam, numpy, biopython) will be loaded from Pyodide CDN at runtime');
console.log('   To self-host packages later, download from: https://cdn.jsdelivr.net/pyodide/v0.24.1/full/');
