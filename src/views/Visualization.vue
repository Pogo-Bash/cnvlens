<template>
  <div class="space-y-6">
    <!-- Breadcrumbs -->
    <div class="breadcrumbs text-sm">
      <ul>
        <li><router-link to="/">Home</router-link></li>
        <li>Visualization</li>
      </ul>
    </div>

    <!-- Header -->
    <div>
      <h1 class="text-4xl font-bold mb-2">📊 Data Visualization</h1>
      <p class="text-lg text-base-content/70">Publication-ready plots from CNV and variant analysis</p>
    </div>

    <!-- Data Status Cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- CNV Data Status -->
      <div class="card bg-base-100 shadow-xl">
        <div class="card-body">
          <h2 class="card-title">CNV Analysis Data</h2>
          <div v-if="cnvResults">
            <div class="stat">
              <div class="stat-title">Status</div>
              <div class="stat-value text-success text-lg">✓ Loaded</div>
              <div class="stat-desc">{{ cnvResults.cnvs?.length || 0 }} CNVs detected</div>
              <div class="stat-desc text-xs mt-1">{{ cnvResults.chromosomes?.length || 0 }} chromosomes</div>
            </div>
          </div>
          <div v-else class="alert alert-warning">
            <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <div class="font-bold">No CNV Data</div>
              <div class="text-sm">Run CNV analysis first</div>
            </div>
            <router-link to="/cnv-analysis" class="btn btn-sm btn-primary">Go to CNV Analysis</router-link>
          </div>
        </div>
      </div>

      <!-- Variant Data Status -->
      <div class="card bg-base-100 shadow-xl">
        <div class="card-body">
          <h2 class="card-title">Variant Calling Data</h2>
          <div v-if="variantResults">
            <div class="stat">
              <div class="stat-title">Status</div>
              <div class="stat-value text-success text-lg">✓ Loaded</div>
              <div class="stat-desc">{{ variantResults.total_variants || 0 }} variants detected</div>
              <div class="stat-desc text-xs mt-1">{{ variantResults.chromosomes_processed?.length || 0 }} chromosomes</div>
            </div>
          </div>
          <div v-else class="alert alert-warning">
            <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <div class="font-bold">No Variant Data</div>
              <div class="text-sm">Run variant calling first</div>
            </div>
            <router-link to="/variant-calling" class="btn btn-sm btn-primary">Go to Variant Calling</router-link>
          </div>
        </div>
      </div>
    </div>

    <!-- Visualizations (only show if we have data) -->
    <div v-if="cnvResults || variantResults" class="space-y-6">

      <!-- CNV Visualizations -->
      <div v-if="cnvResults" class="space-y-6">
        <div class="divider text-xl font-bold">Copy Number Variation Plots</div>

        <!-- CNV Genome-wide Overview -->
        <div class="card bg-base-100 shadow-xl">
          <div class="card-body">
            <div class="flex justify-between items-center mb-4">
              <h3 class="card-title">Genome-wide CNV Overview</h3>
              <div class="flex gap-2">
                <button @click="exportPlot('cnv-overview', 'png')" class="btn btn-sm btn-outline">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  PNG
                </button>
                <button @click="exportPlot('cnv-overview', 'svg')" class="btn btn-sm btn-outline">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  SVG
                </button>
              </div>
            </div>
            <div ref="cnvOverviewPlot" style="min-height: 400px;"></div>
          </div>
        </div>

        <!-- CNV Type Distribution -->
        <div class="card bg-base-100 shadow-xl">
          <div class="card-body">
            <div class="flex justify-between items-center mb-4">
              <h3 class="card-title">CNV Type Distribution</h3>
              <div class="flex gap-2">
                <button @click="exportPlot('cnv-distribution', 'png')" class="btn btn-sm btn-outline">PNG</button>
                <button @click="exportPlot('cnv-distribution', 'svg')" class="btn btn-sm btn-outline">SVG</button>
              </div>
            </div>
            <div ref="cnvDistributionPlot" style="min-height: 400px;"></div>
          </div>
        </div>

        <!-- CNV Size Distribution -->
        <div class="card bg-base-100 shadow-xl">
          <div class="card-body">
            <div class="flex justify-between items-center mb-4">
              <h3 class="card-title">CNV Size Distribution</h3>
              <div class="flex gap-2">
                <button @click="exportPlot('cnv-size', 'png')" class="btn btn-sm btn-outline">PNG</button>
                <button @click="exportPlot('cnv-size', 'svg')" class="btn btn-sm btn-outline">SVG</button>
              </div>
            </div>
            <div ref="cnvSizePlot" style="min-height: 400px;"></div>
          </div>
        </div>
      </div>

      <!-- Variant Visualizations -->
      <div v-if="variantResults" class="space-y-6">
        <div class="divider text-xl font-bold">Variant Analysis Plots</div>

        <!-- Manhattan Plot -->
        <div class="card bg-base-100 shadow-xl">
          <div class="card-body">
            <div class="flex justify-between items-center mb-4">
              <h3 class="card-title">Variant Manhattan Plot</h3>
              <div class="flex gap-2">
                <button @click="exportPlot('manhattan', 'png')" class="btn btn-sm btn-outline">PNG</button>
                <button @click="exportPlot('manhattan', 'svg')" class="btn btn-sm btn-outline">SVG</button>
              </div>
            </div>
            <div ref="manhattanPlot" style="min-height: 500px;"></div>
          </div>
        </div>

        <!-- Variant Type Distribution -->
        <div class="card bg-base-100 shadow-xl">
          <div class="card-body">
            <div class="flex justify-between items-center mb-4">
              <h3 class="card-title">Variant Type Distribution</h3>
              <div class="flex gap-2">
                <button @click="exportPlot('variant-types', 'png')" class="btn btn-sm btn-outline">PNG</button>
                <button @click="exportPlot('variant-types', 'svg')" class="btn btn-sm btn-outline">SVG</button>
              </div>
            </div>
            <div ref="variantTypesPlot" style="min-height: 400px;"></div>
          </div>
        </div>

        <!-- Allele Frequency Distribution -->
        <div class="card bg-base-100 shadow-xl">
          <div class="card-body">
            <div class="flex justify-between items-center mb-4">
              <h3 class="card-title">Allele Frequency Distribution</h3>
              <div class="flex gap-2">
                <button @click="exportPlot('allele-freq', 'png')" class="btn btn-sm btn-outline">PNG</button>
                <button @click="exportPlot('allele-freq', 'svg')" class="btn btn-sm btn-outline">SVG</button>
              </div>
            </div>
            <div ref="alleleFreqPlot" style="min-height: 400px;"></div>
          </div>
        </div>

        <!-- Coverage vs Quality Scatter -->
        <div class="card bg-base-100 shadow-xl">
          <div class="card-body">
            <div class="flex justify-between items-center mb-4">
              <h3 class="card-title">Variant Quality vs Depth</h3>
              <div class="flex gap-2">
                <button @click="exportPlot('quality-depth', 'png')" class="btn btn-sm btn-outline">PNG</button>
                <button @click="exportPlot('quality-depth', 'svg')" class="btn btn-sm btn-outline">SVG</button>
              </div>
            </div>
            <div ref="qualityDepthPlot" style="min-height: 400px;"></div>
          </div>
        </div>
      </div>

      <!-- Combined Analysis (if both available) -->
      <div v-if="cnvResults && variantResults" class="space-y-6">
        <div class="divider text-xl font-bold">Integrated Analysis</div>

        <!-- Chromosome Summary -->
        <div class="card bg-base-100 shadow-xl">
          <div class="card-body">
            <h3 class="card-title mb-4">Per-Chromosome Summary</h3>
            <div ref="chromosomeSummaryPlot" style="min-height: 500px;"></div>
          </div>
        </div>
      </div>

    </div>

    <!-- No Data Message -->
    <div v-else class="alert">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current shrink-0 w-6 h-6">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
      </svg>
      <div>
        <h3 class="font-bold">No Analysis Data Available</h3>
        <div class="text-sm">Run CNV Analysis or Variant Calling first to generate visualizations.</div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { opfsManager } from '../utils/opfs-manager.js';
