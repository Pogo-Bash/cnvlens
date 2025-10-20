/**
 * OPFS (Origin Private File System) Manager
 * Handles BAM file storage with permission requests
 */

class OPFSManager {
  constructor() {
    this.root = null;
    this.initialized = false;
  }

  /**
   * Initialize OPFS and request storage permission
   */
  async initialize() {
    if (this.initialized) return true;

    try {
      // Check if OPFS is supported
      if (!navigator.storage || !navigator.storage.getDirectory) {
        throw new Error('OPFS is not supported in this browser');
      }

      // Request persistent storage
      if (navigator.storage && navigator.storage.persist) {
        const isPersisted = await navigator.storage.persist();
        console.log(`OPFS Persistent storage: ${isPersisted}`);
      }

      // Get OPFS root directory
      this.root = await navigator.storage.getDirectory();
      this.initialized = true;

      console.log('OPFS initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize OPFS:', error);
      throw error;
    }
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
   * Write file to OPFS
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

      // Create file handle
      const fileHandle = await this.root.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();

      // Write data
      if (data instanceof File) {
        await writable.write(data);
      } else {
        await writable.write(new Blob([data]));
      }

      await writable.close();

      console.log(`File ${fileName} written to OPFS (${(fileSize / 1024 / 1024).toFixed(2)}MB)`);
      return fileHandle;
    } catch (error) {
      console.error('Failed to write file to OPFS:', error);
      throw error;
    }
  }

  /**
   * Read file from OPFS
   * @param {string} fileName - Name of the file
   */
  async readFile(fileName) {
    await this.initialize();

    try {
      const fileHandle = await this.root.getFileHandle(fileName);
      const file = await fileHandle.getFile();
      return file;
    } catch (error) {
      console.error('Failed to read file from OPFS:', error);
      throw error;
    }
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
   * Check if file exists in OPFS
   * @param {string} fileName - Name of the file
   */
  async fileExists(fileName) {
    await this.initialize();

    try {
      await this.root.getFileHandle(fileName);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete file from OPFS
   * @param {string} fileName - Name of the file
   */
  async deleteFile(fileName) {
    await this.initialize();

    try {
      await this.root.removeEntry(fileName);
      console.log(`File ${fileName} deleted from OPFS`);
      return true;
    } catch (error) {
      console.error('Failed to delete file from OPFS:', error);
      throw error;
    }
  }

  /**
   * List all files in OPFS
   */
  async listFiles() {
    await this.initialize();

    try {
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
    } catch (error) {
      console.error('Failed to list files:', error);
      throw error;
    }
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
   * Clear all files from OPFS
   */
  async clearAll() {
    await this.initialize();

    try {
      for await (const entry of this.root.values()) {
        await this.root.removeEntry(entry.name);
      }
      console.log('All files cleared from OPFS');
    } catch (error) {
      console.error('Failed to clear OPFS:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const opfsManager = new OPFSManager();
