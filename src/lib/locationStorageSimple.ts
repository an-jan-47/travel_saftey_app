import { 
  EncryptedData, 
  LocationData, 
  encryptLocationData, 
  decryptLocationBatch, 
  calculateDistance,
  validateLocationData 
} from './encryption';
import { ILocationStorage, StoredLocation } from './storageInterface';

export interface LocationStorageConfig {
  maxOnlineLocations: number; // 10 locations for online mode
  maxOfflineLocations: number; // 20 locations for offline mode
  onlineDistanceThreshold: number; // 20 meters for online
  offlineDistanceThreshold: number; // 50 meters for offline
  batchUploadInterval: number; // 5 minutes in milliseconds
}

export class SimpleLocationStorageManager implements ILocationStorage {
  private config: LocationStorageConfig;
  private lastLocationTime: number = 0;
  private batchUploadTimer: NodeJS.Timeout | null = null;
  private readonly STORAGE_KEYS = {
    online: 'travelsafe_locations_online',
    offline: 'travelsafe_locations_offline',
    metadata: 'travelsafe_metadata',
    lastLocation: 'travelsafe_last_location'
  };

  constructor(config?: Partial<LocationStorageConfig>) {
    this.config = {
      maxOnlineLocations: 10,
      maxOfflineLocations: 20,
      onlineDistanceThreshold: 20,
      offlineDistanceThreshold: 50,
      batchUploadInterval: 5 * 60 * 1000, // 5 minutes
      ...config
    };
  }

  /**
   * Initialize storage - always succeeds with localStorage
   */
  async initialize(): Promise<void> {
    try {
      // Test localStorage availability
      const testKey = 'travelsafe_test';
      localStorage.setItem(testKey, 'test');
      localStorage.removeItem(testKey);
      
      console.log('SimpleLocationStorageManager initialized successfully with localStorage');
      
      // Start batch upload timer
      this.startBatchUploadTimer();
    } catch (error) {
      console.error('localStorage not available:', error);
      throw new Error('Storage not available - app requires localStorage support');
    }
  }

  /**
   * Store a location if it meets distance criteria
   */
  async storeLocation(location: LocationData, isOffline: boolean = false): Promise<boolean> {
    if (!validateLocationData(location)) {
      console.warn('Invalid location data:', location);
      return false;
    }

    // Get last stored location to check distance
    const lastLocation = await this.getLastLocation();
    const distanceThreshold = isOffline 
      ? this.config.offlineDistanceThreshold 
      : this.config.onlineDistanceThreshold;

    if (lastLocation) {
      const distance = calculateDistance(
        lastLocation.latitude,
        lastLocation.longitude,
        location.latitude,
        location.longitude
      );

      if (distance < distanceThreshold) {
        console.log(`Distance ${distance}m below threshold ${distanceThreshold}m, skipping storage`);
        return false;
      }
    }

    try {
      // Encrypt the location data
      const encryptedData = encryptLocationData(location, location.touristId);
      
      const storedLocation: StoredLocation = {
        id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: location.timestamp,
        isOffline: isOffline ? 1 : 0,
        encryptedData: encryptedData.data,
        iv: encryptedData.iv,
        salt: encryptedData.salt
      };

      // Store the location
      this.addLocationToStorage(storedLocation, isOffline);
      
      // Update last location
      this.setLastLocation(location);
      
      // Maintain buffer size limits
      this.maintainBufferLimits(isOffline);
      
      this.lastLocationTime = Date.now();
      console.log(`Location stored successfully (${isOffline ? 'offline' : 'online'} mode)`);
      return true;

    } catch (error) {
      console.error('Error storing location:', error);
      return false;
    }
  }

  /**
   * Add location to localStorage
   */
  private addLocationToStorage(location: StoredLocation, isOffline: boolean): void {
    const key = isOffline ? this.STORAGE_KEYS.offline : this.STORAGE_KEYS.online;
    const locations = this.getLocationsFromStorage(key);
    locations.push(location);
    this.saveLocationsToStorage(key, locations);
  }

