import { 
  EncryptedData, 
  LocationData, 
  encryptLocationData, 
  decryptLocationBatch, 
  calculateDistance,
  validateLocationData 
} from './encryption';

export interface StoredLocation extends EncryptedData {
  id: string;
  timestamp: string;
  isOffline: number; // 0 = online, 1 = offline
}

export interface LocationStorageConfig {
  maxOnlineLocations: number; // 10 locations for online mode
  maxOfflineLocations: number; // 20 locations for offline mode
  onlineDistanceThreshold: number; // 20 meters for online
  offlineDistanceThreshold: number; // 50 meters for offline
  batchUploadInterval: number; // 5 minutes in milliseconds
}

export class LocationStorageManager {
  private dbName = 'TravelSafeDB';
  private dbVersion = 2; // Incremented for boolean to number migration
  private storeName = 'locations';
  private metaStoreName = 'metadata';
  private db: IDBDatabase | null = null;
  private config: LocationStorageConfig;
  private lastLocationTime: number = 0;
  private batchUploadTimer: NodeJS.Timeout | null = null;
  private fallbackToLocalStorage: boolean = false;

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
   * Initialize the IndexedDB database with retry mechanism and fallback
   * This method will never throw errors - it always succeeds with either IndexedDB or localStorage
   */
  async initialize(): Promise<void> {
    try {
      // Check if IndexedDB is available
      if (!('indexedDB' in window)) {
        console.warn('IndexedDB not supported, falling back to localStorage');
        this.fallbackToLocalStorage = true;
        return;
      }

      // Retry logic for IndexedDB initialization
      let retries = 3;
      while (retries > 0) {
        try {
          await this.tryInitialize();
          console.log('IndexedDB initialized successfully');
          return;
        } catch (error) {
          retries--;
          console.warn(`IndexedDB initialization attempt failed (${3 - retries}/3):`, error);
          
          if (retries === 0) {
            console.warn('All IndexedDB initialization attempts failed, falling back to localStorage');
            this.fallbackToLocalStorage = true;
            return;
          }
          
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    } catch (error) {
      // Final safety net - should never reach here, but if it does, use localStorage
      console.warn('Unexpected error during initialization, falling back to localStorage:', error);
      this.fallbackToLocalStorage = true;
    }
  }

  /**
   * Single attempt to initialize IndexedDB
   */
  private async tryInitialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = (event) => {
        const error = (event.target as IDBOpenDBRequest).error;
        reject(new Error(`IndexedDB open failed: ${error?.message || 'Unknown error'}`));
      };

      request.onblocked = (event) => {
        console.warn('IndexedDB blocked - another tab may be using an older version');
        reject(new Error('IndexedDB blocked by another tab'));
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        
        // Add error handler for the database connection
        this.db.onerror = (event) => {
          console.error('IndexedDB database error:', event);
        };
        
        this.db.onversionchange = (event) => {
          console.warn('IndexedDB version change detected');
          this.db?.close();
          this.db = null;
        };
        
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const transaction = (event.target as IDBOpenDBRequest).transaction!;
        const oldVersion = event.oldVersion;

        // Create locations store if it doesn't exist
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('isOffline', 'isOffline', { unique: false });
        }

        // Migrate from version 1 to 2: convert boolean isOffline to number
        if (oldVersion < 2) {
          const store = transaction.objectStore(this.storeName);
          const request = store.getAll();
          
          request.onsuccess = () => {
            const locations = request.result as Array<StoredLocation & { isOffline: boolean | number }>;
            locations.forEach(location => {
              // Convert boolean isOffline to number if it's still boolean
              if (typeof location.isOffline === 'boolean') {
                const updatedLocation: StoredLocation = {
                  ...location,
                  isOffline: location.isOffline ? 1 : 0
                };
                store.put(updatedLocation);
              }
            });
          };
        }

        // Create metadata store if it doesn't exist
        if (!db.objectStoreNames.contains(this.metaStoreName)) {
          db.createObjectStore(this.metaStoreName, { keyPath: 'key' });
        }
      };
    });
  }

  /**
   * Store a location if it meets distance criteria
   */
  async storeLocation(location: LocationData, isOffline: boolean = false): Promise<boolean> {
    if (!this.db) {
      await this.initialize();
    }

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
        ...encryptedData
      };

      await this.addLocationToStore(storedLocation);
      
      // Maintain buffer size limits
      await this.maintainBufferLimits(isOffline);
      
      // Update last location time
      this.lastLocationTime = Date.now();
      
      // Start batch upload timer if not already running
      this.startBatchUploadTimer();
      
      console.log(`Location stored successfully. Distance: ${lastLocation ? calculateDistance(lastLocation.latitude, lastLocation.longitude, location.latitude, location.longitude).toFixed(2) : 'N/A'}m`);
      return true;
      
    } catch (error) {
      console.error('Failed to store location:', error);
      return false;
    }
  }

  /**
   * Get the last stored location (decrypted)
   */
  private async getLastLocation(): Promise<LocationData | null> {
    if (!this.db) return null;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const index = store.index('timestamp');
      
      // Get the last entry by timestamp
      const request = index.openCursor(null, 'prev');
      
      request.onsuccess = async (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          try {
            const storedLocation: StoredLocation = cursor.value;
            
            // We need the tourist ID to decrypt, get it from metadata
            const touristId = await this.getTouristId();
            if (!touristId) {
              resolve(null);
              return;
            }
            
            const decryptedLocations = decryptLocationBatch([storedLocation], touristId);
            resolve(decryptedLocations[0] || null);
          } catch (error) {
            console.error('Failed to decrypt last location:', error);
            resolve(null);
          }
        } else {
          resolve(null);
        }
      };
      
      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * Add location to IndexedDB store
   */
  private async addLocationToStore(location: StoredLocation): Promise<void> {
    if (this.fallbackToLocalStorage || !this.db) {
      return this.addLocationToLocalStorage(location);
    }

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const request = store.add(location);

        request.onsuccess = () => resolve();
        request.onerror = () => {
          console.warn('IndexedDB store failed, falling back to localStorage');
          this.fallbackToLocalStorage = true;
          this.addLocationToLocalStorage(location).then(resolve).catch(reject);
        };
      } catch (error) {
        console.warn('IndexedDB transaction failed, falling back to localStorage:', error);
        this.fallbackToLocalStorage = true;
        this.addLocationToLocalStorage(location).then(resolve).catch(reject);
      }
    });
  }

  /**
   * Maintain buffer size limits by removing oldest entries
   */
  private async maintainBufferLimits(isOffline: boolean): Promise<void> {
    if (this.fallbackToLocalStorage || !this.db) {
      // For localStorage, buffer limits are maintained in addLocationToLocalStorage
      return;
    }

    const maxLocations = isOffline 
      ? this.config.maxOfflineLocations 
      : this.config.maxOnlineLocations;

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const index = store.index('isOffline');
        
        const request = index.getAll(IDBKeyRange.only(isOffline ? 1 : 0));
        
        request.onsuccess = () => {
        const locations = request.result as StoredLocation[];
        
        if (locations.length > maxLocations) {
          // Sort by timestamp and remove oldest entries
          locations.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
          
          const toRemove = locations.slice(0, locations.length - maxLocations);
          
          // Remove excess locations
          const deletePromises = toRemove.map(location => {
            return new Promise<void>((deleteResolve, deleteReject) => {
              const deleteRequest = store.delete(location.id);
              deleteRequest.onsuccess = () => deleteResolve();
              deleteRequest.onerror = () => deleteReject(deleteRequest.error);
            });
          });
          
          Promise.all(deletePromises).then(() => {
            console.log(`Removed ${toRemove.length} old locations from ${isOffline ? 'offline' : 'online'} buffer`);
            resolve();
          }).catch(reject);
        } else {
          resolve();
        }
      };
      
      request.onerror = () => {
        console.warn('IndexedDB maintainBufferLimits failed, switching to localStorage');
        this.fallbackToLocalStorage = true;
        resolve(); // Don't reject, just continue with localStorage
      };
      } catch (error) {
        console.warn('IndexedDB maintainBufferLimits error, switching to localStorage:', error);
        this.fallbackToLocalStorage = true;
        resolve();
      }
    });
  }

  /**
   * Get all stored locations for batch upload
   */
  async getLocationsForUpload(isOffline: boolean = false): Promise<StoredLocation[]> {
    if (this.fallbackToLocalStorage) {
      return this.getLocationsFromLocalStorage(isOffline);
    }

    if (!this.db) {
      await this.initialize();
    }

    if (this.fallbackToLocalStorage) {
      return this.getLocationsFromLocalStorage(isOffline);
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const index = store.index('isOffline');
      
      const request = index.getAll(IDBKeyRange.only(isOffline ? 1 : 0));
      
      request.onsuccess = () => {
        const locations = request.result as StoredLocation[];
        resolve(locations);
      };
      
      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * Clear all stored locations after successful upload
   */
  async clearStoredLocations(isOffline: boolean = false): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const index = store.index('isOffline');
      
      const request = index.openCursor(IDBKeyRange.only(isOffline ? 1 : 0));
      
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          console.log(`Cleared all ${isOffline ? 'offline' : 'online'} locations from storage`);
          resolve();
        }
      };
      
      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * Force flush all locations immediately (for SOS)
   */
  async flushAllLocations(): Promise<StoredLocation[]> {
    const onlineLocations = await this.getLocationsForUpload(false);
    const offlineLocations = await this.getLocationsForUpload(true);
    
    return [...onlineLocations, ...offlineLocations];
  }

  /**
   * Start batch upload timer
   */
  private startBatchUploadTimer(): void {
    if (this.batchUploadTimer) return;

    this.batchUploadTimer = setTimeout(() => {
      this.triggerBatchUpload();
      this.batchUploadTimer = null;
    }, this.config.batchUploadInterval);
  }

  /**
   * Trigger batch upload event
   */
  private triggerBatchUpload(): void {
    // Dispatch custom event for batch upload
    window.dispatchEvent(new CustomEvent('locationBatchUpload', {
      detail: { source: 'timer' }
    }));
  }

  /**
   * Store tourist ID in metadata
   */
  async setTouristId(touristId: string): Promise<void> {
    if (!this.db) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.metaStoreName], 'readwrite');
      const store = transaction.objectStore(this.metaStoreName);
      const request = store.put({ key: 'touristId', value: touristId });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get tourist ID from metadata
   */
  async getTouristId(): Promise<string | null> {
    if (!this.db) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.metaStoreName], 'readonly');
      const store = transaction.objectStore(this.metaStoreName);
      const request = store.get('touristId');

      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.value : null);
      };
      
      request.onerror = () => {
        reject(request.error);
      };
    });
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
   * Clean up resources
   */
  dispose(): void {
    if (this.batchUploadTimer) {
      clearTimeout(this.batchUploadTimer);
      this.batchUploadTimer = null;
    }
    
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  // ========== LocalStorage Fallback Methods ==========

  /**
   * Get localStorage key for locations
   */
  private getLocalStorageKey(isOffline: boolean): string {
    return `${this.dbName}_locations_${isOffline ? 'offline' : 'online'}`;
  }

  /**
   * Get locations from localStorage
   */
  private getLocationsFromLocalStorage(isOffline: boolean): StoredLocation[] {
    try {
      const key = this.getLocalStorageKey(isOffline);
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
  private saveLocationsToLocalStorage(locations: StoredLocation[], isOffline: boolean): void {
    try {
      const key = this.getLocalStorageKey(isOffline);
      localStorage.setItem(key, JSON.stringify(locations));
    } catch (error) {
      console.error('Error saving to localStorage:', error);
      // If localStorage is full, remove oldest entries
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        const key = this.getLocalStorageKey(isOffline);
        const reducedLocations = locations.slice(-Math.floor(locations.length / 2));
        localStorage.setItem(key, JSON.stringify(reducedLocations));
      }
    }
  }

  /**
   * Add location using localStorage fallback
   */
  private async addLocationToLocalStorage(location: StoredLocation): Promise<void> {
    const isOffline = location.isOffline === 1;
    const locations = this.getLocationsFromLocalStorage(isOffline);
    locations.push(location);
    
    // Maintain buffer limits
    const maxLocations = isOffline 
      ? this.config.maxOfflineLocations 
      : this.config.maxOnlineLocations;
    
    if (locations.length > maxLocations) {
      locations.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      locations.splice(0, locations.length - maxLocations);
    }
    
    this.saveLocationsToLocalStorage(locations, isOffline);
  }
}