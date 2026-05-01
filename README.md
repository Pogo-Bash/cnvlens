# LungSeq Analyzer

Browser-based lung cancer genomics playground. Upload a BAM, get variants and copy-number calls back without ever sending data to a server.

**Live demo:** https://lungseq-analyzer.onrender.com

> Heads up: this is a class project from UIC. It's a proof-of-concept, not a maintained tool, and definitely not something you should make clinical decisions with. Issues and PRs are welcome but I'm not actively developing it.

## What it actually does

You drop a BAM file into the browser. A Python interpreter compiled to WebAssembly (Pyodide) opens it, walks through the BGZF blocks, builds a pileup, and runs a basic variant or CNV caller. Results render as tables and Plotly/D3 charts, and you can export VCF/JSON/CSV. Nothing leaves the page — files are stored in OPFS (with an IndexedDB fallback for browsers that don't support OPFS).

## Architecture

The app does **all** bioinformatics work in Python via Pyodide. Earlier versions of this repo planned to use bcftools/samtools compiled to WASM via biowasm — that integration was never finished and the placeholder files are still around (see "What's scaffolded" below). The current pipeline is:

```
Vue 3 UI (main thread)
    │
    │ postMessage(BAM ArrayBuffer)
    ▼
Pyodide Web Worker
    ├── SimpleBamReader  (pure-Python BGZF + BAM parser)
    ├── Coverage / pileup builder  (NumPy)
    ├── CNV detector  (read-depth thresholds, adaptive or manual)
    └── Variant caller  (sparse pileup, Phred-scaled qual)
    │
    ▼ JSON results
Plotly / D3 visualizations + OPFS persistence
```

Everything runs client-side; the only network calls are loading Pyodide itself and (optionally) the demo's Render-hosted assets.

## What works

- **Variant calling** (`/variant-calling`) — upload BAM → SNV calls with configurable depth/quality/AF filters → table view, VCF/JSON/CSV export
- **CNV analysis** (`/cnv-analysis`) — read-depth based amp/del calls with adaptive or manual thresholds, confidence scoring, Plotly + D3 visualizations
- **Visualization** (`/visualization`) — Manhattan plot, allele frequency histogram, quality-vs-depth scatter, CNV genome overview, per-chromosome summary, PNG/SVG export
- **OPFS storage** with IndexedDB fallback, quota tracking, persistence across page navigation
- **Browser compat warnings** for older Safari / missing OPFS

## What's scaffolded (don't expect it to work)

- **Data Browser** (`/data-browser`) — UI mockup only. The TCGA/ICGC search button has no handler and the page already shows a "coming soon" notice. Vite has proxy entries for `api.gdc.cancer.gov` and ICGC but no client code uses them.
- **Indels** — the variant calling UI has filters and badges for INS/DEL, but the Python caller currently only emits SNVs. Insertion/deletion counts will always be 0.
- **Worker pool parallelism** — `usePyodidePool.js` spins up multiple Pyodide workers and there's a parallel BAM analysis path, but it's gated behind a feature flag in `analysis-service.js` (`useParallelProcessing = false`) and is never invoked by the UI.
- **Empty placeholder files** — `src/workers/bcftools.worker.js`, `src/services/tcga-client.js`, `src/services/variant-caller.js`, `src/utils/bam-reader.js`, `src/utils/vcf-parser.js`. Nothing imports them; they're leftovers from the bcftools/biowasm direction that got abandoned in favor of pure Pyodide.

## Tech stack

- **Frontend:** Vue 3 (Composition API), Vite, Vue Router, Tailwind + DaisyUI
- **Bioinformatics:** Pyodide 0.24 (Python 3.11 + NumPy in WebAssembly)
- **Visualization:** Plotly.js, D3
- **Storage:** OPFS with IndexedDB fallback
- **Hosting:** Render (Node static server, see `server.js` and `docs/DEPLOY.md`)

## Local development

```bash
git clone https://github.com/Pogo-Bash/lungseq-analyzer.git
cd lungseq-analyzer
npm install
npm run dev
```

Then open http://localhost:3000. The `npm run dev` and `npm run build` scripts both copy Pyodide runtime files from `node_modules/pyodide` into `public/pyodide/` (~18 MB). The dev server sets the COOP/COEP headers Pyodide needs.

```bash
npm run build       # production build to dist/
npm run start       # serve dist/ via server.js (used by Render)
npm run preview     # vite preview (alternative)
```

## Project layout

```
lungseq-analyzer/
├── docs/                       # deploy guide, architecture notes
├── public/pyodide/             # Pyodide runtime (copied at build time)
├── scripts/copy-pyodide.js     # build helper
├── server.js                   # production static server with COOP/COEP
├── src/
│   ├── views/                  # Dashboard, DataBrowser, VariantCalling, CNVAnalysis, Visualization
│   ├── components/             # CNVVisualization, BrowserCompatWarning
│   ├── composables/            # usePyodide, useVariantCaller, usePyodidePool
│   ├── services/               # analysis-service (the active one)
│   ├── utils/                  # opfs-manager, browser-compat
│   └── workers/                # pyodide.worker.js (the real one)
└── vite.config.js
```

## License

MIT.

## Acknowledgments

- TCGA / ICGC for open cancer genomics data (referenced in the UI mockups even if the integration isn't built)
- Pyodide team for making in-browser Python practical
- UIC for the class that prompted this