  /**
   * Get locations from localStorage
   */
  private getLocationsFromStorage(key: string): StoredLocation[] {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error reading from localStorage:', error);
      return [];
    }
  }

  /**
   * Save locations to localStorage
   */
  private saveLocationsToStorage(key: string, locations: StoredLocation[]): void {
    try {
      localStorage.setItem(key, JSON.stringify(locations));
    } catch (error) {
      console.error('Error saving to localStorage:', error);
      // If localStorage is full, remove oldest entries
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        const reducedLocations = locations.slice(-Math.floor(locations.length / 2));
        localStorage.setItem(key, JSON.stringify(reducedLocations));
        console.warn('localStorage full, removed oldest entries');
      }
    }
  }

  /**
   * Maintain buffer size limits by removing oldest entries
   */
  private maintainBufferLimits(isOffline: boolean): void {
    const key = isOffline ? this.STORAGE_KEYS.offline : this.STORAGE_KEYS.online;
    const maxLocations = isOffline 
      ? this.config.maxOfflineLocations 
      : this.config.maxOnlineLocations;

    const locations = this.getLocationsFromStorage(key);
    
    if (locations.length > maxLocations) {
      // Sort by timestamp and remove oldest entries
      locations.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      const trimmedLocations = locations.slice(-maxLocations);
      this.saveLocationsToStorage(key, trimmedLocations);
      
      console.log(`Trimmed ${isOffline ? 'offline' : 'online'} buffer to ${maxLocations} locations`);
    }
  }

  /**
   * Get all stored locations for batch upload
   */
  async getLocationsForUpload(isOffline: boolean = false): Promise<StoredLocation[]> {
    const key = isOffline ? this.STORAGE_KEYS.offline : this.STORAGE_KEYS.online;
    return this.getLocationsFromStorage(key);
  }

  /**
   * Clear all stored locations after successful upload
   */
  async clearStoredLocations(isOffline: boolean = false): Promise<void> {
    const key = isOffline ? this.STORAGE_KEYS.offline : this.STORAGE_KEYS.online;
    try {
      localStorage.removeItem(key);
      console.log(`Cleared all ${isOffline ? 'offline' : 'online'} locations from storage`);
    } catch (error) {
      console.error('Error clearing stored locations:', error);
    }
  }

  /**
   * Get last stored location for distance calculation
   */
  async getLastLocation(): Promise<LocationData | null> {
    try {
      const data = localStorage.getItem(this.STORAGE_KEYS.lastLocation);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Error getting last location:', error);
      return null;
    }
  }

  /**
   * Set last location
   */
  private setLastLocation(location: LocationData): void {
    try {
      localStorage.setItem(this.STORAGE_KEYS.lastLocation, JSON.stringify(location));
    } catch (error) {
      console.error('Error setting last location:', error);
    }
  }

  /**
   * Start batch upload timer
   */
  private startBatchUploadTimer(): void {
    if (this.batchUploadTimer) {
      clearTimeout(this.batchUploadTimer);
    }

    this.batchUploadTimer = setTimeout(() => {
      this.triggerBatchUpload();
      this.startBatchUploadTimer(); // Restart timer
    }, this.config.batchUploadInterval);
  }

  /**
   * Trigger batch upload event
   */
  private triggerBatchUpload(): void {
    window.dispatchEvent(new CustomEvent('locationBatchUpload', {
      detail: { source: 'timer' }
    }));
  }

  /**
   * Store tourist ID in metadata
   */
  async setTouristId(touristId: string): Promise<void> {
    try {
      const metadata = this.getMetadata();
      metadata.touristId = touristId;
      localStorage.setItem(this.STORAGE_KEYS.metadata, JSON.stringify(metadata));
    } catch (error) {
      console.error('Error setting tourist ID:', error);
    }
  }

  /**
   * Get tourist ID from metadata
   */
  async getTouristId(): Promise<string | null> {
    try {
      const metadata = this.getMetadata();
      return metadata.touristId || null;
    } catch (error) {
      console.error('Error getting tourist ID:', error);
      return null;
    }
  }

  /**
   * Get metadata object
   */
  private getMetadata(): any {
    try {
      const data = localStorage.getItem(this.STORAGE_KEYS.metadata);
      return data ? JSON.parse(data) : {};
    } catch (error) {
      console.error('Error reading metadata:', error);
      return {};
    }
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<{ online: number; offline: number; total: number }> {
    const onlineLocations = await this.getLocationsForUpload(false);
    const offlineLocations = await this.getLocationsForUpload(true);
    
    return {
      online: onlineLocations.length,
      offline: offlineLocations.length,
      total: onlineLocations.length + offlineLocations.length
    };
  }

  /**
   * Force immediate batch upload (for SOS)
   */
  async flushToUpload(): Promise<void> {
    if (this.batchUploadTimer) {
      clearTimeout(this.batchUploadTimer);
    }
    
    this.triggerBatchUpload();
    this.startBatchUploadTimer(); // Restart timer
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.batchUploadTimer) {
      clearTimeout(this.batchUploadTimer);
      this.batchUploadTimer = null;
    }
  }

  /**
   * Get storage usage information
   */
  getStorageInfo(): { used: number; available: number; percentage: number } {
    try {
      // Estimate localStorage usage
      let used = 0;
      for (let key in localStorage) {
        if (localStorage.hasOwnProperty(key)) {
          used += localStorage[key].length + key.length;
        }
      }
      
      // Typical localStorage limit is 5-10MB, we'll use 5MB as conservative estimate
      const available = 5 * 1024 * 1024; // 5MB in bytes
      const percentage = (used / available) * 100;
      
      return { used, available, percentage };
    } catch (error) {
      console.error('Error getting storage info:', error);
      return { used: 0, available: 0, percentage: 0 };
    }
  }
}