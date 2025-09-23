import CryptoJS from 'crypto-js';

export interface EncryptedData {
  data: string;
  iv: string;
  salt: string;
}

export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: string;
  address?: string;
  touristId: string;
}

/**
 * Generates a key from tourist ID and salt using PBKDF2
 */
function generateKey(touristId: string, salt: string): CryptoJS.lib.WordArray {
  return CryptoJS.PBKDF2(touristId, salt, {
    keySize: 256 / 32,
    iterations: 10000,
    hasher: CryptoJS.algo.SHA256
  });
}

/**
 * Encrypts location data using AES-256 with tourist ID as key-salt
 */
export function encryptLocationData(locationData: LocationData, touristId: string): EncryptedData {
  try {
    // Generate random salt and IV
    const salt = CryptoJS.lib.WordArray.random(128 / 8);
    const iv = CryptoJS.lib.WordArray.random(128 / 8);
    
    // Generate key from tourist ID and salt
    const key = generateKey(touristId, salt.toString());
    
    // Convert location data to JSON string
    const dataString = JSON.stringify(locationData);
    
    // Encrypt the data
    const encrypted = CryptoJS.AES.encrypt(dataString, key, {
      iv: iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    });
    
    return {
      data: encrypted.toString(),
      iv: iv.toString(),
      salt: salt.toString()
    };
  } catch (error) {
    console.error('Encryption failed:', error);
    throw new Error('Failed to encrypt location data');
  }
}

/**
 * Decrypts location data using AES-256 with tourist ID as key-salt
 */
export function decryptLocationData(encryptedData: EncryptedData, touristId: string): LocationData {
  try {
    // Generate key from tourist ID and salt
    const key = generateKey(touristId, encryptedData.salt);
    
    // Decrypt the data
    const decrypted = CryptoJS.AES.decrypt(encryptedData.data, key, {
      iv: CryptoJS.enc.Hex.parse(encryptedData.iv),
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    });
    
    // Convert decrypted data back to string
    const decryptedString = decrypted.toString(CryptoJS.enc.Utf8);
    
    if (!decryptedString) {
      throw new Error('Failed to decrypt data - invalid key or corrupted data');
    }
    
    // Parse JSON string back to location data
    return JSON.parse(decryptedString);
  } catch (error) {
    console.error('Decryption failed:', error);
    throw new Error('Failed to decrypt location data');
  }
}

/**
 * Encrypts an array of location data
 */
export function encryptLocationBatch(locations: LocationData[], touristId: string): EncryptedData[] {
  return locations.map(location => encryptLocationData(location, touristId));
}

/**
 * Decrypts an array of encrypted location data
 */
export function decryptLocationBatch(encryptedLocations: EncryptedData[], touristId: string): LocationData[] {
  return encryptedLocations.map(encrypted => decryptLocationData(encrypted, touristId));
}

/**
 * Calculates the distance between two coordinates using Haversine formula
 */
export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

/**
 * Validates if location data is within reasonable bounds
 */
export function validateLocationData(location: LocationData): boolean {
  const { latitude, longitude, accuracy } = location;
  
  // Check if coordinates are within valid ranges
  if (latitude < -90 || latitude > 90) return false;
  if (longitude < -180 || longitude > 180) return false;
  
  // Check if accuracy is reasonable (less than 1000 meters)
  if (accuracy < 0 || accuracy > 1000) return false;
  
  // Check if timestamp is valid
  const timestamp = new Date(location.timestamp);
  if (isNaN(timestamp.getTime())) return false;
  
  // Check if timestamp is not in the future
  if (timestamp.getTime() > Date.now()) return false;
  
  return true;
}

/**
 * Generates a secure hash for location data integrity
 */
export function generateLocationHash(location: LocationData): string {
  const dataString = JSON.stringify({
    latitude: location.latitude,
    longitude: location.longitude,
    timestamp: location.timestamp,
    touristId: location.touristId
  });
  
  return CryptoJS.SHA256(dataString).toString();
}