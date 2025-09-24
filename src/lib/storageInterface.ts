import { LocationData } from './encryption';

// Common interface for both storage managers
export interface StoredLocation {
  id: string;
  timestamp: string;
  isOffline: number; // 0 = online, 1 = offline
  encryptedData: string;
  iv: string;
  salt: string;
}

export interface ILocationStorage {
  initialize(): Promise<void>;
  storeLocation(location: LocationData, isOffline?: boolean): Promise<boolean>;
  getLocationsForUpload(isOffline?: boolean): Promise<StoredLocation[]>;
  clearStoredLocations(isOffline?: boolean): Promise<void>;
  getStorageStats(): Promise<{ online: number; offline: number; total: number }>;
  setTouristId(touristId: string): Promise<void>;
  getTouristId(): Promise<string | null>;
  flushToUpload?(): Promise<void>;
  dispose(): void;
}