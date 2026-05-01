<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="max-w-2xl">
      <h1 class="text-2xl font-bold text-text mb-2">data visualization</h1>
      <p class="text-subtext0 leading-relaxed">publication-ready plots from CNV and variant analysis</p>
    </div>

    <!-- Data Status Cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="card-static">
        <h2 class="text-sm font-bold text-overlay1 uppercase tracking-wider mb-2">cnv analysis data</h2>
        <div v-if="cnvResults">
          <p class="text-green text-sm">loaded</p>
          <p class="text-xs text-overlay0 mt-1">{{ cnvResults.cnvs?.length || 0 }} CNVs — {{ cnvResults.chromosomes?.length || 0 }} chromosomes</p>
        </div>
        <div v-else>
          <p class="text-peach text-sm">no data</p>
          <router-link to="/cnv-analysis" class="btn-ghost text-xs mt-2 inline-flex">go to cnv analysis</router-link>
        </div>
      </div>

      <div class="card-static">
        <h2 class="text-sm font-bold text-overlay1 uppercase tracking-wider mb-2">variant calling data</h2>
        <div v-if="variantResults">
          <p class="text-green text-sm">loaded</p>
          <p class="text-xs text-overlay0 mt-1">{{ variantResults.total_variants || 0 }} variants — {{ variantResults.chromosomes_processed?.length || 0 }} chromosomes</p>
        </div>
        <div v-else>
          <p class="text-peach text-sm">no data</p>
          <router-link to="/variant-calling" class="btn-ghost text-xs mt-2 inline-flex">go to variant calling</router-link>
        </div>
      </div>
    </div>

    <!-- Visualizations -->
    <div v-if="cnvResults || variantResults" class="space-y-6">

      <!-- CNV Visualizations -->
      <div v-if="cnvResults" class="space-y-6">
        <h2 class="text-sm font-bold text-overlay1 uppercase tracking-wider">copy number variation plots</h2>

        <div class="card-static">
          <div class="flex justify-between items-center mb-3">
            <h3 class="text-sm font-bold text-text">genome-wide cnv overview</h3>
            <div class="flex gap-2">
              <button @click="exportPlot('cnv-overview', 'png')" class="btn-ghost px-2 py-1 text-xs">PNG</button>
              <button @click="exportPlot('cnv-overview', 'svg')" class="btn-ghost px-2 py-1 text-xs">SVG</button>
            </div>
          </div>
          <div ref="cnvOverviewPlot" style="min-height: 400px;"></div>
        </div>

        <div class="card-static">
          <div class="flex justify-between items-center mb-3">
            <h3 class="text-sm font-bold text-text">cnv type distribution</h3>
            <div class="flex gap-2">
              <button @click="exportPlot('cnv-distribution', 'png')" class="btn-ghost px-2 py-1 text-xs">PNG</button>
              <button @click="exportPlot('cnv-distribution', 'svg')" class="btn-ghost px-2 py-1 text-xs">SVG</button>
            </div>
          </div>
          <div ref="cnvDistributionPlot" style="min-height: 400px;"></div>
        </div>

        <div class="card-static">
          <div class="flex justify-between items-center mb-3">
            <h3 class="text-sm font-bold text-text">cnv size distribution</h3>
            <div class="flex gap-2">
              <button @click="exportPlot('cnv-size', 'png')" class="btn-ghost px-2 py-1 text-xs">PNG</button>
              <button @click="exportPlot('cnv-size', 'svg')" class="btn-ghost px-2 py-1 text-xs">SVG</button>
            </div>
          </div>
          <div ref="cnvSizePlot" style="min-height: 400px;"></div>
        </div>
      </div>

      <!-- Variant Visualizations -->
      <div v-if="variantResults" class="space-y-6">
        <h2 class="text-sm font-bold text-overlay1 uppercase tracking-wider">variant analysis plots</h2>

        <div class="card-static">
          <div class="flex justify-between items-center mb-3">
            <h3 class="text-sm font-bold text-text">variant manhattan plot</h3>
            <div class="flex gap-2">
              <button @click="exportPlot('manhattan', 'png')" class="btn-ghost px-2 py-1 text-xs">PNG</button>
              <button @click="exportPlot('manhattan', 'svg')" class="btn-ghost px-2 py-1 text-xs">SVG</button>
            </div>
          </div>
          <div ref="manhattanPlot" style="min-height: 500px;"></div>
        </div>

        <div class="card-static">
          <div class="flex justify-between items-center mb-3">
            <h3 class="text-sm font-bold text-text">variant type distribution</h3>
            <div class="flex gap-2">
              <button @click="exportPlot('variant-types', 'png')" class="btn-ghost px-2 py-1 text-xs">PNG</button>
              <button @click="exportPlot('variant-types', 'svg')" class="btn-ghost px-2 py-1 text-xs">SVG</button>
            </div>
          </div>
          <div ref="variantTypesPlot" style="min-height: 400px;"></div>
        </div>

        <div class="card-static">
          <div class="flex justify-between items-center mb-3">
            <h3 class="text-sm font-bold text-text">allele frequency distribution</h3>
            <div class="flex gap-2">
              <button @click="exportPlot('allele-freq', 'png')" class="btn-ghost px-2 py-1 text-xs">PNG</button>
              <button @click="exportPlot('allele-freq', 'svg')" class="btn-ghost px-2 py-1 text-xs">SVG</button>
            </div>
          </div>
          <div ref="alleleFreqPlot" style="min-height: 400px;"></div>
        </div>

        <div class="card-static">
          <div class="flex justify-between items-center mb-3">
            <h3 class="text-sm font-bold text-text">variant quality vs depth</h3>
            <div class="flex gap-2">
              <button @click="exportPlot('quality-depth', 'png')" class="btn-ghost px-2 py-1 text-xs">PNG</button>
              <button @click="exportPlot('quality-depth', 'svg')" class="btn-ghost px-2 py-1 text-xs">SVG</button>
            </div>
          </div>
          <div ref="qualityDepthPlot" style="min-height: 400px;"></div>
        </div>
      </div>

      <!-- Combined Analysis -->
      <div v-if="cnvResults && variantResults" class="space-y-6">
        <h2 class="text-sm font-bold text-overlay1 uppercase tracking-wider">integrated analysis</h2>

        <div class="card-static">
          <h3 class="text-sm font-bold text-text mb-3">per-chromosome summary</h3>
          <div ref="chromosomeSummaryPlot" style="min-height: 500px;"></div>
        </div>
      </div>
    </div>

    <!-- No Data -->
    <div v-else class="status-row">
      <span class="status-dot bg-blue"></span>
      <span class="text-sm text-subtext0">run CNV analysis or variant calling first to generate visualizations.</span>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { opfsManager } from '../utils/opfs-manager.js';
