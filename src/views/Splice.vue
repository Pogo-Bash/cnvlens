<template>
  <div class="space-y-8 max-w-3xl">
    <!-- Header -->
    <section>
      <h1 class="text-3xl font-bold text-text mb-2">SpliceQL / CodonSplice</h1>
      <p class="text-subtext0 leading-relaxed">
        A small, SQL-like query language for genomic files. Write SpliceQL, point it at a
        BAM/VCF/BED/FASTA, and get variants, coverage, or reads back — on the command line,
        compiled to a standalone binary, or in the browser via WebAssembly.
        <span class="text-subtext1">SpliceQL is the language; CodonSplice is the engine that
        compiles it to bytecode and runs it on a self-contained stack VM, with no external
        runtime on the query path.</span>
      </p>
      <p class="text-sm text-subtext0 leading-relaxed mt-3">
        It is not a bcftools replacement. It is a common-80% engine with
        <span class="text-green">verified parity</span> on the operations it covers — variant
        calling, set operations, multi-allelic normalization, somatic pairing, and annotation —
        plus reach bcftools structurally lacks: it runs in the browser and embedded, and adds
        parallel CNV calling. Every parity claim below names the oracle it was checked against.
      </p>
    </section>

    <!-- ════════════ LIVE DEMO · EGFR DRIVERS (synthetic) ════════════ -->
    <Collapsible title="Live demo · EGFR drivers" large default-open>
      <!-- MANDATORY, always-visible synthetic label (never inside a v-if) -->
      <div class="rounded-lg border border-yellow/60 bg-yellow/5 px-3 py-2 text-xs text-subtext0 leading-relaxed">
        <span class="font-bold text-yellow">⚠ SYNTHETIC sample.</span>
        Constructed from <code>NA12878</code> (a normal individual) with
        <strong>injected</strong> EGFR drivers (L858R + an exon-19 deletion) to demonstrate the
        calling + annotation stack. <strong>These are not real patient calls.</strong>
        The <code>EGFR p.Gln787=</code> row is a genuine NA12878 polymorphism.
      </div>

      <p class="text-sm text-subtext0">
        One query, entirely in your browser: reference-anchored SNV <em>and</em> indel calling,
        gene/exon annotation, computed HGVS, and ClinVar significance — on the CodonSplice 0.5.1
        WASM engine. Nothing is uploaded.
      </p>
      <CodeBlock lang="sql" :code="demoQuery" />

      <div class="flex flex-wrap items-center gap-3">
        <button
          @click="runDemo"
          :disabled="demoLoading"
          class="px-4 py-2 rounded-lg text-sm font-bold bg-mauve text-crust hover:bg-lavender transition-colors disabled:opacity-50"
        >{{ demoLoading ? 'running…' : '▶ Run the live demo' }}</button>
        <span v-if="demoError" class="text-sm text-red">{{ demoError }}</span>
        <button
          v-if="demoRan"
          @click="openInPlayground"
          class="text-xs text-mauve hover:text-lavender underline"
        >open in playground →</button>
      </div>

      <!-- driver cards — built from the real result rows (demoDrivers) -->
      <div v-if="demoRan && demoDrivers.length" class="grid gap-3 sm:grid-cols-2">
        <div v-for="d in demoDrivers" :key="d.label" class="card-static space-y-1.5">
          <div class="flex items-baseline justify-between gap-2">
            <span class="text-sm font-bold text-text">{{ d.label }}</span>
            <span class="text-[11px] font-mono text-overlay1">AF {{ fmt(d.row.allele_freq) }}</span>
          </div>
          <div class="text-xs font-mono text-subtext0">
            chr{{ d.row.chrom }}:{{ d.row.pos }} {{ d.row.ref }}&gt;{{ d.row.alt }} · {{ d.row.type }}
          </div>
          <div class="text-xs text-subtext0">
            <span class="text-blue font-bold">{{ d.row.gene }}</span> · exon {{ d.row.exon }} ·
            {{ d.row.consequence }}
            <!-- protein/cDNA HGVS shown ONLY when the engine computed it (SNVs);
                 the deletion has aa_change '.', so this block is skipped for it. -->
            <template v-if="d.row.aa_change && d.row.aa_change !== '.'">
              · <span class="text-green font-mono">{{ d.row.aa_change }}</span>
              <span v-if="d.row.hgvs_c && d.row.hgvs_c !== '.'" class="font-mono text-subtext0"> / {{ d.row.hgvs_c }}</span>
            </template>
          </div>
          <div v-if="d.row.clinvar_oncogenic && d.row.clinvar_oncogenic !== '.'" class="text-xs">
            ClinVar: <span class="text-red font-bold">{{ d.row.clinvar_oncogenic }}</span>
            <span class="text-overlay1">({{ d.row.clinvar_significance }} · {{ d.row.clinvar_id }} · {{ d.row.rsid }})</span>
          </div>
        </div>
      </div>

      <!-- full result — all columns, reusing the playground table style -->
      <Collapsible v-if="demoRan" title="Full result — all annotation columns">
        <div class="overflow-x-auto">
          <table class="w-full text-xs text-left">
            <thead class="text-subtext1 border-b border-surface1">
              <tr><th v-for="c in demoColumns" :key="c" class="py-1.5 pr-4 font-bold">{{ c }}</th></tr>
            </thead>
            <tbody>
              <tr v-for="(r, i) in demoRows" :key="i" class="border-b border-surface0">
                <td v-for="c in demoColumns" :key="c" class="py-1 pr-4 text-subtext0 font-mono">{{ fmt(r[c]) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Collapsible>
    </Collapsible>

    <!-- ════════════ TREE 1 · INSTALL ════════════ -->
    <Collapsible title="1 · Install" large default-open>
      <p class="text-sm text-subtext0">
        Every method installs the same <code>splice</code> binary. Pick one, then verify at the
        bottom.
      </p>

      <p class="text-xs uppercase tracking-wider text-mauve font-bold pt-1">Quick install</p>
      <p class="text-sm text-subtext0">
        The included installer script (macOS &amp; Linux) downloads the right prebuilt binary into
        <code>~/.local/bin</code>. Override the location with <code>INSTALL_DIR</code>.
      </p>
      <CodeBlock lang="bash" prompt :code="installQuick" />

      <p class="text-xs uppercase tracking-wider text-mauve font-bold pt-1">Easy installs</p>

      <Collapsible title="npm — cross-platform, no Rust" default-open>
        <p class="text-sm text-subtext0">
          Pulls the matching prebuilt <code>splice</code> binary on install. Best if you already
          have Node.
        </p>
        <CodeBlock lang="bash" prompt :code="installNpm" />
      </Collapsible>

      <Collapsible title="cargo — if you have Rust">
        <p class="text-sm text-subtext0">Builds and installs the <code>splice</code> binary onto your PATH.</p>
        <CodeBlock lang="bash" prompt :code="installCargo" />
      </Collapsible>

      <Collapsible title="macOS — Apple Silicon (M1/M2/M3)">
        <p class="text-sm text-subtext0">
          Downloads the native <code>arm64</code> binary. (The Quick install and npm methods above
          resolve to this same Apple-Silicon build automatically.)
        </p>
        <CodeBlock lang="bash" prompt :code="installMacArm" />
      </Collapsible>

      <Collapsible title="macOS — Intel">
        <p class="text-sm text-subtext0">For Intel Macs (<code>x86_64</code>).</p>
        <CodeBlock lang="bash" prompt :code="installMacIntel" />
      </Collapsible>

      <Collapsible title="Linux — x86_64">
        <CodeBlock lang="bash" prompt :code="installLinuxX86" />
      </Collapsible>

      <Collapsible title="Linux — aarch64 (ARM)">
        <p class="text-sm text-subtext0">AWS Graviton, Raspberry Pi 4/5, and other ARM64 Linux.</p>
        <CodeBlock lang="bash" prompt :code="installLinuxArm" />
      </Collapsible>

      <Collapsible title="Windows — PowerShell one-liner">
        <p class="text-sm text-subtext0">
          The Windows equivalent of the curl installer. Paste into PowerShell — it downloads the
          latest <code>splice.exe</code>, installs it per-user under <code>%LOCALAPPDATA%</code>, and
          adds it to PATH. No admin required.
        </p>
        <CodeBlock lang="powershell" :code="installWinPs" />
        <p class="text-xs text-overlay1">winget packaging is planned but not submitted yet.</p>
      </Collapsible>

      <p class="text-xs uppercase tracking-wider text-mauve font-bold pt-1">Building from source</p>
      <Collapsible title="Build from source — full clone (needs Rust + submodules)">
        <p class="text-sm text-subtext0">
          <code>spliceql</code> and <code>cnvlens</code> are git submodules, so clone with
          <code>--recursive</code>.
        </p>
        <CodeBlock lang="bash" prompt :code="installSource" />
      </Collapsible>

      <p class="text-xs uppercase tracking-wider text-green font-bold pt-1">Verify (after installing)</p>
      <p class="text-sm text-subtext0">
        Once any method above finishes, confirm <code>splice</code> is on your PATH:
      </p>
      <CodeBlock lang="bash" prompt :code="verify" />
      <p class="text-xs text-overlay1">
        <code>splice update</code> self-updates to the latest release; <code>splice uninstall</code> removes it.
      </p>
    </Collapsible>

    <!-- ════════════ TREE 2 · HOW THE LANGUAGE WORKS ════════════ -->
    <Collapsible title="2 · How the language works" large>
      <p class="text-sm text-subtext0">
        A query starts with <code>FROM</code> and adds any of the optional clauses below, in any
        order. It compiles to bytecode and runs on the VM, which reaches into
        <code>cnvlens-core</code> for the actual BAM/VCF work.
      </p>
      <CodeBlock lang="sql" :code="exampleQuery" />

      <Collapsible title="Clauses" default-open>
        <table class="w-full text-xs text-left">
          <thead class="text-subtext1 border-b border-surface1">
            <tr><th class="py-1.5 pr-3 font-bold">Clause</th><th class="py-1.5 pr-3 font-bold">Purpose</th><th class="py-1.5 font-bold">Example</th></tr>
          </thead>
          <tbody>
            <tr v-for="c in clauses" :key="c[0]" class="border-b border-surface0 align-top">
              <td class="py-1.5 pr-3 font-mono text-mauve whitespace-nowrap">{{ c[0] }}</td>
              <td class="py-1.5 pr-3 text-subtext0">{{ c[1] }}</td>
              <td class="py-1.5 font-mono text-subtext1">{{ c[2] }}</td>
            </tr>
          </tbody>
        </table>
      </Collapsible>

      <Collapsible title="Sources & sinks">
        <table class="w-full text-xs text-left">
          <thead class="text-subtext1 border-b border-surface1">
            <tr><th class="py-1.5 pr-3 font-bold">Format</th><th class="py-1.5 pr-3 font-bold">FROM (input)</th><th class="py-1.5 font-bold">INTO (output)</th></tr>
          </thead>
          <tbody>
            <tr v-for="s in sources" :key="s[0]" class="border-b border-surface0 align-top">
              <td class="py-1.5 pr-3 font-mono text-mauve">{{ s[0] }}</td>
              <td class="py-1.5 pr-3 text-subtext0">{{ s[1] }}</td>
              <td class="py-1.5 text-subtext0">{{ s[2] }}</td>
            </tr>
          </tbody>
        </table>
        <p class="text-xs text-overlay1">
          <code>FROM bam</code> with a <code>chr</code>/<code>pos</code> range in <code>WHERE</code> is
          recognized at compile time and turned into a BAI-indexed region seek instead of a full scan.
        </p>
      </Collapsible>

      <Collapsible title="Operations (CALL) & parameters">
        <table class="w-full text-xs text-left">
          <thead class="text-subtext1 border-b border-surface1">
            <tr><th class="py-1.5 pr-3 font-bold">CALL</th><th class="py-1.5 font-bold">WITH parameters</th></tr>
          </thead>
          <tbody>
            <tr v-for="o in ops" :key="o[0]" class="border-b border-surface0 align-top">
              <td class="py-1.5 pr-3 font-mono text-mauve whitespace-nowrap">{{ o[0] }}</td>
              <td class="py-1.5 font-mono text-subtext1">{{ o[1] }}</td>
            </tr>
          </tbody>
        </table>
        <p class="text-xs text-overlay1">
          An unknown parameter is a compile error with a "did you mean" hint.
        </p>
      </Collapsible>

      <Collapsible title="Fields (use in WHERE / SELECT / ORDER BY)">
        <dl class="text-xs space-y-2">
          <div v-for="f in fields" :key="f.kind">
            <dt class="font-mono text-mauve mb-0.5">{{ f.kind }}</dt>
            <dd class="text-subtext0 font-mono leading-relaxed">{{ f.cols }}</dd>
          </div>
        </dl>
      </Collapsible>

      <Collapsible title="Functions (in WHERE / SELECT / ORDER BY)">
        <p class="text-sm text-subtext0">
          Call functions on fields or literals. Scalar + string helpers, plus
          sequence-aware <span class="text-blue">genomic</span> functions that operate on DNA
          strings like <code>ref</code> / <code>alt</code>.
        </p>
        <div v-for="g in functions" :key="g.group" class="space-y-1">
          <p class="text-xs uppercase tracking-wider text-mauve font-bold pt-1">{{ g.group }}</p>
          <table class="w-full text-xs text-left">
            <tbody>
              <tr v-for="fn in g.items" :key="fn[0]" class="border-b border-surface0 align-top">
                <td class="py-1 pr-3 font-mono text-blue whitespace-nowrap">{{ fn[0] }}</td>
                <td class="py-1 text-subtext0">{{ fn[1] }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <CodeBlock lang="sql" :code="functionExample" />
        <p class="text-xs text-overlay1">
          Unknown names, wrong arity, and string-arg type mismatches are caught at
          <code>splice check</code> with a "did you mean" hint. Requires <code>splice ≥ 0.1.13</code>.
        </p>
      </Collapsible>

      <Collapsible title=".spq scripts — reusable, parameterized queries">
        <p class="text-sm text-subtext0">
          A <code>.spq</code> file is a query plus a typed CLI interface in <code>--</code> directives.
          <code>splice new &lt;name&gt;</code> scaffolds one; <code>$vars</code> bind from
          <code>--flag value</code> at run time.
        </p>
        <CodeBlock lang="sql" :code="spqAnatomy" />
        <CodeBlock lang="bash" prompt :code="spqRun" />
      </Collapsible>

      <Collapsible title="The CLI">
        <OutputBlock :code="cliList" />
      </Collapsible>

      <Collapsible title="Compile to a standalone binary">
        <p class="text-sm text-subtext0">
          <code>splice build</code> embeds the bytecode + runtime into a self-contained binary
          (~22 MB) — no <code>splice</code> needed to run it. <code>--wasm</code> emits a
          <code>.wasm</code> module instead.
        </p>
        <CodeBlock lang="bash" prompt :code="buildBinary" />
      </Collapsible>

      <Collapsible title="Architecture">
        <pre class="text-[11px] text-subtext1 leading-relaxed overflow-x-auto">{{ architecture }}</pre>
      </Collapsible>
    </Collapsible>

    <!-- ════════════ TREE 3 · SOMATIC, SET-OPS & ANNOTATION ════════════ -->
    <Collapsible title="3 · Somatic, set operations & annotation" large>
      <p class="text-sm text-subtext0">
        Beyond single-file calling, SpliceQL adds clauses for tumor/normal somatic analysis,
        VCF set operations, multi-allelic normalization, and local annotation — the same
        building blocks you would otherwise chain together with bcftools, expressed as one query.
      </p>

      <Collapsible title="One query vs. a bcftools pipeline" default-open>
        <p class="text-sm text-subtext0">
          A common task: take tumor and normal VCFs, keep the tumor-private (somatic) variants,
          annotate them with gene, HGVS, and ClinVar significance, then filter to the pathogenic
          ones. In SpliceQL that is a single declarative query:
        </p>
        <CodeBlock lang="sql" :code="somaticQuery" />
        <p class="text-sm text-subtext0">
          The equivalent bcftools route is roughly nine steps of bgzip / tabix / isec / csq /
          annotate, with intermediate files at each stage:
        </p>
        <CodeBlock lang="bash" prompt :code="bcftoolsPipeline" />
        <p class="text-xs text-overlay1">
          Same answer. SpliceQL's somatic set is verified byte-identical to the bcftools
          <code>isec</code> private-A partition (see "Verified parity &amp; honest limits" below).
        </p>
      </Collapsible>

      <Collapsible title="PAIRED WITH — tumor / normal somatic">
        <p class="text-sm text-subtext0">
          <code>FROM vcf "tumor" PAIRED WITH vcf "normal"</code> keeps variants present in the
          tumor but not the normal (default <code>MODE somatic</code>); <code>MODE germline</code>
          keeps the shared set. The match key is the exact
          <code>(chrom, pos, ref, alt)</code> tuple — the same engine as <code>ISEC</code>.
        </p>
        <CodeBlock lang="sql" :code="pairedQuery" />
      </Collapsible>

      <Collapsible title="ISEC — VCF set operations">
        <p class="text-sm text-subtext0">
          <code>FROM vcf "a" ISEC vcf "b" MODE …</code> computes a two-input set operation with
          bcftools <code>isec</code> semantics: <code>private_a</code> / <code>private_b</code>
          (records unique to one input), <code>shared</code> / <code>shared_b</code> (intersection,
          taking A's or B's record), or <code>union</code>.
        </p>
        <CodeBlock lang="sql" :code="isecQuery" />
      </Collapsible>

      <Collapsible title="SPLIT — multi-allelic normalization">
        <p class="text-sm text-subtext0">
          <code>SPLIT</code> decomposes multi-allelic records (comma-separated ALTs) into one
          biallelic record per ALT, with per-allele AF apportioned and indels left-trimmed —
          the semantics of <code>bcftools norm -m -</code>.
        </p>
        <CodeBlock lang="sql" :code="splitQuery" />
      </Collapsible>

      <Collapsible title="ANNOTATE WITH — gene, ClinVar, HGVS (all local files)">
        <p class="text-sm text-subtext0">
          <code>ANNOTATE WITH genes="…", clinvar="…"</code> joins each variant against local
          annotation databases — a GFF3 gene model and a ClinVar VCF. Every source is a local
          file; there are no live API calls, so annotation works offline and in the browser
          (privacy, and a requirement for WASM).
        </p>
        <p class="text-sm text-subtext0">
          The annotator adds these fields, usable in <code>WHERE</code> / <code>SELECT</code>
          (a missing join fills with <code>"."</code>, never absent):
        </p>
        <p class="text-xs font-mono text-subtext0 leading-relaxed">
          gene · transcript · exon · exon_id · region · consequence · aa_change · hgvs_c ·
          clinvar_significance · clinvar_oncogenic · clinvar_id · rsid
        </p>
        <CodeBlock lang="sql" :code="annotateQuery" />
        <p class="text-sm text-subtext0">
          <span class="text-mauve font-bold">Looked-up vs. computed.</span> ClinVar significance is
          a <em>lookup</em> — a variant gets a clinical interpretation only if it is already in the
          ClinVar file. HGVS is the opposite: <code>aa_change</code> (e.g.
          <code>p.Leu858Arg</code>) and <code>hgvs_c</code> (e.g. <code>c.2573T&gt;G</code>) are
          <em>derived</em> from the genetic code and the reference codon, so they are produced even
          for novel variants never seen before.
        </p>
      </Collapsible>

      <Collapsible title="Referencing — WITH reference, and why it matters">
        <p class="text-sm text-subtext0">
          Pass a reference FASTA with <code>CALL variants WITH reference = "chr7.fa"</code>. It is
          what makes <code>REF</code> the <em>actual</em> reference base at each position. Without
          it, <code>REF</code> is inferred as the pileup-majority base — a coin-flip at balanced
          heterozygous sites, and <strong>invisible</strong> for homozygous variants (where nearly
          every read differs from the reference). A reference is therefore required to call indels
          and homozygous variants at all, for valid VCF, for truth-set concordance, for indel
          normalization, and for HGVS codon translation. FASTA contig names must match the input
          (e.g. <code>&gt;7</code> ↔ <code>7</code>).
        </p>
      </Collapsible>
    </Collapsible>

    <!-- ════════════ TREE 4 · VERIFIED PARITY & HONEST LIMITS ════════════ -->
    <Collapsible title="4 · Verified parity & honest limits" large>
      <p class="text-sm text-subtext0">
        The project's premise is verified honesty: every parity claim below is backed by a test
        that compares SpliceQL's output to a named oracle. The scope limits are stated just as
        plainly.
      </p>

      <Collapsible title="What is verified, and against what oracle" default-open>
        <table class="w-full text-xs text-left">
          <thead class="text-subtext1 border-b border-surface1">
            <tr><th class="py-1.5 pr-3 font-bold">Operation</th><th class="py-1.5 font-bold">Oracle &amp; result</th></tr>
          </thead>
          <tbody>
            <tr v-for="v in verified" :key="v[0]" class="border-b border-surface0 align-top">
              <td class="py-1.5 pr-3 font-mono text-green whitespace-nowrap">{{ v[0] }}</td>
              <td class="py-1.5 text-subtext0">{{ v[1] }}</td>
            </tr>
          </tbody>
        </table>
      </Collapsible>

      <Collapsible title="Scope limits — stated plainly">
        <ul class="text-sm text-subtext0 list-disc ml-5 space-y-1.5">
          <li v-for="l in limits" :key="l"><span v-html="l"></span></li>
        </ul>
      </Collapsible>

      <Collapsible title="Positioning">
        <p class="text-sm text-subtext0">
          SpliceQL is <strong>not</strong> a bcftools replacement. It is a common-80% engine with
          verified parity on the operations it does cover, plus reach that bcftools structurally
          lacks: it runs in the browser and embedded with no external runtime on the query path,
          and adds parallel CNV calling. Use it for those; reach for bcftools/samtools for the
          long tail of the full VCF/BCF surface.
        </p>
      </Collapsible>
    </Collapsible>

    <!-- ════════════ TREE 5 · BUILD WITH IT ════════════ -->
    <Collapsible title="5 · Build with it — syntax in your own app" large>
      <p class="text-sm text-subtext0">
        CodonSplice compiles to WebAssembly and runs entirely client-side — no server, no genomic
        data leaving the browser. The same Rust engine that powers the <code>splice</code> binary
        runs your query in the page.
      </p>

      <Collapsible title="Scaffold an app — the fastest start" default-open>
        <p class="text-sm text-subtext0">
          <code>splice create</code> generates a Vite/Astro app pre-wired to
          <code>@codonsplice/wasm</code>, with a live SpliceQL playground (type-checks and compiles
          to bytecode as you type) plus a BAM upload to run a real query.
        </p>
        <CodeBlock lang="bash" prompt :code="scaffold" />
      </Collapsible>

      <Collapsible title="Frameworks provided">
        <p class="text-sm text-subtext0">
          Each wrapper is a thin layer over <code>@codonsplice/wasm</code>: it lazily
          <code>init()</code>s one shared engine and exposes idiomatic reactive state
          (<code>{ execute, result, error, loading }</code>). Install the one for your framework:
        </p>
        <CodeBlock lang="bash" prompt :code="fwInstall" />
        <p class="text-xs uppercase tracking-wider text-blue font-bold pt-1">React / Vue — useSpliceQL</p>
        <CodeBlock lang="tsx" :code="reactCode" />
        <p class="text-xs uppercase tracking-wider text-blue font-bold pt-1">Svelte — createSpliceQL (stores)</p>
        <CodeBlock lang="svelte" :code="svelteCode" />
        <p class="text-xs uppercase tracking-wider text-blue font-bold pt-1">Astro — core package in a client script</p>
        <CodeBlock lang="astro" :code="astroCode" />
      </Collapsible>

      <Collapsible title="What's included">
        <ul class="text-sm text-subtext0 list-disc ml-5 space-y-1">
          <li><code>@codonsplice/wasm</code> — the engine as one <code>.wasm</code>, plus the
            <code>@codonsplice/wasm/helpers</code> API: <code>execute</code>, <code>stream</code>,
            <code>compile</code>, <code>check</code>, <code>ast</code>, <code>initEngine</code>.</li>
          <li><code>@codonsplice/{react,vue,svelte,astro}</code> — the reactive wrapper
            (<code>useSpliceQL</code> / <code>createSpliceQL</code>) that re-exports the core tooling,
            so you import everything from one package.</li>
          <li>A shared, lazily-initialized engine that runs queries in a Web Worker (files transferred
            as <code>ArrayBuffer</code>, zero-copy).</li>
          <li>The scaffold ships a sample <code>NA12878_EGFR.bam</code> so the playground runs out of the box.</li>
        </ul>
        <p class="text-xs text-overlay1">
          The worker needs cross-origin isolation — serve with
          <code>Cross-Origin-Opener-Policy: same-origin</code> and
          <code>Cross-Origin-Embedder-Policy: require-corp</code>.
        </p>
      </Collapsible>

      <Collapsible title="How to test">
        <p class="text-sm text-subtext0">
          Validate a query <em>before</em> running it — no files needed. <code>check()</code> returns
          <code>null</code> on success or an error string; <code>compile()</code> returns the
          disassembled bytecode; <code>ast()</code> returns the parsed tree.
        </p>
        <CodeBlock lang="ts" :code="testCode" />
        <p class="text-sm text-subtext0">
          On the CLI the same checks are <code>splice check '…'</code> and <code>splice compile '…'</code>.
          For the engine itself, <code>cargo test --workspace</code>.
        </p>
      </Collapsible>

      <Collapsible title="Switch out the default BAM file">
        <p class="text-sm text-subtext0">
          The <code>files</code> map is just <code>name → bytes</code>. The key must match the path in
          <code>FROM bam "…"</code>. Swap the bundled sample for your own
          <code>File</code> / <code>ArrayBuffer</code> / <code>Uint8Array</code> — keep the query's
          path and the map key in sync.
        </p>
        <CodeBlock lang="ts" :code="switchBam" />
        <p class="text-sm text-subtext0">
          In a scaffolded app the sample is fetched from <code>/public</code>; replace that file (and
          its <code>.bai</code> index), or wire a file input's <code>File</code> straight into the map.
        </p>
      </Collapsible>
    </Collapsible>

    <div id="try-live"></div>
    <!-- ════════════ TREE 6 · TRY IT LIVE ════════════ -->
    <Collapsible title="6 · Try it in your browser" large default-open>
      <p class="text-sm text-subtext0">
        This runs CodonSplice's WebAssembly engine against the bundled
        <code>NA12878_EGFR.bam</code> (EGFR region, chr7) entirely in your browser — nothing is
        uploaded. Edit the query or <code>$min_af</code> and run it.
      </p>
      <div
        v-if="examples.find((e) => e.label === activeExample)?.synthetic"
        class="rounded-lg border border-yellow/60 bg-yellow/5 px-3 py-2 text-xs text-subtext0"
      >
        <span class="font-bold text-yellow">⚠ Synthetic sample</span> — injected EGFR drivers on
        NA12878 (a normal individual). Not real patient calls.
      </div>

      <div class="card-static space-y-3">
        <!-- Example gallery — click to load a runnable query into the editor. -->
        <div class="flex flex-wrap items-center gap-1.5">
          <span class="text-[11px] uppercase tracking-wider text-overlay1 font-bold mr-1">Examples</span>
          <button
            v-for="ex in examples"
            :key="ex.label"
            @click="loadExample(ex)"
            class="text-xs font-mono px-2 py-1 rounded border transition-colors"
            :class="ex.label === activeExample
              ? 'border-mauve text-mauve bg-surface0/60'
              : 'border-surface1 text-subtext0 hover:text-text hover:border-mauve hover:bg-surface0/60'"
          >{{ ex.label }}</button>
        </div>
        <textarea
          v-model="query"
          rows="5"
          spellcheck="false"
          class="w-full font-mono text-sm bg-crust text-text rounded-lg p-3 border border-surface1 focus:border-mauve outline-none"
        />
        <div class="flex flex-wrap items-end gap-3">
          <label class="text-xs text-subtext0">
            $min_af
            <input
              v-model="minAf"
              type="number"
              step="0.01"
              min="0"
              max="1"
              class="block mt-1 w-28 font-mono text-sm bg-crust text-text rounded px-2 py-1 border border-surface1 focus:border-mauve outline-none"
            />
          </label>
          <button
            @click="runQuery"
            :disabled="loading"
            class="px-4 py-2 rounded-lg text-sm font-bold bg-mauve text-crust hover:bg-lavender transition-colors disabled:opacity-50"
          >
            {{ loading ? 'running…' : 'Run query' }}
          </button>
          <span v-if="error" class="text-sm text-red">{{ error }}</span>
          <span v-else-if="ran" class="text-sm text-green">{{ rows.length }} record(s)</span>
        </div>

        <div v-if="rows.length" class="overflow-x-auto">
          <table class="w-full text-xs text-left">
            <thead class="text-subtext1 border-b border-surface1">
              <tr><th v-for="c in columns" :key="c" class="py-1.5 pr-4 font-bold">{{ c }}</th></tr>
            </thead>
            <tbody>
              <tr v-for="(r, i) in rows.slice(0, 50)" :key="i" class="border-b border-surface0">
                <td v-for="c in columns" :key="c" class="py-1 pr-4 text-subtext0 font-mono">{{ fmt(r[c]) }}</td>
              </tr>
            </tbody>
          </table>
          <p v-if="rows.length > 50" class="text-xs text-overlay1 pt-1">showing first 50 of {{ rows.length }}</p>
        </div>
      </div>
    </Collapsible>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import Collapsible from '../components/splice/Collapsible.vue'
import CodeBlock from '../components/splice/CodeBlock.vue'
import OutputBlock from '../components/splice/OutputBlock.vue'

/* ── install snippets ───────────────────────────────────────────────────── */
const installQuick = `curl -fsSL https://github.com/Pogo-Bash/codonsplice/releases/latest/download/install.sh | sh`

const installNpm = `npm install -g @codonsplice/cli`

const installCargo = `cargo install --git https://github.com/Pogo-Bash/codonsplice splice-cli`

const REL_BASE = 'https://github.com/Pogo-Bash/codonsplice/releases/latest/download'

const installMacArm = `REL=${REL_BASE}
curl -fsSL $REL/splice-macos-aarch64.tar.gz | tar xz
sudo mv splice /usr/local/bin/`

const installMacIntel = `REL=${REL_BASE}
curl -fsSL $REL/splice-macos-x86_64.tar.gz | tar xz
sudo mv splice /usr/local/bin/`

const installLinuxX86 = `REL=${REL_BASE}
curl -fsSL $REL/splice-linux-x86_64.tar.gz | tar xz
sudo mv splice /usr/local/bin/`

const installLinuxArm = `REL=${REL_BASE}
curl -fsSL $REL/splice-linux-aarch64.tar.gz | tar xz
sudo mv splice /usr/local/bin/`

const installWinPs = `irm ${REL_BASE}/install.ps1 | iex`

const installSource = `# Fallback only — run as your NORMAL user, never sudo/root
# (a root-owned ~/.cargo or target/ breaks later builds).
git clone --recursive https://github.com/Pogo-Bash/codonsplice
cd codonsplice
# if you forgot --recursive:
git submodule update --init --recursive

cargo build --release          # binary at target/release/splice
# …or install it onto your PATH:
cargo install --path crates/splice-cli`

const verify = `splice --version`

/* ── language reference ─────────────────────────────────────────────────── */
const exampleQuery = `FROM bam "tumor.bam"
WHERE chr = "7" AND pos >= 55000000 AND pos <= 55300000 AND depth > 30
CALL variants
WITH min_af = 0.05, min_base_quality = 20
ORDER BY depth DESC
LIMIT 100
INTO vcf "egfr.vcf"`

const clauses = [
  ['FROM',     'the input source (required, first)', 'FROM bam "x.bam"'],
  ['SELECT',   'project columns (omit for whole records)', 'SELECT chr, pos, depth'],
  ['WHERE',    'per-record predicate', 'WHERE chr = "7" AND depth > 30'],
  ['CALL',     'the genomic operation to run', 'CALL variants'],
  ['WITH',     'tune the CALL', 'WITH min_af = 0.05'],
  ['ORDER BY', 'sort the results', 'ORDER BY depth DESC'],
  ['LIMIT',    'cap the row count', 'LIMIT 100'],
  ['INTO',     'write results to a file', 'INTO vcf "out.vcf"'],
  ['ISEC',     'two-input VCF set operation', 'FROM vcf "a" ISEC vcf "b" MODE shared'],
  ['PAIRED WITH', 'tumor / normal somatic pairing', 'FROM vcf "t" PAIRED WITH vcf "n"'],
  ['SPLIT',    'normalize multi-allelic records', 'FROM vcf "x" SPLIT'],
  ['ANNOTATE WITH', 'join local gene / ClinVar / HGVS', 'ANNOTATE WITH genes="g.gff3"'],
]

const sources = [
  ['bam',   'yes (with .bai region seek)', '—'],
  ['vcf',   'yes', 'yes'],
  ['bed',   'yes', 'yes'],
  ['fasta', 'yes', 'yes — JSON array (legacy)'],
  ['cram',  'planned', '—'],
  ['json',  '—', 'yes — NDJSON, one object per record (≥ 0.1.14)'],
  ['tsv',   '—', 'yes — header row + tab-separated values (≥ 0.1.14)'],
]

const ops = [
  ['variants', 'min_depth, min_base_quality, min_mapping_quality, min_variant_reads, min_allele_freq (alias min_af), min_strand_bias, reference'],
  ['cnv / coverage', 'window_size, amp_threshold, del_threshold, min_windows, segmentation_method'],
  ['reads', '(none)'],
  ['header', '(none)'],
]

const fields = [
  { kind: 'variants', cols: 'chr/chrom, pos, ref, alt, qual, depth, ref_count, alt_count, af/allele_freq, strand_bias, kind, filter, id' },
  { kind: 'reads', cols: 'chr/chrom, pos, mapq, flag, depth, strand, is_reverse, is_duplicate, is_secondary' },
  { kind: 'coverage windows', cols: 'chrom, start, end, coverage, normalized' },
]

const functions = [
  { group: 'scalar / math', items: [
    ['abs(x)', 'absolute value'],
    ['round(x[, n])', 'round to n decimals (default 0)'],
    ['floor(x) · ceil(x)', 'round down / up to an integer'],
    ['sqrt(x) · pow(b, e)', 'square root / exponent'],
    ['log(x[, base])', 'natural log, or log to a base'],
    ['min(…) · max(…)', 'smallest / largest of the args'],
    ['coalesce(…)', 'first non-null argument'],
  ] },
  { group: 'string', items: [
    ['len(s)', 'character count'],
    ['upper(s) · lower(s)', 'change case'],
    ['concat(…)', 'join the args into one string'],
    ['contains(s, sub)', 'substring test → bool'],
    ['starts_with / ends_with(s, p)', 'prefix / suffix test → bool'],
    ['substr(s, start[, len])', '0-based slice'],
  ] },
  { group: 'genomic', items: [
    ['gc(seq)', 'GC fraction of a DNA string'],
    ['revcomp(seq)', 'reverse complement'],
    ['translate(seq[, frame])', 'DNA → amino acids (NCBI table 1, * = stop)'],
    ['codon_at(seq, i)', 'the 3-base codon at 0-based index i'],
  ] },
]

const functionExample = `FROM bam "tumor.bam"
WHERE chr = "7" AND abs(af - 0.5) < 0.1      -- functions in WHERE
CALL variants
SELECT chrom, pos, ref, alt,
       gc(ref) AS gc,                        -- genomic fns as columns
       translate(ref) AS aa,
       revcomp(alt) AS alt_rc`

const spqAnatomy = `#!/usr/bin/env splice
-- @name: egfr-variant-caller
-- @input: bam required "Input BAM file"
-- @input: min_af optional float 0.05 "Minimum allele frequency"
-- @output: vcf "Variant calls"

FROM bam $bam
WHERE chr = "7" AND pos >= 55000000 AND pos <= 55300000
CALL variants
WITH min_af = $min_af
INTO vcf $output`

const spqRun = `splice new caller                              # scaffold caller.spq
splice run caller.spq --bam tumor.bam --output out.vcf --min-af 0.03`

const cliList = `splice                         launch the interactive TUI
splice query   "FROM bam …"    compile + run a one-liner
splice compile "FROM bam …"    compile + print disassembled bytecode
splice check   "FROM bam …"    parse + type-check only, no execution
splice new     <name>          scaffold <name>.spq
splice run     <file.spq> …    run a script, binding $vars from --flag value
splice build   <file.spq> …    compile a script to a native binary or .wasm
splice create  [framework] …   scaffold a web app wired to the WASM engine
splice update | uninstall      self-update / remove the binary`

const buildBinary = `splice build caller.spq -o variant-caller --release
./variant-caller --bam tumor.bam --output out.vcf

splice build caller.spq --wasm -o variant-caller   # → variant-caller.wasm`

const architecture = `  SpliceQL (language)            CodonSplice (engine)
  ───────────────────            ────────────────────
  Lexer → Parser → AST     →     Compiler → Bytecode → VM
                                                │
                          ┌─────────────────────┼─────────────────────┐
                     CALL_VARIANTS       CALL_CNV / CALL_COVERAGE   CALL_READS
                          │                      │                      │
                          ▼                      ▼                      ▼
              cnvlens-core::variants   cnvlens-core::coverage    cnvlens-core::bam
                          └──────────── BAI seeking (noodles csi) ────────────┘`

/* ── somatic / set-ops / annotation ─────────────────────────────────────── */
const somaticQuery = `FROM vcf "tumor.vcf.gz" PAIRED WITH vcf "normal.vcf.gz"
CALL variants WITH reference = "chr7.fa"
ANNOTATE WITH genes = "refGene.gff3", clinvar = "clinvar.vcf.gz"
WHERE clinvar_significance = "Pathogenic"
SELECT chrom, pos, gene, aa_change, clinvar_significance
INTO vcf "somatic_pathogenic.vcf"`

const bcftoolsPipeline = `# normalize + index both inputs
bgzip -c tumor.vcf  > tumor.vcf.gz   && tabix -p vcf tumor.vcf.gz
bgzip -c normal.vcf > normal.vcf.gz  && tabix -p vcf normal.vcf.gz
# tumor-private (somatic) set
bcftools isec -p isec_out tumor.vcf.gz normal.vcf.gz
bgzip -c isec_out/0000.vcf > somatic.vcf.gz && tabix -p vcf somatic.vcf.gz
# HGVS / consequence, then ClinVar significance
bcftools csq -f chr7.fa -g refGene.gff3 somatic.vcf.gz -Oz -o csq.vcf.gz && tabix -p vcf csq.vcf.gz
bcftools annotate -a clinvar.vcf.gz -c INFO/CLNSIG csq.vcf.gz -Oz -o ann.vcf.gz
# filter to pathogenic
bcftools view -i 'INFO/CLNSIG="Pathogenic"' ann.vcf.gz -o somatic_pathogenic.vcf`

const pairedQuery = `FROM vcf "tumor.vcf.gz" PAIRED WITH vcf "normal.vcf.gz" MODE somatic
INTO vcf "somatic.vcf"`

const isecQuery = `FROM vcf "a.vcf.gz" ISEC vcf "b.vcf.gz" MODE private_a
INTO vcf "only_in_a.vcf"`

const splitQuery = `FROM vcf "multiallelic.vcf" SPLIT
CALL variants
INTO vcf "biallelic.vcf"`

const annotateQuery = `FROM vcf "egfr.vcf"
CALL variants WITH reference = "chr7.fa"
ANNOTATE WITH genes = "refGene.gff3", clinvar = "clinvar.vcf.gz"
SELECT chrom, pos, gene, exon, aa_change, hgvs_c, clinvar_significance
INTO vcf "annotated.vcf"`

const verified = [
  ['variant calling', 'Differential vs the GIAB truth set and samtools/bcftools on NA12878 — concordance is measured, not assumed by construction.'],
  ['ISEC / set ops', 'Byte-identical to bcftools isec partitions (0000–0003) on an exact (chrom,pos,ref,alt) key; live-bcftools differential test.'],
  ['PAIRED WITH (somatic)', 'Somatic set byte-identical to bcftools isec private-A; germline to the shared partition.'],
  ['SPLIT (multi-allelic)', 'Record-set identical to bcftools norm -m -, with per-allele AF apportioned and indels trimmed.'],
  ['ANNOTATE (HGVS)', 'EGFR L858R → p.Leu858Arg / c.2573T>G, derived from the genetic code and verified against the real chr7 reference (forward strand).'],
  ['parallel CNV', 'Byte-identical to the serial caller across 2–8 shards, with a positive control: one amplification spanning a shard boundary, emitted as a single call.'],
]

const limits = [
  'A common-80% engine, <strong>not</strong> the full bcftools/BCF surface.',
  'CNV amplification <strong>sensitivity</strong> is unvalidated on real tumors — correctness is proven (no false calls on flat diploid), but a sensitivity number awaits an amplified-tumor truth set.',
  'HGVS is verified on the <strong>forward strand</strong> (EGFR) only; reverse-strand output is implemented but not yet verified end-to-end against a reference.',
  'BAQ (base alignment quality) is not implemented — this accounts for the residual precision-margin gap vs bcftools.',
  '<code>INTO bam</code> / <code>cram</code> are unsupported sinks; CRAM input is planned.',
]

/* ── framework snippets ─────────────────────────────────────────────────── */
const scaffold = `splice create                  # interactive menu — react / vue / svelte / astro
splice create react my-app     # …or non-interactively`

const fwInstall = `npm install @codonsplice/react   # or /vue, /svelte, /astro`

const reactCode = `import { useSpliceQL } from '@codonsplice/react'   // same hook for vue

function VariantCaller({ bamFile }) {
  const { execute, result, error, loading } = useSpliceQL()
  const run = () => execute({
    query: 'FROM bam "sample.bam" CALL variants WITH min_af = 0.05',
    files: { 'sample.bam': bamFile },              // File | ArrayBuffer | Uint8Array
  })
  if (loading) return <div>Running query…</div>
  if (error)   return <div>Error: {error.message}</div>
  return <><button onClick={run}>Call Variants</button>
    {result && <pre>{JSON.stringify(result, null, 2)}</pre>}</>
}`

const svelteCode = `<script>
  import { createSpliceQL } from '@codonsplice/svelte'
  export let bamFile
  const { execute, result, error, loading } = createSpliceQL()   // Svelte stores
  const run = () => execute({
    query: 'FROM bam "sample.bam" CALL variants',
    files: { 'sample.bam': bamFile },
  })
<\/script>

<button on:click={run}>Call Variants</button>
{#if $loading}Running…{/if}
{#if $result}<pre>{JSON.stringify($result, null, 2)}</pre>{/if}`

const astroCode = `<script>
  import { CodonSplice } from '@codonsplice/wasm'
  const engine = await CodonSplice.init()
  document.getElementById('run').addEventListener('click', async () => {
    const file = document.getElementById('bam').files[0]
    const result = await engine.execute({
      query: 'FROM bam "sample.bam" CALL variants',
      files: { 'sample.bam': file },
    })
    document.getElementById('output').textContent = JSON.stringify(result, null, 2)
  })
<\/script>`

const testCode = `import { check, compile, ast } from '@codonsplice/react'  // or any wrapper

const err = await check('FROM bam "x.bam" CALL variants WITH min_freq = 0.05')
// → 'error[E001]: unknown parameter "min_freq" … did you mean "min_allele_freq"?'

if (!err) {
  console.log(await compile('FROM bam "x.bam" CALL variants'))  // bytecode disassembly
}`

const switchBam = `import { execute } from '@codonsplice/react'

// Whatever you name the file in the map must match FROM bam "<name>".
const bytes = await myFile.arrayBuffer()           // from an <input type="file">
const result = await execute({
  query: 'FROM bam "patient.bam" CALL variants WITH min_af = 0.05',
  files: { 'patient.bam': bytes },                 // swapped from the default sample.bam
})`

/* ── live demo ──────────────────────────────────────────────────────────── */
// Runnable example queries (all hit the bundled NA12878_EGFR.bam, chr7 EGFR
// region). Clicking one loads it into the editor; press Run to execute.
const examples = [
  {
    label: 'Variants',
    query: `FROM bam "NA12878_EGFR.bam"
WHERE chr = "7" AND pos >= 55086000 AND pos <= 55280000
CALL variants
WITH min_af = $min_af`,
  },
  {
    label: 'Pick columns',
    query: `FROM bam "NA12878_EGFR.bam"
WHERE chr = "7" AND pos >= 55086000 AND pos <= 55280000
CALL variants
WITH min_af = $min_af
SELECT chr, pos, ref, alt, depth, af
ORDER BY depth DESC
LIMIT 25`,
  },
  {
    label: 'High depth',
    query: `FROM bam "NA12878_EGFR.bam"
WHERE chr = "7" AND pos >= 55086000 AND pos <= 55280000 AND depth > 80
CALL variants
WITH min_af = $min_af
ORDER BY depth DESC`,
  },
  {
    label: 'Genomic fns',
    query: `FROM bam "NA12878_EGFR.bam"
WHERE chr = "7" AND pos >= 55086000 AND pos <= 55280000
CALL variants
WITH min_af = $min_af
SELECT chr, pos, ref, alt,
       gc(ref) AS gc,
       revcomp(alt) AS alt_rc
LIMIT 25`,
  },
  {
    label: 'Coverage',
    query: `FROM bam "NA12878_EGFR.bam"
WHERE chr = "7" AND pos >= 55086000 AND pos <= 55280000
CALL coverage
WITH window_size = 5000`,
  },
  {
    label: 'Reads',
    query: `FROM bam "NA12878_EGFR.bam"
WHERE chr = "7" AND pos >= 55086000 AND pos <= 55120000
CALL reads
ORDER BY mapq DESC
LIMIT 50`,
  },
  {
    label: 'EGFR drivers (synthetic)',
    synthetic: true,
    query: `FROM bam "EGFR_L858R_ex19del_SYNTHETIC.bam"
WHERE chr = "7" AND pos >= 55240000 AND pos <= 55260000
CALL variants
WITH reference = "EGFR_region.fa", min_depth = 20, min_allele_freq = 0.2
ANNOTATE WITH genes = "EGFR_region.GRCh37.gff3", clinvar = "clinvar_GRCh37_EGFR.vcf.gz"
ORDER BY pos`,
  },
]

const demoQuery = `FROM bam "EGFR_L858R_ex19del_SYNTHETIC.bam"
WHERE chr = "7" AND pos >= 55240000 AND pos <= 55260000
CALL variants
WITH reference = "EGFR_region.fa", min_depth = 20, min_allele_freq = 0.2
ANNOTATE WITH genes = "EGFR_region.GRCh37.gff3", clinvar = "clinvar_GRCh37_EGFR.vcf.gz"
ORDER BY pos`

// Teaching variant loaded into the playground via "open in playground →":
// same query with an explicit SELECT to show projection.
const demoSelectQuery = `FROM bam "EGFR_L858R_ex19del_SYNTHETIC.bam"
WHERE chr = "7" AND pos >= 55240000 AND pos <= 55260000
CALL variants
WITH reference = "EGFR_region.fa", min_depth = 20, min_allele_freq = 0.2
ANNOTATE WITH genes = "EGFR_region.GRCh37.gff3", clinvar = "clinvar_GRCh37_EGFR.vcf.gz"
SELECT chrom, pos, ref, alt, type, allele_freq, gene, exon, aa_change, hgvs_c, clinvar_significance
ORDER BY pos`

const activeExample = ref('Variants')
const query = ref(examples[0].query)
const minAf = ref(0.05)
const loading = ref(false)
const error = ref('')
const ran = ref(false)
const rows = ref([])

const columns = computed(() => (rows.value.length ? Object.keys(rows.value[0]) : []))

function fmt(v) {
  if (v == null) return '.'
  if (typeof v === 'number') return Number.isInteger(v) ? v : v.toFixed(4)
  return String(v)
}

// Load an example into the editor and clear the previous run's results.
function loadExample(ex) {
  query.value = ex.query
  activeExample.value = ex.label
  error.value = ''
  rows.value = []
  ran.value = false
}

// Once the user hand-edits the query, drop the "active example" highlight.
watch(query, (q) => {
  const match = examples.find((e) => e.query === q)
  activeExample.value = match ? match.label : ''
})

/* ── live demo showcase (separate state from the playground) ─────────────── */
const demoLoading = ref(false)
const demoError = ref('')
const demoRan = ref(false)
const demoRows = ref([])

const demoColumns = computed(() => (demoRows.value.length ? Object.keys(demoRows.value[0]) : []))

// The two injected drivers, picked from the real result rows by genomic
// position. Returns [] until the demo has run; each entry carries the raw
// engine row so the card renders live output, never hardcoded values.
const demoDrivers = computed(() => {
  const at = (pos) => demoRows.value.find((r) => Number(r.pos) === pos)
  const snv = at(55259515) // injected L858R
  const del = at(55242464) // injected exon-19 deletion (anchor pos)
  return [
    snv && { label: 'L858R — activating SNV', row: snv },
    del && { label: 'Exon-19 deletion', row: del },
  ].filter(Boolean)
})

async function runDemo() {
  demoLoading.value = true
  demoError.value = ''
  demoRows.value = []
  demoRan.value = false
  try {
    const { execute } = await import('@codonsplice/wasm/helpers')
    const files = await fetchSampleFiles()
    const result = await execute({ query: demoQuery, files })
    demoRows.value = Array.isArray(result)
      ? result
      : result?.variants ?? result?.records ?? []
    demoRan.value = true
  } catch (e) {
    demoError.value = e?.message || String(e)
  } finally {
    demoLoading.value = false
  }
}

// Load the teaching (SELECT) variant into the section-6 playground and scroll to it.
function openInPlayground() {
  query.value = demoSelectQuery
  activeExample.value = 'EGFR drivers (synthetic)'
  minAf.value = 0.2
  document.getElementById('try-live')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

async function fetchSampleFiles() {
  const base = import.meta.env.BASE_URL
  const get = async (name) => {
    const r = await fetch(`${base}sample-data/${name}`)
    if (!r.ok) throw new Error(`sample file ${name} not found (${r.status})`)
    return new Uint8Array(await r.arrayBuffer())
  }
  // All files any example/showcase might reference. Fetched only on first run
  // and browser-cached thereafter; the query names the files it actually uses.
  const names = [
    'NA12878_EGFR.bam', 'NA12878_EGFR.bam.bai',
    'EGFR_L858R_ex19del_SYNTHETIC.bam', 'EGFR_L858R_ex19del_SYNTHETIC.bam.bai',
    'EGFR_region.fa',
    'EGFR_region.GRCh37.gff3',
    'clinvar_GRCh37_EGFR.vcf.gz',
  ]
  const bytes = await Promise.all(names.map(get))
  return Object.fromEntries(names.map((n, i) => [n, bytes[i]]))
}

async function runQuery() {
  loading.value = true
  error.value = ''
  rows.value = []
  ran.value = false
  try {
    // Lazy-load the WASM engine so it (and its ~650 KB .wasm) only download on
    // first run. Vite bundles this as its own chunk and emits the wasm asset.
    const { execute } = await import('@codonsplice/wasm/helpers')
    const files = await fetchSampleFiles()
    const result = await execute({
      query: query.value,
      files,
      vars: { min_af: Number(minAf.value) },
    })
    rows.value = Array.isArray(result)
      ? result
      : result?.variants ?? result?.records ?? (result?.text != null ? [{ text: result.text }] : [result])
    ran.value = true
  } catch (e) {
    error.value = e?.message || String(e)
  } finally {
    loading.value = false
  }
}
</script>
