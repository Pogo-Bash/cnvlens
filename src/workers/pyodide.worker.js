/**
 * Pyodide Web Worker
 * Full Python-based bioinformatics analysis pipeline
 * Uses pysam, NumPy, SciPy for genomics analysis
 */

let pyodide = null;
let isInitialized = false;
let initializationPromise = null;

/**
 * Initialize Pyodide environment with bioinformatics packages
 */
async function initializePyodide() {
  if (isInitialized) return pyodide;
  if (initializationPromise) return initializationPromise;

  initializationPromise = (async () => {
    try {
      self.postMessage({
        type: 'status',
        message: 'Loading Python runtime...',
        progress: 10
      });

      // Import Pyodide using importScripts (classic worker)
      importScripts('/pyodide/pyodide.js');

      self.postMessage({
        type: 'status',
        message: 'Initializing Python interpreter...',
        progress: 20
      });

      pyodide = await self.loadPyodide({
        indexURL: '/pyodide/',
        fullStdLib: false,
      });

      self.postMessage({
        type: 'status',
        message: 'Loading NumPy and SciPy...',
        progress: 30
      });

      // Load core scientific packages
      await pyodide.loadPackage(['numpy', 'scipy', 'micropip']);

      self.postMessage({
        type: 'status',
        message: 'Installing bioinformatics packages...',
        progress: 50
      });

      // Install pysam via micropip (if available)
      // Note: pysam may not be available in Pyodide, so we'll use a pure Python alternative
      try {
        const micropip = pyodide.pyimport('micropip');

        // Try to install pysam
        self.postMessage({
          type: 'status',
          message: 'Installing pysam (BAM/SAM handler)...',
          progress: 60
        });

        await micropip.install('pysam');

        self.postMessage({
          type: 'status',
          message: 'pysam installed successfully!',
          progress: 70
        });
      } catch (error) {
        console.warn('pysam not available in Pyodide, will use pure Python BAM parser:', error);

        self.postMessage({
          type: 'status',
          message: 'Using pure Python BAM parser...',
          progress: 70
        });
      }

      // Set up Python analysis environment
      self.postMessage({
        type: 'status',
        message: 'Setting up analysis environment...',
        progress: 80
      });

      await pyodide.runPythonAsync(`
import numpy as np
from scipy import stats, signal
import json
import struct
import gzip
import sys

print(f"Python {sys.version} initialized in worker")
print(f"NumPy {np.__version__} loaded")

# Pure Python BAM parser (lightweight, works without pysam)
class SimpleBamReader:
    """
    Simplified BAM file reader for basic operations
    Works entirely in Python without external dependencies
    """

    def __init__(self, bam_data):
        """Initialize with BAM file data as bytes"""
        self.data = bam_data
        self.pos = 0
        self.references = []
        self.reference_lengths = []

    def read_header(self):
        """Read BAM header"""
        # BAM magic number
        magic = self.data[0:4]
        if magic != b'BAM\\x01':
            raise ValueError("Not a valid BAM file")

        self.pos = 4

        # Read SAM header length
        l_text = struct.unpack('<I', self.data[self.pos:self.pos+4])[0]
        self.pos += 4

        # Skip SAM header text
        self.pos += l_text

        # Read number of reference sequences
        n_ref = struct.unpack('<I', self.data[self.pos:self.pos+4])[0]
        self.pos += 4

        # Read reference sequence names and lengths
        for _ in range(n_ref):
            l_name = struct.unpack('<I', self.data[self.pos:self.pos+4])[0]
            self.pos += 4

            name = self.data[self.pos:self.pos+l_name-1].decode('utf-8')
            self.pos += l_name

            l_ref = struct.unpack('<I', self.data[self.pos:self.pos+4])[0]
            self.pos += 4

            self.references.append(name)
            self.reference_lengths.append(l_ref)

    def read_alignment(self):
        """Read a single alignment record"""
        if self.pos >= len(self.data):
            return None

        try:
            # Read block size
            block_size = struct.unpack('<I', self.data[self.pos:self.pos+4])[0]
            self.pos += 4

            if self.pos + block_size > len(self.data):
                return None

            # Read core alignment data
            refID = struct.unpack('<i', self.data[self.pos:self.pos+4])[0]
            self.pos += 4

            pos = struct.unpack('<i', self.data[self.pos:self.pos+4])[0]
            self.pos += 4

            bin_mq_nl = struct.unpack('<I', self.data[self.pos:self.pos+4])[0]
            self.pos += 4

            mapq = (bin_mq_nl >> 8) & 0xFF

            flag_nc = struct.unpack('<I', self.data[self.pos:self.pos+4])[0]
            self.pos += 4

            flag = flag_nc >> 16

            # Skip rest of the record
            self.pos += block_size - 16

            return {
                'refID': refID,
                'pos': pos,
                'mapq': mapq,
                'flag': flag,
                'is_unmapped': (flag & 0x4) != 0,
                'is_duplicate': (flag & 0x400) != 0,
                'is_secondary': (flag & 0x100) != 0,
            }
        except Exception as e:
            print(f"Error reading alignment: {e}")
            return None

    def calculate_coverage(self, chrom=None, window_size=10000):
        """Calculate coverage across genome"""
        self.read_header()

        # Initialize coverage arrays
        coverage = {}
        for ref_name, ref_len in zip(self.references, self.reference_lengths):
            if chrom and ref_name != chrom:
                continue
            num_windows = (ref_len // window_size) + 1
            coverage[ref_name] = np.zeros(num_windows, dtype=np.int32)

        # Iterate through alignments
        read_count = 0
        while True:
            aln = self.read_alignment()
            if aln is None:
                break

            read_count += 1

            # Skip unmapped, duplicate, secondary
            if aln['is_unmapped'] or aln['is_duplicate'] or aln['is_secondary']:
                continue

            # Get reference name
            if aln['refID'] < 0 or aln['refID'] >= len(self.references):
                continue

            ref_name = self.references[aln['refID']]

            if chrom and ref_name != chrom:
                continue

            if ref_name not in coverage:
                continue

            # Add to coverage
            window_idx = aln['pos'] // window_size
            if 0 <= window_idx < len(coverage[ref_name]):
                coverage[ref_name][window_idx] += 1

        return coverage, read_count

# Global BAM reader instance
bam_reader = None

def analyze_bam_coverage(bam_bytes, window_size=10000, chromosome=None):
    """
    Analyze BAM file and calculate coverage
    Returns coverage data and CNV calls
    """
    global bam_reader

    try:
        # Create BAM reader
        bam_reader = SimpleBamReader(bam_bytes)

        # Calculate coverage
        coverage_data, total_reads = bam_reader.calculate_coverage(
            chrom=chromosome,
            window_size=window_size
        )

        # Process coverage into windows
        windows = []
        for chrom, cov_array in coverage_data.items():
            for i, depth in enumerate(cov_array):
                windows.append({
                    'chromosome': chrom,
                    'start': i * window_size,
                    'end': (i + 1) * window_size,
                    'coverage': int(depth),
                    'normalized': 0.0
                })

        # Normalize coverage
        if windows:
            coverages = [w['coverage'] for w in windows if w['coverage'] > 0]
            if coverages:
                median_cov = float(np.median(coverages))
                for w in windows:
                    w['normalized'] = w['coverage'] / median_cov if median_cov > 0 else 0

        # Detect CNVs
        cnvs = detect_cnvs(windows)

        return {
            'total_reads': total_reads,
            'coverageData': windows,
            'cnvs': cnvs,
            'windowSize': window_size,
            'chromosomes': list(coverage_data.keys()),
            'method': 'pyodide-python'
        }

    except Exception as e:
        import traceback
        return {
            'error': str(e),
            'traceback': traceback.format_exc()
        }

def detect_cnvs(windows, amp_threshold=1.5, del_threshold=0.5):
    """
    Detect copy number variations from coverage windows
    """
    cnvs = []
    current_cnv = None

    for window in windows:
        norm_cov = window['normalized']

        is_amp = norm_cov >= amp_threshold
        is_del = norm_cov <= del_threshold and norm_cov > 0

        if is_amp or is_del:
            cnv_type = 'amplification' if is_amp else 'deletion'

            if current_cnv and current_cnv['type'] == cnv_type and current_cnv['chromosome'] == window['chromosome']:
                # Extend current CNV
                current_cnv['end'] = window['end']
                current_cnv['windows'].append(window)
            else:
                # Start new CNV
                if current_cnv:
                    cnvs.append(summarize_cnv(current_cnv))

                current_cnv = {
                    'chromosome': window['chromosome'],
                    'start': window['start'],
                    'end': window['end'],
                    'type': cnv_type,
                    'windows': [window]
                }
        else:
            # No CNV, close current if exists
            if current_cnv:
                cnvs.append(summarize_cnv(current_cnv))
                current_cnv = None

    # Close last CNV
    if current_cnv:
        cnvs.append(summarize_cnv(current_cnv))

    return cnvs

def summarize_cnv(cnv):
    """Summarize CNV region"""
    windows = cnv['windows']
    coverages = [w['coverage'] for w in windows]
    normalized = [w['normalized'] for w in windows]

    return {
        'chromosome': cnv['chromosome'],
        'start': cnv['start'],
        'end': cnv['end'],
        'length': cnv['end'] - cnv['start'],
        'type': cnv['type'],
        'avgCoverage': float(np.mean(coverages)),
        'copyNumber': float(np.mean(normalized)) * 2,  # Assume diploid
        'confidence': 'high' if len(windows) >= 10 else ('medium' if len(windows) >= 3 else 'low')
    }

def call_variants(bam_bytes, reference_fasta=None, min_coverage=10, min_quality=20):
    """
    Simple variant calling from BAM file
    This is a basic implementation - for production use GATK or similar
    """
    # TODO: Implement full variant calling pipeline
    # For now, return placeholder
    return {
        'variants': [],
        'note': 'Full variant calling pipeline coming soon',
        'status': 'placeholder'
    }

print("✓ Python bioinformatics environment ready")
      `);

      self.postMessage({
        type: 'status',
        message: 'Python bioinformatics environment ready!',
        progress: 100
      });

      isInitialized = true;

      self.postMessage({
        type: 'ready',
        timestamp: Date.now()
      });

      console.log('✓ Pyodide initialized with bioinformatics support');
      return pyodide;

    } catch (error) {
      self.postMessage({
        type: 'error',
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  })();

  return initializationPromise;
}

/**
 * Analyze BAM file with full Python bioinformatics pipeline
 */
async function analyzeBamFile(fileData, options = {}) {
  if (!isInitialized) {
    await initializePyodide();
  }

  try {
    const windowSize = options.windowSize || 10000;
    const chromosome = options.chromosome || null;

    // Send progress updates
    self.postMessage({
      type: 'analysis-progress',
      stage: 'loading',
      message: 'Loading BAM file into Python...',
      progress: 10
    });

    // Convert ArrayBuffer to Uint8Array for Python
    const bamBytes = new Uint8Array(fileData);

    // Store BAM data in Pyodide memory
    pyodide.globals.set('bam_data_js', bamBytes);

    self.postMessage({
      type: 'analysis-progress',
      stage: 'parsing',
      message: 'Parsing BAM header...',
      progress: 30
    });

    // Run Python analysis
    const resultJson = await pyodide.runPythonAsync(`
import json

# Get BAM data from JavaScript
bam_bytes = bytes(bam_data_js.to_py())

# Run analysis
result = analyze_bam_coverage(
    bam_bytes,
    window_size=${windowSize},
    chromosome=${chromosome ? `'${chromosome}'` : 'None'}
)

# Convert to JSON
json.dumps(result)
    `);

    // Clean up
    pyodide.globals.delete('bam_data_js');

    const result = JSON.parse(resultJson);

    if (result.error) {
      throw new Error(result.error + '\\n' + (result.traceback || ''));
    }

    self.postMessage({
      type: 'analysis-progress',
      stage: 'complete',
      message: 'Analysis complete!',
      progress: 100
    });

    return result;

  } catch (error) {
    throw new Error(`BAM analysis failed: ${error.message}`);
  }
}

/**
 * Run custom Python code
 */
async function runPythonCode(code) {
  if (!isInitialized) {
    await initializePyodide();
  }

  try {
    const result = await pyodide.runPythonAsync(code);

    // Convert Python objects to JS
    if (result && typeof result.toJs === 'function') {
      return result.toJs();
    }

    return result;
  } catch (error) {
    throw new Error(`Python execution failed: ${error.message}`);
  }
}

/**
 * Install Python package via micropip
 */
async function installPackage(packageName) {
  if (!isInitialized) {
    await initializePyodide();
  }

  try {
    self.postMessage({
      type: 'status',
      message: `Installing ${packageName}...`
    });

    const micropip = pyodide.pyimport('micropip');
    await micropip.install(packageName);

    self.postMessage({
      type: 'package-installed',
      package: packageName
    });

    return true;
  } catch (error) {
    throw new Error(`Failed to install ${packageName}: ${error.message}`);
  }
}

/**
 * Message handler
 */
self.onmessage = async (event) => {
  const { type, id, payload } = event.data;

  try {
    switch (type) {
      case 'init':
        await initializePyodide();
        self.postMessage({ type: 'init-response', id, success: true });
        break;

      case 'analyze-bam':
        const result = await analyzeBamFile(payload.fileData, payload.options);
        self.postMessage({
          type: 'analyze-bam-response',
          id,
          result
        });
        break;

      case 'run-python':
        const output = await runPythonCode(payload.code);
        self.postMessage({
          type: 'run-python-response',
          id,
          output
        });
        break;

      case 'install-package':
        await installPackage(payload.package);
        self.postMessage({
          type: 'install-package-response',
          id,
          success: true
        });
        break;

      case 'check-ready':
        self.postMessage({
          type: 'check-ready-response',
          id,
          ready: isInitialized
        });
        break;

      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      id,
      error: error.message,
      stack: error.stack
    });
  }
};

console.log('Pyodide worker loaded and ready');