import Plotly from 'plotly.js-dist-min';

// Catppuccin-themed Plotly layout base
const plotTheme = {
  plot_bgcolor: '#1e1e2e',
  paper_bgcolor: '#1e1e2e',
  font: { family: 'JetBrains Mono, monospace', color: '#cdd6f4', size: 11 },
  margin: { t: 40, b: 60, l: 60, r: 20 },
};

const axisTheme = {
  color: '#a6adc8',
  gridcolor: '#313244',
  zerolinecolor: '#45475a',
};

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

  if (cnvResults.value) renderCNVPlots();
  if (variantResults.value) renderVariantPlots();
  if (cnvResults.value && variantResults.value) renderIntegratedPlots();
});

async function loadAnalysisData() {
  try {
    const cnvExists = await opfsManager.fileExists('cnv-results.json');
    if (cnvExists) {
      const cnvData = await opfsManager.readFile('cnv-results.json');
      const text = await cnvData.text();
      cnvResults.value = JSON.parse(text).results;
    }
  } catch (err) {
    console.log('No CNV results available for visualization');
  }

  try {
    const variantExists = await opfsManager.fileExists('variant-results.json');
    if (variantExists) {
      const variantData = await opfsManager.readFile('variant-results.json');
      const text = await variantData.text();
      variantResults.value = JSON.parse(text).results;
    }
  } catch (err) {
    console.log('No variant results available for visualization');
  }
}

function renderCNVPlots() {
  renderCNVOverview();
  renderCNVDistribution();
  renderCNVSizeDistribution();
}

