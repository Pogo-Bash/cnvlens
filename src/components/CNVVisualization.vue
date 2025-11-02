<template>
  <div class="space-y-6">
    <!-- Plotly Coverage Plot -->
    <div class="card bg-base-100 shadow-xl">
      <div class="card-body">
        <h3 class="card-title">Coverage Plot</h3>
        <div ref="plotlyContainer" class="w-full" style="min-height: 400px;"></div>
      </div>
    </div>

    <!-- D3 CNV Overview -->
    <div class="card bg-base-100 shadow-xl">
      <div class="card-body">
        <h3 class="card-title">CNV Overview</h3>

        <!-- Add loading spinner -->
        <div v-if="!props.cnvs || props.cnvs.length === 0" class="flex items-center justify-center h-96">
          <span class="loading loading-spinner loading-lg"></span>
          <span class="ml-4">Preparing visualization...</span>
        </div>

        <div v-else ref="d3Container" class="w-full" style="min-height: 400px;"></div>
      </div>
    </div>

    <!-- CNV Table -->
    <div class="card bg-base-100 shadow-xl" v-if="cnvs && cnvs.length > 0">
      <div class="card-body">
        <!-- Header with counts -->
        <div class="flex justify-between items-center mb-4">
          <h3 class="card-title">
            Detected CNVs ({{ cnvs.length }})
            <span v-if="hasActiveFilters" class="badge badge-primary ml-2">
              {{ filteredCnvs.length }} filtered
            </span>
          </h3>
          <div class="text-sm text-base-content/70">
            Showing {{ pageInfo }}
          </div>
        </div>

        <!-- Filter Controls -->
        <div class="bg-base-200 rounded-lg p-4 mb-4">
          <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
            <!-- Type Filter -->
            <div class="form-control">
              <label class="label">
                <span class="label-text font-semibold">Type</span>
              </label>
              <select v-model="filterType" class="select select-bordered select-sm w-full">
                <option value="all">All Types</option>
                <option value="amplification">Amplification</option>
                <option value="deletion">Deletion</option>
              </select>
            </div>

            <!-- Chromosome Filter -->
            <div class="form-control">
              <label class="label">
                <span class="label-text font-semibold">Chromosome</span>
              </label>
              <select v-model="filterChromosome" class="select select-bordered select-sm w-full">
                <option value="all">All Chromosomes</option>
                <option v-for="chr in uniqueChromosomes" :key="chr" :value="chr">
                  {{ chr }}
                </option>
              </select>
            </div>

            <!-- Confidence Filter -->
            <div class="form-control">
              <label class="label">
                <span class="label-text font-semibold">Confidence</span>
              </label>
              <select v-model="filterConfidence" class="select select-bordered select-sm w-full">
                <option value="all">All Confidence</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>

            <!-- Clear Filters Button -->
            <div class="form-control">
              <label class="label">
                <span class="label-text opacity-0">Clear</span>
              </label>
              <button
                @click="clearFilters"
                :disabled="!hasActiveFilters"
                class="btn btn-sm btn-outline"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
                Clear Filters
              </button>
            </div>
          </div>

          <!-- Filter Status -->
          <div v-if="hasActiveFilters" class="mt-3 text-sm">
            <span class="text-base-content/70">Active filters:</span>
            <span v-if="filterType !== 'all'" class="badge badge-sm badge-primary ml-2">
              Type: {{ filterType }}
            </span>
            <span v-if="filterChromosome !== 'all'" class="badge badge-sm badge-primary ml-2">
              Chr: {{ filterChromosome }}
            </span>
            <span v-if="filterConfidence !== 'all'" class="badge badge-sm badge-primary ml-2">
              Confidence: {{ filterConfidence }}
            </span>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="table table-zebra">
            <thead>
              <tr>
                <th>Type</th>
                <th>Chromosome</th>
                <th>Start</th>
                <th>End</th>
                <th>Length</th>
                <th>Copy Number</th>
                <th>Confidence</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(cnv, idx) in paginatedCnvs" :key="idx">
                <td>
                  <span :class="cnv.type === 'amplification' ? 'badge badge-error' : 'badge badge-info'">
                    {{ cnv.type }}
                  </span>
                </td>
                <td>{{ cnv.chromosome }}</td>
                <td>{{ formatNumber(cnv.start) }}</td>
                <td>{{ formatNumber(cnv.end) }}</td>
                <td>{{ formatSize(cnv.length) }}</td>
                <td>{{ cnv.copyNumber.toFixed(2) }}</td>
                <td>
                  <span :class="getConfidenceBadge(cnv.confidence)">
                    {{ cnv.confidence }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination Controls -->
        <div class="flex flex-col md:flex-row justify-between items-center gap-4 mt-4">
          <!-- Navigation Buttons -->
          <div class="join">
            <!-- First Page -->
            <button
              class="join-item btn btn-sm"
              @click="goToPage(1)"
              :disabled="currentPage === 1"
              title="First page"
            >
              «
            </button>

            <!-- Previous Page -->
            <button
              class="join-item btn btn-sm"
              @click="previousPage"
              :disabled="currentPage === 1"
              title="Previous page"
            >
              ‹
            </button>

            <!-- Current Page Info -->
            <button class="join-item btn btn-sm btn-active pointer-events-none">
              {{ currentPage }} / {{ totalPages }}
            </button>

            <!-- Next Page -->
            <button
              class="join-item btn btn-sm"
              @click="nextPage"
              :disabled="currentPage === totalPages"
              title="Next page"
            >
              ›
            </button>

            <!-- Last Page -->
            <button
              class="join-item btn btn-sm"
              @click="goToPage(totalPages)"
              :disabled="currentPage === totalPages"
              title="Last page"
            >
              »
            </button>
          </div>

          <!-- Quick Navigation -->
          <div class="flex items-center gap-2">
            <!-- Skip Back 10 -->
            <button
              class="btn btn-sm btn-outline"
              @click="goToPage(Math.max(1, currentPage - 10))"
              :disabled="currentPage <= 10"
              title="Go back 10 pages"
            >
              -10
            </button>

            <!-- Jump to Page Input -->
            <div class="flex items-center gap-2">
              <span class="text-sm whitespace-nowrap">Go to:</span>
              <input
                type="number"
                min="1"
                :max="totalPages"
                :value="currentPage"
                @change="e => goToPage(parseInt(e.target.value) || 1)"
                class="input input-bordered input-sm w-20"
                placeholder="Page"
              />
            </div>

            <!-- Skip Forward 10 -->
            <button
              class="btn btn-sm btn-outline"
              @click="goToPage(Math.min(totalPages, currentPage + 10))"
              :disabled="currentPage > totalPages - 10"
              title="Go forward 10 pages"
            >
              +10
            </button>
          </div>
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

  // Filter by type
  if (filterType.value !== 'all') {
    result = result.filter(cnv => cnv.type === filterType.value);
  }

  // Filter by chromosome
  if (filterChromosome.value !== 'all') {
    result = result.filter(cnv => cnv.chromosome === filterChromosome.value);
  }

  // Filter by confidence
  if (filterConfidence.value !== 'all') {
    result = result.filter(cnv => cnv.confidence === filterConfidence.value);
  }

  return result;
});

