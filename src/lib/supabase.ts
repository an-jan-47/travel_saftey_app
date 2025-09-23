import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mensuyrswwixgbvjeuky.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lbnN1eXJzd3dpeGdidmpldWt5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgzNTczODEsImV4cCI6MjA3MzkzMzM4MX0.LM3bXM1nUWmByK3mwAhyLADTe4ngauGhFF9AMIhuOhQ';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Database interfaces
export interface Tourist {
  id: string;
  user_id: string;
  tourist_id: string;
  name: string;
  nationality: string;
  doc_type: string;
  doc_id: string;
  emergency_contact: string;
  language: string;
  medical_info?: string;
  qr_code_url?: string;
  blockchain_hash?: string;
  created_at: string;
  last_known_location?: { lat: number; lng: number };
  updated_at: string;
}

export interface Itinerary {
  id: string;
  user_id: string;
  tourist_id: string;
  destinations: string[];
  start_date: string;
  end_date: string;
  waypoints?: string[];
  auto_checkin_interval: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface LocationLog {
  id: string;
  user_id: string;
  tourist_id: string;
  latitude: number;
  longitude: number;
  address?: string;
  in_restricted_zone: boolean;
  timestamp: string;
}

export interface Incident {
  id: string;
  user_id: string;
  tourist_id: string;
  incident_id: string;
  latitude: number;
  longitude: number;
  status: 'Active' | 'Resolved';
  description?: string;
  created_at: string;
  resolved_at?: string;
}

export interface Alert {
  id: string;
  user_id: string;
  tourist_id: string;
  type: string;
  message: string;
  severity: 'low' | 'medium' | 'high';
  latitude?: number;
  longitude?: number;
  is_read: boolean;
  created_at: string;
}

export interface CheckIn {
  id: string;
  user_id: string;
  tourist_id: string;
  itinerary_id?: string;
  latitude: number;
  longitude: number;
  address?: string;
  status: 'success' | 'missed';
  notes?: string;
  created_at: string;
}

export interface RestrictedZone {
  id: string;
  name: string;
  coordinates: Array<{ lat: number; lng: number }>;
  severity: 'low' | 'medium' | 'high';
  description?: string;
  is_active: boolean;
  created_at: string;
}

export interface Hazard {
  id: string;
  type: string;
  latitude: number;
  longitude: number;
  severity: 'low' | 'medium' | 'high';
  message: string;
  radius_km: number;
  is_active: boolean;
  expires_at?: string;
  created_at: string;
}

// Auth helpers
export const authHelpers = {
  signUp: async (email: string, password: string, metadata: Record<string, string>) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: metadata
      }
    });
    return { data, error };
  },

  signIn: async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    return { data, error };
  },

  signOut: async () => {
    const { error } = await supabase.auth.signOut();
    return { error };
  },

  getCurrentUser: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  },

  onAuthStateChange: (callback: (event: string, session: unknown) => void) => {
    return supabase.auth.onAuthStateChange(callback);
  }
};