import Plotly from 'plotly.js-dist-min';

// Data refs
const cnvResults = ref(null);
const variantResults = ref(null);

// Plot refs
const cnvOverviewPlot = ref(null);
const cnvDistributionPlot = ref(null);
const cnvSizePlot = ref(null);
const manhattanPlot = ref(null);
const variantTypesPlot = ref(null);
const alleleFreqPlot = ref(null);
const qualityDepthPlot = ref(null);
const chromosomeSummaryPlot = ref(null);

onMounted(async () => {
  await loadAnalysisData();

  // Render plots after data loads
  if (cnvResults.value) {
    renderCNVPlots();
  }

  if (variantResults.value) {
    renderVariantPlots();
  }

  if (cnvResults.value && variantResults.value) {
    renderIntegratedPlots();
  }
});

/**
 * Load analysis data from OPFS
 */
async function loadAnalysisData() {
  // Load CNV results
  try {
    const cnvExists = await opfsManager.fileExists('cnv-results.json');
    if (cnvExists) {
      const cnvData = await opfsManager.readFile('cnv-results.json');
      const text = await cnvData.text();
      const parsed = JSON.parse(text);
      cnvResults.value = parsed.results;
      console.log('✓ Loaded CNV results for visualization:', cnvResults.value.cnvs?.length, 'CNVs');
    }
  } catch (err) {
    console.log('No CNV results available for visualization');
  }

  // Load variant results
  try {
    const variantExists = await opfsManager.fileExists('variant-results.json');
    if (variantExists) {
      const variantData = await opfsManager.readFile('variant-results.json');
      const text = await variantData.text();
      const parsed = JSON.parse(text);
      variantResults.value = parsed.results;
      console.log('✓ Loaded variant results for visualization:', variantResults.value.total_variants, 'variants');
    }
  } catch (err) {
    console.log('No variant results available for visualization');
  }
}

