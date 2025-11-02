/**
 * Composable for variant calling using Pyodide worker
 * Wraps the Pyodide worker's variant calling functionality
 */

import { useGlobalPyodide } from './usePyodide.js';

export function useVariantCaller() {
  const pyodide = useGlobalPyodide();

  /**
   * Call variants from BAM file
   * @param {ArrayBuffer} bamData - BAM file data
   * @param {Object} options - Variant calling options
   * @returns {Promise<Object>} Variant calling results
   */
  const callVariants = async (bamData, options = {}) => {
    if (!pyodide.isReady.value) {
      throw new Error('Python environment not ready. Please wait for initialization to complete.');
    }

    console.log('🧬 Starting variant calling with Python...');
    console.log(`BAM file size: ${(bamData.byteLength / 1024 / 1024).toFixed(2)} MB`);

    const filters = {
      minDepth: options.minDepth || 10,
      minBaseQuality: options.minBaseQuality || 20,
      minMappingQuality: options.minMappingQuality || 20,
      minVariantReads: options.minVariantReads || 3,
      minAlleleFreq: options.minAlleleFreq || 0.05,
      chromosomes: options.chromosomes || null
    };

    console.log('Variant calling filters:', filters);

    // Call variant calling in worker
    return new Promise((resolve, reject) => {
      const messageId = Date.now() + Math.random();

      const onMessage = (event) => {
        const { type, id, result, error } = event.data;

        if (id === messageId) {
          pyodide.worker.value.removeEventListener('message', onMessage);

          if (error) {
            console.error('Variant calling error:', error);
            reject(new Error(error));
          } else if (type === 'call-variants-response') {
            console.log(`✓ Variant calling complete: ${result.total_variants} variants found`);
            resolve(result);
          }
        }

        // Progress updates
        if (type === 'variant-calling-progress') {
          console.log(`Variant calling: ${event.data.message} (${event.data.progress}%)`);
          if (options.onProgress) {
            options.onProgress({
              message: event.data.message,
              progress: event.data.progress,
              stage: event.data.stage
            });
          }
        }
      };

      pyodide.worker.value.addEventListener('message', onMessage);

      // Send variant calling request
      pyodide.worker.value.postMessage({
        type: 'call-variants',
        id: messageId,
        payload: {
          fileData: bamData,
          options: filters
        }
      });

      // Timeout after 10 minutes
      setTimeout(() => {
        pyodide.worker.value.removeEventListener('message', onMessage);
        reject(new Error('Variant calling timeout (10 minutes exceeded)'));
      }, 600000);
    });
  };

  /**
   * Format variants to VCF format
   * @param {Array} variants - Array of variant objects
   * @param {Object} metadata - Additional metadata for VCF header
   * @returns {string} VCF formatted string
   */
  const formatToVCF = (variants, metadata = {}) => {
    const vcfLines = [];

    // VCF header
    vcfLines.push('##fileformat=VCFv4.2');
    vcfLines.push(`##fileDate=${new Date().toISOString().split('T')[0].replace(/-/g, '')}`);
    vcfLines.push('##source=lungseq-analyzer-pyodide');
    vcfLines.push('##INFO=<ID=DP,Number=1,Type=Integer,Description="Total Depth">');
    vcfLines.push('##INFO=<ID=AF,Number=A,Type=Float,Description="Allele Frequency">');
    vcfLines.push('##INFO=<ID=AC,Number=A,Type=Integer,Description="Allele Count">');
    vcfLines.push('##INFO=<ID=RC,Number=1,Type=Integer,Description="Reference Count">');
    vcfLines.push('##INFO=<ID=VT,Number=1,Type=String,Description="Variant Type (SNV, INS, DEL)">');

    // Add filter metadata if available
    if (metadata.filters) {
      vcfLines.push(`##FILTER=<ID=min_dp,Description="Minimum depth ${metadata.filters.min_depth}">`);
      vcfLines.push(`##FILTER=<ID=min_bq,Description="Minimum base quality ${metadata.filters.min_base_quality}">`);
      vcfLines.push(`##FILTER=<ID=min_mq,Description="Minimum mapping quality ${metadata.filters.min_mapping_quality}">`);
      vcfLines.push(`##FILTER=<ID=min_af,Description="Minimum allele frequency ${metadata.filters.min_allele_freq}">`);
    }

    // Column header
    vcfLines.push('#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO');

    // Variant lines
    for (const variant of variants) {
      const info = [
        `DP=${variant.depth}`,
        `AF=${variant.allele_freq.toFixed(4)}`,
        `AC=${variant.alt_count}`,
        `RC=${variant.ref_count}`,
        `VT=${variant.type}`
      ].join(';');

      vcfLines.push([
        variant.chrom,
        variant.pos,
        '.',  // ID
        variant.ref,
        variant.alt,
        variant.qual.toFixed(2),
        'PASS',  // FILTER
        info
      ].join('\t'));
    }

    return vcfLines.join('\n');
  };

  return {
    callVariants,
    formatToVCF,
    isReady: pyodide.isReady,
    isInitializing: pyodide.isInitializing,
    error: pyodide.error,
    status: pyodide.status,
    progress: pyodide.progress
  };
}
