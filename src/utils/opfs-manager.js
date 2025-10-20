/**
 * OPFS (Origin Private File System) Manager with IndexedDB Fallback
 * Handles BAM file storage with permission requests
 * Browser compatibility: Chrome 86+, Firefox 111+, Edge 86+, Safari 15.2+ (limited)
 */

class OPFSManager {
  constructor() {
    this.root = null;
    this.db = null;
    this.initialized = false;
    this.storageType = null; // 'opfs' or 'indexeddb'
  }

  /**
   * Initialize storage (OPFS with IndexedDB fallback)
   */
  async initialize() {
    if (this.initialized) return true;

    try {
      // Try OPFS first (Chrome 86+, Firefox 111+, Edge 86+)
      if (this._isOPFSSupported()) {
        await this._initializeOPFS();
        this.storageType = 'opfs';
        console.log('✓ OPFS initialized successfully');
        return true;
      }

      // Fallback to IndexedDB (broader browser support)
      if (this._isIndexedDBSupported()) {
        await this._initializeIndexedDB();
        this.storageType = 'indexeddb';
        console.warn('⚠ OPFS not supported - using IndexedDB fallback');
        return true;
      }

      throw new Error('No storage system available (OPFS or IndexedDB not supported)');
    } catch (error) {
      console.error('Failed to initialize storage:', error);
      throw error;
    }
  }

  /**
   * Check if OPFS is supported
   */
  _isOPFSSupported() {
    return (
      typeof navigator !== 'undefined' &&
      navigator.storage &&
      typeof navigator.storage.getDirectory === 'function'
    );
  }

  /**
   * Check if IndexedDB is supported
   */
  _isIndexedDBSupported() {
    return (
      typeof window !== 'undefined' &&
      typeof window.indexedDB !== 'undefined'
    );
  }

  /**
   * Initialize OPFS
   */
  async _initializeOPFS() {
    // Request persistent storage
    if (navigator.storage && navigator.storage.persist) {
      const isPersisted = await navigator.storage.persist();
      console.log(`Persistent storage: ${isPersisted}`);
    }

    // Get OPFS root directory
    this.root = await navigator.storage.getDirectory();
    this.initialized = true;
  }