/**
 * Render CNV plots
 */
function renderCNVPlots() {
  renderCNVOverview();
  renderCNVDistribution();
  renderCNVSizeDistribution();
}

/**
 * CNV Genome-wide Overview (similar to CNVVisualization component)
 */
function renderCNVOverview() {
  if (!cnvOverviewPlot.value || !cnvResults.value?.cnvs) return;

  const cnvs = cnvResults.value.cnvs;

  // Group CNVs by chromosome
  const chromosomes = [...new Set(cnvs.map(c => c.chromosome))].sort();

  // Create traces for amplifications and deletions
  const ampTrace = {
    x: [],
    y: [],
    text: [],
    mode: 'markers',
    type: 'scatter',
    name: 'Amplifications',
    marker: {
      color: '#ef4444',
      size: 8,
      opacity: 0.7
    },
    hovertemplate: '<b>%{text}</b><br>Copy Number: %{y:.2f}<extra></extra>'
  };

  const delTrace = {
    x: [],
    y: [],
    text: [],
    mode: 'markers',
    type: 'scatter',
    name: 'Deletions',
    marker: {
      color: '#3b82f6',
      size: 8,
      opacity: 0.7
    },
    hovertemplate: '<b>%{text}</b><br>Copy Number: %{y:.2f}<extra></extra>'
  };

  // Assign x-positions to chromosomes
  let currentX = 0;
  const chromPositions = {};

  chromosomes.forEach(chrom => {
    chromPositions[chrom] = currentX;
    currentX += 100; // Space between chromosomes
  });

  // Add CNVs to traces
  cnvs.forEach(cnv => {
    const x = chromPositions[cnv.chromosome] + (cnv.start / 1000000); // Convert to Mb
    const y = cnv.copyNumber;
    const text = `${cnv.chromosome}:${formatNumber(cnv.start)}-${formatNumber(cnv.end)} (${formatSize(cnv.length)})`;

    if (cnv.type === 'amplification') {
      ampTrace.x.push(x);
      ampTrace.y.push(y);
      ampTrace.text.push(text);
    } else {
      delTrace.x.push(x);
      delTrace.y.push(y);
      delTrace.text.push(text);
    }
  });

  const layout = {
    title: 'Copy Number Variations Across Genome',
    xaxis: {
      title: 'Chromosome',
      tickmode: 'array',
      tickvals: chromosomes.map(c => chromPositions[c] + 50),
      ticktext: chromosomes,
      showgrid: false
    },
    yaxis: {
      title: 'Copy Number',
      zeroline: true,
      zerolinewidth: 2,
      zerolinecolor: '#666'
    },
    hovermode: 'closest',
    showlegend: true,
    plot_bgcolor: '#1f2937',
    paper_bgcolor: '#1f2937',
    font: { color: '#fff' },
    shapes: [
      // Baseline at copy number 2
      {
        type: 'line',
        x0: 0,
        x1: currentX,
        y0: 2,
        y1: 2,
        line: {
          color: '#888',
          width: 1,
          dash: 'dash'
        }
      }
    ]
  };

  const config = {
    responsive: true,
    displayModeBar: true,
    displaylogo: false,
    toImageButtonOptions: {
      format: 'png',
      filename: 'cnv_genome_overview',
      height: 600,
      width: 1200
    }
  };

  Plotly.newPlot(cnvOverviewPlot.value, [ampTrace, delTrace], layout, config);
}

