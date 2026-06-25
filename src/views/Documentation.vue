<template>
  <div class="space-y-10">
    <!-- Header + Toggle -->
    <section class="flex items-start justify-between gap-6">
      <div class="max-w-2xl">
        <h1 class="text-3xl font-bold text-text mb-2">documentation</h1>
        <p class="text-subtext0 leading-relaxed">
          everything you need to know about using CNVLens for genomic analysis.
        </p>
      </div>
      <button
        @click="nerd = !nerd"
        class="flex-shrink-0 mt-1 flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-200"
        :class="nerd
          ? 'bg-mauve text-crust'
          : 'bg-surface0 text-subtext0 hover:text-text hover:bg-surface1'"
      >
        <span
          class="inline-block w-2 h-2 rounded-full transition-colors"
          :class="nerd ? 'bg-crust' : 'bg-overlay0'"
        />
        {{ nerd ? 'nerds ON' : 'nerds' }}
      </button>
    </section>

    <!-- Table of Contents -->
    <nav class="card-static">
      <h2 class="text-sm font-bold text-subtext1 uppercase tracking-wider mb-3">contents</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        <a v-for="s in sections" :key="s.id" :href="'#' + s.id"
          class="text-sm text-subtext0 hover:text-mauve transition-colors py-0.5">
          {{ s.label }}
        </a>
      </div>
    </nav>

    <!-- 1. Overview -->
    <section :id="sections[0].id" class="space-y-3">
      <h2 class="text-xl font-bold text-text">{{ sections[0].label }}</h2>
      <template v-if="!nerd">
        <p class="text-subtext0 leading-relaxed">
          CNVLens is a browser-based tool for analyzing DNA sequencing data. Upload
          a BAM file and it will find mutations and copy number changes — regions of
          the genome where DNA has been gained or lost. Everything runs locally in
          your browser using compiled Rust code (WebAssembly). Your data never leaves
          your machine.
        </p>
      </template>
      <template v-else>
        <p class="text-subtext0 leading-relaxed">
          CNVLens is a client-side bioinformatics pipeline compiled from Rust to
          WebAssembly via wasm-bindgen. It implements a complete pileup-based SNV
          caller and a multi-strategy CNV detector (threshold, adaptive, CBS-lite
          segmentation) operating on coordinate-sorted BAM files parsed through the
          noodles BAM/BGZF library. The WASM module runs in a dedicated Web Worker
          to avoid blocking the main thread. Intermediate state is stored in OPFS
          with IndexedDB fallback.
        </p>
      </template>
    </section>

    <!-- 2. Getting Started -->
    <section :id="sections[1].id" class="space-y-3">
      <h2 class="text-xl font-bold text-text">{{ sections[1].label }}</h2>
      <template v-if="!nerd">
        <div class="space-y-2 text-subtext0 leading-relaxed">
          <p>
            <span class="text-text font-bold">1.</span> Go to the
            <router-link to="/variant-calling" class="text-mauve hover:text-lavender">variant calling</router-link> or
            <router-link to="/cnv-analysis" class="text-mauve hover:text-lavender">CNV analysis</router-link> page.
          </p>
          <p>
            <span class="text-text font-bold">2.</span> Upload a BAM file. This is the
            standard format for aligned sequencing reads. Files persist in your
            browser between sessions.
          </p>
          <p>
            <span class="text-text font-bold">3.</span> Optionally upload a reference
            FASTA — this improves accuracy by enabling GC bias correction and proper
            reference base calling.
          </p>
          <p>
            <span class="text-text font-bold">4.</span> Select chromosomes and adjust
            settings, then run the analysis.
          </p>
        </div>
      </template>
      <template v-else>
        <div class="space-y-2 text-subtext0 leading-relaxed">
          <p>
            The engine accepts coordinate-sorted BAM byte buffers (the entire file is
            loaded into WASM linear memory as <code class="text-peach text-xs">&amp;[u8]</code>).
            BAI index bytes can be provided but are currently unused — all operations
            perform a full sequential scan via
            <code class="text-peach text-xs">noodles::bam::io::Reader</code>.
          </p>
          <p>
            File persistence uses the Origin Private File System (OPFS) API where
            available, falling back to IndexedDB. OPFS provides synchronous access
            handles in worker contexts, avoiding serialization overhead.
          </p>
          <p>
            Reference sequences are passed as a
            <code class="text-peach text-xs">HashMap&lt;String, String&gt;</code>
            (chromosome name to FASTA string). When provided, they enable GC
            correction (degree-2 polynomial fit in log-space) and N-masking of
            assembly gaps.
          </p>
        </div>
      </template>
    </section>

    <!-- 3. Coverage Analysis -->
    <section :id="sections[2].id" class="space-y-3">
      <h2 class="text-xl font-bold text-text">{{ sections[2].label }}</h2>
      <template v-if="!nerd">
        <div class="space-y-2 text-subtext0 leading-relaxed">
          <p>
            Coverage analysis counts how many sequencing reads cover each region of
            the genome. The genome is split into fixed-size windows (default 10,000
            bases), and the number of reads starting in each window is tallied.
          </p>
          <p>
            Coverage values are normalized so that the typical window equals 1.0.
            Windows significantly above or below this baseline may indicate DNA gains
            or losses.
          </p>
          <p>
            If a reference genome is provided, a GC bias correction is applied — this
            accounts for the fact that regions with different GC content are sequenced
            at different rates. Windows that fall in assembly gaps (mostly N bases)
            are masked out.
          </p>
        </div>
      </template>
      <template v-else>
        <div class="space-y-2 text-subtext0 leading-relaxed">
          <p>
            The pipeline performs a single-pass linear scan via
            <code class="text-peach text-xs">bam::for_each_core()</code>, decoding
            only (ref_id, 0-based pos, flag) per record. Reads failing the filter
            (unmapped | duplicate | secondary, SAM flags 0x4 | 0x400 | 0x100) are
            skipped. Each surviving read increments
            <code class="text-peach text-xs">counts[pos / window_size]</code>.
          </p>
          <p>
            Normalization: <code class="text-peach text-xs">normalized = raw_count / median(nonzero_counts)</code>.
            Coverage class is assigned as low (&lt;15x), medium (15-30x), or high (&gt;30x).
          </p>
          <p>
            GC correction fits a degree-2 polynomial
            <code class="text-peach text-xs">ln(normalized) ~ a2*gc^2 + a1*gc + a0</code>
            via 3x3 normal equations (Vandermonde), then divides each window's
            normalized value by <code class="text-peach text-xs">exp(polyval(coeffs, gc_frac))</code>.
            Requires >=10 valid data points. N-masking zeros out windows where
            the reference N-fraction exceeds 0.5.
          </p>
        </div>
      </template>
    </section>

    <!-- 4. CNV Detection -->
    <section :id="sections[3].id" class="space-y-3">
      <h2 class="text-xl font-bold text-text">{{ sections[3].label }}</h2>
      <template v-if="!nerd">
        <div class="space-y-2 text-subtext0 leading-relaxed">
          <p>
            CNV detection identifies regions of the genome that have been amplified
            (too many copies) or deleted (missing copies). Three methods are
            available:
          </p>
          <div class="card-static space-y-3 mt-2">
            <div>
              <span class="text-text font-bold">manual threshold</span>
              <span class="text-subtext0"> — you set the cutoffs for what counts as a gain or loss. Windows above the gain threshold or below the loss threshold are grouped into CNV calls.</span>
            </div>
            <div>
              <span class="text-text font-bold">adaptive</span>
              <span class="text-subtext0"> — cutoffs are chosen automatically based on how deep the sequencing is. Lower-coverage data uses more lenient thresholds.</span>
            </div>
            <div>
              <span class="text-text font-bold">automatic change-point detection</span>
              <span class="text-subtext0"> — the algorithm splits each chromosome into segments where the coverage level shifts. This is the default when a reference genome is provided.</span>
            </div>
          </div>
          <p>
            Each CNV call includes a confidence score (low/medium/high) based on how
            many windows support it and how consistent the signal is.
          </p>
        </div>
      </template>
      <template v-else>
        <div class="space-y-2 text-subtext0 leading-relaxed">
          <p>
            Three segmentation strategies are implemented in
            <code class="text-peach text-xs">cnv.rs</code>:
          </p>
          <div class="card-static space-y-3 mt-2 text-sm">
            <div>
              <span class="text-text font-bold">Manual threshold</span>
              <span class="text-subtext0"> — run-length scan: windows with
              <code class="text-peach text-xs">normalized >= amp_threshold</code> are
              classified as amplification,
              <code class="text-peach text-xs">normalized <= del_threshold && > 0</code> as
              deletion. Adjacent windows of the same type on the same chromosome are
              merged. Regions with fewer than <code class="text-peach text-xs">min_windows</code>
              consecutive hits are discarded.</span>
            </div>
            <div>
              <span class="text-text font-bold">Adaptive threshold</span>
              <span class="text-subtext0"> — same algorithm, thresholds derived from
              coverage class: low=(2.0/0.3/5), medium=(1.5/0.5/3), high=(1.3/0.7/2)
              for (amp/del/min_windows).</span>
            </div>
            <div>
              <span class="text-text font-bold">CBS-lite</span>
              <span class="text-subtext0"> — recursive binary segmentation per
              chromosome. At each recursion level, all candidate split points are
              evaluated via a two-sample t-statistic computed with O(n) cumulative
              sums. The split with maximum |t| is accepted if it exceeds
              <code class="text-peach text-xs">t_threshold</code> (default 3.0),
              then both halves are recursed. Segments with mean > 1.3 are called as
              amplifications, &lt; 0.7 as deletions.</span>
            </div>
          </div>
          <p>
            Confidence scoring: CBS-lite uses |t|-statistic thresholds (high: t>5 +
            n>=5, medium: t>3 + n>=3). Threshold methods use window count + standard
            deviation of normalized values (high: n>=7 + std&lt;0.3, medium: n>=3 +
            std&lt;0.5), adjusted by coverage class.
          </p>
          <p>
            CBS-lite output includes
            <code class="text-peach text-xs">copyNumber = avg_normalized * 2.0</code>
            (diploid assumption). Manual mode reports raw
            <code class="text-peach text-xs">copyNumber = avg_normalized</code>.
          </p>
        </div>
      </template>
    </section>

    <!-- 5. Variant Calling -->
    <section :id="sections[4].id" class="space-y-3">
      <h2 class="text-xl font-bold text-text">{{ sections[4].label }}</h2>
      <template v-if="!nerd">
        <div class="space-y-2 text-subtext0 leading-relaxed">
          <p>
            Variant calling identifies single-base mutations (SNVs) — positions where
            the sequenced DNA differs from the reference. The process works by
            stacking all reads that cover each position and counting which bases
            appear.
          </p>
          <p>
            A mutation is called when enough reads support an alternate base, the
            signal appears on both DNA strands, and the variant is not concentrated
            at the edges of reads (which often indicates sequencing artifacts).
          </p>
          <p>
            Each variant is assigned a quality score indicating how confident we are
            that it is a real mutation rather than a sequencing error.
          </p>
        </div>
      </template>
      <template v-else>
        <div class="space-y-2 text-subtext0 leading-relaxed">
          <p>
            Pileup-based SNV caller operating in 1MB genomic windows. Full records
            are decoded via
            <code class="text-peach text-xs">bam::for_each_full()</code> (including
            sequence and base quality arrays) and grouped by target chromosome.
          </p>
          <p>
            Two-pass per window: (1) coverage array to identify candidate positions
            with depth >= <code class="text-peach text-xs">min_depth</code>, (2) base
            pileup at candidates — per-base forward/reverse strand counts filtered by
            <code class="text-peach text-xs">min_base_quality</code> (Phred).
          </p>
          <p>
            Reference base: taken from FASTA when provided, otherwise inferred as the
            most frequent base at each position (first-seen tie-break). Homozygous
            ALT variants are undetectable without a reference.
          </p>
          <p>Filters applied in sequence per alt allele:</p>
          <div class="card-static text-sm space-y-1 mt-1">
            <p><code class="text-peach">min_variant_reads</code> — absolute alt read count floor (default 3)</p>
            <p><code class="text-peach">min_allele_freq</code> — AF = alt_count / total_depth (default 0.05)</p>
            <p><code class="text-peach">min_strand_bias</code> — min(fwd,rev)/total alt reads (default 0.1); filters single-strand artifacts</p>
            <p><code class="text-peach">position-in-read</code> — if >80% of alt-supporting reads carry the variant in the first or last 5 bases, the call is suppressed (edge artifact filter)</p>
          </div>
          <p>
            Quality: Phred-scaled binomial survival test.
            For expected count (n*p) > 5, uses normal approximation;
            otherwise exact log-space CDF via
            <code class="text-peach text-xs">lgamma</code>-based
            <code class="text-peach text-xs">log_comb</code>. Capped at Q999.
          </p>
        </div>
      </template>
    </section>

    <!-- 6. Visualization -->
    <section :id="sections[5].id" class="space-y-3">
      <h2 class="text-xl font-bold text-text">{{ sections[5].label }}</h2>
      <template v-if="!nerd">
        <div class="space-y-2 text-subtext0 leading-relaxed">
          <p>
            The visualization page generates interactive plots from your analysis
            results. Coverage profiles show read depth across chromosomes, with CNV
            regions highlighted. Variant calls can be displayed as scatter plots by
            position and allele frequency.
          </p>
          <p>
            Plots are rendered with Plotly.js and D3.js and can be exported for use
            in publications or reports.
          </p>
        </div>
      </template>
      <template v-else>
        <div class="space-y-2 text-subtext0 leading-relaxed">
          <p>
            Visualization is handled by
            <code class="text-peach text-xs">CNVVisualization.vue</code> using
            Plotly.js (plotly.js-dist-min) for interactive scatter/line plots and
            D3.js for custom SVG rendering. Coverage data is plotted as normalized
            depth per window with CNV segments overlaid as colored regions
            (amplification = red, deletion = blue).
          </p>
          <p>
            Variant allele frequency (VAF) plots show each called SNV positioned by
            genomic coordinate (x) vs. allele frequency (y), colored by quality
            score. All plots support pan, zoom, and PNG/SVG export via the Plotly
            modebar.
          </p>
        </div>
      </template>
    </section>

    <!-- 7. Parameters Reference -->
    <section :id="sections[6].id" class="space-y-4">
      <h2 class="text-xl font-bold text-text">{{ sections[6].label }}</h2>

      <div>
        <h3 class="text-sm font-bold text-subtext1 uppercase tracking-wider mb-2">
          {{ nerd ? 'CoverageOptions struct' : 'coverage settings' }}
        </h3>
        <div class="overflow-x-auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>parameter</th>
                <th>default</th>
                <th>description</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="text-peach">window_size</td>
                <td class="numeric">10,000</td>
                <td>{{ nerd ? 'Bin width in base pairs for coverage accumulation' : 'Size of each counting region in base pairs' }}</td>
              </tr>
              <tr>
                <td class="text-peach">chromosome(s)</td>
                <td>all</td>
                <td>{{ nerd ? 'Reference sequence name filter (matched against BAM header @SQ SN tags)' : 'Which chromosomes to analyze' }}</td>
              </tr>
              <tr>
                <td class="text-peach">segmentation_method</td>
                <td>auto</td>
                <td>{{ nerd ? '"threshold" | "adaptive" | "cbs_lite" — auto selects cbs_lite when reference_seqs is provided' : '"threshold", "adaptive", or "cbs_lite" — auto-selected based on whether you provide a reference' }}</td>
              </tr>
              <tr>
                <td class="text-peach">amp_threshold</td>
                <td class="numeric">1.5</td>
                <td>{{ nerd ? 'Normalized coverage ratio above which a window is classified as amplified (manual mode)' : 'How much above normal a region must be to count as a gain (manual mode)' }}</td>
              </tr>
              <tr>
                <td class="text-peach">del_threshold</td>
                <td class="numeric">0.5</td>
                <td>{{ nerd ? 'Normalized coverage ratio below which a window is classified as deleted (manual mode)' : 'How much below normal a region must be to count as a loss (manual mode)' }}</td>
              </tr>
              <tr>
                <td class="text-peach">min_windows</td>
                <td class="numeric">3</td>
                <td>{{ nerd ? 'Minimum consecutive windows required to emit a CNV call' : 'Minimum number of consecutive windows to report a CNV' }}</td>
              </tr>
              <tr>
                <td class="text-peach">reference_seqs</td>
                <td>none</td>
                <td>{{ nerd ? 'HashMap<String, String> — per-chromosome FASTA sequences for GC correction and N-masking' : 'Reference genome sequences — enables GC correction and gap masking' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 class="text-sm font-bold text-subtext1 uppercase tracking-wider mb-2">
          {{ nerd ? 'VariantOptions struct' : 'variant calling settings' }}
        </h3>
        <div class="overflow-x-auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>parameter</th>
                <th>default</th>
                <th>description</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="text-peach">min_depth</td>
                <td class="numeric">10</td>
                <td>{{ nerd ? 'Minimum pileup depth at a position for it to be considered a candidate' : 'Minimum number of reads covering a position to check for variants' }}</td>
              </tr>
              <tr>
                <td class="text-peach">min_base_quality</td>
                <td class="numeric">20</td>
                <td>{{ nerd ? 'Phred-scaled base quality floor — bases below this are excluded from pileup counts' : 'Minimum quality score for a base to be counted (Phred scale, 20 = 99% accuracy)' }}</td>
              </tr>
              <tr>
                <td class="text-peach">min_mapping_quality</td>
                <td class="numeric">20</td>
                <td>{{ nerd ? 'MAPQ floor — reads with mapping quality below this are discarded pre-pileup' : 'Minimum alignment confidence for a read to be included' }}</td>
              </tr>
              <tr>
                <td class="text-peach">min_variant_reads</td>
                <td class="numeric">3</td>
                <td>{{ nerd ? 'Minimum alt-supporting read count to emit an SNV call' : 'Minimum number of reads supporting the mutation' }}</td>
              </tr>
              <tr>
                <td class="text-peach">min_allele_freq</td>
                <td class="numeric">0.05</td>
                <td>{{ nerd ? 'Minimum variant allele frequency (alt_count / total_depth) threshold' : 'Minimum fraction of reads showing the mutation (5% default)' }}</td>
              </tr>
              <tr>
                <td class="text-peach">min_strand_bias</td>
                <td class="numeric">0.1</td>
                <td>{{ nerd ? 'Minimum min(fwd, rev) / total for alt allele — filters single-strand artifacts' : 'Ensures the mutation appears on both DNA strands (filters artifacts)' }}</td>
              </tr>
              <tr>
                <td class="text-peach">reference_seqs</td>
                <td>none</td>
                <td>{{ nerd ? 'Per-chromosome FASTA for true reference base — without this, ref is inferred as the most frequent base (homozygous ALT undetectable)' : 'Reference genome — without this, the tool guesses the reference base from the data and may miss some mutations' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- 8. Architecture -->
    <section :id="sections[7].id" class="space-y-3">
      <h2 class="text-xl font-bold text-text">{{ sections[7].label }}</h2>
      <template v-if="!nerd">
        <div class="space-y-2 text-subtext0 leading-relaxed">
          <p>
            CNVLens is built as a standard web application (Vue 3) with the heavy
            computation handled by Rust code compiled to WebAssembly. When you run an
            analysis, the work happens in a background thread (Web Worker) so the
            interface stays responsive.
          </p>
          <p>
            The browser loads your BAM file into memory and passes it to the WASM
            module, which parses it and runs the full analysis pipeline. Results come
            back as JSON and are rendered into interactive plots.
          </p>
          <p>
            No data is uploaded to any server. The entire pipeline runs locally. Files
            are stored in your browser's private filesystem between sessions.
          </p>
        </div>
      </template>
      <template v-else>
        <div class="space-y-2 text-subtext0 leading-relaxed">
          <p>
            The Rust crate <code class="text-peach text-xs">cnvlens-core</code> is
            compiled to a <code class="text-peach text-xs">cdylib</code> WASM target
            via wasm-bindgen. The crate exposes two entry points:
            <code class="text-peach text-xs">analyze_coverage(bam, bai, opts_json) -> String</code>
            and
            <code class="text-peach text-xs">call_variants(bam, bai, opts_json) -> String</code>,
            both JSON-in/JSON-out.
          </p>
          <p>Architecture stack:</p>
          <div class="card-static text-sm font-mono space-y-0.5 mt-1">
            <p class="text-subtext0">Vue 3 (Composition API) + Vite</p>
            <p class="text-subtext0">&nbsp; -> Web Worker (dedicated thread)</p>
            <p class="text-subtext0">&nbsp;&nbsp;&nbsp; -> wasm-bindgen shim (cfg(wasm32))</p>
            <p class="text-subtext0">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; -> cnvlens-core pipeline</p>
            <p class="text-subtext0">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; -> noodles BAM/BGZF decoder</p>
          </div>
          <p>
            The WASM module operates on <code class="text-peach text-xs">&amp;[u8]</code>
            slices passed from JS — the entire BAM file must fit in WASM linear memory.
            Results are serialized as <code class="text-peach text-xs">serde_json::Value</code>
            and returned as a JSON string. The native bench binary
            (<code class="text-peach text-xs">src/bin/bench.rs</code>) uses the same
            pipeline code for validation against the Python reference implementation.
          </p>
          <p>
            Dependencies: noodles 0.111 (BAM/BGZF/SAM/CSI), serde/serde_json (serialization),
            libm (lgamma for binomial quality scores). WASM-only: wasm-bindgen,
            console_error_panic_hook. Build profile: opt-level 3, LTO, single codegen
            unit, panic=abort.
          </p>
        </div>
      </template>
    </section>

    <!-- 9. Limitations -->
    <section :id="sections[8].id" class="space-y-3">
      <h2 class="text-xl font-bold text-text">{{ sections[8].label }}</h2>
      <template v-if="!nerd">
        <div class="space-y-2 text-subtext0 leading-relaxed">
          <ul class="space-y-2 list-none">
            <li class="flex gap-2">
              <span class="text-peach flex-shrink-0">*</span>
              <span>Only single-base mutations (SNVs) are detected. Insertions and deletions are not yet supported.</span>
            </li>
            <li class="flex gap-2">
              <span class="text-peach flex-shrink-0">*</span>
              <span>BAM index files (BAI) are accepted but not yet used — the engine always scans the full file. This means region-specific queries are slower than they could be.</span>
            </li>
            <li class="flex gap-2">
              <span class="text-peach flex-shrink-0">*</span>
              <span>The entire BAM file must fit in browser memory. Very large files (multi-gigabyte WGS) may exceed available memory.</span>
            </li>
            <li class="flex gap-2">
              <span class="text-peach flex-shrink-0">*</span>
              <span>Only one BAM file at a time — there is no tumor/normal comparison or multi-sample analysis.</span>
            </li>
            <li class="flex gap-2">
              <span class="text-peach flex-shrink-0">*</span>
              <span>VCF files cannot be imported. All variant calls are generated from BAM files only.</span>
            </li>
            <li class="flex gap-2">
              <span class="text-peach flex-shrink-0">*</span>
              <span>Without a reference genome, some mutations may be missed (homozygous variants where every read differs from the actual reference).</span>
            </li>
            <li class="flex gap-2">
              <span class="text-peach flex-shrink-0">*</span>
              <span>The variant caller has not been validated against benchmark truth sets (e.g., GIAB).</span>
            </li>
          </ul>
        </div>
      </template>
      <template v-else>
        <div class="space-y-2 text-subtext0 leading-relaxed">
          <ul class="space-y-2 list-none">
            <li class="flex gap-2">
              <span class="text-peach flex-shrink-0">*</span>
              <span>No CIGAR-aware alignment — reads are treated as ungapped (<code class="text-peach text-xs">seq[i]</code> maps to <code class="text-peach text-xs">pos + i</code>). Insertions, deletions, soft clips, and split reads are invisible. No indel calling.</span>
            </li>
            <li class="flex gap-2">
              <span class="text-peach flex-shrink-0">*</span>
              <span>BAI-based random access is not implemented — the <code class="text-peach text-xs">_bai</code> parameter is accepted but never dereferenced. All pipelines perform full sequential scans via <code class="text-peach text-xs">noodles::bam::io::Reader</code>.</span>
            </li>
            <li class="flex gap-2">
              <span class="text-peach flex-shrink-0">*</span>
              <span>Entire BAM is held as <code class="text-peach text-xs">&amp;[u8]</code> in WASM linear memory — no streaming I/O. Memory-constrained for files exceeding ~2GB (browser WASM memory limits).</span>
            </li>
            <li class="flex gap-2">
              <span class="text-peach flex-shrink-0">*</span>
              <span>Single-sample only. No tumor/normal paired analysis, no multi-sample VCF output, no cohort-level allele frequency comparison.</span>
            </li>
            <li class="flex gap-2">
              <span class="text-peach flex-shrink-0">*</span>
              <span>No VCF/BCF input parsing. Cannot ingest existing variant call sets for annotation or filtering.</span>
            </li>
            <li class="flex gap-2">
              <span class="text-peach flex-shrink-0">*</span>
              <span>Without <code class="text-peach text-xs">reference_seqs</code>, reference base is inferred as the modal base at each position (first-seen tie-break). Homozygous ALT sites are indistinguishable from reference.</span>
            </li>
            <li class="flex gap-2">
              <span class="text-peach flex-shrink-0">*</span>
              <span>No GIAB/Platinum Genomes validation. The binomial qual score uses a fixed error rate of 0.01 — no per-read error model.</span>
            </li>
            <li class="flex gap-2">
              <span class="text-peach flex-shrink-0">*</span>
              <span>Single-threaded execution. No per-chromosome parallelism (Web Workers are single-threaded; SharedArrayBuffer + worker pool not yet implemented).</span>
            </li>
          </ul>
        </div>
      </template>
    </section>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useHead } from '@unhead/vue'

useHead({
  title: 'Documentation — CNVLens',
  meta: [
    { name: 'description', content: 'CNVLens documentation — coverage analysis, CNV detection, variant calling, and pipeline parameters.' },
  ],
})

const nerd = ref(false)

const sections = [
  { id: 'overview', label: 'overview' },
  { id: 'getting-started', label: 'getting started' },
  { id: 'coverage', label: 'coverage analysis' },
  { id: 'cnv', label: 'cnv detection' },
  { id: 'variants', label: 'variant calling' },
  { id: 'visualization', label: 'visualization' },
  { id: 'parameters', label: 'parameters reference' },
  { id: 'architecture', label: 'architecture' },
  { id: 'limitations', label: 'limitations & known issues' },
]
</script>
