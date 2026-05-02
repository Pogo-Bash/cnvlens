/**
 * Pyodide Web Worker
 * Full Python-based bioinformatics analysis pipeline
 * Uses NumPy for genomics analysis
 */

// Log worker type for debugging
console.log('Pyodide worker starting...');
console.log('Worker type:', typeof importScripts !== 'undefined' ? 'CLASSIC' : 'MODULE');

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

      // Import Pyodide using importScripts (classic worker).
      const baseMatch = self.location.pathname.match(/^(.*?)(?:\/src\/|\/assets\/)/);
      const basePath = baseMatch ? baseMatch[1] + '/' : '/';
      importScripts(basePath + 'pyodide/pyodide.js');

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

      try {
        console.log('Loading NumPy...');
        await pyodide.loadPackage('numpy');
        console.log('NumPy loaded');
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

try:
    import numpy as np
    print(f"NumPy {np.__version__} loaded")
except ImportError as e:
    print(f"NumPy import failed: {e}")
    raise

import json
import struct
import gzip
import math
import time
from collections import defaultdict
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
import time
from collections import defaultdict

# ═══════════════════════════════════════════════════════════
# BAI INDEX READER — Part 2
# ═══════════════════════════════════════════════════════════

class BaiIndexReader:
    """
    Parse BAI binary index format per SAMtools spec.
    Virtual offset = (coffset << 16) | uoffset
    """

    def __init__(self, bai_data):
        self.data = bai_data
        self.pos = 0
        self.references = []
        self._parse()

    def _read_int32(self):
        val = struct.unpack_from('<i', self.data, self.pos)[0]
        self.pos += 4
        return val

    def _read_uint32(self):
        val = struct.unpack_from('<I', self.data, self.pos)[0]
        self.pos += 4
        return val

    def _read_uint64(self):
        val = struct.unpack_from('<Q', self.data, self.pos)[0]
        self.pos += 8
        return val

    def _parse(self):
        # Magic: BAI\\1
        magic = self.data[0:4]
        if magic != b'BAI\\x01':
            raise ValueError(f"Not a valid BAI file (magic: {magic!r})")
        self.pos = 4

        n_ref = self._read_int32()

        for _ in range(n_ref):
            ref_data = {'bins': {}, 'intervals': []}

            # Bins
            n_bin = self._read_int32()
            for _ in range(n_bin):
                bin_id = self._read_uint32()
                n_chunk = self._read_int32()
                chunks = []
                for _ in range(n_chunk):
                    chunk_beg = self._read_uint64()
                    chunk_end = self._read_uint64()
                    chunks.append((chunk_beg, chunk_end))
                ref_data['bins'][bin_id] = chunks

            # Linear index
            n_intv = self._read_int32()
            for _ in range(n_intv):
                ioffset = self._read_uint64()
                ref_data['intervals'].append(ioffset)

            self.references.append(ref_data)

    @staticmethod
    def _reg2bins(beg, end):
        """Return list of bins that overlap [beg, end) per BAM spec binning scheme."""
        bins = [0]
        for shift, offset in [(26, 1), (23, 9), (20, 73), (17, 585), (14, 4681)]:
            for k in range(offset + (beg >> shift), offset + (end >> shift) + 1):
                bins.append(k)
        return bins

    def get_chunks_for_region(self, ref_id, start, end):
        """Get chunks covering a specific region [start, end)."""
        if ref_id >= len(self.references):
            return []

        ref = self.references[ref_id]
        bins_to_check = self._reg2bins(start, end)

        chunks = []
        for bin_id in bins_to_check:
            if bin_id in ref['bins']:
                chunks.extend(ref['bins'][bin_id])

        if not chunks:
            return []

        # Use linear index for lower bound
        lin_idx = start >> 14  # 16kb tiles
        min_offset = 0
        if lin_idx < len(ref['intervals']):
            min_offset = ref['intervals'][lin_idx]

        # Filter chunks by linear index lower bound
        filtered = [(beg, end_vo) for beg, end_vo in chunks if end_vo > min_offset]

        # Merge overlapping chunks
        if not filtered:
            return []
        filtered.sort()
        merged = [filtered[0]]
        for beg, end_vo in filtered[1:]:
            if beg <= merged[-1][1]:
                merged[-1] = (merged[-1][0], max(merged[-1][1], end_vo))
            else:
                merged.append((beg, end_vo))

        return merged

    def get_chunks_for_chromosome(self, ref_id):
        """Get all chunks for an entire chromosome."""
        if ref_id >= len(self.references):
            return []

        ref = self.references[ref_id]
        chunks = []
        for bin_id, bin_chunks in ref['bins'].items():
            chunks.extend(bin_chunks)

        if not chunks:
            return []

        chunks.sort()
        # Merge overlapping
        merged = [chunks[0]]
        for beg, end_vo in chunks[1:]:
            if beg <= merged[-1][1]:
                merged[-1] = (merged[-1][0], max(merged[-1][1], end_vo))
            else:
                merged.append((beg, end_vo))

        return merged


# ═══════════════════════════════════════════════════════════
# STREAMING BAM READER — Parts 1 & 2
# ═══════════════════════════════════════════════════════════

# Pre-computed lookup table for BAM base encoding
_SEQ_LOOKUP = np.array(list('=ACMGRSVTWYHKDBN'), dtype='U1')

class SimpleBamReader:
    """
    Streaming BAM file reader with BGZF decompression.
    Supports optional BAI index for seeking.
    """

    def __init__(self, bam_data):
        self.compressed_data = bam_data
        self.compressed_pos = 0
        self.uncompressed_buffer = b''
        self.buffer_offset = 0
        self.references = []
        self.reference_lengths = []
        self.bai_index = None

    def set_index(self, bai_data):
        """Attach a BAI index for seek-based iteration."""
        self.bai_index = BaiIndexReader(bai_data)

    def read_bgzf_block(self):
        """Read and decompress one BGZF block."""
        if self.compressed_pos >= len(self.compressed_data):
            return None

        try:
            start_pos = self.compressed_pos

            if start_pos + 18 > len(self.compressed_data):
                return None

            header = self.compressed_data[start_pos:start_pos+18]

            if header[0:2] != b'\\x1f\\x8b':
                return None

            bsize = struct.unpack('<H', header[16:18])[0]
            block_size = bsize + 1

            if start_pos + block_size > len(self.compressed_data):
                return None

            block = self.compressed_data[start_pos:start_pos+block_size]
            decompressed = gzip.decompress(block)
            self.compressed_pos = start_pos + block_size

            return decompressed

        except Exception as e:
            print(f"Error reading BGZF block at pos {self.compressed_pos}: {e}")
            return None

    def fill_buffer(self, min_bytes=65536):
        """Fill uncompressed buffer by reading up to 8 BGZF blocks."""
        blocks_read = 0
        while len(self.uncompressed_buffer) - self.buffer_offset < min_bytes and blocks_read < 8:
            block = self.read_bgzf_block()
            if block is None:
                break
            self.uncompressed_buffer += block
            blocks_read += 1

    def read_bytes(self, n):
        """Read n bytes from uncompressed stream."""
        while len(self.uncompressed_buffer) - self.buffer_offset < n:
            block = self.read_bgzf_block()
            if block is None:
                return None
            self.uncompressed_buffer += block

        data = self.uncompressed_buffer[self.buffer_offset:self.buffer_offset+n]
        self.buffer_offset += n

        # Trim buffer at 4MB to save memory
        if self.buffer_offset > 4194304:
            self.uncompressed_buffer = self.uncompressed_buffer[self.buffer_offset:]
            self.buffer_offset = 0

        return data

    def seek_to_voffset(self, voffset):
        """Seek to a virtual offset (coffset << 16 | uoffset)."""
        coffset = voffset >> 16
        uoffset = voffset & 0xFFFF

        self.compressed_pos = coffset
        self.uncompressed_buffer = b''
        self.buffer_offset = 0

        # Fill buffer and advance to uoffset
        self.fill_buffer(uoffset + 65536)
        self.buffer_offset = uoffset

    def read_header(self):
        """Read BAM header from first BGZF block."""
        self.fill_buffer(65536)

        magic = self.read_bytes(4)
        if magic != b'BAM\\x01':
            raise ValueError(f"Not a valid BAM file (magic: {magic!r})")

        l_text_bytes = self.read_bytes(4)
        l_text = struct.unpack('<I', l_text_bytes)[0]
        self.read_bytes(l_text)

        n_ref_bytes = self.read_bytes(4)
        n_ref = struct.unpack('<I', n_ref_bytes)[0]

        for _ in range(n_ref):
            l_name_bytes = self.read_bytes(4)
            l_name = struct.unpack('<I', l_name_bytes)[0]
            name_bytes = self.read_bytes(l_name)
            name = name_bytes[:-1].decode('utf-8')
            l_ref_bytes = self.read_bytes(4)
            l_ref = struct.unpack('<I', l_ref_bytes)[0]
            self.references.append(name)
            self.reference_lengths.append(l_ref)

    def read_alignment(self):
        """Read a single alignment record with NumPy-vectorized decoding."""
        block_size_bytes = self.read_bytes(4)
        if block_size_bytes is None or len(block_size_bytes) < 4:
            return None

        block_size = struct.unpack('<I', block_size_bytes)[0]

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

        # Read name (skip)
        read_name_data = self.read_bytes(l_read_name)
        if read_name_data is None:
            return None

        # CIGAR (skip)
        cigar_bytes = n_cigar_op * 4
        cigar_data = self.read_bytes(cigar_bytes)
        if cigar_data is None and cigar_bytes > 0:
            return None

        # Sequence — NumPy vectorized decoding (Part 1.1)
        seq_bytes_len = (l_seq + 1) // 2
        seq_data = self.read_bytes(seq_bytes_len)

        seq = ''
        if seq_data and l_seq > 0:
            raw = np.frombuffer(seq_data, dtype=np.uint8)
            # Extract high and low nibbles
            high = (raw >> 4) & 0xF
            low = raw & 0xF
            # Interleave: high[0], low[0], high[1], low[1], ...
            nibbles = np.empty(len(raw) * 2, dtype=np.uint8)
            nibbles[0::2] = high
            nibbles[1::2] = low
            # Trim to actual sequence length
            nibbles = nibbles[:l_seq]
            # Look up bases
            seq = ''.join(_SEQ_LOOKUP[nibbles])

        # Quality scores — as numpy array (Part 1.1)
        qual_data = self.read_bytes(l_seq)
        qual = np.frombuffer(qual_data, dtype=np.uint8).copy() if qual_data and l_seq > 0 else np.array([], dtype=np.uint8)

        # Skip remaining auxiliary data
        bytes_read = 32 + l_read_name + cigar_bytes + seq_bytes_len + l_seq
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
            'is_reverse': (flag & 0x10) != 0,
        }

    def iterate_chunks(self, chunks):
        """Generator yielding alignments from indexed chunks."""
        for chunk_beg, chunk_end in chunks:
            self.seek_to_voffset(chunk_beg)
            # Read alignments until we pass chunk_end
            while True:
                # Check if we've passed the end virtual offset
                current_coffset = self.compressed_pos
                current_uoffset = self.buffer_offset
                current_voffset = (current_coffset << 16) | min(current_uoffset, 0xFFFF)

                # Approximate: if compressed pos exceeds chunk end's coffset, stop
                end_coffset = chunk_end >> 16
                if current_coffset > end_coffset:
                    break

                aln = self.read_alignment()
                if aln is None:
                    break
                yield aln

    def calculate_coverage(self, chrom=None, chroms=None, window_size=10000):
        """Calculate coverage across genome."""
        t_start = time.time()
        self.read_header()
        t_header = time.time()
        print(f"  [timing] Header read: {t_header - t_start:.3f}s")

        # Build chromosome filter set
        chrom_filter = None
        if chroms:
            chrom_filter = set(chroms)
        elif chrom:
            chrom_filter = {chrom}

        # Initialize coverage arrays
        coverage = {}
        for ref_name, ref_len in zip(self.references, self.reference_lengths):
            if chrom_filter and ref_name not in chrom_filter:
                continue
            num_windows = (ref_len // window_size) + 1
            coverage[ref_name] = np.zeros(num_windows, dtype=np.int32)

        if not coverage:
            print("No matching chromosomes found in BAM file")
            return {}, 0

        # Stream through alignments (use index if available)
        read_count = 0
        last_report = 0

        if self.bai_index and chrom_filter:
            # Indexed path: seek to relevant chunks
            for ref_name in chrom_filter:
                if ref_name not in coverage:
                    continue
                ref_id = self.references.index(ref_name) if ref_name in self.references else -1
                if ref_id < 0:
                    continue
                chunks = self.bai_index.get_chunks_for_chromosome(ref_id)
                if not chunks:
                    continue
                for aln in self.iterate_chunks(chunks):
                    read_count += 1
                    if aln['is_unmapped'] or aln['is_duplicate'] or aln['is_secondary']:
                        continue
                    if aln['refID'] != ref_id:
                        continue
                    window_idx = aln['pos'] // window_size
                    if 0 <= window_idx < len(coverage[ref_name]):
                        coverage[ref_name][window_idx] += 1
        else:
            # Full scan path
            while True:
                aln = self.read_alignment()
                if aln is None:
                    break
                read_count += 1
                if read_count - last_report >= 100000:
                    print(f"  Processed {read_count:,} reads...")
                    last_report = read_count
                if aln['is_unmapped'] or aln['is_duplicate'] or aln['is_secondary']:
                    continue
                if aln['refID'] < 0 or aln['refID'] >= len(self.references):
                    continue
                ref_name = self.references[aln['refID']]
                if ref_name not in coverage:
                    continue
                window_idx = aln['pos'] // window_size
                if 0 <= window_idx < len(coverage[ref_name]):
                    coverage[ref_name][window_idx] += 1

        t_scan = time.time()
        print(f"  [timing] Alignment scan: {t_scan - t_header:.3f}s ({read_count:,} reads)")
        return coverage, read_count


# Global BAM reader instance
bam_reader = None

def analyze_bam_coverage(bam_bytes, window_size=10000, chromosome=None, chromosomes=None,
                         use_manual_thresholds=False, amp_threshold=None, del_threshold=None,
                         min_windows_override=None, bai_bytes=None, reference_seqs=None,
                         segmentation_method=None):
    """
    Analyze BAM file and calculate coverage with CNV detection.
    """
    global bam_reader
    t_total_start = time.time()

    try:
        bam_reader = SimpleBamReader(bam_bytes)

        if bai_bytes:
            bam_reader.set_index(bai_bytes)
            print("BAI index loaded - using indexed access")

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

        coverages = [w['coverage'] for w in windows if w['coverage'] > 0]
        if not coverages:
            return {'error': 'No coverage data found'}

        median_cov = float(np.median(coverages))
        mean_cov = float(np.mean(coverages))

        if median_cov < 15:
            coverage_class = "low"
        elif median_cov < 30:
            coverage_class = "medium"
        else:
            coverage_class = "high"

        for w in windows:
            w['normalized'] = w['coverage'] / median_cov if median_cov > 0 else 0

        # GC correction if reference provided (Part 4.1)
        gc_corrected = False
        if reference_seqs:
            try:
                windows = apply_gc_correction(windows, reference_seqs, window_size)
                gc_corrected = True
            except Exception as e:
                print(f"GC correction failed: {e}")

        # N-content mask — excludes assembly gaps (Part 4.2)
        if reference_seqs:
            windows = apply_n_mask(windows, reference_seqs, window_size)

        # Choose detection mode
        # Determine segmentation method
        if segmentation_method is None:
            segmentation_method = 'cbs_lite' if reference_seqs else 'threshold'

        if use_manual_thresholds:
            cnvs = detect_cnvs_manual(windows, amp_threshold, del_threshold, min_windows_override, median_cov)
        elif segmentation_method == 'cbs_lite':
            cnvs = detect_cnvs_cbs_lite(windows, coverage_class, median_cov)
        else:
            cnvs = detect_cnvs_adaptive(windows, coverage_class, median_cov)

        # Build warnings (Part 4.5)
        warnings = []
        if not reference_seqs:
            warnings.append("No reference FASTA - GC correction skipped")
        if not bai_bytes:
            warnings.append("No BAI index - full file scan performed")
        warnings.append("Tumor-only calling - no normal reference panel used")
        warnings.append(f"Detection method: {segmentation_method}")

        t_total = time.time() - t_total_start
        print(f"  [timing] Total CNV analysis: {t_total:.3f}s")

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
                'mode': 'manual' if use_manual_thresholds else segmentation_method,
                'amp_threshold': amp_threshold if use_manual_thresholds else None,
                'del_threshold': del_threshold if use_manual_thresholds else None,
                'min_windows': min_windows_override if use_manual_thresholds else None
            },
            'gc_corrected': gc_corrected,
            'warnings': warnings,
            'timing_seconds': t_total
        }

    except Exception as e:
        import traceback
        return {
            'error': str(e),
            'traceback': traceback.format_exc()
        }


