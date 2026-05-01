<template>
  <div class="space-y-6">
    <!-- Plotly Coverage Plot -->
    <div class="card-static">
      <h3 class="text-sm font-bold text-overlay1 uppercase tracking-wider mb-3">coverage plot</h3>
      <div ref="plotlyContainer" class="w-full" style="min-height: 400px;"></div>
    </div>

    <!-- D3 CNV Overview -->
    <div class="card-static">
      <h3 class="text-sm font-bold text-overlay1 uppercase tracking-wider mb-3">cnv overview</h3>

      <div v-if="!props.cnvs || props.cnvs.length === 0" class="flex items-center justify-center h-96 gap-3">
        <span class="spinner"></span>
        <span class="text-sm text-overlay1">preparing visualization...</span>
      </div>

      <div v-else ref="d3Container" class="w-full" style="min-height: 400px;"></div>
    </div>

    <!-- CNV Table -->
    <div class="card-static" v-if="cnvs && cnvs.length > 0">
      <!-- Header with counts -->
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-sm font-bold text-overlay1 uppercase tracking-wider">
          detected CNVs ({{ cnvs.length }})
          <span v-if="hasActiveFilters" class="text-xs px-2 py-0.5 rounded bg-surface0 text-mauve ml-2">
            {{ filteredCnvs.length }} filtered
          </span>
        </h3>
        <span class="text-xs text-overlay0">{{ pageInfo }}</span>
      </div>

      <!-- Filter Controls -->
      <div class="bg-mantle rounded-lg p-4 mb-4">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label class="input-label">type</label>
            <select v-model="filterType" class="input-field">
              <option value="all">all types</option>
              <option value="amplification">amplification</option>
              <option value="deletion">deletion</option>
            </select>
          </div>

          <div>
            <label class="input-label">chromosome</label>
            <select v-model="filterChromosome" class="input-field">
              <option value="all">all chromosomes</option>
              <option v-for="chr in uniqueChromosomes" :key="chr" :value="chr">{{ chr }}</option>
            </select>
          </div>

          <div>
            <label class="input-label">confidence</label>
            <select v-model="filterConfidence" class="input-field">
              <option value="all">all confidence</option>
              <option value="high">high</option>
              <option value="medium">medium</option>
              <option value="low">low</option>
            </select>
          </div>

          <div class="flex items-end">
            <button
              @click="clearFilters"
              :disabled="!hasActiveFilters"
              class="btn-ghost text-xs"
            >
              clear filters
            </button>
          </div>
        </div>

        <div v-if="hasActiveFilters" class="mt-3 flex gap-2 items-center">
          <span class="text-xs text-overlay0">active:</span>
          <span v-if="filterType !== 'all'" class="text-xs px-2 py-0.5 rounded bg-surface0 text-subtext0">{{ filterType }}</span>
          <span v-if="filterChromosome !== 'all'" class="text-xs px-2 py-0.5 rounded bg-surface0 text-subtext0">{{ filterChromosome }}</span>
          <span v-if="filterConfidence !== 'all'" class="text-xs px-2 py-0.5 rounded bg-surface0 text-subtext0">{{ filterConfidence }}</span>
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="data-table">
          <thead>
            <tr>
              <th>type</th>
              <th>chromosome</th>
              <th>start</th>
              <th>end</th>
              <th>length</th>
              <th>copy number</th>
              <th>confidence</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(cnv, idx) in paginatedCnvs" :key="idx">
              <td>
                <span class="text-xs px-2 py-0.5 rounded bg-surface0" :class="cnv.type === 'amplification' ? 'text-red' : 'text-blue'">
                  {{ cnv.type }}
                </span>
              </td>
              <td>{{ cnv.chromosome }}</td>
              <td class="numeric">{{ formatNumber(cnv.start) }}</td>
              <td class="numeric">{{ formatNumber(cnv.end) }}</td>
              <td>{{ formatSize(cnv.length) }}</td>
              <td class="numeric">{{ cnv.copyNumber.toFixed(2) }}</td>
              <td>
                <span class="text-xs" :class="getConfidenceClass(cnv.confidence)">
                  {{ cnv.confidence }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div class="flex flex-col md:flex-row justify-between items-center gap-4 mt-4">
        <div class="flex gap-1">
          <button class="btn-ghost px-2 py-1 text-xs" @click="goToPage(1)" :disabled="currentPage === 1">first</button>
          <button class="btn-ghost px-2 py-1 text-xs" @click="previousPage" :disabled="currentPage === 1">prev</button>
          <span class="text-xs text-overlay1 px-2 py-1">{{ currentPage }}/{{ totalPages }}</span>
          <button class="btn-ghost px-2 py-1 text-xs" @click="nextPage" :disabled="currentPage === totalPages">next</button>
          <button class="btn-ghost px-2 py-1 text-xs" @click="goToPage(totalPages)" :disabled="currentPage === totalPages">last</button>
        </div>

        <div class="flex items-center gap-2">
          <button class="btn-ghost px-2 py-1 text-xs" @click="goToPage(Math.max(1, currentPage - 10))" :disabled="currentPage <= 10">-10</button>
          <span class="text-xs text-overlay0">go to:</span>
          <input
            type="number"
            min="1"
            :max="totalPages"
            :value="currentPage"
            @change="e => goToPage(parseInt(e.target.value) || 1)"
            class="input-field !w-16 text-center"
          />
          <button class="btn-ghost px-2 py-1 text-xs" @click="goToPage(Math.min(totalPages, currentPage + 10))" :disabled="currentPage > totalPages - 10">+10</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, computed } from 'vue';
