/**
 * CNV Analyzer using biowasm
 * Performs copy number variation analysis on BAM files
 */

import Aioli from '@biowasm/aioli';
import { opfsManager } from '../utils/opfs-manager.js';

class CNVAnalyzer {
  constructor() {
    this.samtools = null;
    this.initialized = false;
  }

  /**
   * Initialize biowasm tools (samtools)
   */
  async initialize(onProgress) {
    if (this.initialized) return;

    try {
      onProgress?.({ stage: 'init', message: 'Initializing biowasm tools...' });

      // Initialize Aioli with samtools
      // This downloads WebAssembly modules from CDN
      this.samtools = await new Aioli('samtools/1.17');

      this.initialized = true;
      onProgress?.({ stage: 'init', message: 'Biowasm tools ready!' });
      console.log('CNV Analyzer initialized');
    } catch (error) {
      console.error('Failed to initialize CNV Analyzer:', error);

      // Provide helpful error message for common issues
      if (error.message?.includes('CORS') || error.message?.includes('fetch')) {
        throw new Error('Failed to load biowasm tools from CDN. Please check your internet connection and browser CORS settings. If using Firefox, ensure the dev server is running with proper headers.');
      }

      throw new Error(`Failed to initialize biowasm: ${error.message}`);
    }
  }

  /**
   * Process BAM file and calculate coverage
   * @param {File} bamFile - Input BAM file
   * @param {Object} options - Analysis options
   */
  async analyzeCNV(bamFile, options = {}) {
    const {
      windowSize = 10000,
      chromosome = null,
      onProgress = null
    } = options;

    try {
      await this.initialize(onProgress);

      // Store BAM file in OPFS
      onProgress?.({ stage: 'storage', message: 'Storing BAM file in OPFS...', progress: 10 });
      await opfsManager.writeFile(bamFile.name, bamFile);

      // Mount file in Aioli filesystem
      onProgress?.({ stage: 'mount', message: 'Mounting file in biowasm...', progress: 20 });
      await this.samtools.mount([{
        name: bamFile.name,
        data: new Uint8Array(await bamFile.arrayBuffer())
      }]);

      // Check if BAM is indexed
      onProgress?.({ stage: 'index', message: 'Checking BAM index...', progress: 30 });
      const indexFile = new File([], `${bamFile.name}.bai`);
      let needsIndex = true;

      try {
        await opfsManager.readFile(`${bamFile.name}.bai`);
        needsIndex = false;
      } catch {
        // Index doesn't exist
      }

      if (needsIndex) {
        onProgress?.({ stage: 'index', message: 'Creating BAM index...', progress: 35 });
        await this.samtools.exec(`index ${bamFile.name}`);
      }

      // Get chromosome list if not specified
      onProgress?.({ stage: 'regions', message: 'Getting chromosome information...', progress: 40 });
      const chroms = chromosome ? [chromosome] : await this.getChromosomes(bamFile.name);

      // Calculate coverage for each chromosome
      const coverageData = [];
      const chromCount = chroms.length;

      for (let i = 0; i < chromCount; i++) {
        const chrom = chroms[i];
        const progressPercent = 40 + ((i / chromCount) * 50);

        onProgress?.({
          stage: 'coverage',
          message: `Calculating coverage for ${chrom}...`,
          progress: progressPercent,
          chromosome: chrom
        });

        const chromCoverage = await this.calculateChromosomeCoverage(
          bamFile.name,
          chrom,
          windowSize
        );

        coverageData.push(...chromCoverage);
      }

      // Detect CNVs from coverage data
      onProgress?.({ stage: 'cnv', message: 'Detecting copy number variations...', progress: 95 });
      const cnvs = this.detectCNVs(coverageData, windowSize);

      onProgress?.({ stage: 'complete', message: 'Analysis complete!', progress: 100 });

      return {
        coverageData,
        cnvs,
        windowSize,
        chromosomes: chroms
      };
    } catch (error) {
      console.error('CNV analysis failed:', error);
      throw error;
    }
  }

  /**
   * Get list of chromosomes from BAM file
   */
  async getChromosomes(bamFileName) {
    try {
      const result = await this.samtools.exec(`idxstats ${bamFileName}`);
      const lines = result.stdout.trim().split('\n');

      const chromosomes = lines
        .filter(line => line.trim() && !line.startsWith('*'))
        .map(line => {
          const [chrom, length, mapped, unmapped] = line.split('\t');
          return { chrom, length: parseInt(length), mapped: parseInt(mapped) };
        })
        .filter(c => c.mapped > 0)
        .map(c => c.chrom);

      return chromosomes;
    } catch (error) {
      console.error('Failed to get chromosomes:', error);
      // Fallback to common chromosomes
      return ['chr1', 'chr2', 'chr3', 'chr4', 'chr5', 'chr6', 'chr7', 'chr8', 'chr9', 'chr10',
              'chr11', 'chr12', 'chr13', 'chr14', 'chr15', 'chr16', 'chr17', 'chr18', 'chr19',
              'chr20', 'chr21', 'chr22', 'chrX', 'chrY'];
    }
  }

