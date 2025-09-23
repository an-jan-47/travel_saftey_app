import { Geolocation, Position, GeolocationOptions } from '@capacitor/geolocation';
import { Device } from '@capacitor/device';
import { Network } from '@capacitor/network';
import { LocationData } from './encryption';
import { LocationStorageManager } from './locationStorage';

export interface LocationServiceConfig {
  normalInterval: number; // 30 seconds
  lowBatteryInterval: number; // 2 minutes 
  highAccuracyOptions: GeolocationOptions;
  maxAccuracy: number; // 10 meters
  batteryThreshold: number; // 15%
}

export interface LocationServiceEvents {
  locationUpdate: (location: LocationData) => void;
  locationError: (error: Error) => void;
  batteryOptimization: (enabled: boolean) => void;
  networkStatusChange: (isOnline: boolean) => void;
}

export class LocationService {
  private config: LocationServiceConfig;
  private storageManager: LocationStorageManager;
  private trackingInterval: NodeJS.Timeout | null = null;
  private isTracking: boolean = false;
  private touristId: string = '';
  private isOnline: boolean = true;
  private batteryLevel: number = 100;
  private isLowBattery: boolean = false;
  private eventListeners: Partial<LocationServiceEvents> = {};
  private watchId: string | null = null;

  constructor(
    touristId: string,
    storageManager: LocationStorageManager,
    config?: Partial<LocationServiceConfig>
  ) {
    this.touristId = touristId;
    this.storageManager = storageManager;
    this.config = {
      normalInterval: 30 * 1000, // 30 seconds
      lowBatteryInterval: 2 * 60 * 1000, // 2 minutes
      maxAccuracy: 10, // 10 meters
      batteryThreshold: 15, // 15%
      highAccuracyOptions: {
        enableHighAccuracy: true,
        maximumAge: 3000, // 3 seconds
        timeout: 15000, // 15 seconds timeout
      },
      ...config
    };

    this.initializeNetworkListener();
    this.initializeBatteryMonitoring();
  }

  /**
   * Initialize network status monitoring
   */
  private async initializeNetworkListener(): Promise<void> {
    try {
      // Get initial network status
      const status = await Network.getStatus();
      this.isOnline = status.connected;

      // Listen for network changes
      Network.addListener('networkStatusChange', (status) => {
        const wasOnline = this.isOnline;
        this.isOnline = status.connected;
        
        if (this.eventListeners.networkStatusChange) {
          this.eventListeners.networkStatusChange(this.isOnline);
        }

        // If coming back online, trigger batch upload
        if (!wasOnline && this.isOnline) {
          this.triggerBatchUpload('network_reconnected');
        }

        console.log(`Network status changed: ${this.isOnline ? 'Online' : 'Offline'}`);
      });
    } catch (error) {
      console.error('Failed to initialize network listener:', error);
    }
  }

  /**
   * Initialize battery level monitoring
   */
  private async initializeBatteryMonitoring(): Promise<void> {
    try {
      // Get initial battery info
      const batteryInfo = await Device.getBatteryInfo();
      this.batteryLevel = batteryInfo.batteryLevel || 100;
      this.updateBatteryOptimization();

      // Monitor battery level periodically
      setInterval(async () => {
        try {
          const batteryInfo = await Device.getBatteryInfo();
          this.batteryLevel = batteryInfo.batteryLevel || 100;
          this.updateBatteryOptimization();
        } catch (error) {
          console.error('Failed to get battery info:', error);
        }
      }, 60000); // Check every minute

    } catch (error) {
      console.error('Failed to initialize battery monitoring:', error);
    }
  }

  /**
   * Update battery optimization settings
   */
  private updateBatteryOptimization(): void {
    const wasLowBattery = this.isLowBattery;
    this.isLowBattery = this.batteryLevel < this.config.batteryThreshold;

    if (wasLowBattery !== this.isLowBattery) {
      if (this.eventListeners.batteryOptimization) {
        this.eventListeners.batteryOptimization(this.isLowBattery);
      }

      // Restart tracking with new interval if currently tracking
      if (this.isTracking) {
        this.stopTracking();
        this.startTracking();
      }

      console.log(`Battery optimization ${this.isLowBattery ? 'enabled' : 'disabled'}. Battery: ${this.batteryLevel}%`);
    }
  }

  /**
   * Start location tracking
   */
  async startTracking(): Promise<void> {
    if (this.isTracking) {
      console.log('Location tracking already active');
      return;
    }

    try {
      // Request location permissions
      const permissions = await Geolocation.requestPermissions();
      if (permissions.location !== 'granted') {
        throw new Error('Location permission not granted');
      }

      this.isTracking = true;
      
      // Use watch position for more efficient tracking
      this.watchId = await Geolocation.watchPosition(
        this.config.highAccuracyOptions,
        (position, err) => {
          if (err) {
            this.handleLocationError(new Error(err.message));
            return;
          }

          if (position) {
            this.handleLocationUpdate(position);
          }
        }
      );

      // Set up interval-based tracking as fallback
      const interval = this.isLowBattery 
        ? this.config.lowBatteryInterval 
        : this.config.normalInterval;

      this.trackingInterval = setInterval(() => {
        this.getCurrentLocation();
      }, interval);

      console.log(`Location tracking started with ${interval / 1000}s interval`);
      
    } catch (error) {
      this.isTracking = false;
      const locationError = new Error(`Failed to start location tracking: ${error.message}`);
      this.handleLocationError(locationError);
      throw locationError;
    }
  }