import * as d3 from 'd3';
import Plotly from 'plotly.js-dist-min';

const props = defineProps({
  coverageData: {
    type: Array,
    default: () => []
  },
  cnvs: {
    type: Array,
    default: () => []
  },
  chromosomes: {
    type: Array,
    default: () => []
  }
});

const plotlyContainer = ref(null);
const d3Container = ref(null);

// Filter state
const filterType = ref('all');
const filterChromosome = ref('all');
const filterConfidence = ref('all');

// Pagination state
const currentPage = ref(1);
const itemsPerPage = 100;

// Computed: Get unique chromosomes for filter dropdown
const uniqueChromosomes = computed(() => {
  if (!props.cnvs.length) return [];
  return [...new Set(props.cnvs.map(cnv => cnv.chromosome))].sort();
});

// Computed: Apply filters
const filteredCnvs = computed(() => {
  let result = props.cnvs;

  if (filterType.value !== 'all') {
    result = result.filter(cnv => cnv.type === filterType.value);
  }

  if (filterChromosome.value !== 'all') {
    result = result.filter(cnv => cnv.chromosome === filterChromosome.value);
  }

  if (filterConfidence.value !== 'all') {
    result = result.filter(cnv => cnv.confidence === filterConfidence.value);
  }

  return result;
});

const totalPages = computed(() => {
  return Math.ceil(filteredCnvs.value.length / itemsPerPage);
});

const paginatedCnvs = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage;
  const end = start + itemsPerPage;
  return filteredCnvs.value.slice(start, end);
});

const pageInfo = computed(() => {
  if (filteredCnvs.value.length === 0) return 'no results';
  const start = (currentPage.value - 1) * itemsPerPage + 1;
  const end = Math.min(currentPage.value * itemsPerPage, filteredCnvs.value.length);
  return `${start}-${end} of ${filteredCnvs.value.length}`;
});

const hasActiveFilters = computed(() => {
  return filterType.value !== 'all' ||
         filterChromosome.value !== 'all' ||
         filterConfidence.value !== 'all';
});

function goToPage(page) {
  const pageNum = parseInt(page);
  if (isNaN(pageNum)) return;
  currentPage.value = Math.max(1, Math.min(totalPages.value, pageNum));
}

function nextPage() {
  if (currentPage.value < totalPages.value) currentPage.value++;
}

