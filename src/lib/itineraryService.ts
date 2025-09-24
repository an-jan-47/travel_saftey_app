// Itinerary Service - Comprehensive management for destinations, check-ins, and emergency contacts

import { supabase } from './supabase';
import { 
  Destination, 
  CheckIn, 
  EmergencyContact, 
  ItineraryWithDestinations,
  CheckInStatus,
  LocationCoordinates,
  PlaceSearchResult 
} from './itineraryTypes';
import CryptoJS from 'crypto-js';

const ENCRYPTION_KEY = 'travel-safety-itinerary-key';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export class ItineraryService {
  private static instance: ItineraryService;
  
  public static getInstance(): ItineraryService {
    if (!ItineraryService.instance) {
      ItineraryService.instance = new ItineraryService();
    }
    return ItineraryService.instance;
  }

  // Encryption helpers
  private encrypt(data: any): string {
    return CryptoJS.AES.encrypt(JSON.stringify(data), ENCRYPTION_KEY).toString();
  }

  private decrypt(encryptedData: string): any {
    try {
      const bytes = CryptoJS.AES.decrypt(encryptedData, ENCRYPTION_KEY);
      return JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
    } catch (error) {
      console.error('Decryption failed:', error);
      return null;
    }
  }

  // Cache management
  private setCachedData(key: string, data: any): void {
    const cacheItem = {
      data: this.encrypt(data),
      timestamp: Date.now()
    };
    localStorage.setItem(`itinerary_cache_${key}`, JSON.stringify(cacheItem));
  }

  private getCachedData(key: string): any {
    try {
      const cached = localStorage.getItem(`itinerary_cache_${key}`);
      if (!cached) return null;

      const cacheItem = JSON.parse(cached);
      const isExpired = Date.now() - cacheItem.timestamp > CACHE_DURATION;
      
      if (isExpired) {
        localStorage.removeItem(`itinerary_cache_${key}`);
        return null;
      }

      return this.decrypt(cacheItem.data);
    } catch (error) {
      console.error('Cache retrieval failed:', error);
      return null;
    }
  }

  // Itinerary Management
  async createItinerary(data: Partial<ItineraryWithDestinations>): Promise<ItineraryWithDestinations | null> {
    try {
      const touristId = localStorage.getItem('tourist_id');
      if (!touristId) throw new Error('Tourist ID not found');

      const { data: result, error } = await supabase
        .from('app_a857ad95a4_itineraries')
        .insert([{
          tourist_id: touristId,
          destinations: data.destinations || [],
          start_date: data.start_date,
          end_date: data.end_date,
          waypoints: data.waypoints || [],
          auto_checkin_interval: data.auto_checkin_interval || 21600, // 6 hours default
          status: data.status || 'active',
          notes: data.notes
        }])
        .select()
        .single();

      if (error) throw error;
      
      // Clear cache
      localStorage.removeItem('itinerary_cache_list');
      
      return { ...result, destination_details: [] };
    } catch (error) {
      console.error('Error creating itinerary:', error);
      return null;
    }
  }

  async getItineraries(): Promise<ItineraryWithDestinations[]> {
    try {
      // Check cache first
      const cached = this.getCachedData('list');
      if (cached && navigator.onLine === false) {
        return cached;
      }

      const touristId = localStorage.getItem('tourist_id');
      if (!touristId) return [];

      const { data: itineraries, error } = await supabase
        .from('app_a857ad95a4_itineraries')
        .select(`
          *,
          destination_details:app_a857ad95a4_destinations(*)
        `)
        .eq('tourist_id', touristId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const result = itineraries || [];
      
      // Cache the result
      this.setCachedData('list', result);
      
      return result;
    } catch (error) {
      console.error('Error fetching itineraries:', error);
      
      // Return cached data if available
      const cached = this.getCachedData('list');
      return cached || [];
    }
  }

  async getItinerary(itineraryId: string): Promise<ItineraryWithDestinations | null> {
    try {
      // Check cache first
      const cached = this.getCachedData(itineraryId);
      if (cached && navigator.onLine === false) {
        return cached;
      }

      const { data, error } = await supabase
        .from('app_a857ad95a4_itineraries')
        .select(`
          *,
          destination_details:app_a857ad95a4_destinations(*),
          checkins:app_a857ad95a4_checkins(*)
        `)
        .eq('id', itineraryId)
        .single();

      if (error) throw error;

      // Cache the result
      this.setCachedData(itineraryId, data);
      
      return data;
    } catch (error) {
      console.error('Error fetching itinerary:', error);
      
      // Return cached data if available
      const cached = this.getCachedData(itineraryId);
      return cached;
    }
  }

  // Destination Management
  async addDestination(itineraryId: string, destinationData: Partial<Destination>): Promise<Destination | null> {
    try {
      const touristId = localStorage.getItem('tourist_id');
      if (!touristId) throw new Error('Tourist ID not found');

      // Get current max order_index
      const { data: destinations } = await supabase
        .from('app_a857ad95a4_destinations')
        .select('order_index')
        .eq('itinerary_id', itineraryId)
        .order('order_index', { ascending: false })
        .limit(1);

      const nextOrderIndex = destinations && destinations.length > 0 
        ? destinations[0].order_index + 1 
        : 0;

      const { data: result, error } = await supabase
        .from('app_a857ad95a4_destinations')
        .insert([{
          itinerary_id: itineraryId,
          tourist_id: touristId,
          name: destinationData.name,
          latitude: destinationData.latitude,
          longitude: destinationData.longitude,
          planned_arrival: destinationData.planned_arrival,
          auto_checkin_interval: destinationData.auto_checkin_interval || 21600,
          notes: destinationData.notes,
          order_index: nextOrderIndex,
          status: 'upcoming'
        }])
        .select()
        .single();

      if (error) throw error;

      // Clear caches
      localStorage.removeItem('itinerary_cache_list');
      localStorage.removeItem(`itinerary_cache_${itineraryId}`);
      
      return result;
    } catch (error) {
      console.error('Error adding destination:', error);
      return null;
    }
  }

  async updateDestination(destinationId: string, updates: Partial<Destination>): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('app_a857ad95a4_destinations')
        .update(updates)
        .eq('id', destinationId);

      if (error) throw error;

      // Clear relevant caches
      const { data: destination } = await supabase
        .from('app_a857ad95a4_destinations')
        .select('itinerary_id')
        .eq('id', destinationId)
        .single();

      if (destination) {
        localStorage.removeItem('itinerary_cache_list');
        localStorage.removeItem(`itinerary_cache_${destination.itinerary_id}`);
      }

      return true;
    } catch (error) {
      console.error('Error updating destination:', error);
      return false;
    }
  }

  async deleteDestination(destinationId: string): Promise<boolean> {
    try {
      // Get itinerary_id before deletion for cache clearing
      const { data: destination } = await supabase
        .from('app_a857ad95a4_destinations')
        .select('itinerary_id')
        .eq('id', destinationId)
        .single();

      const { error } = await supabase
        .from('app_a857ad95a4_destinations')
        .delete()
        .eq('id', destinationId);

      if (error) throw error;

      // Clear caches
      if (destination) {
        localStorage.removeItem('itinerary_cache_list');
        localStorage.removeItem(`itinerary_cache_${destination.itinerary_id}`);
      }

      return true;
    } catch (error) {
      console.error('Error deleting destination:', error);
      return false;
    }
  }

  // Check-in Management
  async performManualCheckIn(destinationId: string, location: LocationCoordinates, notes?: string): Promise<CheckIn | null> {
    try {
      const touristId = localStorage.getItem('tourist_id');
      if (!touristId) throw new Error('Tourist ID not found');

      // Get destination details
      const { data: destination } = await supabase
        .from('app_a857ad95a4_destinations')
        .select('*')
        .eq('id', destinationId)
        .single();

      if (!destination) throw new Error('Destination not found');

      // Calculate distance if destination has coordinates
      let distance = null;
      if (destination.latitude && destination.longitude) {
        distance = this.calculateDistance(
          location.lat, 
          location.lng,
          destination.latitude,
          destination.longitude
        );
      }

      const { data: result, error } = await supabase
        .from('app_a857ad95a4_checkins')
        .insert([{
          destination_id: destinationId,
          tourist_id: touristId,
          checkin_type: 'manual',
          status: 'completed',
          latitude: location.lat,
          longitude: location.lng,
          distance_from_destination: distance,
          notes
        }])
        .select()
        .single();

      if (error) throw error;

      // Update destination status if this is the first check-in
      await this.updateDestination(destinationId, { status: 'completed' });

      return result;
    } catch (error) {
      console.error('Error performing manual check-in:', error);
      return null;
    }
  }

  async getDestinationCheckIns(destinationId: string): Promise<CheckIn[]> {
    try {
      const { data, error } = await supabase
        .from('app_a857ad95a4_checkins')
        .select('*')
        .eq('destination_id', destinationId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching check-ins:', error);
      return [];
    }
  }

  // Emergency Contacts Management
  async getEmergencyContacts(): Promise<EmergencyContact[]> {
    try {
      const cached = this.getCachedData('emergency_contacts');
      if (cached && navigator.onLine === false) {
        return cached;
      }

      const touristId = localStorage.getItem('tourist_id');
      if (!touristId) return [];

      const { data, error } = await supabase
        .from('app_a857ad95a4_emergency_contacts')
        .select('*')
        .eq('tourist_id', touristId)
        .order('order_index');

      if (error) throw error;

      const result = data || [];
      this.setCachedData('emergency_contacts', result);
      
      return result;
    } catch (error) {
      console.error('Error fetching emergency contacts:', error);
      const cached = this.getCachedData('emergency_contacts');
      return cached || [];
    }
  }

  async addEmergencyContact(contactData: Partial<EmergencyContact>): Promise<EmergencyContact | null> {
    try {
      const touristId = localStorage.getItem('tourist_id');
      if (!touristId) throw new Error('Tourist ID not found');

      // Check if we already have 3 contacts
      const existing = await this.getEmergencyContacts();
      if (existing.length >= 3) {
        throw new Error('Maximum of 3 emergency contacts allowed');
      }

      // Get next order index
      const nextOrderIndex = existing.length;

      const { data: result, error } = await supabase
        .from('app_a857ad95a4_emergency_contacts')
        .insert([{
          tourist_id: touristId,
          name: contactData.name,
          relationship: contactData.relationship,
          phone: contactData.phone,
          email: contactData.email,
          is_primary: existing.length === 0 ? true : (contactData.is_primary || false),
          order_index: nextOrderIndex
        }])
        .select()
        .single();

      if (error) throw error;

      // Clear cache
      localStorage.removeItem('itinerary_cache_emergency_contacts');
      
      return result;
    } catch (error) {
      console.error('Error adding emergency contact:', error);
      return null;
    }
  }

  async updateEmergencyContact(contactId: string, updates: Partial<EmergencyContact>): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('app_a857ad95a4_emergency_contacts')
        .update(updates)
        .eq('id', contactId);

      if (error) throw error;

      // Clear cache
      localStorage.removeItem('itinerary_cache_emergency_contacts');
      
      return true;
    } catch (error) {
      console.error('Error updating emergency contact:', error);
      return false;
    }
  }

  async deleteEmergencyContact(contactId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('app_a857ad95a4_emergency_contacts')
        .delete()
        .eq('id', contactId);

      if (error) throw error;

      // Clear cache
      localStorage.removeItem('itinerary_cache_emergency_contacts');
      
      return true;
    } catch (error) {
      console.error('Error deleting emergency contact:', error);
      return false;
    }
  }

  // Auto Check-in Logic
  async checkAutoCheckInStatus(destinationId: string, currentLocation: LocationCoordinates): Promise<CheckInStatus> {
    try {
      const { data: destination } = await supabase
        .from('app_a857ad95a4_destinations')
        .select('*')
        .eq('id', destinationId)
        .single();

      if (!destination) {
        throw new Error('Destination not found');
      }

      // Get latest check-in
      const { data: latestCheckIn } = await supabase
        .from('app_a857ad95a4_checkins')
        .select('*')
        .eq('destination_id', destinationId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      const now = new Date();
      const plannedArrival = new Date(destination.planned_arrival);
      const interval = destination.auto_checkin_interval * 1000; // Convert to milliseconds
      
      let nextCheckInTime: Date;
      
      if (latestCheckIn) {
        const lastCheckIn = new Date(latestCheckIn.actual_time);
        nextCheckInTime = new Date(lastCheckIn.getTime() + interval);
      } else {
        nextCheckInTime = plannedArrival;
      }

      const isOverdue = now > nextCheckInTime;
      const gracePeriodEnd = new Date(nextCheckInTime.getTime() + (10 * 60 * 1000)); // 10 minutes
      const gracePeriodActive = isOverdue && now <= gracePeriodEnd;

      // Calculate distance from destination
      let distance = null;
      let canCheckIn = false;

      if (destination.latitude && destination.longitude) {
        distance = this.calculateDistance(
          currentLocation.lat,
          currentLocation.lng,
          destination.latitude,
          destination.longitude
        );
        
        // Can check-in if within 2km radius
        canCheckIn = distance <= 2000;
      } else {
        // If no destination coordinates, allow check-in
        canCheckIn = true;
      }

      return {
        destination_id: destinationId,
        next_checkin_time: nextCheckInTime.toISOString(),
        is_overdue: isOverdue,
        grace_period_active: gracePeriodActive,
        grace_period_end: gracePeriodActive ? gracePeriodEnd.toISOString() : undefined,
        distance_from_destination: distance,
        can_checkin: canCheckIn
      };
    } catch (error) {
      console.error('Error checking auto check-in status:', error);
      return {
        destination_id: destinationId,
        is_overdue: false,
        grace_period_active: false,
        can_checkin: false
      };
    }
  }

  // Utility Functions
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  async searchPlaces(query: string): Promise<PlaceSearchResult[]> {
    try {
      // Using Nominatim API for place search (free alternative to Google Places)
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`
      );
      
      if (!response.ok) throw new Error('Search failed');
      
      const data = await response.json();
      
      return data.map((item: any) => ({
        place_id: item.place_id,
        display_name: item.display_name,
        lat: item.lat,
        lon: item.lon,
        type: item.type,
        importance: item.importance
      }));
    } catch (error) {
      console.error('Error searching places:', error);
      return [];
    }
  }

  // Offline storage management
  async syncOfflineData(): Promise<void> {
    if (!navigator.onLine) return;

    try {
      // Get all offline data
      const offlineKeys = Object.keys(localStorage)
        .filter(key => key.startsWith('offline_'));

      for (const key of offlineKeys) {
        const data = localStorage.getItem(key);
        if (data) {
          const decryptedData = this.decrypt(data);
          if (decryptedData) {
            // Process offline data based on type
            if (key.includes('checkin')) {
              await this.syncOfflineCheckIn(decryptedData);
            } else if (key.includes('destination')) {
              await this.syncOfflineDestination(decryptedData);
            }
            // Remove from offline storage after successful sync
            localStorage.removeItem(key);
          }
        }
      }
    } catch (error) {
      console.error('Error syncing offline data:', error);
    }
  }

  private async syncOfflineCheckIn(checkInData: any): Promise<void> {
    try {
      await this.performManualCheckIn(
        checkInData.destination_id,
        { lat: checkInData.latitude, lng: checkInData.longitude },
        checkInData.notes
      );
    } catch (error) {
      console.error('Error syncing offline check-in:', error);
    }
  }

  private async syncOfflineDestination(destinationData: any): Promise<void> {
    try {
      if (destinationData.id) {
        await this.updateDestination(destinationData.id, destinationData);
      } else {
        await this.addDestination(destinationData.itinerary_id, destinationData);
      }
    } catch (error) {
      console.error('Error syncing offline destination:', error);
    }
  }

  // Store data offline when network is unavailable
  storeOfflineCheckIn(destinationId: string, location: LocationCoordinates, notes?: string): void {
    const checkInData = {
      destination_id: destinationId,
      latitude: location.lat,
      longitude: location.lng,
      notes,
      timestamp: Date.now()
    };
    
    const key = `offline_checkin_${destinationId}_${Date.now()}`;
    localStorage.setItem(key, this.encrypt(checkInData));
  }
}