function renderCNVOverview() {
  if (!cnvOverviewPlot.value || !cnvResults.value?.cnvs) return;

  const cnvs = cnvResults.value.cnvs;
  const chromosomes = [...new Set(cnvs.map(c => c.chromosome))].sort();

  const ampTrace = {
    x: [], y: [], text: [],
    mode: 'markers', type: 'scatter', name: 'amplifications',
    marker: { color: '#f38ba8', size: 8, opacity: 0.7 },
    hovertemplate: '<b>%{text}</b><br>copy number: %{y:.2f}<extra></extra>'
  };

  const delTrace = {
    x: [], y: [], text: [],
    mode: 'markers', type: 'scatter', name: 'deletions',
    marker: { color: '#89b4fa', size: 8, opacity: 0.7 },
    hovertemplate: '<b>%{text}</b><br>copy number: %{y:.2f}<extra></extra>'
  };

  let currentX = 0;
  const chromPositions = {};
  chromosomes.forEach(chrom => { chromPositions[chrom] = currentX; currentX += 100; });

  cnvs.forEach(cnv => {
    const x = chromPositions[cnv.chromosome] + (cnv.start / 1000000);
    const text = `${cnv.chromosome}:${formatNumber(cnv.start)}-${formatNumber(cnv.end)} (${formatSize(cnv.length)})`;
    if (cnv.type === 'amplification') { ampTrace.x.push(x); ampTrace.y.push(cnv.copyNumber); ampTrace.text.push(text); }
    else { delTrace.x.push(x); delTrace.y.push(cnv.copyNumber); delTrace.text.push(text); }
  });

  const layout = {
    ...plotTheme,
    title: { text: 'copy number variations across genome', font: { size: 13, color: '#a6adc8' } },
    xaxis: { ...axisTheme, title: 'chromosome', tickmode: 'array', tickvals: chromosomes.map(c => chromPositions[c] + 50), ticktext: chromosomes, showgrid: false },
    yaxis: { ...axisTheme, title: 'copy number' },
    hovermode: 'closest', showlegend: true,
    legend: { font: { color: '#a6adc8' } },
    shapes: [{ type: 'line', x0: 0, x1: currentX, y0: 2, y1: 2, line: { color: '#45475a', width: 1, dash: 'dash' } }]
  };

  Plotly.newPlot(cnvOverviewPlot.value, [ampTrace, delTrace], layout, { responsive: true, displayModeBar: true, displaylogo: false });
}

function renderCNVDistribution() {
  if (!cnvDistributionPlot.value || !cnvResults.value?.cnvs) return;
  const cnvs = cnvResults.value.cnvs;
  const ampCount = cnvs.filter(c => c.type === 'amplification').length;
  const delCount = cnvs.filter(c => c.type === 'deletion').length;

  const data = [{ values: [ampCount, delCount], labels: ['amplifications', 'deletions'], type: 'pie', marker: { colors: ['#f38ba8', '#89b4fa'] }, textinfo: 'label+percent+value', textfont: { color: '#cdd6f4' } }];
  const layout = { ...plotTheme, title: { text: 'distribution of cnv types', font: { size: 13, color: '#a6adc8' } }, showlegend: true, legend: { font: { color: '#a6adc8' } } };
  Plotly.newPlot(cnvDistributionPlot.value, data, layout, { responsive: true, displayModeBar: true, displaylogo: false });
}

function renderCNVSizeDistribution() {
  if (!cnvSizePlot.value || !cnvResults.value?.cnvs) return;
  const cnvs = cnvResults.value.cnvs;
  const ampSizes = cnvs.filter(c => c.type === 'amplification').map(c => c.length / 1000);
  const delSizes = cnvs.filter(c => c.type === 'deletion').map(c => c.length / 1000);

  const data = [
    { x: ampSizes, type: 'histogram', name: 'amplifications', marker: { color: '#f38ba8', opacity: 0.7 }, xbins: { size: 50 } },
    { x: delSizes, type: 'histogram', name: 'deletions', marker: { color: '#89b4fa', opacity: 0.7 }, xbins: { size: 50 } }
  ];
  const layout = { ...plotTheme, title: { text: 'cnv size distribution', font: { size: 13, color: '#a6adc8' } }, xaxis: { ...axisTheme, title: 'size (Kb)' }, yaxis: { ...axisTheme, title: 'count' }, barmode: 'overlay', showlegend: true, legend: { font: { color: '#a6adc8' } } };
  Plotly.newPlot(cnvSizePlot.value, data, layout, { responsive: true, displayModeBar: true, displaylogo: false });
}

function renderVariantPlots() {
  renderManhattanPlot();
  renderVariantTypeDistribution();
  renderAlleleFrequencyDistribution();
  renderQualityDepthScatter();
}