// Computed properties for pagination (uses filtered data)
const totalPages = computed(() => {
  return Math.ceil(filteredCnvs.value.length / itemsPerPage);
});

const paginatedCnvs = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage;
  const end = start + itemsPerPage;
  return filteredCnvs.value.slice(start, end);
});

const pageInfo = computed(() => {
  if (filteredCnvs.value.length === 0) return 'No results';
  const start = (currentPage.value - 1) * itemsPerPage + 1;
  const end = Math.min(currentPage.value * itemsPerPage, filteredCnvs.value.length);
  return `${start}-${end} of ${filteredCnvs.value.length}`;
});

// Check if any filters are active
const hasActiveFilters = computed(() => {
  return filterType.value !== 'all' ||
         filterChromosome.value !== 'all' ||
         filterConfidence.value !== 'all';
});

// Pagination functions
function goToPage(page) {
  // Handle invalid inputs
  const pageNum = parseInt(page);
  if (isNaN(pageNum)) return;

  // Clamp to valid range
  const validPage = Math.max(1, Math.min(totalPages.value, pageNum));
  currentPage.value = validPage;
}

function nextPage() {
  if (currentPage.value < totalPages.value) {
    currentPage.value++;
  }
}

function previousPage() {
  if (currentPage.value > 1) {
    currentPage.value--;
  }
}