/**
 * CNV Type Distribution (Pie Chart)
 */
function renderCNVDistribution() {
  if (!cnvDistributionPlot.value || !cnvResults.value?.cnvs) return;

  const cnvs = cnvResults.value.cnvs;

  const ampCount = cnvs.filter(c => c.type === 'amplification').length;
  const delCount = cnvs.filter(c => c.type === 'deletion').length;

  const data = [{
    values: [ampCount, delCount],
    labels: ['Amplifications', 'Deletions'],
    type: 'pie',
    marker: {
      colors: ['#ef4444', '#3b82f6']
    },
    textinfo: 'label+percent+value',
    hovertemplate: '<b>%{label}</b><br>Count: %{value}<br>Percentage: %{percent}<extra></extra>'
  }];

  const layout = {
    title: 'Distribution of CNV Types',
    showlegend: true,
    plot_bgcolor: '#1f2937',
    paper_bgcolor: '#1f2937',
    font: { color: '#fff' }
  };

  const config = {
    responsive: true,
    displayModeBar: true,
    displaylogo: false,
    toImageButtonOptions: {
      format: 'png',
      filename: 'cnv_type_distribution',
      height: 500,
      width: 800
    }
  };

  Plotly.newPlot(cnvDistributionPlot.value, data, layout, config);
}

/**
 * CNV Size Distribution (Histogram)
 */
function renderCNVSizeDistribution() {
  if (!cnvSizePlot.value || !cnvResults.value?.cnvs) return;

  const cnvs = cnvResults.value.cnvs;

  const ampSizes = cnvs.filter(c => c.type === 'amplification').map(c => c.length / 1000); // Convert to Kb
  const delSizes = cnvs.filter(c => c.type === 'deletion').map(c => c.length / 1000);

  const data = [
    {
      x: ampSizes,
      type: 'histogram',
      name: 'Amplifications',
      marker: { color: '#ef4444', opacity: 0.7 },
      xbins: { size: 50 }
    },
    {
      x: delSizes,
      type: 'histogram',
      name: 'Deletions',
      marker: { color: '#3b82f6', opacity: 0.7 },
      xbins: { size: 50 }
    }
  ];

  const layout = {
    title: 'CNV Size Distribution',
    xaxis: { title: 'Size (Kb)' },
    yaxis: { title: 'Count' },
    barmode: 'overlay',
    showlegend: true,
    plot_bgcolor: '#1f2937',
    paper_bgcolor: '#1f2937',
    font: { color: '#fff' }
  };

  const config = {
    responsive: true,
    displayModeBar: true,
    displaylogo: false,
    toImageButtonOptions: {
      format: 'png',
      filename: 'cnv_size_distribution',
      height: 500,
      width: 900
    }
  };

  Plotly.newPlot(cnvSizePlot.value, data, layout, config);
}

/**
 * Render variant plots
 */
