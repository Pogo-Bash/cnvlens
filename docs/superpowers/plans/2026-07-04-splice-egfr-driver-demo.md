# /splice EGFR-driver Demo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a curated "Live demo · EGFR drivers" showcase (plus a playground example) to the `/splice` page that runs the full CodonSplice stack — reference-anchored SNV + indel calling, gene/exon annotation, HGVS, ClinVar — on a labeled synthetic BAM, entirely in-browser on the 0.5.1 WASM engine.

**Architecture:** All UI lives in the existing single-file Vue view `src/views/Splice.vue`; it lazy-loads `@codonsplice/wasm/helpers`, fetches data files from `public/sample-data/`, and renders results from reactive state. No new components, no engine changes.

**Tech Stack:** Vue 3 `<script setup>`, Vite, Tailwind (Catppuccin tokens), `@codonsplice/wasm@0.5.1`. Build runs in a throwaway `node:20-alpine` container (deploy host has no node).

## Global Constraints

- **Website only.** No engine/CLI/release change, no version bump. (`cnvlens` repo, `feat/splice-site-features`.)
- **Base file = the server's live `Splice.vue` (with its uncommitted 205-line WIP).** It is already the working-tree copy in this workspace. Author on top of it; do not revert it.
- **Synthetic label is mandatory and ALWAYS visible** — rendered unconditionally (never inside a `v-if`/collapsed region).
- **Cards render REAL engine output** from reactive `demoRows` — never hardcoded variant values.
- **Deletion card must OMIT protein-HGVS** — `aa_change`/`hgvs_c` are `.` for indels; show them only behind `v-if="… !== '.'"`, never fabricate a `p.` notation.
- **Ship data: `EGFR_L858R_ex19del_SYNTHETIC.bam` + `.bai`, `EGFR_region.GRCh37.gff3`, `clinvar_GRCh37_EGFR.vcf.gz`. Do NOT ship the ClinVar `.tbi`** (proven unnecessary in-browser).
- **Deploy:** build in `node:20-alpine`; copy `dist/` → `/usr/share/nginx/html/splice`; `sudo restorecon -Rv` (SELinux 403 gotcha); verify served chunk.
- Confirmed available Tailwind tokens: `mauve, lavender, blue, green, yellow, peach, red, text, subtext0, subtext1, overlay1, surface0, surface1, surface2, crust`. `.card-static` exists in `src/style.css`.

**Workspace:** `/tmp/claude-1000/-home-swap/656e2429-2037-4011-b53c-2013131c9d2f/scratchpad/site` (clone of `feat/splice-site-features` with the live `Splice.vue`). Source data lives at `/home/swap/lang/codonsplice/cnvlens/public/sample-data/` and `/home/swap/lang/codonsplice/testdata/`.

---

### Task 1: Ship the demo data files

**Files:**
- Create: `public/sample-data/EGFR_L858R_ex19del_SYNTHETIC.bam` (+ `.bai`)
- Create: `public/sample-data/EGFR_region.GRCh37.gff3`
- Create: `public/sample-data/clinvar_GRCh37_EGFR.vcf.gz`

**Interfaces:**
- Produces: four files under `public/sample-data/` fetchable at `${BASE_URL}sample-data/<name>` after build (`EGFR_region.fa` already present).

- [ ] **Step 1: Copy the files in**

```bash
cd /tmp/claude-1000/-home-swap/656e2429-2037-4011-b53c-2013131c9d2f/scratchpad/site
SRC_SD=/home/swap/lang/codonsplice/cnvlens/public/sample-data
SRC_TD=/home/swap/lang/codonsplice/testdata
cp "$SRC_SD/EGFR_L858R_ex19del_SYNTHETIC.bam"      public/sample-data/
cp "$SRC_SD/EGFR_L858R_ex19del_SYNTHETIC.bam.bai"  public/sample-data/
cp "$SRC_TD/EGFR_region.GRCh37.gff3"               public/sample-data/
cp "$SRC_TD/clinvar_GRCh37_EGFR.vcf.gz"            public/sample-data/
```

