// Mock API functions to simulate backend functionality
import { Tourist, Itinerary, LocationLog, Incident, Alert } from './storage';

// Mock data for restricted zones (high-risk areas)
export const RESTRICTED_ZONES = [
  {
    id: '1',
    name: 'Border Area - High Risk',
    coordinates: [
      { lat: 28.7041, lng: 77.1025 }, // Delhi area example
      { lat: 28.7141, lng: 77.1125 },
      { lat: 28.6941, lng: 77.1125 },
      { lat: 28.6941, lng: 77.0925 }
    ],
    severity: 'high'
  },
  {
    id: '2',
    name: 'Construction Zone',
    coordinates: [
      { lat: 19.0760, lng: 72.8777 }, // Mumbai area example
      { lat: 19.0860, lng: 72.8877 },
      { lat: 19.0660, lng: 72.8877 },
      { lat: 19.0660, lng: 72.8677 }
    ],
    severity: 'medium'
  }
];

// Mock hazards data
export const MOCK_HAZARDS = [
  {
    id: '1',
    type: 'Weather Alert',
    lat: 28.7041,
    lng: 77.1025,
    severity: 'high',
    message: 'Heavy rainfall expected in Delhi NCR. Avoid outdoor activities.',
    created_at: new Date().toISOString()
  },
  {
    id: '2',
    type: 'Road Closure',
    lat: 19.0760,
    lng: 72.8777,
    severity: 'medium',
    message: 'Marine Drive temporarily closed due to high tide.',
    created_at: new Date().toISOString()
  }
];

// Mock popular destinations
export const POPULAR_DESTINATIONS = [
  'New Delhi',
  'Mumbai',
  'Bangalore',
  'Chennai',
  'Kolkata',
  'Hyderabad',
  'Pune',
  'Ahmedabad',
  'Jaipur',
  'Goa',
  'Kerala',
  'Rajasthan',
  'Himachal Pradesh',
  'Uttarakhand',
  'Tamil Nadu'
];

// Mock Indian languages
export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'hi', name: 'हिंदी (Hindi)' },
  { code: 'bn', name: 'বাংলা (Bengali)' },
  { code: 'te', name: 'తెలుగు (Telugu)' },
  { code: 'mr', name: 'मराठी (Marathi)' },
  { code: 'ta', name: 'தமிழ் (Tamil)' },
  { code: 'gu', name: 'ગુજરાતી (Gujarati)' },
  { code: 'kn', name: 'ಕನ್ನಡ (Kannada)' },
  { code: 'ml', name: 'മലയാളം (Malayalam)' },
  { code: 'or', name: 'ଓଡ଼ିଆ (Odia)' },
  { code: 'pa', name: 'ਪੰਜਾਬੀ (Punjabi)' },
  { code: 'as', name: 'অসমীয়া (Assamese)' }
];