function renderVariantPlots() {
  renderManhattanPlot();
  renderVariantTypeDistribution();
  renderAlleleFrequencyDistribution();
  renderQualityDepthScatter();
}

/**
 * Manhattan Plot for variants
 */
function renderManhattanPlot() {
  if (!manhattanPlot.value || !variantResults.value?.variants) return;

  const variants = variantResults.value.variants;

  // Group variants by chromosome
  const chromosomes = [...new Set(variants.map(v => v.chrom))].sort();

  // Assign x-positions
  let currentX = 0;
  const chromPositions = {};
  const chromColors = {};

  chromosomes.forEach((chrom, idx) => {
    chromPositions[chrom] = currentX;
    chromColors[chrom] = idx % 2 === 0 ? '#3b82f6' : '#8b5cf6';

    // Estimate chromosome length from max variant position
    const chromVariants = variants.filter(v => v.chrom === chrom);
    const maxPos = Math.max(...chromVariants.map(v => v.pos));
    currentX += maxPos / 1000000 + 10; // Convert to Mb and add spacing
  });

  // Create traces (one per chromosome for coloring)
  const traces = chromosomes.map(chrom => {
    const chromVariants = variants.filter(v => v.chrom === chrom);

    return {
      x: chromVariants.map(v => chromPositions[chrom] + v.pos / 1000000),
      y: chromVariants.map(v => v.qual),
      text: chromVariants.map(v =>
        `${v.chrom}:${v.pos.toLocaleString()}<br>` +
        `${v.ref}→${v.alt} (${v.type})<br>` +
        `AF: ${(v.allele_freq * 100).toFixed(1)}%<br>` +
        `Depth: ${v.depth}x`
      ),
      mode: 'markers',
      type: 'scatter',
      name: chrom,
      marker: {
        color: chromColors[chrom],
        size: 5,
        opacity: 0.6
      },
      hovertemplate: '%{text}<br>Quality: %{y:.1f}<extra></extra>'
    };
  });

  const layout = {
    title: 'Variant Manhattan Plot',
    xaxis: {
      title: 'Chromosome',
      tickmode: 'array',
      tickvals: chromosomes.map(c => {
        const chromVars = variants.filter(v => v.chrom === c);
        const maxPos = Math.max(...chromVars.map(v => v.pos)) / 1000000;
        return chromPositions[c] + maxPos / 2;
      }),
      ticktext: chromosomes,
      showgrid: false
    },
    yaxis: {
      title: 'Variant Quality Score',
      zeroline: false
    },
    hovermode: 'closest',
    showlegend: false,
    plot_bgcolor: '#1f2937',
    paper_bgcolor: '#1f2937',
    font: { color: '#fff' }
  };

  const config = {
    responsive: true,
    displayModeBar: true,
    displaylogo: false,
    toImageButtonOptions: {
      format: 'png',
      filename: 'variant_manhattan_plot',
      height: 600,
      width: 1400
    }
  };

  Plotly.newPlot(manhattanPlot.value, traces, layout, config);
}

/**
 * Variant Type Distribution
 */
function renderVariantTypeDistribution() {
  if (!variantTypesPlot.value || !variantResults.value?.variants) return;

  const variants = variantResults.value.variants;

  // Count by type
  const typeCounts = {};
  variants.forEach(v => {
    typeCounts[v.type] = (typeCounts[v.type] || 0) + 1;
  });

  const types = Object.keys(typeCounts);
  const counts = Object.values(typeCounts);
  const colors = {
    'SNV': '#3b82f6',
    'INS': '#10b981',
    'DEL': '#ef4444'
  };

  const data = [{
    x: types,
    y: counts,
    type: 'bar',
    marker: {
      color: types.map(t => colors[t] || '#888')
    },
    text: counts.map(c => c.toLocaleString()),
    textposition: 'auto',
    hovertemplate: '<b>%{x}</b><br>Count: %{y:,}<extra></extra>'
  }];

  const layout = {
    title: 'Variant Type Distribution',
    xaxis: { title: 'Variant Type' },
    yaxis: { title: 'Count' },
    showlegend: false,
    plot_bgcolor: '#1f2937',
    paper_bgcolor: '#1f2937',
    font: { color: '#fff' }
  };

  const config = {
    responsive: true,
    displayModeBar: true,
    displaylogo: false,
    toImageButtonOptions: {
      format: 'png',
      filename: 'variant_type_distribution',
      height: 500,
      width: 800
    }
  };

  Plotly.newPlot(variantTypesPlot.value, data, layout, config);
}