function previousPage() {
  if (currentPage.value > 1) currentPage.value--;
}

function clearFilters() {
  filterType.value = 'all';
  filterChromosome.value = 'all';
  filterConfidence.value = 'all';
  currentPage.value = 1;
}

watch(() => props.cnvs, () => { currentPage.value = 1; });
watch([filterType, filterChromosome, filterConfidence], () => { currentPage.value = 1; });

onMounted(() => {
  if (props.coverageData.length > 0) {
    renderPlotly();
    renderD3();
  }
});

watch(() => props.coverageData, () => {
  if (props.coverageData.length > 0) {
    renderPlotly();
    renderD3();
  }
});

function renderPlotly() {
  if (!plotlyContainer.value || !props.coverageData.length) return;

  const chromosomeData = {};
  props.coverageData.forEach(d => {
    if (!chromosomeData[d.chromosome]) chromosomeData[d.chromosome] = [];
    chromosomeData[d.chromosome].push(d);
  });

  const traces = Object.entries(chromosomeData).map(([chrom, data]) => ({
    x: data.map(d => d.start),
    y: data.map(d => d.normalized),
    name: chrom,
    type: 'scatter',
    mode: 'lines',
    line: { width: 1 }
  }));

  const cnvsForShapes = props.cnvs
    .filter(cnv => cnv.confidence === 'high' || cnv.confidence === 'medium')
    .slice(0, 500);

  const shapes = cnvsForShapes.map(cnv => ({
    type: 'rect',
    xref: 'x',
    yref: 'paper',
    x0: cnv.start,
    x1: cnv.end,
    y0: 0,
    y1: 1,
    fillcolor: cnv.type === 'amplification' ? 'rgba(243, 139, 168, 0.15)' : 'rgba(137, 180, 250, 0.15)',
    line: { width: 0 }
  }));

  const layout = {
    title: { text: 'normalized coverage across genome', font: { size: 13, color: '#a6adc8' } },
    xaxis: { title: 'genomic position', color: '#a6adc8', gridcolor: '#313244' },
    yaxis: { title: 'normalized coverage', color: '#a6adc8', gridcolor: '#313244' },
    hovermode: 'closest',
    showlegend: true,
    shapes,
    plot_bgcolor: '#1e1e2e',
    paper_bgcolor: '#1e1e2e',
    font: { family: 'JetBrains Mono, monospace', color: '#cdd6f4', size: 11 },
    legend: { font: { color: '#a6adc8' } },
    margin: { t: 40, b: 60, l: 60, r: 20 },
  };

  const config = {
    responsive: true,
    displayModeBar: true,
    displaylogo: false
  };

  Plotly.newPlot(plotlyContainer.value, traces, layout, config);
}