// Mock API functions
export const mockApi = {
  // Authentication
  register: async (userData: Partial<Tourist>): Promise<{ success: boolean; user?: Tourist; error?: string }> => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Mock email validation
    if (!userData.email || !userData.email.includes('@')) {
      return { success: false, error: 'Invalid email address' };
    }
    
    // Mock registration success
    const user: Tourist = {
      tourist_id: `tourist_${Date.now()}`,
      email: userData.email!,
      name: userData.name!,
      nationality: userData.nationality!,
      doc_type: userData.doc_type!,
      doc_id: userData.doc_id!,
      emergency_contact: userData.emergency_contact!,
      language: userData.language || 'en',
      medical_info: userData.medical_info,
      created_at: new Date().toISOString(),
      qr_code_url: `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="white"/><text x="100" y="100" text-anchor="middle" font-size="12">ID: ${userData.doc_id}</text></svg>`)}`,
      blockchain_hash: `0x${btoa(userData.doc_id!).slice(0, 40)}`
    };
    
    return { success: true, user };
  },

  login: async (email: string, password: string): Promise<{ success: boolean; user?: Tourist; error?: string }> => {
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // Mock login - in real app, this would validate against backend
    if (email === 'demo@tourist.com' && password === 'Demo123!') {
      const user: Tourist = {
        tourist_id: 'demo_tourist_123',
        email: 'demo@tourist.com',
        name: 'Demo Tourist',
        nationality: 'Indian',
        doc_type: 'Aadhaar',
        doc_id: '1234-5678-9012',
        emergency_contact: '+91-9876543210',
        language: 'en',
        created_at: new Date().toISOString(),
        qr_code_url: `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="white"/><text x="100" y="100" text-anchor="middle" font-size="12">Demo Tourist</text></svg>')}`,
        blockchain_hash: '0xdemo123abc456def789'
      };
      return { success: true, user };
    }
    
    return { success: false, error: 'Invalid credentials' };
  },

  // Location services
  getCurrentLocation: async (): Promise<{ lat: number; lng: number } | null> => {
    // Mock GPS location (Delhi coordinates)
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          lat: 28.7041 + (Math.random() - 0.5) * 0.01,
          lng: 77.1025 + (Math.random() - 0.5) * 0.01
        });
      }, 500);
    });
  },

  checkRestrictedZone: async (lat: number, lng: number): Promise<{ inZone: boolean; zoneName?: string; severity?: string }> => {
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Simple point-in-polygon check for restricted zones
    for (const zone of RESTRICTED_ZONES) {
      // Simplified check - in real app, use proper geo-fencing library
      const bounds = zone.coordinates;
      const minLat = Math.min(...bounds.map(p => p.lat));
      const maxLat = Math.max(...bounds.map(p => p.lat));
      const minLng = Math.min(...bounds.map(p => p.lng));
      const maxLng = Math.max(...bounds.map(p => p.lng));
      
      if (lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng) {
        return {
          inZone: true,
          zoneName: zone.name,
          severity: zone.severity
        };
      }
    }
    
    return { inZone: false };
  },

  getHazards: async (): Promise<typeof MOCK_HAZARDS> => {
    await new Promise(resolve => setTimeout(resolve, 300));
    return MOCK_HAZARDS;
  },

  // Safety scoring
  calculateSafetyScore: (tourist: Tourist, alerts: Alert[], incidents: Incident[]): number => {
    let score = 100;
    
    // Deduct points for missed check-ins
    score -= alerts.length * 10;
    
    // Deduct points for active incidents
    const activeIncidents = incidents.filter(i => i.status === 'Active');
    score -= activeIncidents.length * 25;
    
    // Bonus points for having emergency contact
    if (tourist.emergency_contact) score += 5;
    
    // Bonus points for medical info
    if (tourist.medical_info) score += 5;
    
    return Math.max(0, Math.min(100, score));
  },

  // Emergency services
  sendSOS: async (incident: Incident): Promise<{ success: boolean; message: string }> => {
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    console.log('🚨 SOS ALERT SENT:', incident);
    console.log('📱 Notifying emergency contacts...');
    console.log('🚔 Alerting local authorities...');
    
    return {
      success: true,
      message: 'SOS alert sent successfully. Emergency services have been notified.'
    };
  },

  // Mock mesh networking
  relaySOSViaMesh: async (incident: Incident): Promise<void> => {
    await new Promise(resolve => setTimeout(resolve, 800));
    console.log('📡 Relaying SOS via nearby devices (mesh network):', incident);
  }
};

// Safety tips in multiple languages (simplified)
export const SAFETY_TIPS = {
  en: [
    "Always inform someone about your travel plans",
    "Keep emergency contacts easily accessible",
    "Stay aware of your surroundings",
    "Avoid isolated areas, especially at night",
    "Keep important documents secure"
  ],
  hi: [
    "हमेशा किसी को अपनी यात्रा की योजना के बारे में बताएं",
    "आपातकालीन संपर्क आसानी से उपलब्ध रखें",
    "अपने आसपास के माहौल से अवगत रहें",
    "अकेले इलाकों से बचें, खासकर रात में",
    "महत्वपूर्ण दस्तावेज सुरक्षित रखें"
  ]
};