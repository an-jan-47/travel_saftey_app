// TypeScript interfaces for the itinerary system

export interface Destination {
  id: string;
  itinerary_id: string;
  user_id: string;
  tourist_id: string;
  name: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  planned_arrival: string; // ISO timestamp
  auto_checkin_interval: number; // seconds
  notes?: string;
  status: 'upcoming' | 'completed' | 'missed' | 'cancelled';
  order_index: number;
  created_at: string;
  updated_at: string;
}

export interface CheckIn {
  id: string;
  destination_id: string;
  user_id: string;
  tourist_id: string;
  checkin_type: 'auto' | 'manual' | 'grace';
  status: 'completed' | 'missed';
  latitude: number;
  longitude: number;
  address?: string;
  distance_from_destination?: number; // meters
  scheduled_time?: string;
  actual_time: string;
  grace_period_end?: string;
  notes?: string;
  created_at: string;
}

export interface EmergencyContact {
  id: string;
  user_id: string;
  tourist_id: string;
  name: string;
  relationship: string;
  phone: string;
  email?: string;
  is_primary: boolean;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export interface ItineraryWithDestinations {
  id: string;
  user_id: string;
  tourist_id: string;
  title?: string;
  destinations: string[];
  start_date: string;
  end_date: string;
  waypoints?: string[];
  auto_checkin_interval: number;
  status: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  destination_details: Destination[];
  checkins?: CheckIn[];
}

export interface LocationCoordinates {
  lat: number;
  lng: number;
}

export interface PlaceSearchResult {
  place_id: string;
  display_name: string;
  name?: string;
  address?: string;
  lat: string;
  lon: string;
  type: string;
  importance: number;
}

export interface DestinationMarker {
  id: string;
  lat: number;
  lng: number;
  title: string;
  status: 'upcoming' | 'completed' | 'missed' | 'cancelled';
  type: 'destination';
  popup: string;
}

export interface CheckInStatus {
  destination_id: string;
  next_checkin_time?: string;
  is_overdue: boolean;
  grace_period_active: boolean;
  grace_period_end?: string;
  distance_from_destination?: number;
  can_checkin: boolean;
}