// Clear all filters
function clearFilters() {
  filterType.value = 'all';
  filterChromosome.value = 'all';
  filterConfidence.value = 'all';
  currentPage.value = 1;
}

// Reset to page 1 when CNV data changes
watch(() => props.cnvs, () => {
  currentPage.value = 1;
});

// Reset to page 1 when filters change
watch([filterType, filterChromosome, filterConfidence], () => {
  currentPage.value = 1;
});

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
  console.log('📈 Starting Plotly Coverage Plot render');

  if (!plotlyContainer.value || !props.coverageData.length) {
    console.warn('⚠️ Plotly container or coverage data not available');
    return;
  }

  // Group data by chromosome
  const chromosomeData = {};
  props.coverageData.forEach(d => {
    if (!chromosomeData[d.chromosome]) {
      chromosomeData[d.chromosome] = [];
    }
    chromosomeData[d.chromosome].push(d);
  });

  // Create traces for each chromosome
  const traces = Object.entries(chromosomeData).map(([chrom, data]) => {
    return {
      x: data.map(d => d.start),
      y: data.map(d => d.normalized),
      name: chrom,
      type: 'scatter',
      mode: 'lines',
      line: {
        width: 1
      }
    };
  });

  // CRITICAL: Limit CNV shapes to prevent browser crash
  // Filter to high/medium confidence, max 500 shapes
  const cnvsForShapes = props.cnvs
    .filter(cnv => cnv.confidence === 'high' || cnv.confidence === 'medium')
    .slice(0, 500);

  console.log(`📊 Adding ${cnvsForShapes.length} CNV shapes (filtered from ${props.cnvs.length} total)`);

  // Add CNV regions as shapes
  const shapes = cnvsForShapes.map(cnv => {
    return {
      type: 'rect',
      xref: 'x',
      yref: 'paper',
      x0: cnv.start,
      x1: cnv.end,
      y0: 0,
      y1: 1,
      fillcolor: cnv.type === 'amplification' ? 'rgba(255, 0, 0, 0.1)' : 'rgba(0, 0, 255, 0.1)',
      line: {
        width: 0
      }
    };
  });

  const layout = {
    title: 'Normalized Coverage Across Genome',
    xaxis: {
      title: 'Genomic Position'
    },
    yaxis: {
      title: 'Normalized Coverage'
    },
    hovermode: 'closest',
    showlegend: true,
    shapes: shapes,
    plot_bgcolor: '#1f2937',
    paper_bgcolor: '#1f2937',
    font: {
      color: '#fff'
    }
  };

  const config = {
    responsive: true,
    displayModeBar: true,
    displaylogo: false
  };

  Plotly.newPlot(plotlyContainer.value, traces, layout, config);
}