  /**
   * Initialize IndexedDB as fallback
   */
  async _initializeIndexedDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('LungSeqStorage', 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        this.initialized = true;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('files')) {
          db.createObjectStore('files', { keyPath: 'name' });
        }
      };
    });
  }

  /**
   * Check and request storage quota
   * @param {number} requiredBytes - Bytes needed for the operation
   */
  async requestStorageQuota(requiredBytes) {
    try {
      const estimate = await navigator.storage.estimate();
      const available = estimate.quota - estimate.usage;

      const requiredMB = (requiredBytes / 1024 / 1024).toFixed(2);
      const availableMB = (available / 1024 / 1024).toFixed(2);
      const usageMB = (estimate.usage / 1024 / 1024).toFixed(2);
      const quotaMB = (estimate.quota / 1024 / 1024).toFixed(2);

      console.log(`Storage - Usage: ${usageMB}MB, Available: ${availableMB}MB, Quota: ${quotaMB}MB`);
      console.log(`Required: ${requiredMB}MB`);

      if (available < requiredBytes) {
        const message = `Insufficient storage. Required: ${requiredMB}MB, Available: ${availableMB}MB. Please free up space.`;
        throw new Error(message);
      }

      return {
        available,
        usage: estimate.usage,
        quota: estimate.quota,
        required: requiredBytes,
        sufficient: available >= requiredBytes
      };
    } catch (error) {
      console.error('Failed to check storage quota:', error);
      throw error;
    }
  }

  /**
   * Write file to storage (OPFS or IndexedDB)
   * @param {string} fileName - Name of the file
   * @param {File|ArrayBuffer} data - File data
   */
  async writeFile(fileName, data) {
    await this.initialize();

    try {
      // Get file size
      const fileSize = data instanceof File ? data.size : data.byteLength;

      // Request storage quota
      await this.requestStorageQuota(fileSize);

      if (this.storageType === 'opfs') {
        return await this._writeFileOPFS(fileName, data, fileSize);
      } else {
        return await this._writeFileIndexedDB(fileName, data, fileSize);
      }
    } catch (error) {
      console.error('Failed to write file:', error);
      throw error;
    }
  }

  /**
   * Write file to OPFS
   */
  async _writeFileOPFS(fileName, data, fileSize) {
    const fileHandle = await this.root.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();

    if (data instanceof File) {
      await writable.write(data);
    } else {
      await writable.write(new Blob([data]));
    }

    await writable.close();
    console.log(`File ${fileName} written to OPFS (${(fileSize / 1024 / 1024).toFixed(2)}MB)`);
    return fileHandle;
  }

  /**
   * Write file to IndexedDB
   */
  async _writeFileIndexedDB(fileName, data, fileSize) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['files'], 'readwrite');
      const store = transaction.objectStore('files');

      const fileData = {
        name: fileName,
        data: data instanceof File ? data : new Blob([data]),
        size: fileSize,
        lastModified: Date.now()
      };

      const request = store.put(fileData);

      request.onsuccess = () => {
        console.log(`File ${fileName} written to IndexedDB (${(fileSize / 1024 / 1024).toFixed(2)}MB)`);
        resolve(fileData);
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Read file from storage
   * @param {string} fileName - Name of the file
   */
  async readFile(fileName) {
    await this.initialize();

    try {
      if (this.storageType === 'opfs') {
        const fileHandle = await this.root.getFileHandle(fileName);
        return await fileHandle.getFile();
      } else {
        return await this._readFileIndexedDB(fileName);
      }
    } catch (error) {
      console.error('Failed to read file:', error);
      throw error;
    }
  }

  /**
   * Read file from IndexedDB
   */
  async _readFileIndexedDB(fileName) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['files'], 'readonly');
      const store = transaction.objectStore('files');
      const request = store.get(fileName);

      request.onsuccess = () => {
        if (request.result) {
          resolve(request.result.data);
        } else {
          reject(new Error(`File ${fileName} not found`));
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get file as ArrayBuffer
   * @param {string} fileName - Name of the file
   */
  async readFileAsArrayBuffer(fileName) {
    const file = await this.readFile(fileName);
    return await file.arrayBuffer();
  }

  /**
   * Check if file exists
   * @param {string} fileName - Name of the file
   */
  async fileExists(fileName) {
    await this.initialize();

    try {
      if (this.storageType === 'opfs') {
        await this.root.getFileHandle(fileName);
        return true;
      } else {
        return await this._fileExistsIndexedDB(fileName);
      }
    } catch {
      return false;
    }
  }

  /**
   * Check if file exists in IndexedDB
   */
  async _fileExistsIndexedDB(fileName) {
    return new Promise((resolve) => {
      const transaction = this.db.transaction(['files'], 'readonly');
      const store = transaction.objectStore('files');
      const request = store.get(fileName);

      request.onsuccess = () => resolve(!!request.result);
      request.onerror = () => resolve(false);
    });
  }

  /**
   * Delete file from storage
   * @param {string} fileName - Name of the file
   */
  async deleteFile(fileName) {
    await this.initialize();

    try {
      if (this.storageType === 'opfs') {
        await this.root.removeEntry(fileName);
      } else {
        await this._deleteFileIndexedDB(fileName);
      }
      console.log(`File ${fileName} deleted`);
      return true;
    } catch (error) {
      console.error('Failed to delete file:', error);
      throw error;
    }
  }

  /**
   * Delete file from IndexedDB
   */
  async _deleteFileIndexedDB(fileName) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['files'], 'readwrite');
      const store = transaction.objectStore('files');
      const request = store.delete(fileName);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * List all files
   */
  async listFiles() {
    await this.initialize();

    try {
      if (this.storageType === 'opfs') {
        return await this._listFilesOPFS();
      } else {
        return await this._listFilesIndexedDB();
      }
    } catch (error) {
      console.error('Failed to list files:', error);
      throw error;
    }
  }

  /**
   * List files from OPFS
   */
  async _listFilesOPFS() {
    const files = [];
    for await (const entry of this.root.values()) {
      if (entry.kind === 'file') {
        const file = await entry.getFile();
        files.push({
          name: entry.name,
          size: file.size,
          lastModified: file.lastModified
        });
      }
    }
    return files;
  }

  /**
   * List files from IndexedDB
   */
  async _listFilesIndexedDB() {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['files'], 'readonly');
      const store = transaction.objectStore('files');
      const request = store.getAll();

      request.onsuccess = () => {
        const files = request.result.map(f => ({
          name: f.name,
          size: f.size,
          lastModified: f.lastModified
        }));
        resolve(files);
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get storage usage statistics
   */
  async getStorageStats() {
    try {
      const estimate = await navigator.storage.estimate();
      return {
        usage: estimate.usage,
        quota: estimate.quota,
        usageMB: (estimate.usage / 1024 / 1024).toFixed(2),
        quotaMB: (estimate.quota / 1024 / 1024).toFixed(2),
        percentUsed: ((estimate.usage / estimate.quota) * 100).toFixed(2)
      };
    } catch (error) {
      console.error('Failed to get storage stats:', error);
      throw error;
    }
  }

  /**
   * Clear all files
   */
  async clearAll() {
    await this.initialize();

    try {
      if (this.storageType === 'opfs') {
        for await (const entry of this.root.values()) {
          await this.root.removeEntry(entry.name);
        }
      } else {
        await this._clearAllIndexedDB();
      }
      console.log('All files cleared from storage');
    } catch (error) {
      console.error('Failed to clear storage:', error);
      throw error;
    }
  }

  /**
   * Clear all files from IndexedDB
   */
  async _clearAllIndexedDB() {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['files'], 'readwrite');
      const store = transaction.objectStore('files');
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get current storage type
   */
  getStorageType() {
    return this.storageType || 'unknown';
  }

  /**
   * Get storage info with browser compatibility details
   */
  async getStorageInfo() {
    await this.initialize();

    const stats = await this.getStorageStats();

    return {
      ...stats,
      storageType: this.storageType,
      opfsSupported: this._isOPFSSupported(),
      indexedDBSupported: this._isIndexedDBSupported()
    };
  }
}

// Export singleton instance
export const opfsManager = new OPFSManager();