# ═══════════════════════════════════════════════════════════
# GC CORRECTION — Part 4.1
# ═══════════════════════════════════════════════════════════

def apply_gc_correction(windows, reference_seqs, window_size, method='polyfit'):
    """
    Apply GC content correction via polynomial regression.

    Fits in log-space for stability at GC extremes, then exponentiates
    back to linear so downstream consumers (thresholds, CBS-lite, segment
    means) all operate on linear ratios. This gains fitting stability but
    keeps the heteroscedastic variance in the CBS input — acceptable
    tradeoff for lite usage; log-space CBS would need thresholds reworked.

    method: 'polyfit' (degree-2, default) or 'loess' (not yet implemented).
    """
    if method == 'loess':
        raise NotImplementedError("LOESS GC correction not yet implemented; use 'polyfit'")
    gc_fractions = []
    valid_indices = []

    for i, w in enumerate(windows):
        chrom = w['chromosome']
        if chrom not in reference_seqs:
            continue
        seq = reference_seqs[chrom]
        start = w['start']
        end = min(w['end'], len(seq))
        if end <= start:
            continue
        window_seq = seq[start:end].upper()
        gc_count = window_seq.count('G') + window_seq.count('C')
        total = len(window_seq) - window_seq.count('N')
        if total < window_size * 0.5:
            continue
        gc_frac = gc_count / total
        gc_fractions.append(gc_frac)
        valid_indices.append(i)

    if len(gc_fractions) < 10:
        return windows

    gc_arr = np.array(gc_fractions)
    cov_arr = np.array([windows[i]['normalized'] for i in valid_indices])

    # Fit degree-2 polynomial in log-space for stability at GC extremes
    mask = cov_arr > 0
    if mask.sum() < 10:
        return windows

    log_cov = np.log(cov_arr[mask])
    coeffs = np.polyfit(gc_arr[mask], log_cov, 2)
    log_predicted = np.polyval(coeffs, gc_arr)
    predicted = np.exp(log_predicted)

    # Normalize: divide observed by predicted
    for j, idx in enumerate(valid_indices):
        if predicted[j] > 0.1:
            windows[idx]['normalized'] = windows[idx]['normalized'] / predicted[j]

    print(f"  GC correction applied to {len(valid_indices)} windows")
    return windows


