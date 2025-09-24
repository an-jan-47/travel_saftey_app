import { Network } from '@capacitor/network';
import { ILocationStorage, StoredLocation } from './storageInterface';
import { decryptLocationBatch, LocationData } from './encryption';
import { supabase, authHelpers } from './supabase';

export interface BatchUploadConfig {
  maxRetries: number;
  baseRetryDelay: number; // milliseconds
  maxRetryDelay: number; // milliseconds
  batchSize: number;
  uploadTimeout: number; // milliseconds
}

export interface UploadResult {
  success: boolean;
  uploaded: number;
  failed: number;
  error?: string;
}

export interface RetryState {
  attempt: number;
  nextRetryTime: number;
  locations: StoredLocation[];
}

export class BatchUploadService {
  private config: BatchUploadConfig;
  private storageManager: ILocationStorage;
  private isUploading: boolean = false;
  private retryQueue: Map<string, RetryState> = new Map();
  private retryTimer: NodeJS.Timeout | null = null;

  constructor(
    storageManager: ILocationStorage,
    config?: Partial<BatchUploadConfig>
  ) {
    this.storageManager = storageManager;
    this.config = {
      maxRetries: 5,
      baseRetryDelay: 1000, // 1 second
      maxRetryDelay: 30000, // 30 seconds
      batchSize: 50, // Process in smaller batches
      uploadTimeout: 30000, // 30 seconds timeout
      ...config
    };

    this.initializeEventListeners();
  }

  /**
   * Initialize event listeners for batch upload triggers
   */
  private initializeEventListeners(): void {
    // Listen for batch upload events
    window.addEventListener('locationBatchUpload', (event: CustomEvent) => {
      const { source } = event.detail;
      console.log(`Batch upload triggered by: ${source}`);
      this.uploadPendingLocations();
    });

    // Listen for network status changes
    Network.addListener('networkStatusChange', (status) => {
      if (status.connected && this.retryQueue.size > 0) {
        console.log('Network reconnected, processing retry queue');
        this.processRetryQueue();
      }
    });
  }

  /**
   * Upload all pending locations
   */
  async uploadPendingLocations(): Promise<UploadResult> {
    if (this.isUploading) {
      console.log('Upload already in progress, skipping');
      return { success: false, uploaded: 0, failed: 0, error: 'Upload in progress' };
    }

    // Check network connectivity
    const networkStatus = await Network.getStatus();
    if (!networkStatus.connected) {
      console.log('No network connection, skipping upload');
      return { success: false, uploaded: 0, failed: 0, error: 'No network connection' };
    }

    this.isUploading = true;
    let totalUploaded = 0;
    let totalFailed = 0;
    let lastError: string | undefined;

    try {
      // Get tourist ID for decryption
      const touristId = await this.storageManager.getTouristId();
      if (!touristId) {
        throw new Error('Tourist ID not found');
      }

      // Upload online locations first
      const onlineResult = await this.uploadLocationBatch(false, touristId);
      totalUploaded += onlineResult.uploaded;
      totalFailed += onlineResult.failed;
      if (onlineResult.error) lastError = onlineResult.error;

      // Upload offline locations
      const offlineResult = await this.uploadLocationBatch(true, touristId);
      totalUploaded += offlineResult.uploaded;
      totalFailed += offlineResult.failed;
      if (offlineResult.error) lastError = offlineResult.error;

      const success = totalFailed === 0;
      console.log(`Batch upload completed: ${totalUploaded} uploaded, ${totalFailed} failed`);

      return {
        success,
        uploaded: totalUploaded,
        failed: totalFailed,
        error: lastError
      };

    } catch (error) {
      console.error('Batch upload failed:', error);
      return {
        success: false,
        uploaded: totalUploaded,
        failed: totalFailed,
        error: error.message
      };
    } finally {
      this.isUploading = false;
    }
  }