// Database helpers
export const dbHelpers = {
  // Tourist profile
  createTouristProfile: async (touristData: Omit<Tourist, 'id' | 'created_at' | 'updated_at'>) => {
    const { data, error } = await supabase
      .from('app_a857ad95a4_tourists')
      .insert(touristData)
      .select()
      .single();
    return { data, error };
  },

  getTouristProfile: async (userId: string) => {
    const { data, error } = await supabase
      .from('app_a857ad95a4_tourists')
      .select('*')
      .eq('user_id', userId)
      .single();
    return { data, error };
  },

  updateTouristProfile: async (userId: string, updates: Partial<Tourist>) => {
    const { data, error } = await supabase
      .from('app_a857ad95a4_tourists')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .select()
      .single();
    return { data, error };
  },

  // Itineraries
  createItinerary: async (itineraryData: Omit<Itinerary, 'id' | 'created_at' | 'updated_at'>) => {
    const { data, error } = await supabase
      .from('app_a857ad95a4_itineraries')
      .insert(itineraryData)
      .select()
      .single();
    return { data, error };
  },

  getUserItineraries: async (userId: string) => {
    const { data, error } = await supabase
      .from('app_a857ad95a4_itineraries')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    return { data, error };
  },

  getCurrentItinerary: async (userId: string) => {
    const { data, error } = await supabase
      .from('app_a857ad95a4_itineraries')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    return { data, error };
  },

  // Location logs
  addLocationLog: async (locationData: Omit<LocationLog, 'id' | 'timestamp'>) => {
    const { data, error } = await supabase
      .from('app_a857ad95a4_location_logs')
      .insert(locationData)
      .select()
      .single();
    return { data, error };
  },

  getRecentLocationLogs: async (userId: string, limit: number = 10) => {
    const { data, error } = await supabase
      .from('app_a857ad95a4_location_logs')
      .select('*')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false })
      .limit(limit);
    return { data, error };
  },

  // Check-ins
  addCheckIn: async (checkInData: Omit<CheckIn, 'id' | 'created_at'>) => {
    const { data, error } = await supabase
      .from('app_a857ad95a4_checkins')
      .insert(checkInData)
      .select()
      .single();
    return { data, error };
  },

  getRecentCheckIns: async (userId: string, limit: number = 10) => {
    const { data, error } = await supabase
      .from('app_a857ad95a4_checkins')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    return { data, error };
  },

  // Incidents
  createIncident: async (incidentData: Omit<Incident, 'id' | 'created_at'>) => {
    const { data, error } = await supabase
      .from('app_a857ad95a4_incidents')
      .insert(incidentData)
      .select()
      .single();
    return { data, error };
  },

  getActiveIncidents: async (userId: string) => {
    const { data, error } = await supabase
      .from('app_a857ad95a4_incidents')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'Active')
      .order('created_at', { ascending: false });
    return { data, error };
  },

  resolveIncident: async (incidentId: string) => {
    const { data, error } = await supabase
      .from('app_a857ad95a4_incidents')
      .update({ 
        status: 'Resolved', 
        resolved_at: new Date().toISOString() 
      })
      .eq('incident_id', incidentId)
      .select()
      .single();
    return { data, error };
  },

  // Alerts
  createAlert: async (alertData: Omit<Alert, 'id' | 'created_at'>) => {
    const { data, error } = await supabase
      .from('app_a857ad95a4_alerts')
      .insert(alertData)
      .select()
      .single();
    return { data, error };
  },

  getUserAlerts: async (userId: string, unreadOnly: boolean = false) => {
    let query = supabase
      .from('app_a857ad95a4_alerts')
      .select('*')
      .eq('user_id', userId);
    
    if (unreadOnly) {
      query = query.eq('is_read', false);
    }
    
    const { data, error } = await query.order('created_at', { ascending: false });
    return { data, error };
  },

  markAlertAsRead: async (alertId: string) => {
    const { data, error } = await supabase
      .from('app_a857ad95a4_alerts')
      .update({ is_read: true })
      .eq('id', alertId)
      .select()
      .single();
    return { data, error };
  },

  // Public data
  getRestrictedZones: async () => {
    const { data, error } = await supabase
      .from('app_a857ad95a4_restricted_zones')
      .select('*')
      .eq('is_active', true);
    return { data, error };
  },

  getActiveHazards: async () => {
    const { data, error } = await supabase
      .from('app_a857ad95a4_hazards')
      .select('*')
      .eq('is_active', true)
      .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString());
    return { data, error };
  }
};

// Utility functions
export const generateTouristId = () => {
  return 'TID-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 5);
};

export const generateQRCodeURL = (touristId: string) => {
  const qrData = {
    tourist_id: touristId,
    app: 'Smart Tourist Safety',
    timestamp: new Date().toISOString()
  };
  
  // In production, use a proper QR code library
  const dataString = JSON.stringify(qrData);
  return `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect width="200" height="200" fill="white"/><text x="100" y="90" text-anchor="middle" font-family="Arial" font-size="10" fill="black">Tourist ID</text><text x="100" y="110" text-anchor="middle" font-family="Arial" font-size="12" font-weight="bold" fill="black">${touristId}</text><text x="100" y="130" text-anchor="middle" font-family="Arial" font-size="8" fill="gray">Scan for verification</text></svg>`)}`;
};

export const generateBlockchainHash = (touristId: string, docId: string) => {
  // Mock blockchain hash - in production, this would be a real blockchain transaction
  const combined = touristId + docId + Date.now();
  return '0x' + btoa(combined).replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 40);
};

// Location utilities
export const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

export const isPointInPolygon = (point: { lat: number; lng: number }, polygon: Array<{ lat: number; lng: number }>): boolean => {
  const x = point.lat;
  const y = point.lng;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat;
    const yi = polygon[i].lng;
    const xj = polygon[j].lat;
    const yj = polygon[j].lng;

    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }

  return inside;
};

// Real-time location services
export const getCurrentLocation = (): Promise<{ lat: number; lng: number }> => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported'));
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
        // Fallback to mock location for demo
        console.warn('Geolocation error, using mock location:', error);
        resolve({
          lat: 28.7041 + (Math.random() - 0.5) * 0.01,
          lng: 77.1025 + (Math.random() - 0.5) * 0.01
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000
      }
    );
  });
};

// Reverse geocoding (mock implementation)
export const reverseGeocode = async (lat: number, lng: number): Promise<string> => {
  // Mock implementation - in production, use Google Maps Geocoding API
  if (lat > 28 && lat < 29 && lng > 77 && lng < 78) {
    return 'New Delhi, India';
  }
  if (lat > 19 && lat < 20 && lng > 72 && lng < 73) {
    return 'Mumbai, India';
  }
  if (lat > 12 && lat < 13 && lng > 77 && lng < 78) {
    return 'Bangalore, India';
  }
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
};