# ═══════════════════════════════════════════════════════════
# N-CONTENT MASK — Part 4.2
# (Excludes assembly gaps/N-runs; does NOT replace a true
# mappability track like ENCODE 36-mer uniqueness)
# ═══════════════════════════════════════════════════════════

def apply_n_mask(windows, reference_seqs, window_size, n_threshold=0.5):
    """Exclude windows where reference is mostly Ns (assembly gaps)."""
    masked_count = 0
    for w in windows:
        chrom = w['chromosome']
        if chrom not in reference_seqs:
            continue
        seq = reference_seqs[chrom]
        start = w['start']
        end = min(w['end'], len(seq))
        if end <= start:
            continue
        window_seq = seq[start:end].upper()
        n_frac = window_seq.count('N') / len(window_seq)
        if n_frac > n_threshold:
            w['masked'] = True
            w['normalized'] = 0.0
            masked_count += 1

    if masked_count > 0:
        print(f"  N-mask: excluded {masked_count} windows (>{n_threshold*100:.0f}% N)")
    return windows


# ═══════════════════════════════════════════════════════════
# CNV DETECTION — Parts 1 & 4
# ═══════════════════════════════════════════════════════════

def detect_cnvs_manual(windows, amp_threshold, del_threshold, min_windows, median_cov):
    """Manual CNV detection with user-specified thresholds."""
    cnvs = []
    current_cnv = None

    for window in windows:
        if window.get('masked'):
            continue
        norm_cov = window['normalized']
        is_amp = norm_cov >= amp_threshold
        is_del = norm_cov <= del_threshold and norm_cov > 0

        if is_amp or is_del:
            cnv_type = 'amplification' if is_amp else 'deletion'
            if current_cnv and current_cnv['type'] == cnv_type and current_cnv['chromosome'] == window['chromosome']:
                current_cnv['end'] = window['end']
                current_cnv['windows'].append(window)
            else:
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
            if current_cnv and len(current_cnv['windows']) >= min_windows:
                cnvs.append(summarize_cnv_manual(current_cnv, median_cov))
            current_cnv = None

    if current_cnv and len(current_cnv['windows']) >= min_windows:
        cnvs.append(summarize_cnv_manual(current_cnv, median_cov))

    return cnvs