- [ ] **Step 2: Verify present + sizes, and that `.tbi` was NOT copied**

```bash
ls -la public/sample-data/EGFR_L858R_ex19del_SYNTHETIC.bam public/sample-data/EGFR_L858R_ex19del_SYNTHETIC.bam.bai public/sample-data/EGFR_region.GRCh37.gff3 public/sample-data/clinvar_GRCh37_EGFR.vcf.gz
test ! -e public/sample-data/clinvar_GRCh37_EGFR.vcf.gz.tbi && echo "OK: no .tbi (correct)"
```
Expected: BAM ≈2.4M, `.bai` ≈28K, gff3 ≈66K, vcf.gz ≈180K; "OK: no .tbi".

- [ ] **Step 3: Commit**

```bash
git add public/sample-data/EGFR_L858R_ex19del_SYNTHETIC.bam public/sample-data/EGFR_L858R_ex19del_SYNTHETIC.bam.bai public/sample-data/EGFR_region.GRCh37.gff3 public/sample-data/clinvar_GRCh37_EGFR.vcf.gz
git commit -m "feat(splice): add synthetic EGFR-driver sample + gene model + ClinVar slice for the demo"
```

---

### Task 2: Extend `fetchSampleFiles()` to include the demo files

**Files:**
- Modify: `src/views/Splice.vue` (the `fetchSampleFiles` function, currently ~line 879)

**Interfaces:**
- Produces: `fetchSampleFiles()` returns a files map that additionally contains `EGFR_L858R_ex19del_SYNTHETIC.bam` (+`.bai`), `EGFR_region.fa`, `EGFR_region.GRCh37.gff3`, `clinvar_GRCh37_EGFR.vcf.gz`. Consumed by both `runQuery()` (playground) and `runDemo()` (Task 3).

- [ ] **Step 1: Replace the function body**

Replace the whole existing `fetchSampleFiles` function with:

```js
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
```

- [ ] **Step 2: Sanity — the workspace still parses (no build yet, just grep)**

```bash
grep -c "EGFR_L858R_ex19del_SYNTHETIC.bam'" src/views/Splice.vue
```
Expected: `2` (bam + bai entries).

- [ ] **Step 3: Commit**

```bash
git add src/views/Splice.vue
git commit -m "feat(splice): fetch synthetic BAM + reference + gff + ClinVar in fetchSampleFiles"
```

---

### Task 3: The showcase — script state + logic

**Files:**
- Modify: `src/views/Splice.vue` `<script setup>` (add near the existing playground state, after the `rows`/`columns` block)

**Interfaces:**
- Consumes: `fetchSampleFiles()` (Task 2), existing `fmt()` helper, existing `query`/`activeExample`/`minAf` refs (for `openInPlayground`).
- Produces: refs `demoLoading`, `demoError`, `demoRan`, `demoRows`; consts `demoQuery`, `demoSelectQuery`; computed `demoColumns`, `demoDrivers`; functions `runDemo()`, `openInPlayground()`. `demoDrivers` is `[{ label, row }]` where `row` is a raw engine result object. Consumed by Task 4's template.

- [ ] **Step 1: Add the demo query constants** (place with the other `const … = \`…\`` query literals in the script)

```js
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
```