/**
 * Allele Frequency Distribution
 */
function renderAlleleFrequencyDistribution() {
  if (!alleleFreqPlot.value || !variantResults.value?.variants) return;

  const variants = variantResults.value.variants;
  const alleleFreqs = variants.map(v => v.allele_freq * 100); // Convert to percentage

  const data = [{
    x: alleleFreqs,
    type: 'histogram',
    marker: {
      color: '#8b5cf6',
      opacity: 0.7
    },
    xbins: {
      start: 0,
      end: 100,
      size: 5
    },
    hovertemplate: 'Allele Freq: %{x:.1f}%<br>Count: %{y}<extra></extra>'
  }];

  const layout = {
    title: 'Variant Allele Frequency Distribution',
    xaxis: {
      title: 'Variant Allele Frequency (%)',
      range: [0, 100]
    },
    yaxis: { title: 'Number of Variants' },
    showlegend: false,
    plot_bgcolor: '#1f2937',
    paper_bgcolor: '#1f2937',
    font: { color: '#fff' }
  };

  const config = {
    responsive: true,
    displayModeBar: true,
    displaylogo: false,
    toImageButtonOptions: {
      format: 'png',
      filename: 'allele_frequency_distribution',
      height: 500,
      width: 900
    }
  };

  Plotly.newPlot(alleleFreqPlot.value, data, layout, config);
}

/**
 * Quality vs Depth Scatter Plot
 */
function renderQualityDepthScatter() {
  if (!qualityDepthPlot.value || !variantResults.value?.variants) return;

  const variants = variantResults.value.variants;

  // Group by variant type
  const snvs = variants.filter(v => v.type === 'SNV');
  const insertions = variants.filter(v => v.type === 'INS');
  const deletions = variants.filter(v => v.type === 'DEL');

  const traces = [
    {
      x: snvs.map(v => v.depth),
      y: snvs.map(v => v.qual),
      mode: 'markers',
      type: 'scatter',
      name: 'SNV',
      marker: { color: '#3b82f6', size: 4, opacity: 0.5 }
    },
    {
      x: insertions.map(v => v.depth),
      y: insertions.map(v => v.qual),
      mode: 'markers',
      type: 'scatter',
      name: 'Insertions',
      marker: { color: '#10b981', size: 4, opacity: 0.5 }
    },
    {
      x: deletions.map(v => v.depth),
      y: deletions.map(v => v.qual),
      mode: 'markers',
      type: 'scatter',
      name: 'Deletions',
      marker: { color: '#ef4444', size: 4, opacity: 0.5 }
    }
  ];

  const layout = {
    title: 'Variant Quality vs Read Depth',
    xaxis: { title: 'Read Depth', type: 'log' },
    yaxis: { title: 'Quality Score' },
    hovermode: 'closest',
    showlegend: true,
    plot_bgcolor: '#1f2937',
    paper_bgcolor: '#1f2937',
    font: { color: '#fff' }
  };

  const config = {
    responsive: true,
    displayModeBar: true,
    displaylogo: false,
    toImageButtonOptions: {
      format: 'png',
      filename: 'quality_vs_depth',
      height: 500,
      width: 900
    }
  };

  Plotly.newPlot(qualityDepthPlot.value, traces, layout, config);
}

/**
 * Render integrated plots (when both CNV and variant data available)
 */
function renderIntegratedPlots() {
  renderChromosomeSummary();
}

/**
 * Per-Chromosome Summary (CNVs + Variants)
 */