def summarize_cnv_manual(cnv, median_cov):
    """Summarize CNV region with manual thresholds."""
    windows = cnv['windows']
    coverages = [w['coverage'] for w in windows]
    normalized = [w['normalized'] for w in windows]
    avg_norm = float(np.mean(normalized))
    std_norm = float(np.std(normalized))

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
    """Adaptive CNV detection with thresholds based on coverage level."""
    if coverage_class == "low":
        amp_threshold = 2.0
        del_threshold = 0.3
        min_windows = 5
    elif coverage_class == "medium":
        amp_threshold = 1.5
        del_threshold = 0.5
        min_windows = 3
    else:
        amp_threshold = 1.3
        del_threshold = 0.7
        min_windows = 2

    cnvs = []
    current_cnv = None

    for window in windows:
        if window.get('masked'):
            continue
        norm_cov = window['normalized']
        is_amp = norm_cov >= amp_threshold
        is_del = norm_cov <= del_threshold and norm_cov > 0

        if is_amp or is_del:
            cnv_type = 'amplification' if is_amp else 'deletion'
            if current_cnv and current_cnv['type'] == cnv_type and current_cnv['chromosome'] == window['chromosome']:
                current_cnv['end'] = window['end']
                current_cnv['windows'].append(window)
            else:
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
            if current_cnv and len(current_cnv['windows']) >= min_windows:
                cnvs.append(summarize_cnv(current_cnv, median_cov, coverage_class))
            current_cnv = None

    if current_cnv and len(current_cnv['windows']) >= min_windows:
        cnvs.append(summarize_cnv(current_cnv, median_cov, coverage_class))

    return cnvs

def summarize_cnv(cnv, median_cov, coverage_class, t_stat=None):
    """
    Summarize CNV region with confidence scoring.

    Confidence rubric (Part 4.4):
    - High: |t-stat| > 5 AND num_windows >= 5
    - Medium: |t-stat| > 3 AND num_windows >= 3
    - Low: everything else

    When t_stat is not available (threshold mode), falls back to
    window count + stddev heuristic.
    """
    windows = cnv['windows']
    coverages = [w['coverage'] for w in windows]
    normalized = [w['normalized'] for w in windows]
    avg_norm = float(np.mean(normalized))
    std_norm = float(np.std(normalized))

    if t_stat is not None:
        # CBS-lite confidence scoring
        abs_t = abs(t_stat)
        if abs_t > 5 and len(windows) >= 5:
            confidence = 'high'
        elif abs_t > 3 and len(windows) >= 3:
            confidence = 'medium'
        else:
            confidence = 'low'
    else:
        # Fallback heuristic
        if coverage_class == "low":
            if len(windows) >= 10 and std_norm < 0.3:
                confidence = 'high'
            elif len(windows) >= 5 and std_norm < 0.5:
                confidence = 'medium'
            else:
                confidence = 'low'
        elif coverage_class == "medium":
            if len(windows) >= 7 and std_norm < 0.3:
                confidence = 'high'
            elif len(windows) >= 3 and std_norm < 0.5:
                confidence = 'medium'
            else:
                confidence = 'low'
        else:
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
        'copyNumber': avg_norm * 2,
        'confidence': confidence,
        'num_windows': len(windows),
        't_statistic': float(t_stat) if t_stat is not None else None
    }


# ═══════════════════════════════════════════════════════════
# CBS-LITE SEGMENTATION — Part 4.3
# ═══════════════════════════════════════════════════════════