  /**
   * Stop location tracking
   */
  async stopTracking(): Promise<void> {
    if (!this.isTracking) {
      return;
    }

    this.isTracking = false;

    // Clear watch position
    if (this.watchId) {
      await Geolocation.clearWatch({ id: this.watchId });
      this.watchId = null;
    }

    // Clear interval
    if (this.trackingInterval) {
      clearInterval(this.trackingInterval);
      this.trackingInterval = null;
    }

    console.log('Location tracking stopped');
  }

  /**
   * Get current location with high accuracy
   */
  private async getCurrentLocation(): Promise<void> {
    try {
      const position = await Geolocation.getCurrentPosition(this.config.highAccuracyOptions);
      await this.handleLocationUpdate(position);
    } catch (error) {
      this.handleLocationError(new Error(`Failed to get location: ${error.message}`));
    }
  }

  /**
   * Handle location update
   */
  private async handleLocationUpdate(position: Position): Promise<void> {
    try {
      const { coords, timestamp } = position;
      
      // Check accuracy requirement
      if (coords.accuracy > this.config.maxAccuracy) {
        console.log(`Location accuracy ${coords.accuracy}m exceeds threshold ${this.config.maxAccuracy}m, skipping`);
        return;
      }

      // Reverse geocode for address (optional)
      let address: string | undefined;
      try {
        address = await this.reverseGeocode(coords.latitude, coords.longitude);
      } catch (error) {
        console.warn('Reverse geocoding failed:', error);
      }

      const locationData: LocationData = {
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy: coords.accuracy,
        timestamp: new Date(timestamp).toISOString(),
        address,
        touristId: this.touristId
      };

      // Store location
      const stored = await this.storageManager.storeLocation(locationData, !this.isOnline);
      
      if (stored) {
        // Trigger location update event
        if (this.eventListeners.locationUpdate) {
          this.eventListeners.locationUpdate(locationData);
        }

        // Check if we should trigger batch upload
        await this.checkBatchUploadTriggers();
      }

    } catch (error) {
      this.handleLocationError(new Error(`Failed to handle location update: ${error.message}`));
    }
  }

  /**
   * Handle location errors
   */
  private handleLocationError(error: Error): void {
    console.error('Location error:', error);
    
    if (this.eventListeners.locationError) {
      this.eventListeners.locationError(error);
    }
  }

  /**
   * Reverse geocode coordinates to address
   */
  private async reverseGeocode(latitude: number, longitude: number): Promise<string | undefined> {
    if (!this.isOnline) {
      return undefined;
    }

    try {
      // Using OpenStreetMap Nominatim for reverse geocoding
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
        {
          headers: {
            'User-Agent': 'TravelSafe/1.0'
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        return data.display_name;
      }
    } catch (error) {
      console.warn('Reverse geocoding failed:', error);
    }

    return undefined;
  }

  /**
   * Check if batch upload should be triggered
   */
  private async checkBatchUploadTriggers(): Promise<void> {
    const stats = await this.storageManager.getStorageStats();
    const maxLocations = this.isOnline ? 10 : 20;

    // Trigger if we have enough locations
    if (stats.total >= maxLocations) {
      this.triggerBatchUpload('location_count');
    }
  }

  /**
   * Trigger batch upload
   */
  private triggerBatchUpload(reason: string): void {
    window.dispatchEvent(new CustomEvent('locationBatchUpload', {
      detail: { source: reason }
    }));
  }

  /**
   * Force flush all locations (for SOS)
   */
  async flushLocations(): Promise<void> {
    try {
      // Get current location immediately
      await this.getCurrentLocation();
      
      // Trigger immediate batch upload
      this.triggerBatchUpload('sos_flush');
      
      console.log('Emergency location flush triggered');
    } catch (error) {
      console.error('Failed to flush locations:', error);
    }
  }

  /**
   * Add event listener
   */
  addEventListener<K extends keyof LocationServiceEvents>(
    event: K,
    listener: LocationServiceEvents[K]
  ): void {
    this.eventListeners[event] = listener;
  }

  /**
   * Remove event listener
   */
  removeEventListener<K extends keyof LocationServiceEvents>(event: K): void {
    delete this.eventListeners[event];
  }

  /**
   * Get current tracking status
   */
  getTrackingStatus(): {
    isTracking: boolean;
    isOnline: boolean;
    batteryLevel: number;
    isLowBattery: boolean;
    interval: number;
  } {
    return {
      isTracking: this.isTracking,
      isOnline: this.isOnline,
      batteryLevel: this.batteryLevel,
      isLowBattery: this.isLowBattery,
      interval: this.isLowBattery 
        ? this.config.lowBatteryInterval 
        : this.config.normalInterval
    };
  }

  /**
   * Update tourist ID
   */
  updateTouristId(touristId: string): void {
    this.touristId = touristId;
  }

  /**
   * Clean up resources
   */
  async dispose(): Promise<void> {
    await this.stopTracking();
    
    // Remove network listener
    try {
      Network.removeAllListeners();
    } catch (error) {
      console.error('Failed to remove network listeners:', error);
    }
  }
}