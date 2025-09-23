import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { MapPin, Navigation, AlertTriangle, Shield, Wifi, WifiOff, Play, Pause, Battery, BatteryLow } from 'lucide-react';
import { toast } from 'sonner';
import { authHelpers, dbHelpers, getCurrentLocation, reverseGeocode, isPointInPolygon, calculateDistance, LocationLog, RestrictedZone, Hazard } from '@/lib/supabase';
import { LeafletMap, MapMarker } from '@/components/LeafletMap';
import { LocationService } from '@/lib/locationService';
import { LocationStorageManager } from '@/lib/locationStorage';
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
  const storageManagerRef = useRef<LocationStorageManager | null>(null);
  const batchUploadServiceRef = useRef<BatchUploadService | null>(null);

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
  }, []);

  const initializeServices = useCallback(async () => {
    try {
      const user = await authHelpers.getCurrentUser();
      if (!user) return;

      const { data: profile } = await dbHelpers.getTouristProfile(user.id);
      if (!profile) return;

      // Initialize storage manager
      storageManagerRef.current = new LocationStorageManager();
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
      locationServiceRef.current.addEventListener('locationUpdate', (location) => {
        setCurrentLocation({
          lat: location.latitude,
          lng: location.longitude,
          address: location.address || ''
        });
        updateStorageStats();
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

    } catch (error) {
      console.error('Failed to initialize services:', error);
      toast.error('Failed to initialize location services');
    }
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
        await logLocation(location, address);
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

  const logLocation = async (location: { lat: number; lng: number }, address: string) => {
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

  const toggleTracking = () => {
    if (isTracking) {
      // Stop tracking
      if (trackingIntervalRef.current) {
        clearInterval(trackingIntervalRef.current);
        trackingIntervalRef.current = null;
      }
      setIsTracking(false);
      toast.success('Location tracking stopped');
    } else {
      // Start tracking
      setIsTracking(true);
      trackingIntervalRef.current = setInterval(updateLocation, 30000); // Update every 30 seconds
      updateLocation(); // Update immediately
      toast.success('Location tracking started');
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

      {/* Tracking Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Navigation className="w-5 h-5" />
            Tracking Controls
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Switch
                  id="tracking"
                  checked={isTracking}
                  onCheckedChange={toggleTracking}
                />
                <Label htmlFor="tracking">Live Location Tracking</Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Switch
                  id="geofencing"
                  checked={geoFencing}
                  onCheckedChange={setGeoFencing}
                />
                <Label htmlFor="geofencing">Geo-fencing Alerts</Label>
              </div>
            </div>
            
            <Button onClick={toggleTracking} variant={isTracking ? "destructive" : "default"}>
              {isTracking ? (
                <>
                  <Pause className="w-4 h-4 mr-2" />
                  Stop Tracking
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Start Tracking
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

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
        {/* Location History */}
        <Card>
          <CardHeader>
            <CardTitle>Location History</CardTitle>
            <CardDescription>{locationLogs.length} locations tracked</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {locationLogs.map((log, index) => (
                <div key={log.id} className="flex items-start gap-3 p-3 border rounded-lg">
                  <MapPin className={`w-4 h-4 mt-0.5 ${
                    log.in_restricted_zone ? 'text-red-500' : 'text-green-500'
                  }`} />
                  <div className="flex-1">
                    <p className="font-semibold text-sm">{log.address || 'Unknown location'}</p>
                    <p className="text-xs text-muted-foreground">
                      {log.latitude.toFixed(6)}, {log.longitude.toFixed(6)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(log.timestamp).toLocaleString()}
                    </p>
                  </div>
                  {log.in_restricted_zone && (
                    <Badge variant="destructive" className="text-xs">
                      Restricted
                    </Badge>
                  )}
                </div>
              ))}
              {locationLogs.length === 0 && (
                <p className="text-muted-foreground text-center py-4">No location history</p>
              )}
            </div>
          </CardContent>
        </Card>

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