def detect_cnvs_cbs_lite(windows, coverage_class, median_cov, min_segment_windows=3, t_threshold=3.0):
    """
    Recursive binary segmentation (CBS-lite) for CNV detection.

    For each chromosome, find the position that maximizes the t-statistic
    between left and right segments. If t > threshold, split and recurse.
    """
    # Group windows by chromosome
    chrom_windows = defaultdict(list)
    for w in windows:
        if not w.get('masked') and w['normalized'] > 0:
            chrom_windows[w['chromosome']].append(w)

    cnvs = []
    for chrom, chrom_wins in chrom_windows.items():
        if len(chrom_wins) < min_segment_windows * 2:
            continue

        norm_values = np.array([w['normalized'] for w in chrom_wins])
        segments = _segment_recursive(norm_values, 0, len(norm_values), t_threshold, min_segment_windows)

        # Convert segments to CNVs
        for seg_start, seg_end, seg_mean, seg_t in segments:
            if seg_mean > 1.3:
                cnv_type = 'amplification'
            elif seg_mean < 0.7:
                cnv_type = 'deletion'
            else:
                continue  # Normal segment

            seg_windows = chrom_wins[seg_start:seg_end]
            cnv = {
                'chromosome': chrom,
                'start': seg_windows[0]['start'],
                'end': seg_windows[-1]['end'],
                'type': cnv_type,
                'windows': seg_windows
            }
            cnvs.append(summarize_cnv(cnv, median_cov, coverage_class, t_stat=seg_t))

    return cnvs

def _segment_recursive(values, start, end, t_threshold, min_size):
    """Recursively segment an array by maximizing t-statistic at split points."""
    length = end - start
    if length < min_size * 2:
        mean_val = float(np.mean(values[start:end]))
        return [(start, end, mean_val, 0.0)]

    # Find best split point
    best_t = 0.0
    best_pos = -1

    segment = values[start:end]
    n = len(segment)

    # Compute cumulative sums for efficient mean/var calculation
    cumsum = np.cumsum(segment)
    cumsum2 = np.cumsum(segment ** 2)

    for i in range(min_size, n - min_size):
        n_left = i
        n_right = n - i

        sum_left = cumsum[i-1]
        sum_right = cumsum[n-1] - cumsum[i-1]

        mean_left = sum_left / n_left
        mean_right = sum_right / n_right

        sum2_left = cumsum2[i-1]
        sum2_right = cumsum2[n-1] - cumsum2[i-1]

        var_left = sum2_left / n_left - mean_left ** 2
        var_right = sum2_right / n_right - mean_right ** 2

        # Pooled standard error
        var_left = max(var_left, 1e-10)
        var_right = max(var_right, 1e-10)
        se = math.sqrt(var_left / n_left + var_right / n_right)

        if se > 0:
            t_stat = abs(mean_left - mean_right) / se
            if t_stat > best_t:
                best_t = t_stat
                best_pos = i

    if best_t > t_threshold and best_pos > 0:
        # Split and recurse
        left_segments = _segment_recursive(values, start, start + best_pos, t_threshold, min_size)
        right_segments = _segment_recursive(values, start + best_pos, end, t_threshold, min_size)
        return left_segments + right_segments
    else:
        mean_val = float(np.mean(values[start:end]))
        return [(start, end, mean_val, best_t)]


# ═══════════════════════════════════════════════════════════
# VARIANT CALLING — Parts 1 & 3
# ═══════════════════════════════════════════════════════════

