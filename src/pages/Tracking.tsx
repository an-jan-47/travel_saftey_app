import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, AlertTriangle, Shield, Wifi, WifiOff, Battery, BatteryLow } from 'lucide-react';
import { toast } from 'sonner';
import { authHelpers, dbHelpers, getCurrentLocation, reverseGeocode, isPointInPolygon, LocationLog, RestrictedZone, Hazard } from '@/lib/supabase';
import { LeafletMap, MapMarker } from '@/components/LeafletMap';
import { LocationService } from '@/lib/locationService';
import { SimpleLocationStorageManager } from '@/lib/locationStorageSimple';
import { BatchUploadService } from '@/lib/batchUpload';

const Tracking: React.FC = () => {
  const [isTracking, setIsTracking] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number; address: string } | null>(null);
  const [locationLogs, setLocationLogs] = useState<LocationLog[]>([]);
  const [restrictedZones, setRestrictedZones] = useState<RestrictedZone[]>([]);
  const [hazards, setHazards] = useState<Hazard[]>([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [geoFencing, setGeoFencing] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [batteryLevel, setBatteryLevel] = useState(100);
  const [isLowBattery, setIsLowBattery] = useState(false);
  const [storageStats, setStorageStats] = useState({ online: 0, offline: 0, total: 0 });
  
  // Service references
  const locationServiceRef = useRef<LocationService | null>(null);
  const storageManagerRef = useRef<SimpleLocationStorageManager | null>(null);
  const batchUploadServiceRef = useRef<BatchUploadService | null>(null);
  const trackingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // State refs for event handlers
  const isTrackingRef = useRef(isTracking);
  const geoFencingRef = useRef(geoFencing);
  
  // Update refs when state changes
  useEffect(() => {
    isTrackingRef.current = isTracking;
  }, [isTracking]);
  
  useEffect(() => {
    geoFencingRef.current = geoFencing;
  }, [geoFencing]);

  const loadTrackingData = useCallback(async () => {
    try {
      const user = await authHelpers.getCurrentUser();
      if (!user) return;

      // Initialize services
      await initializeServices();

      // Load recent location logs
      const { data: logsData, error: logsError } = await dbHelpers.getRecentLocationLogs(user.id, 50);
      if (logsError) {
        console.error('Error loading location logs:', logsError);
      } else if (logsData) {
        setLocationLogs(logsData);
      }

      // Load restricted zones
      const { data: zonesData, error: zonesError } = await dbHelpers.getRestrictedZones();
      if (zonesError) {
        console.error('Error loading restricted zones:', zonesError);
      } else if (zonesData) {
        setRestrictedZones(zonesData);
      }

      // Load active hazards
      const { data: hazardsData, error: hazardsError } = await dbHelpers.getActiveHazards();
      if (hazardsError) {
        console.error('Error loading hazards:', hazardsError);
      } else if (hazardsData) {
        setHazards(hazardsData);
      }

      // Get current location
      await updateLocation();

    } catch (error) {
      console.error('Error loading tracking data:', error);
      toast.error('Failed to load tracking data');
    } finally {
      setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initializeServices = useCallback(async () => {
    try {
      const user = await authHelpers.getCurrentUser();
      if (!user) return;

      const { data: profile } = await dbHelpers.getTouristProfile(user.id);
      if (!profile) return;

      // Initialize storage manager
      storageManagerRef.current = new SimpleLocationStorageManager();
      await storageManagerRef.current.initialize();
      await storageManagerRef.current.setTouristId(profile.tourist_id);

      // Initialize location service
      locationServiceRef.current = new LocationService(
        profile.tourist_id,
        storageManagerRef.current
      );

      // Initialize batch upload service
      batchUploadServiceRef.current = new BatchUploadService(storageManagerRef.current);

      // Set up event listeners
      locationServiceRef.current.addEventListener('locationUpdate', async (location) => {
        setCurrentLocation({
          lat: location.latitude,
          lng: location.longitude,
          address: location.address || ''
        });
        
        // Check for geo-fencing violations if tracking is active
        if (isTrackingRef.current && geoFencingRef.current) {
          await checkGeoFencing({ lat: location.latitude, lng: location.longitude });
        }

        // Log location to database if tracking is active (for UI display)
        if (isTrackingRef.current) {
          await logLocationToDatabase({ lat: location.latitude, lng: location.longitude }, location.address || '');
        }
        
        // Update storage stats
        if (storageManagerRef.current) {
          try {
            const stats = await storageManagerRef.current.getStorageStats();
            setStorageStats(stats);
          } catch (error) {
            console.error('Failed to update storage stats:', error);
          }
        }
      });

      locationServiceRef.current.addEventListener('locationError', (error) => {
        toast.error(`Location error: ${error.message}`);
      });

      locationServiceRef.current.addEventListener('batteryOptimization', (enabled) => {
        setIsLowBattery(enabled);
        toast.info(enabled ? 'Battery optimization enabled' : 'Battery optimization disabled');
      });

      locationServiceRef.current.addEventListener('networkStatusChange', (online) => {
        setIsOnline(online);
        if (online) {
          toast.success('Network reconnected');
        } else {
          toast.warning('Network disconnected - using offline mode');
        }
      });

      // Set up batch upload event listener
      window.addEventListener('locationBatchUpload', handleBatchUpload);

      // Update storage stats
      updateStorageStats();

      // Start location tracking automatically
      if (locationServiceRef.current) {
        await locationServiceRef.current.startTracking();
        setIsTracking(true);
        toast.success('Location tracking started automatically');
      }

    } catch (error) {
      console.error('Failed to initialize services:', error);
      toast.error('Failed to initialize location services');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateStorageStats = useCallback(async () => {
    if (storageManagerRef.current) {
      try {
        const stats = await storageManagerRef.current.getStorageStats();
        setStorageStats(stats);
      } catch (error) {
        console.error('Failed to update storage stats:', error);
      }
    }
  }, []);

  const handleBatchUpload = useCallback(async () => {
    if (batchUploadServiceRef.current) {
      try {
        const result = await batchUploadServiceRef.current.uploadPendingLocations();
        if (result.success) {
          toast.success(`Uploaded ${result.uploaded} locations`);
          updateStorageStats();
        } else {
          toast.error(`Failed to upload locations: ${result.error}`);
        }
      } catch (error) {
        console.error('Batch upload failed:', error);
      }
    }
  }, [updateStorageStats]);

  useEffect(() => {
    loadTrackingData();
    
    // Monitor online status
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('locationBatchUpload', handleBatchUpload);
      
      // Cleanup services
      if (locationServiceRef.current) {
        locationServiceRef.current.dispose();
      }
      if (storageManagerRef.current) {
        storageManagerRef.current.dispose();
      }
      if (batchUploadServiceRef.current) {
        batchUploadServiceRef.current.dispose();
      }
    };
  }, [loadTrackingData, handleBatchUpload]);

  const updateLocation = async () => {
    try {
      const location = await getCurrentLocation();
      const address = await reverseGeocode(location.lat, location.lng);
      
      setCurrentLocation({
        lat: location.lat,
        lng: location.lng,
        address
      });

      // Check for geo-fencing violations
      if (geoFencing) {
        await checkGeoFencing(location);
      }

      // Log location if tracking is active
      if (isTracking) {
        await logLocationToDatabase(location, address);
      }

    } catch (error) {
      console.error('Error updating location:', error);
      if (isTracking) {
        toast.error('Failed to update location');
      }
    }
  };

  const checkGeoFencing = async (location: { lat: number; lng: number }) => {
    try {
      const user = await authHelpers.getCurrentUser();
      if (!user) return;

      // Check restricted zones
      for (const zone of restrictedZones) {
        if (isPointInPolygon(location, zone.coordinates)) {
          toast.error(`Warning: You are in a restricted area - ${zone.name}`);
          
          // Create alert
          const { data: profile } = await dbHelpers.getTouristProfile(user.id);
          if (profile) {
            await dbHelpers.createAlert({
              user_id: user.id,
              tourist_id: profile.tourist_id,
              type: 'Geo-fence Violation',
              message: `Entered restricted zone: ${zone.name}. ${zone.description}`,
              severity: zone.severity,
              latitude: location.lat,
              longitude: location.lng,
              is_read: false
            });
          }
          break;
        }
      }

      // Check hazards
      for (const hazard of hazards) {
        const distance = calculateDistance(
          location.lat, location.lng,
          hazard.latitude, hazard.longitude
        );
        
        if (distance <= hazard.radius_km) {
          toast.warning(`${hazard.type}: ${hazard.message}`);
          
          // Create alert
          const { data: profile } = await dbHelpers.getTouristProfile(user.id);
          if (profile) {
            await dbHelpers.createAlert({
              user_id: user.id,
              tourist_id: profile.tourist_id,
              type: hazard.type,
              message: hazard.message,
              severity: hazard.severity,
              latitude: location.lat,
              longitude: location.lng,
              is_read: false
            });
          }
          break;
        }
      }
    } catch (error) {
      console.error('Error checking geo-fencing:', error);
    }
  };

  const logLocationToDatabase = async (location: { lat: number; lng: number }, address: string) => {
    try {
      const user = await authHelpers.getCurrentUser();
      if (!user) return;

      const { data: profile } = await dbHelpers.getTouristProfile(user.id);
      if (!profile) return;

      // Check if in restricted zone
      const inRestrictedZone = restrictedZones.some(zone => 
        isPointInPolygon(location, zone.coordinates)
      );

      const { data, error } = await dbHelpers.addLocationLog({
        user_id: user.id,
        tourist_id: profile.tourist_id,
        latitude: location.lat,
        longitude: location.lng,
        address,
        in_restricted_zone: inRestrictedZone
      });

      if (error) {
        console.error('Error logging location:', error);
      } else if (data) {
        setLocationLogs(prev => [data, ...prev.slice(0, 49)]);
      }
    } catch (error) {
      console.error('Error logging location:', error);
    }
  };

  const getMapMarkers = (): MapMarker[] => {
    const markers: MapMarker[] = [];
    
    // Current location
    if (currentLocation) {
      markers.push({
        lat: currentLocation.lat,
        lng: currentLocation.lng,
        title: 'Current Location',
        type: 'current' as const,
        popup: `Current Location: ${currentLocation.address}`
      });
    }

    // Recent location logs
    locationLogs.slice(0, 10).forEach((log, index) => {
      markers.push({
        lat: log.latitude,
        lng: log.longitude,
        title: `Location ${index + 1}`,
        type: 'log' as const,
        popup: `Location ${index + 1}: ${log.address || 'No address'}<br/>Time: ${new Date(log.timestamp).toLocaleString()}`
      });
    });

    // Hazards
    hazards.forEach(hazard => {
      markers.push({
        lat: hazard.latitude,
        lng: hazard.longitude,
        title: hazard.type,
        type: 'hazard' as const,
        popup: `${hazard.type}: ${hazard.message}<br/>Radius: ${hazard.radius_km}km`
      });
    });

    return markers;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Live Tracking</h1>
          <p className="text-muted-foreground">Real-time location monitoring and geo-fencing</p>
        </div>
        
        <div className="flex items-center gap-2">
          {isOnline ? (
            <Badge variant="default" className="gap-1">
              <Wifi className="w-3 h-3" />
              Online
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-1">
              <WifiOff className="w-3 h-3" />
              Offline
            </Badge>
          )}
        </div>
      </div>

      {/* Map */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5" />
            Live Map
          </CardTitle>
          <CardDescription>
            {currentLocation ? `Current: ${currentLocation.address}` : 'Loading location...'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[400px] rounded-lg overflow-hidden">
            {currentLocation ? (
              <LeafletMap
                center={currentLocation}
                markers={getMapMarkers()}
                restrictedZones={restrictedZones}
                zoom={15}
                className="w-full h-full"
              />
            ) : (
              <div className="w-full h-full bg-gray-100 rounded-lg flex items-center justify-center">
                <p className="text-muted-foreground">Loading map...</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Safety Zones & Hazards */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Safety Information
            </CardTitle>
            <CardDescription>
              {restrictedZones.length} restricted zones, {hazards.length} active hazards
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold text-sm mb-2">Restricted Zones</h4>
                <div className="space-y-2">
                  {restrictedZones.map((zone) => (
                    <div key={zone.id} className="p-2 border rounded">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-sm">{zone.name}</p>
                        <Badge variant={
                          zone.severity === 'high' ? 'destructive' :
                          zone.severity === 'medium' ? 'secondary' : 'outline'
                        }>
                          {zone.severity}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {zone.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
              
              <div>
                <h4 className="font-semibold text-sm mb-2">Active Hazards</h4>
                <div className="space-y-2">
                  {hazards.map((hazard) => (
                    <div key={hazard.id} className="p-2 border rounded">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-sm">{hazard.type}</p>
                        <Badge variant={
                          hazard.severity === 'high' ? 'destructive' :
                          hazard.severity === 'medium' ? 'secondary' : 'outline'
                        }>
                          {hazard.severity}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {hazard.message}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Radius: {hazard.radius_km}km
                      </p>
                    </div>
                  ))}
                </div>
              </div>
              
              {restrictedZones.length === 0 && hazards.length === 0 && (
                <p className="text-muted-foreground text-center py-4">No safety alerts in your area</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Tracking;