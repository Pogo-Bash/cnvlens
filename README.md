# LungSeq Analyzer

LungSeq Analyzer is a browser-based proof-of-concept for local-first cancer genomics analysis. Built as a class project at UIC. It implements pileup-based variant calling and read-depth CNV detection in pure Python, running entirely in the browser via Pyodide. No server, no uploads, no installation.

**Live demo:** https://lungseq-analyzer.onrender.com

> This is a scoped class project. It's not maintained, it's not a clinical tool, and it's not going to be either of those things. PRs are welcome but I'm not actively developing it.

## What works

- **SNV calling** — upload a BAM, get a sparse-pileup-based SNV caller with configurable depth/quality/AF filters and VCF/JSON/CSV export.
- **Sample data** — click "try with sample data" on the Variant Calling page to run the pipeline without your own files. Sample data: NA12878 exome slice covering EGFR (chr7:55,000,000–55,300,000, GRCh37). 2.4MB, ~57x coverage in captured exons. Released under 1000 Genomes Project data use policy (unrestricted).
- **CNV analysis** — read-depth based amp/del calls with adaptive or manual thresholds, confidence scoring, and Plotly + D3 visualizations.
- **Visualization** — Manhattan plot, allele-frequency histogram, quality-vs-depth scatter, CNV genome overview, per-chromosome summary, with PNG/SVG export.
- **OPFS storage** — large BAM files persist between sessions via the Origin Private File System, with an IndexedDB fallback for browsers that don't support OPFS.

## What's scaffolded

- **TCGA / ICGC integration** — the Data Browser page is a static UI mockup. The "Search TCGA Database" button has no handler. `vite.config.js` has proxy entries for `api.gdc.cancer.gov` and the ICGC API but no client code uses them.
- **Indel calling** — the variant caller emits SNVs only. Indels would need CIGAR-aware pileup logic that isn't implemented. The UI surfaces this limitation explicitly now (it used to silently report 0 indels).
- **Worker pool parallelism** — `src/composables/usePyodidePool.js` builds a multi-threaded Pyodide worker pool that splits chromosomes across cores, but the parallel path is gated behind a feature flag set to `false` in `src/services/analysis-service.js`. See the docstring at the top of `usePyodidePool.js` for why it's off.
- **Data Browser** — see TCGA/ICGC above. It's a non-functional placeholder.

## Architecture

All bioinformatics work happens in Python via Pyodide. There is no compiled bcftools/samtools in this repo — the pipeline is a custom pure-Python BAM parser plus NumPy:

```
Vue 3 UI (main thread)
    │
    │ postMessage(BAM ArrayBuffer)
    ▼
Pyodide Web Worker (Python 3.11 + NumPy in WASM)
    ├── SimpleBamReader        — streaming BGZF + BAM binary parser
    ├── Coverage / pileup      — sparse two-pass pileup, NumPy bincount
    ├── CNV detector           — read-depth thresholds (adaptive or manual)
    └── SNV caller             — Phred-scaled qual from allele frequency
    │
    ▼ JSON results
Plotly / D3 visualizations + OPFS persistence
```

Files never leave the browser. The only network calls are loading the Pyodide runtime itself (~18 MB, cached after first load).

## Tech stack

- **Frontend:** Vue 3 (Composition API), Vite, Vue Router, Tailwind (Catppuccin Mocha)
- **Bioinformatics:** Pyodide 0.24 (Python 3.11 + NumPy in WebAssembly), custom BGZF/BAM parser
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

Then open http://localhost:3000. Both `npm run dev` and `npm run build` run a `copy-pyodide` step that copies the Pyodide runtime from `node_modules/pyodide` into `public/pyodide/`. The dev server sets the COOP/COEP headers Pyodide requires.

```bash
npm run build       # production build to dist/
npm run start       # serve dist/ via server.js (used by Render)
npm run preview     # vite preview (alternative)
```

Note: the app is built with a base path of `/lungseq/`. When running locally with `npm run dev`, that means the app lives at http://localhost:3000/lungseq/, not at the root.

## Run with Docker

The repo ships a multi-stage Dockerfile that produces a small nginx image serving the built app at `/lungseq/` with the cross-origin isolation headers (`Cross-Origin-Opener-Policy`, `Cross-Origin-Embedder-Policy`) Pyodide needs.

```bash
# docker compose (easiest)
docker compose up --build

# or by hand
docker build -t lungseq-analyzer .
docker run --rm -p 8080:80 lungseq-analyzer
```

Then open http://localhost:8080/lungseq/. The bare host (http://localhost:8080/) redirects there.

The headers are set inside the container, so the image works as a standalone deployment or sitting behind a reverse proxy that just forwards traffic — no need for the proxy to inject COOP/COEP itself.

## Project layout

```
lungseq-analyzer/
├── docs/                       # deploy guide, architecture notes
├── public/pyodide/             # Pyodide runtime (copied at build time)
├── public/sample-data/         # bundled NA12878 EGFR slice (1000 Genomes)
├── scripts/copy-pyodide.js     # build helper
├── server.js                   # production static server with COOP/COEP
├── src/
│   ├── views/                  # Dashboard, DataBrowser, VariantCalling, CNVAnalysis, Visualization
│   ├── components/             # CNVVisualization, BrowserCompatWarning, TerminalLog
│   ├── composables/            # usePyodide, useVariantCaller, usePyodidePool
│   ├── services/               # analysis-service
│   ├── utils/                  # opfs-manager, browser-compat
│   └── workers/                # pyodide.worker.js
└── vite.config.js
```

## License

MIT.

## Acknowledgments

- Pyodide team for making in-browser Python practical
- [1000 Genomes Project](https://www.internationalgenome.org/) for the NA12878 exome data used as bundled sample data
- TCGA / ICGC for the open cancer genomics data the (currently mocked) Data Browser would have queried
- UIC for the class that prompted this
