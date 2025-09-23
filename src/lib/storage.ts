// Local Storage utilities for offline-first functionality
export interface Tourist {
  tourist_id: string;
  email: string;
  name: string;
  nationality: string;
  doc_type: string;
  doc_id: string;
  emergency_contact: string;
  language: string;
  medical_info?: string;
  created_at: string;
  last_known_location?: { lat: number; lng: number };
  qr_code_url: string;
  blockchain_hash: string;
}

export interface Itinerary {
  id: string;
  tourist_id: string;
  destinations: string[];
  start_date: string;
  end_date: string;
  waypoints?: string[];
  auto_checkin_interval: number;
  created_at: string;
}

export interface LocationLog {
  id: string;
  tourist_id: string;
  timestamp: string;
  lat: number;
  lng: number;
  in_restricted_zone: boolean;
}

export interface Incident {
  incident_id: string;
  tourist_id: string;
  lat: number;
  lng: number;
  timestamp: string;
  status: 'Active' | 'Resolved';
}

export interface Alert {
  id: string;
  tourist_id: string;
  last_known_location: { lat: number; lng: number };
  missed_at: string;
  type: string;
}

// Storage keys
const STORAGE_KEYS = {
  CURRENT_USER: 'tourist_current_user',
  ITINERARIES: 'tourist_itineraries',
  LOCATION_LOGS: 'tourist_location_logs',
  INCIDENTS: 'tourist_incidents',
  ALERTS: 'tourist_alerts',
  OFFLINE_QUEUE: 'tourist_offline_queue',
  LANGUAGE: 'tourist_language',
  THEME: 'tourist_theme'
};

// Generic storage functions
export const storage = {
  get: <T>(key: string): T | null => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    } catch {
      return null;
    }
  },

  set: <T>(key: string, value: T): void => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error('Storage error:', error);
    }
  },

  remove: (key: string): void => {
    localStorage.removeItem(key);
  },

  clear: (): void => {
    localStorage.clear();
  }
};

// User management
export const userStorage = {
  getCurrentUser: (): Tourist | null => {
    return storage.get<Tourist>(STORAGE_KEYS.CURRENT_USER);
  },

  setCurrentUser: (user: Tourist): void => {
    storage.set(STORAGE_KEYS.CURRENT_USER, user);
  },

  logout: (): void => {
    storage.remove(STORAGE_KEYS.CURRENT_USER);
  },

  isLoggedIn: (): boolean => {
    return !!userStorage.getCurrentUser();
  }
};

// Itinerary management
export const itineraryStorage = {
  getAll: (): Itinerary[] => {
    return storage.get<Itinerary[]>(STORAGE_KEYS.ITINERARIES) || [];
  },

  add: (itinerary: Itinerary): void => {
    const itineraries = itineraryStorage.getAll();
    itineraries.push(itinerary);
    storage.set(STORAGE_KEYS.ITINERARIES, itineraries);
  },

  getCurrent: (): Itinerary | null => {
    const user = userStorage.getCurrentUser();
    if (!user) return null;
    
    const itineraries = itineraryStorage.getAll();
    return itineraries.find(i => i.tourist_id === user.tourist_id) || null;
  }
};

// Location logging
export const locationStorage = {
  getAll: (): LocationLog[] => {
    return storage.get<LocationLog[]>(STORAGE_KEYS.LOCATION_LOGS) || [];
  },

  add: (log: LocationLog): void => {
    const logs = locationStorage.getAll();
    logs.push(log);
    // Keep only last 20 locations for offline support
    if (logs.length > 20) {
      logs.splice(0, logs.length - 20);
    }
    storage.set(STORAGE_KEYS.LOCATION_LOGS, logs);
  },

  getRecent: (limit: number = 5): LocationLog[] => {
    const logs = locationStorage.getAll();
    return logs.slice(-limit);
  }
};

// Incident management
export const incidentStorage = {
  getAll: (): Incident[] => {
    return storage.get<Incident[]>(STORAGE_KEYS.INCIDENTS) || [];
  },

  add: (incident: Incident): void => {
    const incidents = incidentStorage.getAll();
    incidents.push(incident);
    storage.set(STORAGE_KEYS.INCIDENTS, incidents);
  },

  getActive: (): Incident[] => {
    return incidentStorage.getAll().filter(i => i.status === 'Active');
  }
};

// Alert management
export const alertStorage = {
  getAll: (): Alert[] => {
    return storage.get<Alert[]>(STORAGE_KEYS.ALERTS) || [];
  },

  add: (alert: Alert): void => {
    const alerts = alertStorage.getAll();
    alerts.push(alert);
    storage.set(STORAGE_KEYS.ALERTS, alerts);
  }
};

// Settings
export const settingsStorage = {
  getLanguage: (): string => {
    return storage.get<string>(STORAGE_KEYS.LANGUAGE) || 'en';
  },

  setLanguage: (language: string): void => {
    storage.set(STORAGE_KEYS.LANGUAGE, language);
  },

  getTheme: (): 'light' | 'dark' => {
    return storage.get<'light' | 'dark'>(STORAGE_KEYS.THEME) || 'light';
  },

  setTheme: (theme: 'light' | 'dark'): void => {
    storage.set(STORAGE_KEYS.THEME, theme);
  }
};

// Utility functions
export const generateUUID = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

export const generateQRCodeURL = (touristId: string): string => {
  // Mock QR code URL - in real app, this would generate actual QR code
  return `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect width="200" height="200" fill="white"/><text x="100" y="100" text-anchor="middle" font-family="Arial" font-size="12" fill="black">Tourist ID: ${touristId.slice(0, 8)}</text></svg>`)}`;
};

export const generateBlockchainHash = (touristId: string, docId: string): string => {
  // Mock blockchain hash
  return `0x${btoa(touristId + docId).replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 40)}`;
};

// Password strength checker
export const checkPasswordStrength = (password: string): { score: number; feedback: string } => {
  let score = 0;
  const feedback = [];

  if (password.length >= 8) score += 1;
  else feedback.push('At least 8 characters');

  if (/[A-Z]/.test(password)) score += 1;
  else feedback.push('One uppercase letter');

  if (/[a-z]/.test(password)) score += 1;
  else feedback.push('One lowercase letter');

  if (/\d/.test(password)) score += 1;
  else feedback.push('One number');

  if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) score += 1;
  else feedback.push('One special character');

  return {
    score,
    feedback: feedback.length > 0 ? `Missing: ${feedback.join(', ')}` : 'Strong password!'
  };
};