def call_variants_from_bam(bam_bytes, chromosomes=None, min_depth=10, min_base_quality=20,
                           min_mapping_quality=20, min_variant_reads=3, min_allele_freq=0.05,
                           min_strand_bias=0.1, bai_bytes=None, reference_seqs=None):
    """
    Call variants from BAM data with correctness filters.

    Args:
        bam_bytes: BAM file data (BGZF compressed)
        chromosomes: List of chromosomes to process (None = all)
        min_depth: Minimum read depth at position
        min_base_quality: Minimum base quality score (Phred)
        min_mapping_quality: Minimum mapping quality
        min_variant_reads: Minimum number of reads supporting variant
        min_allele_freq: Minimum variant allele frequency (0-1)
        min_strand_bias: Min proportion of variant reads on minority strand (0.1 = 10%)
        bai_bytes: Optional BAI index data
        reference_seqs: Optional dict of {chrom: sequence_string} for ref base determination
    """
    t_total_start = time.time()
    print(f"Starting variant calling with filters:")
    print(f"  Min depth: {min_depth}, Min BQ: {min_base_quality}, Min MQ: {min_mapping_quality}")
    print(f"  Min variant reads: {min_variant_reads}, Min AF: {min_allele_freq}")
    print(f"  Min strand bias: {min_strand_bias}")

    bam_reader = SimpleBamReader(bam_bytes)
    if bai_bytes:
        bam_reader.set_index(bai_bytes)
        print("BAI index loaded for variant calling")

    bam_reader.read_header()

    # Build chromosome filter
    chrom_filter = None
    if chromosomes:
        chrom_filter = set(chromosomes)

    target_refs = []
    for i, (ref_name, ref_len) in enumerate(zip(bam_reader.references, bam_reader.reference_lengths)):
        if chrom_filter and ref_name not in chrom_filter:
            continue
        target_refs.append((i, ref_name, ref_len))

    print(f"Processing {len(target_refs)} chromosomes/contigs")

    variants = []
    total_chroms = len(target_refs)

    # Part 1.2: Single-pass optimization when only one chromosome is targeted
    if total_chroms == 1:
        ref_id, ref_name, ref_len = target_refs[0]
        print(f"  Single-chromosome mode: {ref_name} (optimized single pass)")
        t_scan_start = time.time()

        chrom_reads = []
        reads_scanned = 0

        if bam_reader.bai_index:
            # Indexed path
            chunks = bam_reader.bai_index.get_chunks_for_chromosome(ref_id)
            if chunks:
                for aln in bam_reader.iterate_chunks(chunks):
                    reads_scanned += 1
                    if aln['refID'] != ref_id:
                        continue
                    if aln['is_unmapped'] or aln['is_duplicate'] or aln['is_secondary']:
                        continue
                    if aln['mapq'] < min_mapping_quality:
                        continue
                    chrom_reads.append(aln)
        else:
            # Full scan - single pass, no reset needed
            while True:
                aln = bam_reader.read_alignment()
                if aln is None:
                    break
                reads_scanned += 1
                if aln['refID'] != ref_id:
                    continue
                if aln['is_unmapped'] or aln['is_duplicate'] or aln['is_secondary']:
                    continue
                if aln['mapq'] < min_mapping_quality:
                    continue
                chrom_reads.append(aln)

        t_scan = time.time() - t_scan_start
        print(f"  [timing] Scan: {t_scan:.3f}s ({reads_scanned:,} reads, {len(chrom_reads):,} kept)")

        if chrom_reads:
            ref_seq = reference_seqs.get(ref_name) if reference_seqs else None
            chrom_variants = call_variants_from_pileup(
                chrom_reads, ref_name, ref_len,
                min_depth, min_base_quality, min_variant_reads, min_allele_freq,
                min_strand_bias, ref_seq
            )
            variants.extend(chrom_variants)

    else:
        # Multi-chromosome: re-scan per chromosome (no index)
        for chrom_idx, (ref_id, ref_name, ref_len) in enumerate(target_refs, 1):
            print(f"  [{chrom_idx}/{total_chroms}] {ref_name} ({ref_len:,} bp)")
            t_chrom_start = time.time()

            chrom_reads = []

            if bam_reader.bai_index:
                chunks = bam_reader.bai_index.get_chunks_for_chromosome(ref_id)
                if chunks:
                    for aln in bam_reader.iterate_chunks(chunks):
                        if aln['refID'] != ref_id:
                            continue
                        if aln['is_unmapped'] or aln['is_duplicate'] or aln['is_secondary']:
                            continue
                        if aln['mapq'] < min_mapping_quality:
                            continue
                        chrom_reads.append(aln)
            else:
                # Reset and re-scan for each chromosome
                bam_reader.compressed_pos = 0
                bam_reader.uncompressed_buffer = b''
                bam_reader.buffer_offset = 0
                bam_reader.references = []
                bam_reader.reference_lengths = []
                bam_reader.read_header()

                while True:
                    aln = bam_reader.read_alignment()
                    if aln is None:
                        break
                    if aln['refID'] != ref_id:
                        continue
                    if aln['is_unmapped'] or aln['is_duplicate'] or aln['is_secondary']:
                        continue
                    if aln['mapq'] < min_mapping_quality:
                        continue
                    chrom_reads.append(aln)

            t_chrom_scan = time.time() - t_chrom_start
            print(f"    [timing] Scan: {t_chrom_scan:.3f}s, {len(chrom_reads):,} reads")

            if chrom_reads:
                ref_seq = reference_seqs.get(ref_name) if reference_seqs else None
                chrom_variants = call_variants_from_pileup(
                    chrom_reads, ref_name, ref_len,
                    min_depth, min_base_quality, min_variant_reads, min_allele_freq,
                    min_strand_bias, ref_seq
                )
                variants.extend(chrom_variants)
                print(f"    {len(chrom_variants):,} variants")

            import gc
            chrom_reads = None
            gc.collect()

    # Sort variants
    variants.sort(key=lambda v: (v['chrom'], v['pos']))

    t_total = time.time() - t_total_start
    print(f"  [timing] Total variant calling: {t_total:.3f}s")
    print(f"  Total variants: {len(variants)}")

    # Build warnings (Part 3.5)
    warnings = []
    if not reference_seqs:
        warnings.append("No reference FASTA provided - homozygous variants undetectable (reference base inferred from reads)")
    if not bai_bytes:
        warnings.append("No BAI index - full file scan performed")
    warnings.append("No GIAB validation has been performed on this caller")

    return {
        'variants': variants,
        'total_variants': len(variants),
        'filters': {
            'min_depth': min_depth,
            'min_base_quality': min_base_quality,
            'min_mapping_quality': min_mapping_quality,
            'min_variant_reads': min_variant_reads,
            'min_allele_freq': min_allele_freq,
            'min_strand_bias': min_strand_bias
        },
        'chromosomes_processed': [name for _, name, _ in target_refs],
        'reference_used': 'fasta' if reference_seqs else 'inferred_from_reads',
        'warnings': warnings,
        'timing_seconds': t_total
    }


