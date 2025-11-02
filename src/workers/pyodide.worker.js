/**
 * Pyodide Web Worker
 * Full Python-based bioinformatics analysis pipeline
 * Uses pysam, NumPy, SciPy for genomics analysis
 */

// Log worker type for debugging
console.log('🔧 Pyodide worker starting...');
console.log('🔧 Worker type:', typeof importScripts !== 'undefined' ? 'CLASSIC ✅' : 'MODULE ❌');

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
        indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/',
        fullStdLib: false,
      });

      self.postMessage({
        type: 'status',
        message: 'Loading NumPy...',
        progress: 30
      });

      // Load only NumPy (SciPy removed to save ~20MB memory)
      try {
        console.log('Loading NumPy...');
        await pyodide.loadPackage('numpy');
        console.log('✓ NumPy loaded');

      } catch (error) {
        console.error('Failed to load NumPy:', error);
        throw new Error(`NumPy loading failed: ${error.message}`);
      }

      // Set up Python analysis environment
      self.postMessage({
        type: 'status',
        message: 'Setting up analysis environment...',
        progress: 60
      });

      // Verify packages are importable
      try {
        await pyodide.runPythonAsync(`
import sys
print(f"Python {sys.version} ready")

# Test NumPy import
try:
    import numpy as np
    print(f"✓ NumPy {np.__version__} loaded")
except ImportError as e:
    print(f"✗ NumPy import failed: {e}")
    raise

# Other imports
import json
import struct
import gzip
import math
        `);
      } catch (error) {
        console.error('Package import test failed:', error);
        throw new Error(`Failed to import packages: ${error.message}`);
      }

      console.log('Packages imported successfully, defining analysis functions...');

      // Now define the analysis functions
      await pyodide.runPythonAsync(`
import numpy as np
import json
import struct
import gzip
import sys
import math

# Pure Python BAM parser with streaming BGZF decompression
class SimpleBamReader:
    """
    Simplified BAM file reader for basic operations
    Streams BGZF blocks on-demand (no full decompression!)
    """

    def __init__(self, bam_data):
        """Initialize with BGZF compressed BAM file data"""
        self.compressed_data = bam_data
        self.compressed_pos = 0
        self.uncompressed_buffer = b''
        self.buffer_offset = 0
        self.references = []
        self.reference_lengths = []

        print(f"Initializing streaming BAM reader ({len(bam_data)} bytes compressed)")

    def read_bgzf_block(self):
        """Read and decompress one BGZF block"""
        if self.compressed_pos >= len(self.compressed_data):
            return None

        try:
            # BGZF block structure:
            # - Gzip header with extra fields
            # - Compressed data
            # - CRC and size footer

            # Find start of next block
            start_pos = self.compressed_pos

            # Read gzip header (minimum 10 bytes)
            if start_pos + 18 > len(self.compressed_data):
                return None

            header = self.compressed_data[start_pos:start_pos+18]

            # Check gzip magic
            if header[0:2] != b'\\x1f\\x8b':
                return None

            # Get block size from BGZF extra field (BSIZE)
            # BGZF stores block size - 1 in bytes 16-17
            bsize = struct.unpack('<H', header[16:18])[0]
            block_size = bsize + 1

            # Read entire block
            if start_pos + block_size > len(self.compressed_data):
                return None

            block = self.compressed_data[start_pos:start_pos+block_size]

            # Decompress using gzip
            decompressed = gzip.decompress(block)

            # Move to next block
            self.compressed_pos = start_pos + block_size

            return decompressed

        except Exception as e:
            print(f"Error reading BGZF block at pos {self.compressed_pos}: {e}")
            return None

    def fill_buffer(self, min_bytes=65536):
        """Fill uncompressed buffer by reading BGZF blocks"""
        while len(self.uncompressed_buffer) - self.buffer_offset < min_bytes:
            block = self.read_bgzf_block()
            if block is None:
                break
            self.uncompressed_buffer += block

    def read_bytes(self, n):
        """Read n bytes from uncompressed stream"""
        # Ensure buffer has enough data
        while len(self.uncompressed_buffer) - self.buffer_offset < n:
            block = self.read_bgzf_block()
            if block is None:
                # Not enough data
                return None
            self.uncompressed_buffer += block

        # Read from buffer
        data = self.uncompressed_buffer[self.buffer_offset:self.buffer_offset+n]
        self.buffer_offset += n

        # Trim buffer periodically to save memory
        if self.buffer_offset > 1048576:  # 1MB
            self.uncompressed_buffer = self.uncompressed_buffer[self.buffer_offset:]
            self.buffer_offset = 0

        return data

    def read_header(self):
        """Read BAM header from first BGZF block"""
        print("Reading BAM header...")

        # Fill initial buffer
        self.fill_buffer(65536)

        # BAM magic number
        magic = self.read_bytes(4)
        if magic != b'BAM\\x01':
            raise ValueError(f"Not a valid BAM file (magic: {magic!r})")

        # Read SAM header length
        l_text_bytes = self.read_bytes(4)
        l_text = struct.unpack('<I', l_text_bytes)[0]

        # Skip SAM header text
        self.read_bytes(l_text)

        # Read number of reference sequences
        n_ref_bytes = self.read_bytes(4)
        n_ref = struct.unpack('<I', n_ref_bytes)[0]

        print(f"Found {n_ref} reference sequences")

        # Read reference sequence names and lengths
        for _ in range(n_ref):
            l_name_bytes = self.read_bytes(4)
            l_name = struct.unpack('<I', l_name_bytes)[0]

            name_bytes = self.read_bytes(l_name)
            name = name_bytes[:-1].decode('utf-8')  # Remove null terminator

            l_ref_bytes = self.read_bytes(4)
            l_ref = struct.unpack('<I', l_ref_bytes)[0]

            self.references.append(name)
            self.reference_lengths.append(l_ref)

    def read_alignment(self):
        """Read a single alignment record from stream"""
        # Read block size
        block_size_bytes = self.read_bytes(4)
        if block_size_bytes is None or len(block_size_bytes) < 4:
            return None

        block_size = struct.unpack('<I', block_size_bytes)[0]

        # Read core alignment data (first 32 bytes of block)
        core_data = self.read_bytes(32)
        if core_data is None or len(core_data) < 32:
            return None

        refID = struct.unpack('<i', core_data[0:4])[0]
        pos = struct.unpack('<i', core_data[4:8])[0]

        bin_mq_nl = struct.unpack('<I', core_data[8:12])[0]
        mapq = (bin_mq_nl >> 8) & 0xFF
        l_read_name = bin_mq_nl & 0xFF

        flag_nc = struct.unpack('<I', core_data[12:16])[0]
        flag = flag_nc >> 16
        n_cigar_op = flag_nc & 0xFFFF

        l_seq = struct.unpack('<I', core_data[16:20])[0]

        # Parse variable-length data section
        # 1. Read name (skip it)
        read_name_data = self.read_bytes(l_read_name)
        if read_name_data is None:
            return None

        # 2. CIGAR (skip it)
        cigar_bytes = n_cigar_op * 4
        cigar_data = self.read_bytes(cigar_bytes)
        if cigar_data is None and cigar_bytes > 0:
            return None

        # 3. Sequence (decode it - needed for variant calling!)
        seq_bytes = (l_seq + 1) // 2  # 4 bits per base, 2 bases per byte
        seq_data = self.read_bytes(seq_bytes)

        seq = ''
        if seq_data and l_seq > 0:
            # BAM base encoding: =ACMGRSVTWYHKDBN (values 0-15)
            seq_lookup = '=ACMGRSVTWYHKDBN'
            for i in range(l_seq):
                byte_idx = i // 2
                if byte_idx < len(seq_data):
                    byte_val = seq_data[byte_idx]
                    # Each byte has 2 bases: high nibble (first base), low nibble (second base)
                    if i % 2 == 0:
                        # First base in byte (high nibble)
                        base_idx = (byte_val >> 4) & 0xF
                    else:
                        # Second base in byte (low nibble)
                        base_idx = byte_val & 0xF
                    seq += seq_lookup[base_idx]

        # 4. Quality scores (extract them - needed for variant calling!)
        qual_data = self.read_bytes(l_seq)

        qual = []
        if qual_data and l_seq > 0:
            # Quality scores are stored as Phred+33 ASCII values
            # Convert to numeric Phred scores
            qual = [q for q in qual_data]

        # Skip any remaining auxiliary data (tags)
        bytes_read = 32 + l_read_name + cigar_bytes + seq_bytes + l_seq
        remaining = block_size - bytes_read
        if remaining > 0:
            self.read_bytes(remaining)

        return {
            'refID': refID,
            'pos': pos,
            'mapq': mapq,
            'flag': flag,
            'seq': seq,
            'qual': qual,
            'is_unmapped': (flag & 0x4) != 0,
            'is_duplicate': (flag & 0x400) != 0,
            'is_secondary': (flag & 0x100) != 0,
        }

    def calculate_coverage(self, chrom=None, chroms=None, window_size=10000):
        """
        Calculate coverage across genome
        Args:
            chrom: Single chromosome to process (legacy)
            chroms: List of chromosomes to process (for parallel processing)
            window_size: Window size in bp
        """
        self.read_header()

        # Build chromosome filter set
        chrom_filter = None
        if chroms:
            chrom_filter = set(chroms)
            print(f"Processing chromosomes: {', '.join(chroms)}")
        elif chrom:
            chrom_filter = {chrom}
            print(f"Processing chromosome: {chrom}")

        # Initialize coverage arrays
        coverage = {}
        for ref_name, ref_len in zip(self.references, self.reference_lengths):
            if chrom_filter and ref_name not in chrom_filter:
                continue
            num_windows = (ref_len // window_size) + 1
            coverage[ref_name] = np.zeros(num_windows, dtype=np.int32)

        if not coverage:
            print("⚠️ No matching chromosomes found in BAM file")
            return {}, 0

        # Stream through alignments
        print(f"Streaming through alignments...")
        read_count = 0
        last_report = 0

        while True:
            aln = self.read_alignment()
            if aln is None:
                break

            read_count += 1

            # Progress reporting every 100k reads
            if read_count - last_report >= 100000:
                print(f"  Processed {read_count:,} reads...")
                last_report = read_count

            # Skip unmapped, duplicate, secondary
            if aln['is_unmapped'] or aln['is_duplicate'] or aln['is_secondary']:
                continue

            # Get reference name
            if aln['refID'] < 0 or aln['refID'] >= len(self.references):
                continue

            ref_name = self.references[aln['refID']]

            if ref_name not in coverage:
                continue

            # Add to coverage
            window_idx = aln['pos'] // window_size
            if 0 <= window_idx < len(coverage[ref_name]):
                coverage[ref_name][window_idx] += 1

        print(f"✓ Processed {read_count:,} total reads")
        return coverage, read_count

# Global BAM reader instance
bam_reader = None

def analyze_bam_coverage(bam_bytes, window_size=10000, chromosome=None, chromosomes=None,
                         use_manual_thresholds=False, amp_threshold=None, del_threshold=None, min_windows_override=None):
    """
    Analyze BAM file and calculate coverage with adaptive OR manual thresholds
    Args:
        bam_bytes: BAM file data
        window_size: Window size in bp
        chromosome: Single chromosome (legacy)
        chromosomes: List of chromosomes for parallel processing
        use_manual_thresholds: If True, use manual thresholds instead of adaptive
        amp_threshold: Manual amplification threshold (normalized coverage ratio)
        del_threshold: Manual deletion threshold (normalized coverage ratio)
        min_windows_override: Manual minimum windows for CNV calling
    """
    global bam_reader

    try:
        # Create BAM reader and calculate coverage
        bam_reader = SimpleBamReader(bam_bytes)
        coverage_data, total_reads = bam_reader.calculate_coverage(
            chrom=chromosome,
            chroms=chromosomes,
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

        # Calculate median coverage to detect sample quality
        coverages = [w['coverage'] for w in windows if w['coverage'] > 0]
        if not coverages:
            return {'error': 'No coverage data found'}

        median_cov = float(np.median(coverages))
        mean_cov = float(np.mean(coverages))

        print(f"Coverage stats: median={median_cov:.1f}x, mean={mean_cov:.1f}x")

        # Classify coverage level
        if median_cov < 15:
            coverage_class = "low"
            print("⚠️ LOW COVERAGE DETECTED (<15x)")
        elif median_cov < 30:
            coverage_class = "medium"
            print("📊 MEDIUM COVERAGE (15-30x)")
        else:
            coverage_class = "high"
            print("✅ HIGH COVERAGE (>30x)")

        # Normalize coverage
        for w in windows:
            w['normalized'] = w['coverage'] / median_cov if median_cov > 0 else 0

        # Choose detection mode
        if use_manual_thresholds:
            print(f"Using MANUAL thresholds: amp={amp_threshold}, del={del_threshold}, min_windows={min_windows_override}")
            cnvs = detect_cnvs_manual(windows, amp_threshold, del_threshold, min_windows_override, median_cov)
        else:
            print("Using ADAPTIVE thresholds based on coverage quality")
            cnvs = detect_cnvs_adaptive(windows, coverage_class, median_cov)

        return {
            'total_reads': total_reads,
            'coverageData': windows,
            'cnvs': cnvs,
            'windowSize': window_size,
            'chromosomes': list(coverage_data.keys()),
            'method': 'pyodide-python-streaming',
            'coverage_stats': {
                'median': median_cov,
                'mean': mean_cov,
                'class': coverage_class
            },
            'thresholds_used': {
                'mode': 'manual' if use_manual_thresholds else 'adaptive',
                'amp_threshold': amp_threshold if use_manual_thresholds else None,
                'del_threshold': del_threshold if use_manual_thresholds else None,
                'min_windows': min_windows_override if use_manual_thresholds else None
            }
        }

    except Exception as e:
        import traceback
        return {
            'error': str(e),
            'traceback': traceback.format_exc()
        }

def detect_cnvs_manual(windows, amp_threshold, del_threshold, min_windows, median_cov):
    """
    Manual CNV detection with user-specified thresholds
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
                if current_cnv and len(current_cnv['windows']) >= min_windows:
                    cnvs.append(summarize_cnv_manual(current_cnv, median_cov))

                current_cnv = {
                    'chromosome': window['chromosome'],
                    'start': window['start'],
                    'end': window['end'],
                    'type': cnv_type,
                    'windows': [window]
                }
        else:
            # No CNV, close current if exists
            if current_cnv and len(current_cnv['windows']) >= min_windows:
                cnvs.append(summarize_cnv_manual(current_cnv, median_cov))
                current_cnv = None

    # Close last CNV
    if current_cnv and len(current_cnv['windows']) >= min_windows:
        cnvs.append(summarize_cnv_manual(current_cnv, median_cov))

    print(f"Detected {len(cnvs)} CNVs with manual thresholds")
    return cnvs

def summarize_cnv_manual(cnv, median_cov):
    """Summarize CNV region with manual thresholds (no adaptive confidence)"""
    windows = cnv['windows']
    coverages = [w['coverage'] for w in windows]
    normalized = [w['normalized'] for w in windows]

    avg_norm = float(np.mean(normalized))
    std_norm = float(np.std(normalized))

    # Simple confidence based on consistency
    if len(windows) >= 7 and std_norm < 0.3:
        confidence = 'high'
    elif len(windows) >= 3 and std_norm < 0.5:
        confidence = 'medium'
    else:
        confidence = 'low'

    return {
        'chromosome': cnv['chromosome'],
        'start': cnv['start'],
        'end': cnv['end'],
        'length': cnv['end'] - cnv['start'],
        'type': cnv['type'],
        'copyNumber': avg_norm,
        'avgCoverage': float(np.mean(coverages)),
        'confidence': confidence,
        'num_windows': len(windows)
    }

def detect_cnvs_adaptive(windows, coverage_class, median_cov):
    """
    Adaptive CNV detection with thresholds based on coverage level
    """

    # Adjust thresholds based on coverage quality
    if coverage_class == "low":
        # More permissive thresholds for low coverage
        amp_threshold = 2.0      # Less strict (was 1.5)
        del_threshold = 0.3      # More strict (was 0.5)
        min_windows = 5          # Require longer regions
        print(f"Using LOW COVERAGE thresholds: amp={amp_threshold}, del={del_threshold}")

    elif coverage_class == "medium":
        # Standard thresholds
        amp_threshold = 1.5
        del_threshold = 0.5
        min_windows = 3
        print(f"Using MEDIUM COVERAGE thresholds: amp={amp_threshold}, del={del_threshold}")

    else:  # high coverage
        # More sensitive detection
        amp_threshold = 1.3      # More sensitive
        del_threshold = 0.7      # More sensitive
        min_windows = 2          # Can be shorter
        print(f"Using HIGH COVERAGE thresholds: amp={amp_threshold}, del={del_threshold}")

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
                if current_cnv and len(current_cnv['windows']) >= min_windows:
                    cnvs.append(summarize_cnv(current_cnv, median_cov, coverage_class))

                current_cnv = {
                    'chromosome': window['chromosome'],
                    'start': window['start'],
                    'end': window['end'],
                    'type': cnv_type,
                    'windows': [window]
                }
        else:
            # No CNV, close current if exists
            if current_cnv and len(current_cnv['windows']) >= min_windows:
                cnvs.append(summarize_cnv(current_cnv, median_cov, coverage_class))
                current_cnv = None

    # Close last CNV
    if current_cnv and len(current_cnv['windows']) >= min_windows:
        cnvs.append(summarize_cnv(current_cnv, median_cov, coverage_class))

    print(f"Detected {len(cnvs)} CNVs with adaptive thresholds")
    return cnvs

def summarize_cnv(cnv, median_cov, coverage_class):
    """Summarize CNV region with confidence based on coverage"""
    windows = cnv['windows']
    coverages = [w['coverage'] for w in windows]
    normalized = [w['normalized'] for w in windows]

    avg_norm = float(np.mean(normalized))
    std_norm = float(np.std(normalized))

    # Confidence scoring adapted to coverage level
    if coverage_class == "low":
        # More stringent confidence for low coverage
        if len(windows) >= 10 and std_norm < 0.3:
            confidence = 'high'
        elif len(windows) >= 5 and std_norm < 0.5:
            confidence = 'medium'
        else:
            confidence = 'low'

    elif coverage_class == "medium":
        # Standard confidence
        if len(windows) >= 7 and std_norm < 0.3:
            confidence = 'high'
        elif len(windows) >= 3 and std_norm < 0.5:
            confidence = 'medium'
        else:
            confidence = 'low'

    else:  # high coverage
        # More lenient confidence (data is more reliable)
        if len(windows) >= 5 and std_norm < 0.4:
            confidence = 'high'
        elif len(windows) >= 2 and std_norm < 0.6:
            confidence = 'medium'
        else:
            confidence = 'low'

    return {
        'chromosome': cnv['chromosome'],
        'start': cnv['start'],
        'end': cnv['end'],
        'length': cnv['end'] - cnv['start'],
        'type': cnv['type'],
        'avgCoverage': float(np.mean(coverages)),
        'copyNumber': avg_norm * 2,  # Assume diploid
        'confidence': confidence,
        'num_windows': len(windows)
    }

def call_variants_from_bam(bam_bytes, chromosomes=None, min_depth=10, min_base_quality=20, min_mapping_quality=20, min_variant_reads=3, min_allele_freq=0.05):
    """
    Call variants from BAM file using pileup-based approach

    Args:
        bam_bytes: BAM file data (BGZF compressed)
        chromosomes: List of chromosomes to process (None = all)
        min_depth: Minimum read depth at position
        min_base_quality: Minimum base quality score (Phred)
        min_mapping_quality: Minimum mapping quality
        min_variant_reads: Minimum number of reads supporting variant
        min_allele_freq: Minimum variant allele frequency (0-1)

    Returns:
        Dictionary with variants array and metadata
    """
    print(f"Starting variant calling with filters:")
    print(f"  Min depth: {min_depth}")
    print(f"  Min base quality: {min_base_quality}")
    print(f"  Min mapping quality: {min_mapping_quality}")
    print(f"  Min variant reads: {min_variant_reads}")
    print(f"  Min allele frequency: {min_allele_freq}")

    # Create BAM reader
    bam_reader = SimpleBamReader(bam_bytes)
    bam_reader.read_header()

    # Build chromosome filter
    chrom_filter = None
    if chromosomes:
        chrom_filter = set(chromosomes)
        print(f"Processing chromosomes: {', '.join(chromosomes)}")

    # Filter references
    target_refs = []
    for i, (ref_name, ref_len) in enumerate(zip(bam_reader.references, bam_reader.reference_lengths)):
        if chrom_filter and ref_name not in chrom_filter:
            continue
        target_refs.append((i, ref_name, ref_len))

    print(f"Processing {len(target_refs)} chromosomes/contigs")

    # Collect reads for all target chromosomes in ONE pass through BAM
    # This is much more efficient than streaming through the file once per chromosome
    print("\\nPhase 1: Collecting reads from BAM file...")
    chrom_reads_dict = collect_reads_for_all_chromosomes(
        bam_reader,
        target_refs,
        min_mapping_quality
    )

    # Now call variants for each chromosome
    print("\\nPhase 2: Calling variants from pileup...")
    variants = []
    total_positions = 0
    positions_with_variants = 0

    total_chroms = len(target_refs)
    for chrom_idx, (ref_id, ref_name, ref_len) in enumerate(target_refs, 1):
        print(f"\\n[{chrom_idx}/{total_chroms}] Processing {ref_name} ({ref_len:,} bp)...")

        chrom_reads = chrom_reads_dict.get(ref_id, [])

        if not chrom_reads:
            print(f"  ⚠ No reads found for {ref_name}")
            continue

        print(f"  Using {len(chrom_reads):,} high-quality reads")

        # Generate pileup and call variants
        chrom_variants = call_variants_from_pileup(
            chrom_reads,
            ref_name,
            ref_len,
            min_depth,
            min_base_quality,
            min_variant_reads,
            min_allele_freq
        )

        variants.extend(chrom_variants)
        positions_with_variants += len(chrom_variants)

    print(f"✓ Variant calling complete: {len(variants)} variants found")

    # Sort variants by chromosome and position
    variants.sort(key=lambda v: (v['chrom'], v['pos']))

    return {
        'variants': variants,
        'total_variants': len(variants),
        'filters': {
            'min_depth': min_depth,
            'min_base_quality': min_base_quality,
            'min_mapping_quality': min_mapping_quality,
            'min_variant_reads': min_variant_reads,
            'min_allele_freq': min_allele_freq
        },
        'chromosomes_processed': [name for _, name, _ in target_refs]
    }

def collect_reads_for_all_chromosomes(bam_reader, target_refs, min_mapping_quality):
    """
    Collect reads for all target chromosomes in ONE pass through BAM
    Much more efficient than reading the file once per chromosome!

    Args:
        bam_reader: SimpleBamReader instance
        target_refs: List of (ref_id, ref_name, ref_len) tuples
        min_mapping_quality: Minimum mapping quality

    Returns:
        Dictionary mapping ref_id to list of reads
    """
    # Build set of target ref IDs for fast lookup
    target_ref_ids = {ref_id for ref_id, _, _ in target_refs}
    ref_names = {ref_id: ref_name for ref_id, ref_name, _ in target_refs}

    # Initialize dictionary to hold reads for each chromosome
    chrom_reads = {ref_id: [] for ref_id in target_ref_ids}

    # Reset reader to start
    bam_reader.compressed_pos = 0
    bam_reader.uncompressed_buffer = b''
    bam_reader.buffer_offset = 0

    # Re-read header to reset position
    bam_reader.read_header()

    # Stream through all alignments ONCE
    print("  Streaming through BAM file (single pass)...")
    read_count = 0
    kept_count = 0
    last_report = 0

    while True:
        aln = bam_reader.read_alignment()
        if aln is None:
            break

        read_count += 1

        # Progress reporting every 100k reads
        if read_count - last_report >= 100000:
            print(f"    Scanned {read_count:,} reads, kept {kept_count:,}...")
            last_report = read_count

        # Filter by target chromosomes
        ref_id = aln['refID']
        if ref_id not in target_ref_ids:
            continue

        # Skip unmapped, duplicates, secondary
        if aln['is_unmapped'] or aln['is_duplicate'] or aln['is_secondary']:
            continue

        # Filter by mapping quality
        if aln['mapq'] < min_mapping_quality:
            continue

        # Store read info for this chromosome
        chrom_reads[ref_id].append({
            'pos': aln['pos'],
            'seq': aln.get('seq', ''),
            'qual': aln.get('qual', []),
            'flag': aln['flag'],
            'cigar': aln.get('cigar', [])
        })
        kept_count += 1

    print(f"  ✓ Scanned {read_count:,} total reads, kept {kept_count:,} high-quality reads")
    print(f"  ✓ Reads per chromosome:")
    for ref_id in sorted(chrom_reads.keys()):
        ref_name = ref_names.get(ref_id, f"chr{ref_id}")
        print(f"      {ref_name}: {len(chrom_reads[ref_id]):,} reads")

    return chrom_reads

def call_variants_from_pileup(reads, chrom_name, chrom_len, min_depth, min_base_quality, min_variant_reads, min_allele_freq):
    """
    Generate pileup and call variants
    """
    variants = []

    # Build position-to-reads mapping (pileup)
    # To save memory, we'll process in windows
    window_size = 1000000  # 1MB windows
    num_windows = (chrom_len // window_size) + 1

    print(f"  Processing {chrom_name} in {num_windows} windows ({window_size:,}bp each)...")

    for window_idx in range(num_windows):
        window_start = window_idx * window_size
        window_end = min(window_start + window_size, chrom_len)

        if window_idx % 10 == 0 and window_idx > 0:
            print(f"    Processing window {window_idx}/{num_windows} ({window_start:,}-{window_end:,})...")

        # Build pileup for this window
        pileup = {}

        for read in reads:
            read_start = read['pos']
            read_seq = read['seq']
            read_qual = read['qual']

            if not read_seq:
                continue

            # Only process if read overlaps this window
            read_end = read_start + len(read_seq)
            if read_end < window_start or read_start > window_end:
                continue

            # Add each base to pileup
            for i, (base, qual) in enumerate(zip(read_seq, read_qual)):
                pos = read_start + i

                # Check if in window
                if pos < window_start or pos >= window_end:
                    continue

                # Filter by base quality
                if qual < min_base_quality:
                    continue

                if pos not in pileup:
                    pileup[pos] = {'A': 0, 'C': 0, 'G': 0, 'T': 0, 'N': 0}

                base_upper = base.upper()
                if base_upper in pileup[pos]:
                    pileup[pos][base_upper] += 1

        # Call variants from pileup in this window
        for pos in sorted(pileup.keys()):
            bases = pileup[pos]
            total_depth = sum(bases.values())

            if total_depth < min_depth:
                continue

            # Find most common base (reference)
            ref_base = max(bases.keys(), key=lambda b: bases[b])
            ref_count = bases[ref_base]

            # Check each alternate base
            for alt_base in ['A', 'C', 'G', 'T']:
                if alt_base == ref_base or alt_base == 'N':
                    continue

                alt_count = bases[alt_base]

                if alt_count < min_variant_reads:
                    continue

                allele_freq = alt_count / total_depth

                if allele_freq < min_allele_freq:
                    continue

                # Calculate quality score (Phred-scaled)
                # Simple quality based on allele frequency and depth (no SciPy needed)
                # Higher depth + higher AF = higher confidence
                # Formula: Q = -10 * log10(error_rate)
                # Estimate error rate based on how confident we are this isn't sequencing error
                base_error = 0.01  # 1% sequencing error rate
                # Probability this many errors occurred by chance
                error_prob = base_error ** alt_count
                qual = min(-10 * math.log10(max(error_prob, 1e-100)), 999)

                # Determine variant type
                var_type = 'SNV'  # For now, only SNVs (would need CIGAR for indels)

                variants.append({
                    'chrom': chrom_name,
                    'pos': pos + 1,  # VCF is 1-based
                    'ref': ref_base,
                    'alt': alt_base,
                    'qual': float(qual),
                    'type': var_type,
                    'depth': total_depth,
                    'ref_count': ref_count,
                    'alt_count': alt_count,
                    'allele_freq': float(allele_freq)
                })

    print(f"  ✓ Found {len(variants):,} variants in {chrom_name}")
    return variants

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
      const errorMessage = error?.message || error?.toString() || 'Unknown initialization error';
      const errorStack = error?.stack || '';

      console.error('Pyodide initialization failed:', error);
      console.error('Error details:', { message: errorMessage, stack: errorStack });

      self.postMessage({
        type: 'error',
        error: errorMessage,
        stack: errorStack,
        details: String(error)
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
    const chromosomes = options.chromosomes || null;

    // Manual threshold parameters
    const useManualThresholds = options.useManualThresholds || false;
    const ampThreshold = options.ampThreshold || 1.5;
    const delThreshold = options.delThreshold || 0.5;
    const minWindows = options.minWindows || 3;

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

    // Store chromosomes list if provided
    if (chromosomes) {
      pyodide.globals.set('chromosomes_js', chromosomes);
    }

    self.postMessage({
      type: 'analysis-progress',
      stage: 'parsing',
      message: 'Parsing BAM header...',
      progress: 30
    });

    // Build Python call with chromosomes parameter
    const chromParam = chromosomes
      ? 'chromosomes=list(chromosomes_js.to_py())'
      : chromosome
        ? `chromosome='${chromosome}'`
        : 'chromosome=None';

    // Run Python analysis
    const resultJson = await pyodide.runPythonAsync(`
import json

# Get BAM data from JavaScript
bam_bytes = bytes(bam_data_js.to_py())

# Run analysis
result = analyze_bam_coverage(
    bam_bytes,
    window_size=${windowSize},
    ${chromParam},
    use_manual_thresholds=${useManualThresholds ? 'True' : 'False'},
    amp_threshold=${ampThreshold},
    del_threshold=${delThreshold},
    min_windows_override=${minWindows}
)

# Convert to JSON
json.dumps(result)
    `);

    // Clean up
    pyodide.globals.delete('bam_data_js');
    if (chromosomes) {
      pyodide.globals.delete('chromosomes_js');
    }

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
 * Call variants from BAM file using Python pileup-based approach
 */
async function callVariants(fileData, options = {}) {
  if (!isInitialized) {
    await initializePyodide();
  }

  try {
    const chromosomes = options.chromosomes || null;
    const minDepth = options.minDepth || 10;
    const minBaseQuality = options.minBaseQuality || 20;
    const minMappingQuality = options.minMappingQuality || 20;
    const minVariantReads = options.minVariantReads || 3;
    const minAlleleFreq = options.minAlleleFreq || 0.05;

    // Send progress updates
    self.postMessage({
      type: 'variant-calling-progress',
      stage: 'loading',
      message: 'Loading BAM file into Python...',
      progress: 10
    });

    // Convert ArrayBuffer to Uint8Array for Python
    const bamBytes = new Uint8Array(fileData);

    // Store BAM data in Pyodide memory
    pyodide.globals.set('bam_data_js', bamBytes);

    // Store chromosomes list if provided
    if (chromosomes) {
      pyodide.globals.set('chromosomes_js', chromosomes);
    }

    self.postMessage({
      type: 'variant-calling-progress',
      stage: 'parsing',
      message: 'Parsing BAM and generating pileup...',
      progress: 30
    });

    // Build Python call with parameters
    const chromParam = chromosomes
      ? 'chromosomes=list(chromosomes_js.to_py())'
      : 'chromosomes=None';

    // Run Python variant calling
    const resultJson = await pyodide.runPythonAsync(`
import json

# Get BAM data from JavaScript
bam_bytes = bytes(bam_data_js.to_py())

# Run variant calling
result = call_variants_from_bam(
    bam_bytes,
    ${chromParam},
    min_depth=${minDepth},
    min_base_quality=${minBaseQuality},
    min_mapping_quality=${minMappingQuality},
    min_variant_reads=${minVariantReads},
    min_allele_freq=${minAlleleFreq}
)

# Convert to JSON
json.dumps(result)
    `);

    // Clean up
    pyodide.globals.delete('bam_data_js');
    if (chromosomes) {
      pyodide.globals.delete('chromosomes_js');
    }

    const result = JSON.parse(resultJson);

    if (result.error) {
      throw new Error(result.error + '\n' + (result.traceback || ''));
    }

    self.postMessage({
      type: 'variant-calling-progress',
      stage: 'complete',
      message: 'Variant calling complete!',
      progress: 100
    });

    return result;

  } catch (error) {
    throw new Error(`Variant calling failed: ${error.message}`);
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

      case 'call-variants':
        const variantResult = await callVariants(payload.fileData, payload.options);
        self.postMessage({
          type: 'call-variants-response',
          id,
          result: variantResult
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