  /**
   * Calculate coverage for a specific chromosome
   */
  async calculateChromosomeCoverage(bamFileName, chromosome, windowSize) {
    try {
      // Use samtools depth to get coverage
      const result = await this.samtools.exec(`depth -a -r ${chromosome} ${bamFileName}`);
      const lines = result.stdout.trim().split('\n');

      if (!lines || lines.length === 0) {
        return [];
      }

      // Bin coverage into windows
      const windows = new Map();

      for (const line of lines) {
        if (!line.trim()) continue;

        const [chrom, pos, depth] = line.split('\t');
        const position = parseInt(pos);
        const coverage = parseInt(depth);

        const windowStart = Math.floor(position / windowSize) * windowSize;

        if (!windows.has(windowStart)) {
          windows.set(windowStart, {
            chromosome: chrom,
            start: windowStart,
            end: windowStart + windowSize,
            totalDepth: 0,
            count: 0
          });
        }

        const window = windows.get(windowStart);
        window.totalDepth += coverage;
        window.count++;
      }

      // Calculate average coverage for each window
      return Array.from(windows.values()).map(window => ({
        chromosome: window.chromosome,
        start: window.start,
        end: window.end,
        coverage: window.count > 0 ? window.totalDepth / window.count : 0,
        normalized: 0 // Will be normalized later
      }));
    } catch (error) {
      console.error(`Failed to calculate coverage for ${chromosome}:`, error);
      return [];
    }
  }

  /**
   * Detect CNVs from coverage data
   */
  detectCNVs(coverageData, windowSize) {
    if (!coverageData || coverageData.length === 0) {
      return [];
    }

    // Calculate median coverage for normalization
    const coverages = coverageData.map(d => d.coverage).filter(c => c > 0);
    const median = this.calculateMedian(coverages);

    // Normalize coverage
    coverageData.forEach(d => {
      d.normalized = median > 0 ? d.coverage / median : 0;
    });

    // Detect CNVs (simple threshold-based approach)
    const cnvs = [];
    let currentCNV = null;

    const amplificationThreshold = 1.5; // 50% above median
    const deletionThreshold = 0.5; // 50% below median

    for (const window of coverageData) {
      const isAmplification = window.normalized >= amplificationThreshold;
      const isDeletion = window.normalized <= deletionThreshold;

      if (isAmplification || isDeletion) {
        const type = isAmplification ? 'amplification' : 'deletion';

        if (currentCNV && currentCNV.type === type && currentCNV.chromosome === window.chromosome) {
          // Extend current CNV
          currentCNV.end = window.end;
          currentCNV.windows.push(window);
        } else {
          // Start new CNV
          if (currentCNV) {
            cnvs.push(this.summarizeCNV(currentCNV));
          }

          currentCNV = {
            chromosome: window.chromosome,
            start: window.start,
            end: window.end,
            type,
            windows: [window]
          };
        }
      } else {
        // No CNV, close current if exists
        if (currentCNV) {
          cnvs.push(this.summarizeCNV(currentCNV));
          currentCNV = null;
        }
      }
    }

    // Add last CNV if exists
    if (currentCNV) {
      cnvs.push(this.summarizeCNV(currentCNV));
    }

    return cnvs;
  }

  /**
   * Summarize CNV region
   */
  summarizeCNV(cnv) {
    const avgCoverage = cnv.windows.reduce((sum, w) => sum + w.coverage, 0) / cnv.windows.length;
    const avgNormalized = cnv.windows.reduce((sum, w) => sum + w.normalized, 0) / cnv.windows.length;

    return {
      chromosome: cnv.chromosome,
      start: cnv.start,
      end: cnv.end,
      length: cnv.end - cnv.start,
      type: cnv.type,
      avgCoverage,
      copyNumber: avgNormalized * 2, // Assuming diploid
      confidence: this.calculateConfidence(cnv.windows)
    };
  }

  /**
   * Calculate confidence score for CNV
   */
  calculateConfidence(windows) {
    if (windows.length < 3) return 'low';
    if (windows.length >= 10) return 'high';
    return 'medium';
  }

  /**
   * Calculate median of array
   */
  calculateMedian(arr) {
    if (arr.length === 0) return 0;

    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);

    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }
}

export const cnvAnalyzer = new CNVAnalyzer();
export default cnvAnalyzer;