def call_variants_from_pileup(reads, chrom_name, chrom_len, min_depth, min_base_quality,
                              min_variant_reads, min_allele_freq, min_strand_bias=0.1, ref_seq=None):
    """
    Optimized variant calling with NumPy pileup arrays and correctness filters.

    Part 1.3: Uses numpy arrays for coverage and base counts
    Part 1.4: Pre-bins reads by window to avoid O(windows*reads)
    Part 3.2: Strand bias filtering
    Part 3.3: Position-in-read filtering
    Part 3.4: Binomial quality scores
    """
    t_pileup_start = time.time()
    variants = []

    # Filter reads with sequences
    quality_reads = [r for r in reads if r.get('seq') and len(r['seq']) > 0]
    if not quality_reads:
        return variants

    # Part 1.4: Pre-bin reads by 1MB window
    window_size = 1000000
    num_windows = (chrom_len // window_size) + 1
    reads_by_window = defaultdict(list)

    for read in quality_reads:
        read_start = read['pos']
        read_end = read_start + len(read['seq'])
        start_window = max(0, read_start // window_size)
        end_window = min(num_windows - 1, read_end // window_size)
        for w_idx in range(start_window, end_window + 1):
            reads_by_window[w_idx].append(read)

    t_bin = time.time()
    print(f"    [timing] Read binning: {t_bin - t_pileup_start:.3f}s ({len(quality_reads):,} reads -> {len(reads_by_window)} windows)")

    for window_idx in sorted(reads_by_window.keys()):
        window_start = window_idx * window_size
        window_end = min(window_start + window_size, chrom_len)
        window_reads = reads_by_window[window_idx]

        if not window_reads:
            continue

        # Part 1.3: NumPy array for coverage (Pass 1)
        ws = window_end - window_start
        coverage_array = np.zeros(ws, dtype=np.int32)

        for read in window_reads:
            read_start = read['pos']
            read_seq = read['seq']
            read_end = read_start + len(read_seq)

            # Clip to window bounds
            clip_start = max(read_start, window_start) - window_start
            clip_end = min(read_end, window_end) - window_start
            if clip_start < clip_end:
                coverage_array[clip_start:clip_end] += 1

        # Find candidate positions with sufficient depth
        candidate_offsets = np.where(coverage_array >= min_depth)[0]
        if len(candidate_offsets) == 0:
            continue

        # Part 1.3: NumPy 2D array for base counts [5 x window_size]
        # Indices: A=0, C=1, G=2, T=3, N=4
        base_map = {'A': 0, 'C': 1, 'G': 2, 'T': 3, 'N': 4}
        candidate_set = set(candidate_offsets.tolist())

        # For strand bias (Part 3.2): track forward/reverse counts per base per position
        # Shape: [ws, 5, 2] where last dim is [forward, reverse]
        base_strand_counts = {}  # offset -> {base_idx: [fwd, rev]}
        # For position-in-read filter (Part 3.3)
        base_positions = {}  # offset -> {base_idx: [read_positions]}

        for read in window_reads:
            read_start = read['pos']
            read_seq = read['seq']
            read_qual = read.get('qual')
            is_reverse = read.get('is_reverse', False)
            seq_len = len(read_seq)

            if read_qual is None or len(read_qual) == 0:
                continue

            # Handle numpy qual arrays
            if hasattr(read_qual, '__len__'):
                pass  # numpy array or list, both indexable

            for i in range(seq_len):
                pos = read_start + i
                offset = pos - window_start
                if offset < 0 or offset >= ws:
                    continue
                if offset not in candidate_set:
                    continue

                q = int(read_qual[i]) if i < len(read_qual) else 0
                if q < min_base_quality:
                    continue

                base = read_seq[i].upper() if i < len(read_seq) else 'N'
                base_idx = base_map.get(base, 4)

                if offset not in base_strand_counts:
                    base_strand_counts[offset] = {}
                    base_positions[offset] = {}

                if base_idx not in base_strand_counts[offset]:
                    base_strand_counts[offset][base_idx] = [0, 0]
                    base_positions[offset][base_idx] = []

                strand_idx = 1 if is_reverse else 0
                base_strand_counts[offset][base_idx][strand_idx] += 1
                base_positions[offset][base_idx].append(i)

        t_pass2 = time.time()

        # Call variants from pileup data
        for offset in candidate_offsets:
            offset_int = int(offset)
            if offset_int not in base_strand_counts:
                continue

            counts = base_strand_counts[offset_int]
            total_depth = sum(fwd + rev for fwd, rev in counts.values())

            if total_depth < min_depth:
                continue

            pos = window_start + offset_int

            # Determine reference base (Part 3.1)
            if ref_seq and pos < len(ref_seq):
                ref_base_char = ref_seq[pos].upper()
                ref_base_idx = base_map.get(ref_base_char, -1)
            else:
                # Infer from most common base
                ref_base_idx = max(counts.keys(), key=lambda b: sum(counts[b]))
                ref_base_char = 'ACGTN'[ref_base_idx]

            ref_count = sum(counts.get(ref_base_idx, [0, 0]))

            # Check each alternate base
            for alt_idx in range(4):  # A, C, G, T
                if alt_idx == ref_base_idx:
                    continue
                if alt_idx not in counts:
                    continue

                fwd_count, rev_count = counts[alt_idx]
                alt_count = fwd_count + rev_count

                if alt_count < min_variant_reads:
                    continue

                allele_freq = alt_count / total_depth
                if allele_freq < min_allele_freq:
                    continue

                # Part 3.2: Strand bias filter
                minority_strand = min(fwd_count, rev_count)
                strand_bias = minority_strand / alt_count if alt_count > 0 else 0
                if strand_bias < min_strand_bias:
                    continue

                # Part 3.3: Position-in-read filter
                # Filter out variants where >80% of supporting reads have the variant
                # in the first or last 5bp of the read
                if alt_idx in base_positions.get(offset_int, {}):
                    positions_in_read = base_positions[offset_int][alt_idx]
                    if len(positions_in_read) > 0:
                        edge_count = sum(1 for p in positions_in_read if p < 5 or p >= (len(read_seq) - 5))
                        edge_fraction = edge_count / len(positions_in_read)
                        if edge_fraction > 0.8:
                            continue

                # Part 3.4: Quality score - binomial test
                # Null hypothesis: observed alt reads came from sequencing error at rate 0.01
                # P(X >= alt_count | n=total_depth, p=0.01)
                # Use log-space binomial survival function approximation
                error_rate = 0.01
                qual = _binomial_qual_score(alt_count, total_depth, error_rate)

                alt_base_char = 'ACGTN'[alt_idx]
                variants.append({
                    'chrom': chrom_name,
                    'pos': pos + 1,  # VCF is 1-based
                    'ref': ref_base_char,
                    'alt': alt_base_char,
                    'qual': float(qual),
                    'type': 'SNV',
                    'depth': total_depth,
                    'ref_count': ref_count,
                    'alt_count': alt_count,
                    'allele_freq': float(allele_freq),
                    'strand_bias': float(strand_bias)
                })

    t_end = time.time()
    print(f"    [timing] Pileup + calling: {t_end - t_pileup_start:.3f}s, {len(variants):,} variants")
    return variants


def _binomial_qual_score(k, n, p):
    """
    Compute Phred-scaled quality score using a binomial test.

    Tests the null hypothesis that k or more successes in n trials
    occurred by chance with error probability p.

    Uses log-space computation of the binomial survival function:
    P(X >= k) = sum_{i=k}^{n} C(n,i) * p^i * (1-p)^(n-i)

    Returns -10 * log10(P) capped at 999.
    """
    # For computational efficiency, use normal approximation when n*p > 5
    mean = n * p
    if mean > 5:
        # Normal approximation to binomial
        std = math.sqrt(n * p * (1 - p))
        if std == 0:
            return 999.0
        z = (k - 0.5 - mean) / std
        # Approximate upper tail of normal: P(Z > z) ~ exp(-z^2/2) / (z * sqrt(2*pi))
        if z > 0:
            log10_p = -(z * z) / (2 * math.log(10)) - math.log10(z) - 0.5 * math.log10(2 * math.pi)
            qual = -10 * log10_p
        else:
            qual = 0.0
    else:
        # Direct computation in log space for small expected counts
        # P(X >= k) = 1 - sum_{i=0}^{k-1} C(n,i) * p^i * (1-p)^(n-i)
        log_sum = float('-inf')
        log_p = math.log(p) if p > 0 else float('-inf')
        log_1mp = math.log(1 - p)

        for i in range(k):
            log_term = _log_comb(n, i) + i * log_p + (n - i) * log_1mp
            log_sum = _log_add(log_sum, log_term)

        # P(X >= k) = 1 - CDF(k-1)
        cdf = math.exp(log_sum) if log_sum > -500 else 0.0
        survival = 1.0 - cdf
        if survival <= 0:
            qual = 999.0
        else:
            qual = -10 * math.log10(survival)

    return min(qual, 999.0)


def _log_comb(n, k):
    """Log of binomial coefficient using lgamma."""
    if k < 0 or k > n:
        return float('-inf')
    return math.lgamma(n + 1) - math.lgamma(k + 1) - math.lgamma(n - k + 1)


def _log_add(log_a, log_b):
    """Log-space addition: log(exp(a) + exp(b))."""
    if log_a == float('-inf'):
        return log_b
    if log_b == float('-inf'):
        return log_a
    if log_a > log_b:
        return log_a + math.log1p(math.exp(log_b - log_a))
    else:
        return log_b + math.log1p(math.exp(log_a - log_b))


print("Python bioinformatics environment ready")
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

      console.log('Pyodide initialized with bioinformatics support');
      return pyodide;

    } catch (error) {
      const errorMessage = error?.message || error?.toString() || 'Unknown initialization error';
      const errorStack = error?.stack || '';

      console.error('Pyodide initialization failed:', error);

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
    const baiData = options.baiData || null;
    const referenceSeqs = options.referenceSeqs || null;
    const segmentationMethod = options.segmentationMethod || null;

    // Manual threshold parameters
    const useManualThresholds = options.useManualThresholds || false;
    const ampThreshold = options.ampThreshold || 1.5;
    const delThreshold = options.delThreshold || 0.5;
    const minWindows = options.minWindows || 3;

    self.postMessage({
      type: 'analysis-progress',
      stage: 'loading',
      message: 'Loading BAM file into Python...',
      progress: 10
    });

    const bamBytes = new Uint8Array(fileData);
    pyodide.globals.set('bam_data_js', bamBytes);

    if (baiData) {
      const baiBytes = new Uint8Array(baiData);
      pyodide.globals.set('bai_data_js', baiBytes);
    }

    if (chromosomes) {
      pyodide.globals.set('chromosomes_js', chromosomes);
    }

    if (referenceSeqs) {
      pyodide.globals.set('reference_seqs_js', JSON.stringify(referenceSeqs));
    }

    self.postMessage({
      type: 'analysis-progress',
      stage: 'parsing',
      message: 'Parsing BAM header...',
      progress: 30
    });

    const chromParam = chromosomes
      ? 'chromosomes=list(chromosomes_js.to_py())'
      : chromosome
        ? `chromosome='${chromosome}'`
        : 'chromosome=None';

    const baiParam = baiData ? 'bai_bytes=bytes(bai_data_js.to_py())' : 'bai_bytes=None';
    const refParam = referenceSeqs ? 'reference_seqs=json.loads(str(reference_seqs_js))' : 'reference_seqs=None';
    const segParam = segmentationMethod ? `segmentation_method='${segmentationMethod}'` : 'segmentation_method=None';

    const resultJson = await pyodide.runPythonAsync(`
import json

bam_bytes = bytes(bam_data_js.to_py())

result = analyze_bam_coverage(
    bam_bytes,
    window_size=${windowSize},
    ${chromParam},
    use_manual_thresholds=${useManualThresholds ? 'True' : 'False'},
    amp_threshold=${ampThreshold},
    del_threshold=${delThreshold},
    min_windows_override=${minWindows},
    ${baiParam},
    ${refParam},
    ${segParam}
)

json.dumps(result)
    `);

    // Clean up
    pyodide.globals.delete('bam_data_js');
    if (baiData) pyodide.globals.delete('bai_data_js');
    if (chromosomes) pyodide.globals.delete('chromosomes_js');
    if (referenceSeqs) pyodide.globals.delete('reference_seqs_js');

    const result = JSON.parse(resultJson);

    if (result.error) {
      throw new Error(result.error + '\n' + (result.traceback || ''));
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
    const minStrandBias = options.minStrandBias || 0.1;
    const baiData = options.baiData || null;
    const referenceSeqs = options.referenceSeqs || null;

    self.postMessage({
      type: 'variant-calling-progress',
      stage: 'loading',
      message: 'Loading BAM file into Python...',
      progress: 10
    });

    const bamBytes = new Uint8Array(fileData);
    pyodide.globals.set('bam_data_js', bamBytes);

    if (baiData) {
      const baiBytes = new Uint8Array(baiData);
      pyodide.globals.set('bai_data_js', baiBytes);
    }

    if (chromosomes) {
      pyodide.globals.set('chromosomes_js', chromosomes);
    }

    if (referenceSeqs) {
      pyodide.globals.set('reference_seqs_js', JSON.stringify(referenceSeqs));
    }

    self.postMessage({
      type: 'variant-calling-progress',
      stage: 'parsing',
      message: 'Parsing BAM and generating pileup...',
      progress: 30
    });

    const chromParam = chromosomes
      ? 'chromosomes=list(chromosomes_js.to_py())'
      : 'chromosomes=None';

    const baiParam = baiData ? 'bai_bytes=bytes(bai_data_js.to_py())' : 'bai_bytes=None';
    const refParam = referenceSeqs ? 'reference_seqs=json.loads(str(reference_seqs_js))' : 'reference_seqs=None';

    const resultJson = await pyodide.runPythonAsync(`
import json

bam_bytes = bytes(bam_data_js.to_py())

result = call_variants_from_bam(
    bam_bytes,
    ${chromParam},
    min_depth=${minDepth},
    min_base_quality=${minBaseQuality},
    min_mapping_quality=${minMappingQuality},
    min_variant_reads=${minVariantReads},
    min_allele_freq=${minAlleleFreq},
    min_strand_bias=${minStrandBias},
    ${baiParam},
    ${refParam}
)

json.dumps(result)
    `);

    // Clean up
    pyodide.globals.delete('bam_data_js');
    if (baiData) pyodide.globals.delete('bai_data_js');
    if (chromosomes) pyodide.globals.delete('chromosomes_js');
    if (referenceSeqs) pyodide.globals.delete('reference_seqs_js');

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
