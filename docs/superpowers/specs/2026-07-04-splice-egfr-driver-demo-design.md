# /splice "Live demo · EGFR drivers" showcase — design

**Date:** 2026-07-04
**Status:** approved design, gated on WASM annotation-parity proof (PASSED)
**Scope:** website only (`cnvlens` repo, `feat/splice-site-features` → deployed to `/splice`). No engine/release changes, no version bumps.

## Goal

Add a maxed-out demo to the `/splice` page that exercises the **full CodonSplice stack in one query** on a labeled synthetic sample: SNV calling + indel calling + reference-anchored REF + gene/exon annotation + computed HGVS + ClinVar significance — all client-side on the 0.5.1 WASM engine.

## Verified facts (the gate)

The WASM engine (`@codonsplice/wasm@0.5.1`, the version now live on `/splice`) runs the full-stack ANNOTATE query **identically to the CLI**, proven via a Node harness (fetch-polyfilled for the wasm load):

- Annotation columns are produced in-browser: `gene, transcript, exon, exon_id, region, consequence, aa_change, hgvs_c, clinvar_significance, clinvar_oncogenic, clinvar_id, rsid`.
- **The ClinVar `.tbi` index is NOT required in-browser** — output is identical with and without it (the engine full-scans the bgzipped VCF). So the `.tbi` is not shipped.

**Real result of the demo query** (this is engine output, not hand-authored — the showcase renders these live):

| pos | type | AF | gene·exon | consequence | aa_change / hgvs_c | ClinVar |
|---|---|---|---|---|---|---|
| chr7:55259515 T>G *(injected)* | SNV | 0.52 | EGFR·21 | missense_variant | **p.Leu858Arg / c.2573T>G** | drug_response, **Oncogenic**, 16609, rs121434568 |
| chr7:55242464 …AGC>A *(injected)* | DEL | 0.37 | EGFR·19 | **inframe_deletion** | `.` / `.` | Conflicting…, **Oncogenic**, 163343, rs121913421 |
| chr7:55249063 G>A *(real NA12878)* | SNV | 0.47 | EGFR·20 | synonymous | p.Gln787= / c.2361G>A | Benign, 45271, rs1050171 |

Two honesty constraints this fixes in the design:
1. The deletion's `aa_change`/`hgvs_c` are `.` (engine computes HGVS for SNVs only) — its card **must not** display a fabricated `p.` notation.
2. Row 3 is a **real** NA12878 polymorphism, not injected — the label names it explicitly.

## The demo query (canonical)

```sql
FROM bam "EGFR_L858R_ex19del_SYNTHETIC.bam"
WHERE chr = "7" AND pos >= 55240000 AND pos <= 55260000
CALL variants
WITH reference = "EGFR_region.fa", min_depth = 20, min_allele_freq = 0.2
ANNOTATE WITH genes = "EGFR_region.GRCh37.gff3", clinvar = "clinvar_GRCh37_EGFR.vcf.gz"
ORDER BY pos
```

**The run query has no `SELECT`** — it returns all annotation columns, so the driver cards read specific fields (`aa_change`, `clinvar_oncogenic`, …) and the full-table view shows everything from the same result set. A `SELECT chrom, pos, ref, alt, type, allele_freq, gene, exon, aa_change, hgvs_c, clinvar_significance` variant is used only for the "open in playground →" teaching version, to show projection.

## UX / components (all in `src/views/Splice.vue`)

### 1. Curated showcase — new `Collapsible`, inserted after the hero `<section>`, before "1 · Install"
- `large default-open`, visually distinct (accent border), **unnumbered** so the 1–6 sequence is undisturbed.
- **Synthetic banner (mandatory, always visible, non-dismissable):**
  > ⚠ SYNTHETIC sample — constructed from `NA12878` (a normal individual) with **injected** EGFR drivers (L858R, exon-19 deletion) to demonstrate the calling + annotation stack. **These are not real patient calls.** The EGFR Q787= row is a genuine NA12878 polymorphism.
- **"Run the live demo ▶" button** (no auto-fetch on page load — keeps the page light). On click: lazy-`import('@codonsplice/wasm/helpers')`, fetch the data files, `execute()` the demo query, render:
  - **Two driver cards** built from the real result rows:
    - L858R SNV: `chr7:55259515 T>G`, AF, `EGFR · exon 21 · missense`, **p.Leu858Arg · c.2573T>G**, ClinVar drug_response / Oncogenic (16609, rs121434568).
    - Exon-19 DEL: `chr7:55242464 …>A`, AF, `EGFR · exon 19 · inframe_deletion`, ClinVar Oncogenic (163343, rs121913421). **No protein-HGVS shown** (it is `.`).
  - **Collapsible full result table** — all rows + all annotation columns, reusing the existing playground table markup/formatter.
  - The **SpliceQL query** in a `CodeBlock`, and an **"open in playground →"** control that loads this query into section 6.
- States: idle (cards empty, button prominent) → loading ("running…") → populated. Error → red message (reuse existing pattern).

### 2. Playground integration (section 6)
- Add an **"EGFR drivers (synthetic)"** entry to the `examples` array with the demo query.
- Extend `fetchSampleFiles()` to also fetch `EGFR_region.fa`, `EGFR_region.GRCh37.gff3`, `clinvar_GRCh37_EGFR.vcf.gz` (in addition to the BAM). Fetch is cheap and cached; always including them keeps the map simple and lets any example use annotation.
- Show the synthetic note when that example is `activeExample`.

### 3. Shared state
- New reactive block for the showcase (`demoRows`, `demoLoading`, `demoError`, `demoRan`, a `runDemo()` mirroring `runQuery()`), kept separate from the playground's state to avoid coupling.

## Data to deploy → `cnvlens/public/sample-data/`
- `EGFR_L858R_ex19del_SYNTHETIC.bam` + `.bai` (2.4 MB + 28 KB) — the synthetic sample.
- `EGFR_region.GRCh37.gff3` (68 KB) — gene model (from `testdata/`).
- `clinvar_GRCh37_EGFR.vcf.gz` (180 KB) — ClinVar slice (from `testdata/`). **No `.tbi`.**
- `EGFR_region.fa` (+`.fai`) — already present.

Total added payload ≈ 2.7 MB, fetched only on demo run.

## Deploy (per `oracle-web-deploy` runbook)
Build in throwaway `node:20-alpine` (host has no node), copy `dist/` → `/usr/share/nginx/html/splice`, `restorecon -Rv` (SELinux), verify the served `Splice-*.js` chunk + the demo assets. Commit the `Splice.vue` change + spec on `feat/splice-site-features`; the existing uncommitted WIP on that file is the base and is preserved (this change is authored on top of it).

## Testing / verification
- **Pre-build (done):** WASM harness proves ANNOTATE parity + `.tbi` not needed.
- **Post-build, pre-deploy:** `npm run build` in the container is clean; grep the built `Splice-*.js` for the demo query string.
- **Post-deploy (runtime):** load `/splice` over HTTPS, click "Run the live demo", confirm the two driver cards populate with p.Leu858Arg + the exon-19 inframe_deletion and ClinVar Oncogenic, and the full table shows all 3 rows. Rollback copy retained (`splice.bak.<ts>`).

## Out of scope
- Any engine/CLI/release change or version bump (website is separate).
- The CNV amplification positive-control gap (needs a real HCC827 BAM or coverage manipulation) — unaffected.
- Wiring a file-upload path for user BAMs (the existing playground note already covers "swap your own file").
