/**
 * TCGA/GDC API Client
 *
 * Provides access to The Cancer Genome Atlas data through the
 * Genomic Data Commons (GDC) API.
 *
 * API Documentation: https://docs.gdc.cancer.gov/API/Users_Guide/
 */

const GDC_API_BASE = 'https://api.gdc.cancer.gov';

// Lung cancer project IDs
const LUNG_CANCER_PROJECTS = [
  'TCGA-LUAD', // Lung Adenocarcinoma
  'TCGA-LUSC', // Lung Squamous Cell Carcinoma
];

// Data type filters for BAM files
const DATA_CATEGORIES = {
  'Sequencing Reads': 'Sequencing Reads',
  'Copy Number Variation': 'Copy Number Variation',
  'Simple Nucleotide Variation': 'Simple Nucleotide Variation',
};

const DATA_FORMATS = {
  BAM: 'BAM',
  VCF: 'VCF',
  TSV: 'TSV',
};

const EXPERIMENTAL_STRATEGIES = {
  WES: 'WXS',
  WGS: 'WGS',
  'RNA-Seq': 'RNA-Seq',
  'Targeted Sequencing': 'Targeted Sequencing',
};

class TCGAClient {
  constructor() {
    this.token = null;
    this.loadToken();
  }

  /**
   * Load token from localStorage
   */
  loadToken() {
    try {
      this.token = localStorage.getItem('gdc_api_token');
    } catch (e) {
      console.warn('Could not load token from localStorage:', e);
    }
  }

  /**
   * Save token to localStorage
   */
  saveToken(token) {
    this.token = token;
    try {
      if (token) {
        localStorage.setItem('gdc_api_token', token);
      } else {
        localStorage.removeItem('gdc_api_token');
      }
    } catch (e) {
      console.warn('Could not save token to localStorage:', e);
    }
  }

  /**
   * Clear the stored token
   */
  clearToken() {
    this.saveToken(null);
  }

  /**
   * Check if we have a token
   */
  hasToken() {
    return !!this.token;
  }

  /**
   * Get request headers
   */
  getHeaders() {
    const headers = {
      'Content-Type': 'application/json',
    };
    if (this.token) {
      headers['X-Auth-Token'] = this.token;
    }
    return headers;
  }

  /**
   * Build filters for GDC API query
   */
  buildFilters(options = {}) {
    const filters = {
      op: 'and',
      content: []
    };

    // Filter by project (lung cancer)
    if (options.projects && options.projects.length > 0) {
      filters.content.push({
        op: 'in',
        content: {
          field: 'cases.project.project_id',
          value: options.projects
        }
      });
    }

    // Filter by data format (BAM, VCF, etc.)
    if (options.dataFormat) {
      filters.content.push({
        op: '=',
        content: {
          field: 'data_format',
          value: options.dataFormat
        }
      });
    }

    // Filter by data category
    if (options.dataCategory) {
      filters.content.push({
        op: '=',
        content: {
          field: 'data_category',
          value: options.dataCategory
        }
      });
    }

    // Filter by experimental strategy (WES, WGS, etc.)
    if (options.experimentalStrategy) {
      filters.content.push({
        op: '=',
        content: {
          field: 'experimental_strategy',
          value: options.experimentalStrategy
        }
      });
    }

    // Filter by access type
    if (options.accessType) {
      filters.content.push({
        op: '=',
        content: {
          field: 'access',
          value: options.accessType
        }
      });
    }

    return filters;
  }

