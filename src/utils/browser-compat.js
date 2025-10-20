/**
 * Browser Compatibility Checker
 * Detects browser capabilities and versions
 */

export class BrowserCompat {
  constructor() {
    this.userAgent = navigator.userAgent.toLowerCase();
    this.browser = this.detectBrowser();
  }

  /**
   * Detect which browser is being used
   */
  detectBrowser() {
    const ua = this.userAgent;

    // Edge (Chromium-based)
    if (ua.includes('edg/')) {
      return {
        name: 'Edge',
        chromiumBased: true,
        version: this.extractVersion('edg/')
      };
    }

    // Chrome
    if (ua.includes('chrome/') && !ua.includes('edg/')) {
      return {
        name: 'Chrome',
        chromiumBased: true,
        version: this.extractVersion('chrome/')
      };
    }

    // Firefox
    if (ua.includes('firefox/')) {
      return {
        name: 'Firefox',
        chromiumBased: false,
        version: this.extractVersion('firefox/')
      };
    }

    // Safari
    if (ua.includes('safari/') && !ua.includes('chrome/')) {
      return {
        name: 'Safari',
        chromiumBased: false,
        version: this.extractVersion('version/')
      };
    }

    // Opera
    if (ua.includes('opr/') || ua.includes('opera/')) {
      return {
        name: 'Opera',
        chromiumBased: true,
        version: this.extractVersion('opr/') || this.extractVersion('opera/')
      };
    }

    // Brave (reports as Chrome)
    if (navigator.brave && typeof navigator.brave.isBrave === 'function') {
      return {
        name: 'Brave',
        chromiumBased: true,
        version: this.extractVersion('chrome/')
      };
    }

    return {
      name: 'Unknown',
      chromiumBased: false,
      version: 0
    };
  }

  /**
   * Extract version number from user agent
   */
  extractVersion(identifier) {
    const ua = this.userAgent;
    const index = ua.indexOf(identifier);
    if (index === -1) return 0;

    const versionString = ua.substring(index + identifier.length);
    const version = parseFloat(versionString);
    return isNaN(version) ? 0 : version;
  }

  /**
   * Check if OPFS is supported
   */
  isOPFSSupported() {
    return (
      typeof navigator !== 'undefined' &&
      navigator.storage &&
      typeof navigator.storage.getDirectory === 'function'
    );
  }

  /**
   * Check if IndexedDB is supported
   */
  isIndexedDBSupported() {
    return (
      typeof window !== 'undefined' &&
      typeof window.indexedDB !== 'undefined'
    );
  }

  /**
   * Check if Web Workers are supported
   */
  isWebWorkersSupported() {
    return typeof Worker !== 'undefined';
  }

  /**
   * Check if WebAssembly is supported
   */
  isWebAssemblySupported() {
    return typeof WebAssembly !== 'undefined';
  }

  /**
   * Check if SharedArrayBuffer is supported
   */
  isSharedArrayBufferSupported() {
    return typeof SharedArrayBuffer !== 'undefined';
  }

  /**
   * Get minimum browser versions for full support
   */
  getMinimumVersions() {
    return {
      Chrome: 86,
      Edge: 86,
      Firefox: 111,
      Safari: 15.2,
      Opera: 72,
      Brave: 86
    };
  }

  /**
   * Check if current browser meets minimum version requirements
   */
  meetsMinimumVersion() {
    const minVersions = this.getMinimumVersions();
    const minRequired = minVersions[this.browser.name];

    if (!minRequired) return false;
    return this.browser.version >= minRequired;
  }

  /**
   * Get compatibility report
   */
  getCompatibilityReport() {
    const opfsSupported = this.isOPFSSupported();
    const indexedDBSupported = this.isIndexedDBSupported();
    const webAssemblySupported = this.isWebAssemblySupported();
    const sharedArrayBufferSupported = this.isSharedArrayBufferSupported();
    const meetsMinVersion = this.meetsMinimumVersion();

    const issues = [];
    const warnings = [];

    // Critical issues
    if (!webAssemblySupported) {
      issues.push('WebAssembly is not supported - biowasm tools will not work');
    }

    if (!opfsSupported && !indexedDBSupported) {
      issues.push('No file storage system available (OPFS or IndexedDB)');
    }

    // Warnings
    if (!opfsSupported && indexedDBSupported) {
      warnings.push('OPFS not supported - falling back to IndexedDB (slower for large files)');
    }

    if (!sharedArrayBufferSupported) {
      warnings.push('SharedArrayBuffer not supported - multi-threading disabled');
    }

    if (!meetsMinVersion && this.browser.name !== 'Unknown') {
      warnings.push(
        `${this.browser.name} version ${this.browser.version} detected. ` +
        `Minimum recommended version is ${this.getMinimumVersions()[this.browser.name]}`
      );
    }

    // Safari specific warning
    if (this.browser.name === 'Safari') {
      warnings.push(
        'Safari has limited OPFS support. Chrome, Firefox, or Edge recommended for best experience.'
      );
    }

    return {
      browser: this.browser,
      supported: issues.length === 0,
      opfsSupported,
      indexedDBSupported,
      webAssemblySupported,
      sharedArrayBufferSupported,
      meetsMinVersion,
      issues,
      warnings,
      recommendation: this.getRecommendation(issues, warnings)
    };
  }

  /**
   * Get browser recommendation based on compatibility
   */
  getRecommendation(issues, warnings) {
    if (issues.length > 0) {
      return 'critical';
    }

    if (this.browser.name === 'Safari') {
      return 'warning';
    }

    if (warnings.length > 0) {
      return 'info';
    }

    if (this.browser.chromiumBased || this.browser.name === 'Firefox') {
      return 'optimal';
    }

    return 'info';
  }
}

// Export singleton instance
export const browserCompat = new BrowserCompat();