  /**
   * Upload a batch of locations (online or offline)
   */
  private async uploadLocationBatch(isOffline: boolean, touristId: string): Promise<UploadResult> {
    try {
      // Get locations for upload
      const storedLocations = await this.storageManager.getLocationsForUpload(isOffline);
      
      if (storedLocations.length === 0) {
        return { success: true, uploaded: 0, failed: 0 };
      }

      console.log(`Uploading ${storedLocations.length} ${isOffline ? 'offline' : 'online'} locations`);

      // Convert StoredLocation to EncryptedData format for decryption
      const encryptedDataArray = storedLocations.map(location => ({
        data: location.encryptedData,
        iv: location.iv,
        salt: location.salt
      }));

      // Decrypt locations
      const decryptedLocations = decryptLocationBatch(encryptedDataArray, touristId);

      // Process in batches to avoid overwhelming the server
      const batches = this.chunkArray(decryptedLocations, this.config.batchSize);
      let totalUploaded = 0;
      let totalFailed = 0;
      let lastError: string | undefined;

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const batchResult = await this.uploadBatch(batch, `${isOffline ? 'offline' : 'online'}_batch_${i}`);
        
        if (batchResult.success) {
          totalUploaded += batch.length;
        } else {
          totalFailed += batch.length;
          lastError = batchResult.error;
          
          // Add failed batch to retry queue
          const retryKey = `${isOffline ? 'offline' : 'online'}_${Date.now()}_${i}`;
          const correspondingStoredLocations = storedLocations.slice(
            i * this.config.batchSize, 
            (i + 1) * this.config.batchSize
          );
          
          this.addToRetryQueue(retryKey, correspondingStoredLocations);
        }
      }

      // Clear successfully uploaded locations
      if (totalUploaded > 0) {
        await this.storageManager.clearStoredLocations(isOffline);
      }

      return {
        success: totalFailed === 0,
        uploaded: totalUploaded,
        failed: totalFailed,
        error: lastError
      };

    } catch (error) {
      console.error(`Failed to upload ${isOffline ? 'offline' : 'online'} locations:`, error);
      return {
        success: false,
        uploaded: 0,
        failed: 0,
        error: error.message
      };
    }
  }

  /**
   * Upload a single batch to the server
   */
  private async uploadBatch(locations: LocationData[], batchId: string): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`📤 Uploading batch ${batchId} with ${locations.length} locations (user_id will be auto-filled by database)`);

      // Prepare location data for database insertion
      // Note: user_id is omitted - the database trigger will fill it automatically using tourist_id
      const dbLocations = locations.map(location => ({
        tourist_id: location.touristId,
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy || null, // Include GPS accuracy
        address: location.address || null,
        in_restricted_zone: false, // Will be computed server-side
        timestamp: location.timestamp
      }));

      // Upload with timeout
      const uploadPromise = supabase
        .from('app_a857ad95a4_location_logs')
        .insert(dbLocations);

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Upload timeout')), this.config.uploadTimeout);
      });

      const result = await Promise.race([uploadPromise, timeoutPromise]);
      const { error } = result;

      if (error) {
        console.error(`Batch upload failed for ${batchId}:`, error);
        return { success: false, error: error.message };
      }

      console.log(`Successfully uploaded batch ${batchId} with ${locations.length} locations`);
      return { success: true };

    } catch (error) {
      console.error(`Batch upload error for ${batchId}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Add locations to retry queue with exponential backoff
   */
  private addToRetryQueue(key: string, locations: StoredLocation[]): void {
    const existingRetry = this.retryQueue.get(key);
    const attempt = existingRetry ? existingRetry.attempt + 1 : 1;

    if (attempt > this.config.maxRetries) {
      console.warn(`Max retries exceeded for batch ${key}, dropping ${locations.length} locations`);
      return;
    }

    // Calculate exponential backoff delay
    const delay = Math.min(
      this.config.baseRetryDelay * Math.pow(2, attempt - 1),
      this.config.maxRetryDelay
    );

    const retryState: RetryState = {
      attempt,
      nextRetryTime: Date.now() + delay,
      locations
    };

    this.retryQueue.set(key, retryState);
    
    console.log(`Added batch ${key} to retry queue (attempt ${attempt}/${this.config.maxRetries}, delay: ${delay}ms)`);
    
    // Schedule retry processing
    this.scheduleRetryProcessing();
  }

  /**
   * Schedule retry queue processing
   */
  private scheduleRetryProcessing(): void {
    if (this.retryTimer) return;

    // Find the earliest retry time
    let earliestRetryTime = Number.MAX_SAFE_INTEGER;
    for (const retryState of this.retryQueue.values()) {
      if (retryState.nextRetryTime < earliestRetryTime) {
        earliestRetryTime = retryState.nextRetryTime;
      }
    }

    if (earliestRetryTime === Number.MAX_SAFE_INTEGER) return;

    const delay = Math.max(0, earliestRetryTime - Date.now());
    
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.processRetryQueue();
    }, delay);
  }

  /**
   * Process retry queue
   */
  private async processRetryQueue(): Promise<void> {
    if (this.isUploading) return;

    const now = Date.now();
    const retryBatches: Array<{ key: string; retryState: RetryState }> = [];

    // Find batches ready for retry
    for (const [key, retryState] of this.retryQueue.entries()) {
      if (retryState.nextRetryTime <= now) {
        retryBatches.push({ key, retryState });
      }
    }

    if (retryBatches.length === 0) {
      this.scheduleRetryProcessing();
      return;
    }

    // Check network connectivity
    const networkStatus = await Network.getStatus();
    if (!networkStatus.connected) {
      console.log('No network connection for retry, rescheduling');
      this.scheduleRetryProcessing();
      return;
    }

    console.log(`Processing ${retryBatches.length} retry batches`);

    const touristId = await this.storageManager.getTouristId();
    if (!touristId) {
      console.error('Tourist ID not found for retry processing');
      return;
    }

    for (const { key, retryState } of retryBatches) {
      try {
        // Convert StoredLocation to EncryptedData format for decryption
        const encryptedDataArray = retryState.locations.map(location => ({
          data: location.encryptedData,
          iv: location.iv,
          salt: location.salt
        }));

        // Decrypt and upload retry batch
        const decryptedLocations = decryptLocationBatch(encryptedDataArray, touristId);
        const result = await this.uploadBatch(decryptedLocations, `retry_${key}`);

        if (result.success) {
          // Remove from retry queue on success
          this.retryQueue.delete(key);
          console.log(`Retry successful for batch ${key}`);
        } else {
          // Re-add to retry queue with incremented attempt
          this.addToRetryQueue(key, retryState.locations);
        }
      } catch (error) {
        console.error(`Retry failed for batch ${key}:`, error);
        this.addToRetryQueue(key, retryState.locations);
      }
    }

    // Schedule next retry processing if needed
    this.scheduleRetryProcessing();
  }

  /**
   * Emergency flush all locations (for SOS)
   */
  async emergencyFlush(): Promise<UploadResult> {
    console.log('Emergency flush initiated');
    
    // Force upload regardless of current state
    this.isUploading = false;
    
    const result = await this.uploadPendingLocations();
    
    // Also try to upload retry queue immediately
    if (this.retryQueue.size > 0) {
      await this.processRetryQueue();
    }
    
    return result;
  }

  /**
   * Get retry queue status
   */
  getRetryQueueStatus(): { 
    totalBatches: number; 
    totalLocations: number; 
    nextRetryTime?: number 
  } {
    let totalLocations = 0;
    let nextRetryTime: number | undefined;

    for (const retryState of this.retryQueue.values()) {
      totalLocations += retryState.locations.length;
      
      if (!nextRetryTime || retryState.nextRetryTime < nextRetryTime) {
        nextRetryTime = retryState.nextRetryTime;
      }
    }

    return {
      totalBatches: this.retryQueue.size,
      totalLocations,
      nextRetryTime
    };
  }

  /**
   * Clear retry queue (for testing or reset)
   */
  clearRetryQueue(): void {
    this.retryQueue.clear();
    
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    
    console.log('Retry queue cleared');
  }

  /**
   * Utility function to chunk array into smaller batches
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    
    this.retryQueue.clear();
    
    // Remove event listeners
    window.removeEventListener('locationBatchUpload', this.uploadPendingLocations);
    
    try {
      Network.removeAllListeners();
    } catch (error) {
      console.error('Failed to remove network listeners:', error);
    }
  }
}