function renderD3() {
  if (!d3Container.value) return;
  if (!props.cnvs || props.cnvs.length === 0) return;

  const cnvsToVisualize = props.cnvs
    .filter(cnv => cnv.confidence === 'high' || cnv.confidence === 'medium')
    .slice(0, 500);

  if (cnvsToVisualize.length === 0) return;

  try {
    d3.select(d3Container.value).selectAll('*').remove();

    const margin = { top: 40, right: 120, bottom: 60, left: 80 };
    const width = d3Container.value.clientWidth - margin.left - margin.right;
    const height = 300 - margin.top - margin.bottom;

    const svg = d3.select(d3Container.value)
      .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const chromosomes = [...new Set(cnvsToVisualize.map(c => c.chromosome))];
    const yScale = d3.scaleBand()
      .domain(chromosomes)
      .range([0, height])
      .padding(0.2);

    const maxPos = d3.max(cnvsToVisualize, d => d.end);
    const xScale = d3.scaleLinear()
      .domain([0, maxPos])
      .range([0, width]);

    const colorScale = d3.scaleOrdinal()
      .domain(['amplification', 'deletion'])
      .range(['#f38ba8', '#89b4fa']);

    svg.selectAll('.cnv-rect')
      .data(cnvsToVisualize)
      .enter()
      .append('rect')
      .attr('class', 'cnv-rect')
      .attr('x', d => xScale(d.start))
      .attr('y', d => yScale(d.chromosome))
      .attr('width', d => xScale(d.end) - xScale(d.start))
      .attr('height', yScale.bandwidth())
      .attr('fill', d => colorScale(d.type))
      .attr('opacity', 0.7)
      .on('mouseover', function(event, d) {
        d3.select(this).attr('opacity', 1);
        d3.select('body').append('div')
          .attr('class', 'tooltip')
          .style('position', 'absolute')
          .style('background', '#181825')
          .style('color', '#cdd6f4')
          .style('padding', '8px 12px')
          .style('border-radius', '8px')
          .style('border', '1px solid #313244')
          .style('font-family', 'JetBrains Mono, monospace')
          .style('font-size', '12px')
          .style('pointer-events', 'none')
          .style('z-index', '1000')
          .html(`
            <strong>${d.type}</strong><br/>
            ${d.chromosome}:${formatNumber(d.start)}-${formatNumber(d.end)}<br/>
            length: ${formatSize(d.length)}<br/>
            copy number: ${d.copyNumber.toFixed(2)}
          `)
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 10) + 'px');
      })
      .on('mouseout', function() {
        d3.select(this).attr('opacity', 0.7);
        d3.selectAll('.tooltip').remove();
      });

    const xAxis = d3.axisBottom(xScale).tickFormat(d => formatNumber(d));
    svg.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(xAxis)
      .selectAll('text')
      .style('fill', '#a6adc8')
      .style('font-size', '10px');

    svg.append('g')
      .call(d3.axisLeft(yScale))
      .selectAll('text')
      .style('fill', '#a6adc8')
      .style('font-size', '10px');

    // Style axis lines
    svg.selectAll('.domain, .tick line').style('stroke', '#313244');

    svg.append('text')
      .attr('x', width / 2)
      .attr('y', height + 50)
      .style('text-anchor', 'middle')
      .style('fill', '#6c7086')
      .style('font-size', '11px')
      .text('genomic position');

    svg.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -height / 2)
      .attr('y', -60)
      .style('text-anchor', 'middle')
      .style('fill', '#6c7086')
      .style('font-size', '11px')
      .text('chromosome');

    const legend = svg.append('g')
      .attr('transform', `translate(${width + 20}, 0)`);

    const legendData = [
      { type: 'amplification', label: 'amplification' },
      { type: 'deletion', label: 'deletion' }
    ];

    legend.selectAll('.legend-item')
      .data(legendData)
      .enter()
      .append('g')
      .attr('class', 'legend-item')
      .attr('transform', (d, i) => `translate(0, ${i * 25})`)
      .each(function(d) {
        const g = d3.select(this);
        g.append('rect')
          .attr('width', 14)
          .attr('height', 14)
          .attr('rx', 2)
          .attr('fill', colorScale(d.type));
        g.append('text')
          .attr('x', 20)
          .attr('y', 11)
          .style('fill', '#a6adc8')
          .style('font-size', '11px')
          .text(d.label);
      });

  } catch (error) {
    console.error('D3 rendering failed:', error);
    d3.select(d3Container.value)
      .append('div')
      .style('padding', '20px')
      .style('color', '#f38ba8')
      .text(`failed to render CNV overview: ${error.message}`);
  }
}

function formatNumber(num) {
  return num.toLocaleString();
}

function formatSize(bytes) {
  if (bytes < 1000) return `${bytes} bp`;
  if (bytes < 1000000) return `${(bytes / 1000).toFixed(1)} Kb`;
  return `${(bytes / 1000000).toFixed(2)} Mb`;
}

function getConfidenceClass(confidence) {
  const classes = {
    high: 'text-green',
    medium: 'text-peach',
    low: 'text-overlay0'
  };
  return classes[confidence] || 'text-overlay1';
}
</script>