- [ ] **Step 2: Add the showcase state + logic** (place after the playground's `rows`/`columns`/`fmt` definitions)

```js
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
```

- [ ] **Step 3: Verify the new symbols exist and are internally consistent**

```bash
grep -nE "demoQuery|demoSelectQuery|demoRows|demoDrivers|demoColumns|runDemo|openInPlayground" src/views/Splice.vue | head
```
Expected: each symbol appears (definition; template refs come in Task 4).

- [ ] **Step 4: Commit**

```bash
git add src/views/Splice.vue
git commit -m "feat(splice): live-demo showcase state + runDemo (real engine output)"
```

---

### Task 4: The showcase — template (banner, cards, table)

**Files:**
- Modify: `src/views/Splice.vue` template — insert a new block immediately after the hero `</section>` (line ~21), before `<!-- ════════════ TREE 1 · INSTALL ════════════ -->`.

**Interfaces:**
- Consumes: `demoQuery`, `runDemo`, `demoLoading`, `demoError`, `demoRan`, `demoDrivers`, `demoRows`, `demoColumns`, `openInPlayground`, `fmt` (Task 3); `Collapsible`, `CodeBlock` (already imported).

- [ ] **Step 1: Insert the showcase block** (immediately after the hero `</section>`)

```html
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
```

- [ ] **Step 2: Static discipline checks (the three review gates), before building**

```bash
# (a) banner is NOT inside any v-if — must be an unconditional child of the showcase Collapsible:
grep -n "⚠ SYNTHETIC sample" src/views/Splice.vue
grep -n "SYNTHETIC sample" src/views/Splice.vue | head    # inspect: no v-if on its wrapping div
# (b) deletion omit-not-fake: aa_change only shown behind the '.' guard:
grep -n "aa_change !== '.'" src/views/Splice.vue           # expect the template guard present
# (c) cards bind to d.row.* (live), not string literals:
grep -nE "d\.row\.(aa_change|clinvar_oncogenic|allele_freq|gene)" src/views/Splice.vue | head
grep -n "p.Leu858Arg" src/views/Splice.vue && echo "FAIL: hardcoded value present" || echo "OK: no hardcoded variant values"
```
Expected: banner div has no `v-if`; the `aa_change !== '.'` guard present; `d.row.*` bindings present; "OK: no hardcoded variant values".

- [ ] **Step 3: Commit**

```bash
git add src/views/Splice.vue
git commit -m "feat(splice): live-demo showcase UI — synthetic banner, driver cards, full table"
```

---

### Task 5: Playground example "EGFR drivers (synthetic)"

**Files:**
- Modify: `src/views/Splice.vue` — the `examples` array (add an entry) and the playground template (add a synthetic note shown when active).

**Interfaces:**
- Consumes: existing `examples`/`activeExample`/`loadExample` machinery, `demoQuery` (Task 3).

- [ ] **Step 1: Add the example** (append to the `examples` array)

```js
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
```

- [ ] **Step 2: Add the scroll anchor + synthetic note** in the section-6 template.

Immediately before `<Collapsible title="6 · Try it in your browser" large default-open>`, add:
```html
    <div id="try-live"></div>
```
Inside that Collapsible, right after its intro `<p>…</p>`, add the note (shown only when the synthetic example is active):
```html
      <div
        v-if="examples.find((e) => e.label === activeExample)?.synthetic"
        class="rounded-lg border border-yellow/60 bg-yellow/5 px-3 py-2 text-xs text-subtext0"
      >
        <span class="font-bold text-yellow">⚠ Synthetic sample</span> — injected EGFR drivers on
        NA12878 (a normal individual). Not real patient calls.
      </div>
```

- [ ] **Step 3: Verify**

```bash
grep -n "EGFR drivers (synthetic)" src/views/Splice.vue    # example label present
grep -n 'id="try-live"' src/views/Splice.vue               # anchor present
```
Expected: both found.

- [ ] **Step 4: Commit**

```bash
git add src/views/Splice.vue
git commit -m "feat(splice): playground 'EGFR drivers (synthetic)' example + synthetic note"
```

---

### Task 6: Build, deploy, and verify live

**Files:** none (build + deploy of the committed workspace).

- [ ] **Step 1: Push the branch**

```bash
cd /tmp/claude-1000/-home-swap/656e2429-2037-4011-b53c-2013131c9d2f/scratchpad/site
git push origin feat/splice-site-features
```

- [ ] **Step 2: On the server — pull, then build in the throwaway container**

The server's working `Splice.vue` WIP is the base these commits were authored on, so the pull is a fast-forward with no conflict. Run:
```bash
ssh -i ~/.ssh/oracle_2026.key opc@163.192.109.107
cd /home/opc/repos/cnvlens
git stash list   # note any stash; the WIP is already committed via these tasks
git pull --ff-only origin feat/splice-site-features
docker run --rm -v "$PWD":/app -w /app node:20-alpine sh -c \
  "npm install --no-audit --no-fund && VITE_BASE=/splice/ VITE_SPLICE_HOME=1 npm run build"
```
Expected: build exits 0; `dist/assets/Splice-<hash>.js` emitted.

- [ ] **Step 3: Confirm the built chunk carries the demo (not hardcoded output)**

```bash
grep -l "Run the live demo" dist/assets/Splice-*.js && echo "showcase present"
grep -o "EGFR_L858R_ex19del_SYNTHETIC.bam" dist/assets/Splice-*.js | head -1
grep -c "p.Leu858Arg" dist/assets/Splice-*.js   # expect 0 — value must come from the engine at runtime
```
Expected: "showcase present"; the synthetic BAM name found; `p.Leu858Arg` count **0**.

- [ ] **Step 4: Deploy (backup, copy, SELinux relabel)**

```bash
TS=$(date +%s)
sudo cp -a /usr/share/nginx/html/splice /usr/share/nginx/html/splice.bak.$TS
sudo find /usr/share/nginx/html/splice -mindepth 1 -delete
sudo cp -a dist/. /usr/share/nginx/html/splice/
sudo restorecon -Rv /usr/share/nginx/html/splice
```

- [ ] **Step 5: Verify over HTTPS + runtime (the three discipline checks)**

```bash
curl -s -o /dev/null -w "index %{http_code}\n" https://swapdoesbioandis-a.dev/splice/
curl -s -o /dev/null -w "synthetic bam %{http_code}\n" https://swapdoesbioandis-a.dev/splice/sample-data/EGFR_L858R_ex19del_SYNTHETIC.bam
curl -s -o /dev/null -w "gff %{http_code}\n" https://swapdoesbioandis-a.dev/splice/sample-data/EGFR_region.GRCh37.gff3
curl -s -o /dev/null -w "clinvar %{http_code}\n" https://swapdoesbioandis-a.dev/splice/sample-data/clinvar_GRCh37_EGFR.vcf.gz
```
Expected: all `200`.

Then in a browser at `https://swapdoesbioandis-a.dev/splice/`, confirm the three gates:
1. **Real output, not hardcoded:** before clicking Run, the driver cards are absent; after "▶ Run the live demo", they populate with `p.Leu858Arg` / `c.2573T>G` (L858R) and the exon-19 `inframe_deletion`, and the full table shows all 3 rows including the real `p.Gln787=`.
2. **Banner always visible:** the ⚠ SYNTHETIC banner is shown on load, before and after running, and cannot be dismissed.
3. **Deletion omits protein-HGVS:** the exon-19 card shows `EGFR · exon 19 · inframe_deletion · ClinVar Oncogenic` and **no** `p.` / `c.` notation.

- [ ] **Step 6: Note rollback** (only if a gate fails)

```bash
sudo cp -a /usr/share/nginx/html/splice.bak.$TS/. /usr/share/nginx/html/splice/ && sudo restorecon -Rv /usr/share/nginx/html/splice
```

---

## Self-Review

**Spec coverage:** showcase placement/banner/button/cards/table/query/open-in-playground → Tasks 3–4; playground example + synthetic note → Task 5; `fetchSampleFiles` extension → Task 2; data files (no `.tbi`) → Task 1; deploy + runtime verification → Task 6; honesty constraints (real output, always-visible banner, deletion omits HGVS) → Global Constraints + Task 4 Step 2 + Task 6 Step 5. All covered.

**Placeholder scan:** no TBD/TODO; every code step shows full code; commands have expected output.

**Type consistency:** `demoDrivers` is `[{label,row}]` in Task 3 and consumed as `d.label`/`d.row.*` in Task 4; `demoRows`/`demoColumns`/`demoQuery`/`runDemo`/`openInPlayground` names match across Tasks 3–5; `fetchSampleFiles` return shape (Task 2) is consumed by `runDemo` (Task 3) and `runQuery` (existing).