function renderD3() {
  console.log('🎨 Starting D3 CNV Overview render');

  if (!d3Container.value) {
    console.error('❌ d3Container ref is null');
    return;
  }

  if (!props.cnvs || props.cnvs.length === 0) {
    console.error('❌ No CNV data available');
    return;
  }

  console.log(`📊 Total CNVs: ${props.cnvs.length}`);

  // CRITICAL: Limit to prevent browser crash
  // Only show high/medium confidence CNVs, max 500
  const cnvsToVisualize = props.cnvs
    .filter(cnv => cnv.confidence === 'high' || cnv.confidence === 'medium')
    .slice(0, 500);

  console.log(`📊 Visualizing ${cnvsToVisualize.length} filtered CNVs`);

  if (cnvsToVisualize.length === 0) {
    console.warn('⚠️ No high/medium confidence CNVs to display');
    return;
  }

  try {
    // Clear previous render
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

    // Group CNVs by chromosome
    const chromosomes = [...new Set(cnvsToVisualize.map(c => c.chromosome))];
    const yScale = d3.scaleBand()
      .domain(chromosomes)
      .range([0, height])
      .padding(0.2);

    // Find max position for x scale
    const maxPos = d3.max(cnvsToVisualize, d => d.end);
    const xScale = d3.scaleLinear()
      .domain([0, maxPos])
      .range([0, width]);

    // Color scale
    const colorScale = d3.scaleOrdinal()
      .domain(['amplification', 'deletion'])
      .range(['#ef4444', '#3b82f6']);

    // Draw CNV rectangles
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

        // Show tooltip
        const tooltip = d3.select('body').append('div')
          .attr('class', 'tooltip')
          .style('position', 'absolute')
          .style('background', '#1f2937')
          .style('color', '#fff')
          .style('padding', '8px')
          .style('border-radius', '4px')
          .style('pointer-events', 'none')
          .style('z-index', '1000')
          .html(`
            <strong>${d.type}</strong><br/>
            ${d.chromosome}:${formatNumber(d.start)}-${formatNumber(d.end)}<br/>
            Length: ${formatSize(d.length)}<br/>
            Copy Number: ${d.copyNumber.toFixed(2)}
          `)
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 10) + 'px');
      })
      .on('mouseout', function() {
        d3.select(this).attr('opacity', 0.7);
        d3.selectAll('.tooltip').remove();
      });

    // Add axes
    const xAxis = d3.axisBottom(xScale)
      .tickFormat(d => formatNumber(d));

    svg.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(xAxis)
      .selectAll('text')
      .style('fill', '#fff');

    const yAxis = d3.axisLeft(yScale);

    svg.append('g')
      .call(yAxis)
      .selectAll('text')
      .style('fill', '#fff');

    // Add axis labels
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', height + 50)
      .style('text-anchor', 'middle')
      .style('fill', '#fff')
      .text('Genomic Position');

    svg.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -height / 2)
      .attr('y', -60)
      .style('text-anchor', 'middle')
      .style('fill', '#fff')
      .text('Chromosome');

    // Add legend
    const legend = svg.append('g')
      .attr('transform', `translate(${width + 20}, 0)`);

    const legendData = [
      { type: 'amplification', label: 'Amplification' },
      { type: 'deletion', label: 'Deletion' }
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
          .attr('width', 18)
          .attr('height', 18)
          .attr('fill', colorScale(d.type));

        g.append('text')
          .attr('x', 24)
          .attr('y', 14)
          .style('fill', '#fff')
          .style('font-size', '12px')
          .text(d.label);
      });

    console.log('✅ D3 render complete');

  } catch (error) {
    console.error('❌ D3 rendering failed:', error);
    // Show error message in the chart area
    d3.select(d3Container.value)
      .append('div')
      .style('padding', '20px')
      .style('color', 'red')
      .text(`Failed to render CNV overview: ${error.message}`);
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

function getConfidenceBadge(confidence) {
  const badges = {
    high: 'badge badge-success',
    medium: 'badge badge-warning',
    low: 'badge badge-ghost'
  };
  return badges[confidence] || 'badge';
}
</script>

<style scoped>
/* Add any additional styles here */
</style>