function renderManhattanPlot() {
  if (!manhattanPlot.value || !variantResults.value?.variants) return;
  const variants = variantResults.value.variants;
  const chromosomes = [...new Set(variants.map(v => v.chrom))].sort();

  let currentX = 0;
  const chromPositions = {};
  chromosomes.forEach((chrom, idx) => {
    chromPositions[chrom] = currentX;
    const chromVariants = variants.filter(v => v.chrom === chrom);
    const maxPos = Math.max(...chromVariants.map(v => v.pos));
    currentX += maxPos / 1000000 + 10;
  });

  const traces = chromosomes.map((chrom, idx) => {
    const chromVariants = variants.filter(v => v.chrom === chrom);
    return {
      x: chromVariants.map(v => chromPositions[chrom] + v.pos / 1000000),
      y: chromVariants.map(v => v.qual),
      text: chromVariants.map(v => `${v.chrom}:${v.pos.toLocaleString()}<br>${v.ref}>${v.alt} (${v.type})<br>AF: ${(v.allele_freq * 100).toFixed(1)}%<br>depth: ${v.depth}x`),
      mode: 'markers', type: 'scatter', name: chrom,
      marker: { color: idx % 2 === 0 ? '#89b4fa' : '#cba6f7', size: 5, opacity: 0.6 },
      hovertemplate: '%{text}<br>quality: %{y:.1f}<extra></extra>'
    };
  });

  const layout = {
    ...plotTheme,
    title: { text: 'variant manhattan plot', font: { size: 13, color: '#a6adc8' } },
    xaxis: { ...axisTheme, title: 'chromosome', tickmode: 'array', tickvals: chromosomes.map(c => { const cv = variants.filter(v => v.chrom === c); return chromPositions[c] + Math.max(...cv.map(v => v.pos)) / 2000000; }), ticktext: chromosomes, showgrid: false },
    yaxis: { ...axisTheme, title: 'variant quality score', zeroline: false },
    hovermode: 'closest', showlegend: false
  };

  Plotly.newPlot(manhattanPlot.value, traces, layout, { responsive: true, displayModeBar: true, displaylogo: false });
}

function renderVariantTypeDistribution() {
  if (!variantTypesPlot.value || !variantResults.value?.variants) return;
  const variants = variantResults.value.variants;
  const typeCounts = {};
  variants.forEach(v => { typeCounts[v.type] = (typeCounts[v.type] || 0) + 1; });
  const types = Object.keys(typeCounts);
  const counts = Object.values(typeCounts);
  const colors = { 'SNV': '#89b4fa', 'INS': '#a6e3a1', 'DEL': '#f38ba8' };

  const data = [{ x: types, y: counts, type: 'bar', marker: { color: types.map(t => colors[t] || '#6c7086') }, text: counts.map(c => c.toLocaleString()), textposition: 'auto', textfont: { color: '#cdd6f4' } }];
  const layout = { ...plotTheme, title: { text: 'variant type distribution', font: { size: 13, color: '#a6adc8' } }, xaxis: { ...axisTheme, title: 'variant type' }, yaxis: { ...axisTheme, title: 'count' }, showlegend: false };
  Plotly.newPlot(variantTypesPlot.value, data, layout, { responsive: true, displayModeBar: true, displaylogo: false });
}

function renderAlleleFrequencyDistribution() {
  if (!alleleFreqPlot.value || !variantResults.value?.variants) return;
  const alleleFreqs = variantResults.value.variants.map(v => v.allele_freq * 100);

  const data = [{ x: alleleFreqs, type: 'histogram', marker: { color: '#cba6f7', opacity: 0.7 }, xbins: { start: 0, end: 100, size: 5 } }];
  const layout = { ...plotTheme, title: { text: 'variant allele frequency distribution', font: { size: 13, color: '#a6adc8' } }, xaxis: { ...axisTheme, title: 'variant allele frequency (%)', range: [0, 100] }, yaxis: { ...axisTheme, title: 'number of variants' }, showlegend: false };
  Plotly.newPlot(alleleFreqPlot.value, data, layout, { responsive: true, displayModeBar: true, displaylogo: false });
}

