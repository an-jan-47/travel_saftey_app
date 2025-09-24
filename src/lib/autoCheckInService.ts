// Auto Check-in Service - Background service for automatic check-ins
import { ItineraryService } from './itineraryService';
import { Destination, CheckInStatus, LocationCoordinates } from './itineraryTypes';

export class AutoCheckInService {
  private static instance: AutoCheckInService;
  private checkInterval: NodeJS.Timer | null = null;
  private readonly CHECK_FREQUENCY = 30 * 1000; // 30 seconds
  private isRunning = false;
  
  public static getInstance(): AutoCheckInService {
    if (!AutoCheckInService.instance) {
      AutoCheckInService.instance = new AutoCheckInService();
    }
    return AutoCheckInService.instance;
  }

  private constructor() {
    // Start service when created
    this.start();
  }

  public start(): void {
    if (this.isRunning) return;

    console.log('Starting auto check-in service...');
    this.isRunning = true;
    
    // Check immediately on start
    this.performAutoCheckInCheck();
    
    // Set up interval for regular checks
    this.checkInterval = setInterval(() => {
      this.performAutoCheckInCheck();
    }, this.CHECK_FREQUENCY);

    // Listen for online/offline events
    window.addEventListener('online', this.handleOnlineEvent.bind(this));
    window.addEventListener('offline', this.handleOfflineEvent.bind(this));
  }

  public stop(): void {
    if (!this.isRunning) return;

    console.log('Stopping auto check-in service...');
    this.isRunning = false;
    
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    window.removeEventListener('online', this.handleOnlineEvent.bind(this));
    window.removeEventListener('offline', this.handleOfflineEvent.bind(this));
  }

  private async performAutoCheckInCheck(): Promise<void> {
    try {
      const itineraryService = ItineraryService.getInstance();
      
      // Get current location
      const location = await this.getCurrentLocation();
      if (!location) {
        console.log('Unable to get current location for auto check-in');
        return;
      }

      // Get all active itineraries
      const itineraries = await itineraryService.getItineraries();
      const activeItineraries = itineraries.filter(it => it.status === 'active');

      for (const itinerary of activeItineraries) {
        if (!itinerary.destination_details) continue;

        for (const destination of itinerary.destination_details) {
          if (destination.status !== 'upcoming') continue;
          
          await this.checkDestinationAutoCheckIn(destination, location);
        }
      }
    } catch (error) {
      console.error('Error during auto check-in check:', error);
    }
  }

  private async checkDestinationAutoCheckIn(destination: Destination, location: LocationCoordinates): Promise<void> {
    try {
      const itineraryService = ItineraryService.getInstance();
      
      // Check the status for this destination
      const status = await itineraryService.checkAutoCheckInStatus(destination.id, location);
      
      // Log current status for debugging
      console.log(`Destination ${destination.name}:`, {
        isOverdue: status.is_overdue,
        gracePeriodActive: status.grace_period_active,
        canCheckIn: status.can_checkin,
        distance: status.distance_from_destination
      });

      // If we're overdue and can check in, perform auto check-in
      if (status.is_overdue && status.can_checkin) {
        console.log(`Performing auto check-in for ${destination.name}`);
        
        // Determine check-in type
        const checkinType = status.grace_period_active ? 'grace' : 'auto';
        
        const result = await itineraryService.performManualCheckIn(
          destination.id,
          location,
          `Auto check-in (${checkinType})`
        );

        if (result) {
          // Show notification if supported
          this.showNotification(
            'Auto Check-in Complete',
            `Checked in to ${destination.name}`,
            'success'
          );
          
          console.log(`Successfully auto-checked-in to ${destination.name}`);
        } else {
          console.error(`Failed to auto check-in to ${destination.name}`);
        }
      } 
      // If we're in grace period but can't check in (too far), show warning
      else if (status.grace_period_active && !status.can_checkin) {
        this.showNotification(
          'Check-in Required',
          `You need to check in to ${destination.name} but you're too far away (${(status.distance_from_destination! / 1000).toFixed(1)}km)`,
          'warning'
        );
      }
      // If grace period ended and we missed it
      else if (status.is_overdue && !status.grace_period_active) {
        // Mark as missed and notify
        await itineraryService.updateDestination(destination.id, { status: 'missed' });
        
        this.showNotification(
          'Missed Check-in',
          `Missed check-in for ${destination.name}. Grace period expired.`,
          'error'
        );
        
        console.log(`Missed check-in for ${destination.name}`);
      }
    } catch (error) {
      console.error(`Error checking auto check-in for ${destination.name}:`, error);
    }
  }

  private getCurrentLocation(): Promise<LocationCoordinates | null> {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(null);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => {
          console.error('Error getting location for auto check-in:', error);
          resolve(null);
        },
        {
          enableHighAccuracy: false, // Use less battery for background checks
          timeout: 10000,
          maximumAge: 60000 // Accept location up to 1 minute old
        }
      );
    });
  }

  private showNotification(title: string, message: string, type: 'success' | 'warning' | 'error'): void {
    // Check if notifications are supported and permitted
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        const notification = new Notification(title, {
          body: message,
          icon: type === 'success' ? '✅' : type === 'warning' ? '⚠️' : '❌',
          badge: '/favicon.svg',
          tag: `checkin-${Date.now()}`,
          requireInteraction: type === 'error' // Keep error notifications visible
        });

        // Auto-close success notifications after 5 seconds
        if (type === 'success') {
          setTimeout(() => notification.close(), 5000);
        }
      } catch (error) {
        console.error('Error showing notification:', error);
      }
    }
    
    // Fallback to console for development
    console.log(`${type.toUpperCase()}: ${title} - ${message}`);
  }

  private handleOnlineEvent(): void {
    console.log('Device came online - resuming auto check-in service');
    if (!this.isRunning) {
      this.start();
    }
    
    // Sync offline data
    const itineraryService = ItineraryService.getInstance();
    itineraryService.syncOfflineData();
  }

  private handleOfflineEvent(): void {
    console.log('Device went offline - auto check-in service will continue but may store data locally');
  }

  // Request notification permission
  public async requestNotificationPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      console.log('This browser does not support notifications');
      return false;
    }

    if (Notification.permission === 'granted') {
      return true;
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }

    return false;
  }

  // Get service status
  public getStatus(): {
    isRunning: boolean;
    checkFrequency: number;
    notificationPermission: string;
  } {
    return {
      isRunning: this.isRunning,
      checkFrequency: this.CHECK_FREQUENCY,
      notificationPermission: 'Notification' in window ? Notification.permission : 'not-supported'
    };
  }

  // Force a check (for testing or manual triggers)
  public async forceCheck(): Promise<void> {
    console.log('Forcing auto check-in check...');
    await this.performAutoCheckInCheck();
  }
}