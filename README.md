# CNVLens

CNVLens is a browser-based tool for copy number variation (CNV) calling from BAM files. It runs a complete CNV detection and variant calling pipeline entirely in the browser via WebAssembly, with no server, no uploads, and no installation. 

**Live demo:** https://swapdoesbioandis-a.dev/cnvlens

> **Not validated for clinical use.** This is an educational/research tool. No GIAB validation has been performed. See "Known limitations" below.

> This is a scoped class project. PRs are welcome but I'm not actively developing it.

## What works

- **SNV calling** — upload a BAM, get a pileup-based SNV caller with configurable depth/quality/AF/strand-bias filters and VCF/JSON/CSV export. Optional BAI index can be supplied (see note under "Known limitations" about how it's used).
- **Sample data** — click "try with sample data" on the Variant Calling page to run the pipeline without your own files. Sample data: NA12878 exome slice covering EGFR (chr7:55,000,000–55,300,000, GRCh37). 5.7MB with BAI index, ~57x coverage in captured exons. Released under 1000 Genomes Project data use policy (unrestricted).
- **CNV analysis** — read-depth based amp/del calls with adaptive thresholds, CBS-lite binary segmentation (when reference provided), degree-2 GC correction in log-space, N-mask handling, confidence scoring, and Plotly + D3 visualizations.
- **Visualization** — Manhattan plot, allele-frequency histogram, quality-vs-depth scatter, CNV genome overview, per-chromosome summary, with PNG/SVG export.
- **Diagnostics** — benchmarking page at /diagnostics for measuring pipeline performance with timing instrumentation.
- **OPFS storage** — large BAM files persist between sessions via the Origin Private File System, with an IndexedDB fallback for browsers that don't support OPFS.

## What's scaffolded

- **TCGA / ICGC integration** — the Data Browser page is a static UI mockup. The "Search TCGA Database" button has no handler. `vite.config.js` has proxy entries for `api.gdc.cancer.gov` and the ICGC API but no client code uses them.
- **Indel calling** — the variant caller emits SNVs only. Indels would need CIGAR-aware pileup logic that isn't implemented. The UI surfaces this limitation explicitly (it used to silently report 0 indels).
- **Data Browser** — see TCGA/ICGC above. It's a non-functional placeholder.

## Known limitations

- **No indel calling** — the variant caller emits SNVs only. CIGAR-aware pileup logic not implemented.
- **BAI index is not used for seeking** — a BAI can be supplied, but the current Rust pipeline does a single full file scan for both coverage and variant calling regardless. When no BAI is present the result simply carries a "full file scan performed" warning. (A previous Python build used the BAI to seek a single chromosome; that fast path has not been reimplemented in the Rust engine yet.)
- **Simple CNV segmentation** — CBS-lite is a basic recursive binary segmentation, not a full CBS implementation.
- **No normal reference panel** — tumor-only calling means germline variants cannot be distinguished from somatic.
- **No GIAB validation** — variant calls have not been benchmarked against truth sets.
- **Reference base inference** — without a FASTA, homozygous variants are undetectable (most common base is assumed to be reference).

## Performance

The whole engine is a single ~300 KB WebAssembly module (compiled from Rust), so there is no large runtime to download — the previous Pyodide build pulled ~18 MB of Python/NumPy before it could do anything. The module loads effectively instantly and is cached after first visit.

For the EGFR sample (5.7 MB, single full scan) variant calling typically completes in a few seconds. The /diagnostics page provides exact timing breakdowns.

## Architecture

All bioinformatics work happens in a Rust core compiled to WebAssembly. There is no Python, no Pyodide, and no compiled bcftools/samtools in this repo. BAM/BGZF/CSI parsing is handled by the [`noodles`](https://github.com/zaeleus/noodles) crate; coverage, CNV detection, and SNV calling are custom Rust.

```
Vue 3 UI (main thread)
    │
    │ postMessage(BAM ArrayBuffer + optional BAI + options)
    ▼
WASM Web Worker  (cnvlens-core, Rust → wasm32)
    ├── bam (noodles)      — BGZF/BAM decode → lightweight AlnRecord stream
    ├── coverage           — windowed read-depth, single-pass binning
    ├── cnv                — CBS-lite segmentation or threshold-based
    │                        (adaptive/manual), log-space GC correction, N-mask
    ├── variants           — 1MB-window pileup, strand-bias + position-in-read
    │                        filters, binomial Phred score, optional FASTA ref
    └── stats              — shared numeric helpers (binomial, regression, …)
    │
    ▼ JSON results + warnings   (thin wasm-bindgen JSON-in / JSON-out shim)
Plotly / D3 visualizations + OPFS persistence
```

Files never leave the browser. After the initial app load there are no required network calls — the WASM module is served as a static asset.

The Rust core is split so the pipeline logic lives in plain functions that compile and run natively too. `rust/cnvlens-core/src/bin/bench.rs` is a native harness that runs the same pipeline on the bundled sample for timing and API validation.

## Tech stack

- **Frontend:** Vue 3 (Composition API), Vite 7, Vue Router, Tailwind (Catppuccin Mocha)
- **Bioinformatics engine:** Rust compiled to WebAssembly (`wasm-bindgen` / `wasm-pack`), using the `noodles` crate for BGZF/BAM/CSI parsing plus custom coverage/CNV/SNV code
- **Visualization:** Plotly.js, D3
- **Storage:** OPFS with IndexedDB fallback
- **Hosting:** Docker (nginx) behind a reverse proxy

## Local development

```bash
git clone https://github.com/Pogo-Bash/cnvlens.git
cd cnvlens
npm install
npm run dev
```

Then open http://localhost:3000/cnvlens/. The dev server sets the COOP/COEP headers WebAssembly workers require.

The compiled WASM bundle is **committed to the repo** under `src/wasm/`, so a plain `npm install && npm run dev` (or `npm run build`) works without a Rust toolchain. You only need Rust if you want to change the engine:

```bash
# Requires a Rust toolchain + wasm-pack
npm run build:wasm     # rebuilds src/wasm/ from rust/cnvlens-core

npm run build          # production build to dist/ (also regenerates the OG image)
npm run start          # serve dist/ via server.js (used by Render)
npm run preview        # vite preview (alternative)
```

Note: the app is built with a base path of `/cnvlens/`, so locally it lives at http://localhost:3000/cnvlens/, not at the root.

## Run with Docker

The repo ships a multi-stage Dockerfile that produces a small nginx image serving the built app at `/cnvlens/` with the cross-origin isolation headers (`Cross-Origin-Opener-Policy`, `Cross-Origin-Embedder-Policy`). Because the WASM bundle is committed, the build image needs only Node — no Rust toolchain.

```bash
# docker compose (easiest)
docker compose up --build

# or by hand
docker build -t cnvlens .
docker run --rm -p 8080:80 cnvlens
```

Then open http://localhost:8080/cnvlens/. The bare host (http://localhost:8080/) redirects there.

The headers are set inside the container, so the image works as a standalone deployment or behind a reverse proxy that just forwards traffic — no need for the proxy to inject COOP/COEP itself.

## Project layout

```
cnvlens/
├── docs/                       # deploy guide, architecture/migration notes
├── rust/cnvlens-core/          # Rust engine (BAM parse + CNV/SNV pipeline)
│   └── src/                    # bam, coverage, cnv, variants, stats, model, lib
├── public/sample-data/         # bundled NA12878 EGFR slice (1000 Genomes)
├── scripts/build-og.js         # OG-image generator (runs during build)
├── server.js                   # production static server with COOP/COEP
├── src/
│   ├── wasm/                   # committed wasm-pack output (cnvlens_core)
│   ├── views/                  # Dashboard, DataBrowser, VariantCalling, CNVAnalysis, Visualization, Diagnostics
│   ├── components/             # CNVVisualization, BrowserCompatWarning, TerminalLog
│   ├── composables/            # useWasm, useVariantCaller
│   ├── services/               # analysis-service
│   ├── utils/                  # opfs-manager, browser-compat
│   └── workers/                # cnvlens.worker.js (loads the WASM module)
└── vite.config.js
```

## License

MIT.

## Acknowledgments

- The [`noodles`](https://github.com/zaeleus/noodles) project for pure-Rust BGZF/BAM/CSI parsing
- The Rust and `wasm-bindgen` teams for making in-browser native-speed bioinformatics practical
- [1000 Genomes Project](https://www.internationalgenome.org/) for the NA12878 exome data used as bundled sample data
- TCGA / ICGC for the open cancer genomics data the (currently mocked) Data Browser would have queried
- UIC for the class that prompted this