function renderChromosomeSummary() {
  if (!chromosomeSummaryPlot.value) return;

  const cnvs = cnvResults.value?.cnvs || [];
  const variants = variantResults.value?.variants || [];

  // Get all unique chromosomes
  const cnvChroms = new Set(cnvs.map(c => c.chromosome));
  const variantChroms = new Set(variants.map(v => v.chrom));
  const allChroms = [...new Set([...cnvChroms, ...variantChroms])].sort();

  // Count CNVs per chromosome
  const cnvCounts = {};
  const ampCounts = {};
  const delCounts = {};

  cnvs.forEach(cnv => {
    cnvCounts[cnv.chromosome] = (cnvCounts[cnv.chromosome] || 0) + 1;
    if (cnv.type === 'amplification') {
      ampCounts[cnv.chromosome] = (ampCounts[cnv.chromosome] || 0) + 1;
    } else {
      delCounts[cnv.chromosome] = (delCounts[cnv.chromosome] || 0) + 1;
    }
  });

  // Count variants per chromosome
  const variantCounts = {};
  variants.forEach(v => {
    variantCounts[v.chrom] = (variantCounts[v.chrom] || 0) + 1;
  });

  const data = [
    {
      x: allChroms,
      y: allChroms.map(c => ampCounts[c] || 0),
      name: 'Amplifications',
      type: 'bar',
      marker: { color: '#ef4444' }
    },
    {
      x: allChroms,
      y: allChroms.map(c => delCounts[c] || 0),
      name: 'Deletions',
      type: 'bar',
      marker: { color: '#3b82f6' }
    },
    {
      x: allChroms,
      y: allChroms.map(c => variantCounts[c] || 0),
      name: 'Variants',
      type: 'scatter',
      mode: 'lines+markers',
      yaxis: 'y2',
      marker: { color: '#10b981', size: 8 },
      line: { color: '#10b981', width: 2 }
    }
  ];

  const layout = {
    title: 'Per-Chromosome Summary: CNVs and Variants',
    xaxis: { title: 'Chromosome' },
    yaxis: {
      title: 'CNV Count',
      side: 'left'
    },
    yaxis2: {
      title: 'Variant Count',
      overlaying: 'y',
      side: 'right',
      showgrid: false
    },
    barmode: 'stack',
    showlegend: true,
    plot_bgcolor: '#1f2937',
    paper_bgcolor: '#1f2937',
    font: { color: '#fff' },
    hovermode: 'x unified'
  };

  const config = {
    responsive: true,
    displayModeBar: true,
    displaylogo: false,
    toImageButtonOptions: {
      format: 'png',
      filename: 'chromosome_summary',
      height: 600,
      width: 1200
    }
  };

  Plotly.newPlot(chromosomeSummaryPlot.value, data, layout, config);
}

/**
 * Export plot as image
 */
async function exportPlot(plotId, format) {
  const plotMap = {
    'cnv-overview': cnvOverviewPlot.value,
    'cnv-distribution': cnvDistributionPlot.value,
    'cnv-size': cnvSizePlot.value,
    'manhattan': manhattanPlot.value,
    'variant-types': variantTypesPlot.value,
    'allele-freq': alleleFreqPlot.value,
    'quality-depth': qualityDepthPlot.value,
    'chromosome-summary': chromosomeSummaryPlot.value
  };

  const plotElement = plotMap[plotId];
  if (!plotElement) return;

  try {
    if (format === 'png') {
      await Plotly.downloadImage(plotElement, {
        format: 'png',
        width: 1200,
        height: 600,
        filename: plotId
      });
    } else if (format === 'svg') {
      await Plotly.downloadImage(plotElement, {
        format: 'svg',
        width: 1200,
        height: 600,
        filename: plotId
      });
    }
  } catch (err) {
    console.error('Failed to export plot:', err);
    alert('Failed to export plot. Please try again.');
  }
}

/**
 * Utility functions
 */
function formatNumber(num) {
  return num.toLocaleString();
}

function formatSize(bytes) {
  if (bytes < 1000) return `${bytes} bp`;
  if (bytes < 1000000) return `${(bytes / 1000).toFixed(1)} Kb`;
  return `${(bytes / 1000000).toFixed(2)} Mb`;
}
</script>

<style scoped>
/* Custom styles if needed */
</style>