  /**
   * Search for files in GDC
   */
  async searchFiles(options = {}) {
    const {
      projects = LUNG_CANCER_PROJECTS,
      dataFormat = null,
      dataCategory = null,
      experimentalStrategy = null,
      accessType = null,
      from = 0,
      size = 20,
      sort = 'file_size:desc',
    } = options;

    const filters = this.buildFilters({
      projects,
      dataFormat,
      dataCategory,
      experimentalStrategy,
      accessType,
    });

    const params = {
      filters: JSON.stringify(filters),
      fields: [
        'file_id',
        'file_name',
        'file_size',
        'data_format',
        'data_category',
        'data_type',
        'experimental_strategy',
        'access',
        'state',
        'md5sum',
        'cases.case_id',
        'cases.submitter_id',
        'cases.project.project_id',
        'cases.project.name',
        'cases.demographic.gender',
        'cases.demographic.ethnicity',
        'cases.diagnoses.primary_diagnosis',
        'cases.diagnoses.tumor_stage',
        'cases.samples.sample_type',
      ].join(','),
      from,
      size,
      sort,
    };

    const queryString = new URLSearchParams(params).toString();
    const url = `${GDC_API_BASE}/files?${queryString}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`GDC API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return {
        files: data.data.hits,
        pagination: data.data.pagination,
        total: data.data.pagination.total,
      };
    } catch (error) {
      console.error('Error searching GDC files:', error);
      throw error;
    }
  }

  /**
   * Get file metadata by ID
   */
  async getFileMetadata(fileId) {
    const url = `${GDC_API_BASE}/files/${fileId}?expand=cases,cases.project,cases.demographic,cases.diagnoses`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`GDC API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data.data;
    } catch (error) {
      console.error('Error fetching file metadata:', error);
      throw error;
    }
  }

  /**
   * Get download URL for a file
   * Note: Controlled-access files require a valid token
   */
  getDownloadUrl(fileId) {
    return `${GDC_API_BASE}/data/${fileId}`;
  }

  /**
   * Download a file
   * Returns a readable stream or blob depending on browser support
   */
  async downloadFile(fileId, onProgress = null) {
    const url = this.getDownloadUrl(fileId);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('Access denied. Please check your API token has access to this file.');
        }
        throw new Error(`Download failed: ${response.status} ${response.statusText}`);
      }

      // Get total size for progress tracking
      const contentLength = response.headers.get('Content-Length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;

      // If no progress callback or no content length, just return blob
      if (!onProgress || !total) {
        return await response.blob();
      }

      // Stream the response with progress
      const reader = response.body.getReader();
      const chunks = [];
      let loaded = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        loaded += value.length;

        if (onProgress) {
          onProgress({
            loaded,
            total,
            percent: Math.round((loaded / total) * 100),
          });
        }
      }

      // Combine chunks into blob
      const blob = new Blob(chunks);
      return blob;
    } catch (error) {
      console.error('Error downloading file:', error);
      throw error;
    }
  }

  /**
   * Validate the current token by making a test request
   */
  async validateToken() {
    if (!this.token) {
      return { valid: false, message: 'No token provided' };
    }

    try {
      // Try to access the user endpoint which requires authentication
      const response = await fetch(`${GDC_API_BASE}/status`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (response.ok) {
        return { valid: true, message: 'Token is valid' };
      } else if (response.status === 401) {
        return { valid: false, message: 'Token is invalid or expired' };
      } else {
        return { valid: false, message: `API error: ${response.status}` };
      }
    } catch (error) {
      return { valid: false, message: `Network error: ${error.message}` };
    }
  }

  /**
   * Get available projects (for lung cancer)
   */
  async getLungCancerProjects() {
    const params = {
      filters: JSON.stringify({
        op: 'in',
        content: {
          field: 'project_id',
          value: LUNG_CANCER_PROJECTS
        }
      }),
      fields: 'project_id,name,primary_site,disease_type,summary.case_count,summary.file_count',
      size: 10,
    };

    const queryString = new URLSearchParams(params).toString();
    const url = `${GDC_API_BASE}/projects?${queryString}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`GDC API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data.data.hits;
    } catch (error) {
      console.error('Error fetching projects:', error);
      throw error;
    }
  }

  /**
   * Get summary statistics for lung cancer data
   */
  async getDataSummary() {
    const filters = this.buildFilters({
      projects: LUNG_CANCER_PROJECTS,
    });

    const params = {
      filters: JSON.stringify(filters),
      facets: 'data_format,data_category,experimental_strategy,access',
      size: 0, // We only want facets, not actual results
    };

    const queryString = new URLSearchParams(params).toString();
    const url = `${GDC_API_BASE}/files?${queryString}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`GDC API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return {
        total: data.data.pagination.total,
        facets: data.data.aggregations,
      };
    } catch (error) {
      console.error('Error fetching data summary:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const tcgaClient = new TCGAClient();

// Export constants for UI
export const CANCER_TYPES = {
  'TCGA-LUAD': 'Lung Adenocarcinoma (LUAD)',
  'TCGA-LUSC': 'Lung Squamous Cell Carcinoma (LUSC)',
};

export { DATA_CATEGORIES, DATA_FORMATS, EXPERIMENTAL_STRATEGIES, LUNG_CANCER_PROJECTS };
