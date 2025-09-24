import { Geolocation, Position, GeolocationOptions } from '@capacitor/geolocation';
import { Device } from '@capacitor/device';
import { Network } from '@capacitor/network';
import { Capacitor } from '@capacitor/core';
import { LocationData } from './encryption';
import { ILocationStorage } from './storageInterface';

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
  private storageManager: ILocationStorage;
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
    storageManager: ILocationStorage,
    config?: Partial<LocationServiceConfig>
  ) {
    this.touristId = touristId;
    this.storageManager = storageManager;
    
    // Check if running on web platform
    const isWeb = Capacitor.getPlatform() === 'web';
    
    this.config = {
      normalInterval: 30 * 1000, // 30 seconds
      lowBatteryInterval: 2 * 60 * 1000, // 2 minutes
      maxAccuracy: isWeb ? 100 : 10, // 100m for web (very lenient), 10m for mobile
      batteryThreshold: 15, // 15%
      highAccuracyOptions: {
        enableHighAccuracy: true,
        maximumAge: 5000, // 5 seconds
        timeout: 30000, // 30 seconds timeout for web compatibility
      },
      ...config
    };

    console.log(`🔧 LocationService initialized for ${isWeb ? 'WEB' : 'MOBILE'} platform`);
    console.log(`📏 Max accuracy threshold: ${this.config.maxAccuracy}m`);
    console.log(`⏱️ Timeout: ${this.config.highAccuracyOptions.timeout}ms`);

    this.initializeNetworkListener();
    this.initializeBatteryMonitoring();
  }

  /**
   * Initialize network status monitoring
   */
  private async initializeNetworkListener(): Promise<void> {
    try {
      if (this.isWebPlatform()) {
        // For web, use navigator.onLine and window events
        this.isOnline = navigator.onLine;
        
        const handleOnlineStatus = () => {
          const wasOnline = this.isOnline;
          this.isOnline = navigator.onLine;
          
          if (this.eventListeners.networkStatusChange) {
            this.eventListeners.networkStatusChange(this.isOnline);
          }

          // If coming back online, trigger batch upload
          if (!wasOnline && this.isOnline) {
            this.triggerBatchUpload('network_reconnected');
          }

          console.log(`Network status changed: ${this.isOnline ? 'Online' : 'Offline'}`);
        };
        
        window.addEventListener('online', handleOnlineStatus);
        window.addEventListener('offline', handleOnlineStatus);
      } else {
        // Get initial network status for mobile
        const status = await Network.getStatus();
        this.isOnline = status.connected;

        // Listen for network changes on mobile
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
      }
    } catch (error) {
      console.error('Failed to initialize network listener:', error);
    }
  }

  /**
   * Initialize battery level monitoring
   */
  private async initializeBatteryMonitoring(): Promise<void> {
    try {
      if (this.isWebPlatform()) {
        // For web, use Battery API if available, otherwise assume full battery
        if ('getBattery' in navigator) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const battery = await (navigator as any).getBattery() as any;
          this.batteryLevel = Math.round(battery.level * 100);
          
          // Listen for battery changes
          battery.addEventListener('levelchange', () => {
            this.batteryLevel = Math.round(battery.level * 100);
            this.updateBatteryOptimization();
          });
        } else {
          // Battery API not available, assume 100%
          this.batteryLevel = 100;
          console.log('Battery API not available on web, assuming 100%');
        }
      } else {
        // Get initial battery info for mobile
        const batteryInfo = await Device.getBatteryInfo();
        // Convert decimal to percentage (0.84 -> 84)
        this.batteryLevel = Math.round((batteryInfo.batteryLevel || 1) * 100);
        
        // Monitor battery level periodically on mobile
        setInterval(async () => {
          try {
            const batteryInfo = await Device.getBatteryInfo();
            // Convert decimal to percentage (0.84 -> 84)
            this.batteryLevel = Math.round((batteryInfo.batteryLevel || 1) * 100);
            this.updateBatteryOptimization();
          } catch (error) {
            console.error('Failed to get battery info:', error);
          }
        }, 60000); // Check every minute
      }
      
      this.updateBatteryOptimization();

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
   * Check if running on web platform
   */
  private isWebPlatform(): boolean {
    return Capacitor.getPlatform() === 'web';
  }

  /**
   * Request location permission with web fallback
   */
  private async requestLocationPermission(): Promise<boolean> {
    if (this.isWebPlatform()) {
      // For web, we'll check permissions during geolocation request
      return true;
    } else {
      const permissions = await Geolocation.requestPermissions();
      return permissions.location === 'granted';
    }
  }

  /**
   * Get current position with web fallback
   */
  private async getCurrentPositionCompat(): Promise<Position> {
    if (this.isWebPlatform()) {
      return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error('Geolocation is not supported by this browser'));
          return;
        }

        navigator.geolocation.getCurrentPosition(
          (position) => {
            resolve({
              coords: {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy,
                altitude: position.coords.altitude,
                altitudeAccuracy: position.coords.altitudeAccuracy,
                heading: position.coords.heading,
                speed: position.coords.speed
              },
              timestamp: position.timestamp
            });
          },
          (error) => {
            reject(new Error(`Geolocation error: ${error.message}`));
          },
          {
            enableHighAccuracy: this.config.highAccuracyOptions.enableHighAccuracy,
            timeout: this.config.highAccuracyOptions.timeout,
            maximumAge: this.config.highAccuracyOptions.maximumAge
          }
        );
      });
    } else {
      return await Geolocation.getCurrentPosition(this.config.highAccuracyOptions);
    }
  }

  /**
   * Watch position with web fallback
   */
  private async watchPositionCompat(): Promise<string> {
    if (this.isWebPlatform()) {
      return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error('Geolocation is not supported by this browser'));
          return;
        }

        const watchId = navigator.geolocation.watchPosition(
          (position) => {
            const capacitorPosition: Position = {
              coords: {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy,
                altitude: position.coords.altitude,
                altitudeAccuracy: position.coords.altitudeAccuracy,
                heading: position.coords.heading,
                speed: position.coords.speed
              },
              timestamp: position.timestamp
            };
            this.handleLocationUpdate(capacitorPosition);
          },
          (error) => {
            this.handleLocationError(new Error(`Geolocation error: ${error.message}`));
          },
          {
            enableHighAccuracy: this.config.highAccuracyOptions.enableHighAccuracy,
            timeout: this.config.highAccuracyOptions.timeout,
            maximumAge: this.config.highAccuracyOptions.maximumAge
          }
        );

        resolve(watchId.toString());
      });
    } else {
      return await Geolocation.watchPosition(
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
    }
  }

  /**
   * Clear watch position with web fallback
   */
  private async clearWatchCompat(watchId: string): Promise<void> {
    if (this.isWebPlatform()) {
      navigator.geolocation.clearWatch(parseInt(watchId));
    } else {
      await Geolocation.clearWatch({ id: watchId });
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
      const hasPermission = await this.requestLocationPermission();
      if (!hasPermission) {
        throw new Error('Location permission not granted');
      }

      this.isTracking = true;
      
      // Use watch position for more efficient tracking
      this.watchId = await this.watchPositionCompat();

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
      await this.clearWatchCompat(this.watchId);
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
      const position = await this.getCurrentPositionCompat();
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

      console.log(`✅ Location acquired: ${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)} (accuracy: ${coords.accuracy}m)`);

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
        console.log(`📍 Location stored successfully: ${address || 'Unknown address'}`);
        
        // Trigger location update event
        if (this.eventListeners.locationUpdate) {
          this.eventListeners.locationUpdate(locationData);
        }

        // Check if we should trigger batch upload
        await this.checkBatchUploadTriggers();
      } else {
        console.warn('⚠️ Failed to store location');
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