function renderQualityDepthScatter() {
  if (!qualityDepthPlot.value || !variantResults.value?.variants) return;
  const variants = variantResults.value.variants;
  const snvs = variants.filter(v => v.type === 'SNV');
  const insertions = variants.filter(v => v.type === 'INS');
  const deletions = variants.filter(v => v.type === 'DEL');

  const traces = [
    { x: snvs.map(v => v.depth), y: snvs.map(v => v.qual), mode: 'markers', type: 'scatter', name: 'SNV', marker: { color: '#89b4fa', size: 4, opacity: 0.5 } },
    { x: insertions.map(v => v.depth), y: insertions.map(v => v.qual), mode: 'markers', type: 'scatter', name: 'insertions', marker: { color: '#a6e3a1', size: 4, opacity: 0.5 } },
    { x: deletions.map(v => v.depth), y: deletions.map(v => v.qual), mode: 'markers', type: 'scatter', name: 'deletions', marker: { color: '#f38ba8', size: 4, opacity: 0.5 } }
  ];

  const layout = { ...plotTheme, title: { text: 'variant quality vs read depth', font: { size: 13, color: '#a6adc8' } }, xaxis: { ...axisTheme, title: 'read depth', type: 'log' }, yaxis: { ...axisTheme, title: 'quality score' }, hovermode: 'closest', showlegend: true, legend: { font: { color: '#a6adc8' } } };
  Plotly.newPlot(qualityDepthPlot.value, traces, layout, { responsive: true, displayModeBar: true, displaylogo: false });
}

function renderIntegratedPlots() {
  renderChromosomeSummary();
}

function renderChromosomeSummary() {
  if (!chromosomeSummaryPlot.value) return;
  const cnvs = cnvResults.value?.cnvs || [];
  const variants = variantResults.value?.variants || [];

  const allChroms = [...new Set([...cnvs.map(c => c.chromosome), ...variants.map(v => v.chrom)])].sort();
  const ampCounts = {}, delCounts = {}, variantCounts = {};
  cnvs.forEach(cnv => { if (cnv.type === 'amplification') ampCounts[cnv.chromosome] = (ampCounts[cnv.chromosome] || 0) + 1; else delCounts[cnv.chromosome] = (delCounts[cnv.chromosome] || 0) + 1; });
  variants.forEach(v => { variantCounts[v.chrom] = (variantCounts[v.chrom] || 0) + 1; });

  const data = [
    { x: allChroms, y: allChroms.map(c => ampCounts[c] || 0), name: 'amplifications', type: 'bar', marker: { color: '#f38ba8' } },
    { x: allChroms, y: allChroms.map(c => delCounts[c] || 0), name: 'deletions', type: 'bar', marker: { color: '#89b4fa' } },
    { x: allChroms, y: allChroms.map(c => variantCounts[c] || 0), name: 'variants', type: 'scatter', mode: 'lines+markers', yaxis: 'y2', marker: { color: '#a6e3a1', size: 8 }, line: { color: '#a6e3a1', width: 2 } }
  ];

  const layout = {
    ...plotTheme,
    title: { text: 'per-chromosome summary: CNVs and variants', font: { size: 13, color: '#a6adc8' } },
    xaxis: { ...axisTheme, title: 'chromosome' },
    yaxis: { ...axisTheme, title: 'cnv count', side: 'left' },
    yaxis2: { ...axisTheme, title: 'variant count', overlaying: 'y', side: 'right', showgrid: false },
    barmode: 'stack', showlegend: true, legend: { font: { color: '#a6adc8' } }, hovermode: 'x unified'
  };

  Plotly.newPlot(chromosomeSummaryPlot.value, data, layout, { responsive: true, displayModeBar: true, displaylogo: false });
}

async function exportPlot(plotId, format) {
  const plotMap = {
    'cnv-overview': cnvOverviewPlot.value, 'cnv-distribution': cnvDistributionPlot.value, 'cnv-size': cnvSizePlot.value,
    'manhattan': manhattanPlot.value, 'variant-types': variantTypesPlot.value, 'allele-freq': alleleFreqPlot.value,
    'quality-depth': qualityDepthPlot.value, 'chromosome-summary': chromosomeSummaryPlot.value
  };
  const plotElement = plotMap[plotId];
  if (!plotElement) return;
  try {
    await Plotly.downloadImage(plotElement, { format, width: 1200, height: 600, filename: plotId });
  } catch (err) {
    console.error('Failed to export plot:', err);
  }
}

function formatNumber(num) { return num.toLocaleString(); }
function formatSize(bytes) { if (bytes < 1000) return `${bytes} bp`; if (bytes < 1000000) return `${(bytes / 1000).toFixed(1)} Kb`; return `${(bytes / 1000000).toFixed(2)} Mb`; }
</script>
