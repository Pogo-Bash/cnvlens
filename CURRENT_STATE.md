# Current State Before Pyodide Migration

**Date**: 2025-11-01
**Branch**: claude/pyodide-wasm-migration-011CUhg5jBGyUJV2qYoZ5QUj

## Current Dependencies

```json
{
  "dependencies": {
    "@biowasm/aioli": "^3.2.1",
    "d3": "^7.9.0",
    "jszip": "^3.10.1",
    "pako": "^2.1.0",
    "plotly.js-dist-min": "^3.1.2",
    "vue": "^3.5.22",
    "vue-router": "^4.6.3"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^6.0.1",
    "autoprefixer": "^10.4.21",
    "daisyui": "^5.3.7",
    "postcss": "^8.5.6",
    "tailwindcss": "^3.4.18",
    "vite": "^7.1.7"
  }
}
```

## File Structure

```
lungseq-analyzer/
├── public/
├── src/
│   ├── components/
│   │   ├── BrowserCompatWarning.vue
│   │   ├── CNVVisualization.vue
│   │   └── HelloWorld.vue
│   ├── router/
│   │   └── index.js
│   ├── services/
│   │   ├── cnv-analyzer.js      (ACTIVE - uses @biowasm/aioli)
│   │   ├── tcga-client.js
│   │   └── variant-caller.js    (EMPTY - placeholder)
│   ├── utils/
│   │   ├── bam-reader.js
│   │   ├── browser-compat.js
│   │   ├── opfs-manager.js      (ACTIVE - OPFS + IndexedDB)
│   │   └── vcf-parser.js
│   ├── views/
│   │   ├── CNVAnalysis.vue
│   │   ├── Dashboard.vue
│   │   ├── DataBrowser.vue
│   │   ├── Visualization.vue
│   │   └── VariantCalling.vue
│   ├── workers/
│   │   └── bcftools.worker.js   (EMPTY - placeholder)
│   ├── App.vue
│   └── main.js
├── vite.config.js
├── package.json
└── index.html
```

## Current biowasm Usage

### CNV Analyzer (src/services/cnv-analyzer.js)

**Active Implementation**:
- Uses `@biowasm/aioli` version 3.2.1
- Loads samtools/1.17 from CDN
- Functions used:
  - `samtools index` - Create BAM index
  - `samtools idxstats` - Get chromosome list
  - `samtools depth` - Calculate coverage

**Key Methods**:
1. `initialize()` - Loads Aioli + samtools
2. `analyzeCNV()` - Main analysis pipeline
3. `getChromosomes()` - Extract chromosome list from BAM
4. `calculateChromosomeCoverage()` - Per-chromosome coverage calculation
5. `detectCNVs()` - CNV detection from coverage data

**Analysis Pipeline**:
```
1. Store BAM in OPFS
2. Mount in Aioli filesystem
3. Create/check BAM index
4. Get chromosome list (samtools idxstats)
5. Calculate coverage per chromosome (samtools depth)
6. Detect CNVs (threshold-based algorithm)
```

## Architecture Highlights

### ✅ Already Implemented (Great for Pyodide migration!)

1. **CORS Headers**:
   - vite.config.js already has COOP + COEP headers
   - Set to "same-origin" and "credentialless"

2. **OPFS Manager**:
   - Sophisticated file storage system
   - OPFS with IndexedDB fallback
   - Quota management
   - File persistence

3. **Web Workers**:
   - Worker format set to 'es' in vite.config.js
   - bcftools.worker.js placeholder exists

4. **Modern Stack**:
   - Vue 3 Composition API
   - Vite 7 (fast builds)
   - Tailwind CSS + DaisyUI

### 🔄 To Be Migrated

1. **CNV Analysis**: biowasm/Aioli → Pyodide/pysam
2. **Variant Calling**: Implement with Pyodide (currently empty)

## Bundle Size

- node_modules not currently installed
- Will measure after npm install

## Current Functionality

### Working:
- ✅ OPFS file storage
- ✅ CNV analysis with samtools
- ✅ Browser compatibility detection
- ✅ CORS headers for WASM

### Placeholder/Empty:
- ❌ variant-caller.js (1 line - empty)
- ❌ bcftools.worker.js (1 line - empty)

## Known Issues

None reported - clean starting state

## Migration Strategy

1. Keep @biowasm/aioli as dependency initially (fallback)
2. Create parallel Pyodide implementation
3. Use feature flags to toggle between implementations
4. Test thoroughly before removing biowasm
5. Monitor performance and error rates

## Performance Baseline (To Measure)

Will measure after initial setup:
- [ ] Initial page load time
- [ ] Time to Interactive (TTI)
- [ ] Lighthouse performance score
- [ ] CNV analysis time (small/medium/large BAM)

## Next Steps

1. Install npm dependencies
2. Add Pyodide to package.json
3. Create copy-pyodide script
4. Build Pyodide web worker
5. Create usePyodide composable
6. Implement parallel Pyodide-based CNV analyzer
