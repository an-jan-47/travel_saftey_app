import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertTriangle, Phone, Shield, Clock, CheckCircle, X, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { authHelpers, dbHelpers, getCurrentLocation, reverseGeocode, Incident, Alert } from '@/lib/supabase';
import { LocationService } from '@/lib/locationService';
import { LocationStorageManager } from '@/lib/locationStorage';
import { BatchUploadService } from '@/lib/batchUpload';

const SOS: React.FC = () => {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [isSOSActive, setIsSOSActive] = useState(false);
  const [sosCountdown, setSOSCountdown] = useState(0);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number; address: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Service references for location flushing
  const locationServiceRef = useRef<LocationService | null>(null);
  const storageManagerRef = useRef<LocationStorageManager | null>(null);
  const batchUploadServiceRef = useRef<BatchUploadService | null>(null);
  
  const [emergencyContacts] = useState([
    { name: 'Emergency Services', number: '112', type: 'emergency' },
    { name: 'Tourist Helpline', number: '1363', type: 'tourist' },
    { name: 'Police', number: '100', type: 'police' },
    { name: 'Medical Emergency', number: '108', type: 'medical' }
  ]);

  useEffect(() => {
    loadSOSData();
    updateLocation();
    initializeLocationServices();
    
    // Listen for triple key press (simulate triple power button)
    let keyPressCount = 0;
    let keyPressTimer: NodeJS.Timeout;
    
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'p' || e.key === 'P') {
        keyPressCount++;
        
        if (keyPressCount === 1) {
          keyPressTimer = setTimeout(() => {
            keyPressCount = 0;
          }, 2000);
        }
        
        if (keyPressCount === 3) {
          clearTimeout(keyPressTimer);
          keyPressCount = 0;
          triggerEmergencySOS();
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyPress);
    
    return () => {
      window.removeEventListener('keydown', handleKeyPress);
      if (keyPressTimer) clearTimeout(keyPressTimer);
      
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
  }, []);

  const initializeLocationServices = async () => {
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

    } catch (error) {
      console.error('Failed to initialize location services:', error);
    }
  };

  useEffect(() => {
    let countdownTimer: NodeJS.Timeout;
    
    if (sosCountdown > 0) {
      countdownTimer = setTimeout(() => {
        setSOSCountdown(prev => prev - 1);
      }, 1000);
    } else if (sosCountdown === 0 && isSOSActive) {
      // SOS countdown finished, create incident
      createEmergencyIncident();
    }
    
    return () => {
      if (countdownTimer) clearTimeout(countdownTimer);
    };
  }, [sosCountdown, isSOSActive]);

  const loadSOSData = async () => {
    try {
      const user = await authHelpers.getCurrentUser();
      if (!user) return;

      // Load active incidents
      const { data: incidentsData, error: incidentsError } = await dbHelpers.getActiveIncidents(user.id);
      if (incidentsError) {
        console.error('Error loading incidents:', incidentsError);
      } else if (incidentsData) {
        setIncidents(incidentsData);
      }

      // Load recent alerts
      const { data: alertsData, error: alertsError } = await dbHelpers.getUserAlerts(user.id);
      if (alertsError) {
        console.error('Error loading alerts:', alertsError);
      } else if (alertsData) {
        setAlerts(alertsData.slice(0, 10));
      }

    } catch (error) {
      console.error('Error loading SOS data:', error);
      toast.error('Failed to load SOS data');
    } finally {
      setIsLoading(false);
    }
  };

  const updateLocation = async () => {
    try {
      const location = await getCurrentLocation();
      const address = await reverseGeocode(location.lat, location.lng);
      
      setCurrentLocation({
        lat: location.lat,
        lng: location.lng,
        address
      });
    } catch (error) {
      console.error('Error updating location:', error);
    }
  };

  const triggerEmergencySOS = async () => {
    if (isSOSActive) return;
    
    setIsSOSActive(true);
    setSOSCountdown(3);
    toast.error('Emergency SOS activated! Countdown started...');
    
    // Immediately flush location cache for emergency
    await flushLocationCache();
  };

  const flushLocationCache = async () => {
    try {
      // Force immediate location update if location service is available
      if (locationServiceRef.current) {
        await locationServiceRef.current.flushLocations();
        toast.success('Emergency location data sent');
      }

      // Force immediate batch upload
      if (batchUploadServiceRef.current) {
        const result = await batchUploadServiceRef.current.emergencyFlush();
        console.log('Emergency flush result:', result);
      }

    } catch (error) {
      console.error('Failed to flush location cache:', error);
      toast.error('Failed to send emergency location data');
    }
  };

  const cancelSOS = () => {
    setIsSOSActive(false);
    setSOSCountdown(0);
    toast.success('SOS cancelled');
  };

  const createEmergencyIncident = async () => {
    try {
      const user = await authHelpers.getCurrentUser();
      if (!user || !currentLocation) return;

      const { data: profile } = await dbHelpers.getTouristProfile(user.id);
      if (!profile) return;

      const incidentId = 'INC-' + Date.now().toString(36).toUpperCase();

      const { data, error } = await dbHelpers.createIncident({
        user_id: user.id,
        tourist_id: profile.tourist_id,
        incident_id: incidentId,
        latitude: currentLocation.lat,
        longitude: currentLocation.lng,
        status: 'Active',
        description: `Emergency SOS triggered at ${currentLocation.address}`
      });

      if (error) {
        toast.error('Failed to create emergency incident: ' + error.message);
        return;
      }

      if (data) {
        setIncidents(prev => [data, ...prev]);
        toast.success(`Emergency incident created: ${incidentId}`);
        
        // Create alert
        await dbHelpers.createAlert({
          user_id: user.id,
          tourist_id: profile.tourist_id,
          type: 'Emergency SOS',
          message: `Emergency SOS activated at ${currentLocation.address}. Incident ID: ${incidentId}`,
          severity: 'high',
          latitude: currentLocation.lat,
          longitude: currentLocation.lng,
          is_read: false
        });
      }
    } catch (error) {
      console.error('Error creating emergency incident:', error);
      toast.error('Failed to create emergency incident');
    } finally {
      setIsSOSActive(false);
      setSOSCountdown(0);
    }
  };

  const resolveIncident = async (incidentId: string) => {
    try {
      const { data, error } = await dbHelpers.resolveIncident(incidentId);
      
      if (error) {
        toast.error('Failed to resolve incident: ' + error.message);
        return;
      }

      if (data) {
        setIncidents(prev => prev.filter(inc => inc.incident_id !== incidentId));
        toast.success('Incident resolved successfully');
      }
    } catch (error) {
      console.error('Error resolving incident:', error);
      toast.error('Failed to resolve incident');
    }
  };

  const markAlertAsRead = async (alertId: string) => {
    try {
      const { error } = await dbHelpers.markAlertAsRead(alertId);
      
      if (error) {
        console.error('Error marking alert as read:', error);
        return;
      }

      setAlerts(prev => prev.map(alert => 
        alert.id === alertId ? { ...alert, is_read: true } : alert
      ));
    } catch (error) {
      console.error('Error marking alert as read:', error);
    }
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
          <h1 className="text-3xl font-bold">Emergency SOS</h1>
          <p className="text-muted-foreground">Emergency assistance and incident management</p>
        </div>
        
        <Badge variant={incidents.length > 0 ? "destructive" : "default"}>
          {incidents.length} Active Incidents
        </Badge>
      </div>

      {/* SOS Countdown Dialog */}
      <Dialog open={isSOSActive} onOpenChange={() => {}}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-center text-red-600">
              Emergency SOS Active
            </DialogTitle>
            <DialogDescription className="text-center">
              Emergency services will be contacted in
            </DialogDescription>
          </DialogHeader>
          
          <div className="text-center space-y-4">
            <div className="text-6xl font-bold text-red-600 animate-pulse">
              {sosCountdown}
            </div>
            <Button onClick={cancelSOS} variant="outline" className="w-full">
              <X className="w-4 h-4 mr-2" />
              Cancel SOS
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Emergency SOS Button */}
      <Card className="bg-gradient-to-r from-red-600 to-red-700 text-white">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <AlertTriangle className="w-6 h-6" />
            Emergency SOS
          </CardTitle>
          <CardDescription className="text-red-100">
            Press and hold for 3 seconds to activate emergency assistance
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-red-100 text-sm mb-2">Current Location:</p>
              <p className="font-semibold">
                {currentLocation?.address || 'Locating...'}
              </p>
              <p className="text-red-100 text-xs">
                Tip: Press 'P' key 3 times quickly for emergency SOS
              </p>
            </div>
            <Button
              size="lg"
              variant="secondary"
              className="h-20 w-20 rounded-full bg-white text-red-600 hover:bg-red-50"
              onMouseDown={triggerEmergencySOS}
              disabled={isSOSActive}
            >
              <AlertTriangle className="w-8 h-8" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Emergency Contacts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="w-5 h-5" />
            Emergency Contacts
          </CardTitle>
          <CardDescription>Quick access to emergency services</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {emergencyContacts.map((contact, index) => (
              <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-semibold">{contact.name}</p>
                  <p className="text-sm text-muted-foreground">{contact.number}</p>
                </div>
                <Button size="sm" className="bg-green-600 hover:bg-green-700">
                  <Phone className="w-4 h-4 mr-2" />
                  Call
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Incidents */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Active Incidents
            </CardTitle>
            <CardDescription>{incidents.length} incidents requiring attention</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {incidents.map((incident) => (
                <div key={incident.id} className="p-3 border rounded-lg">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="w-4 h-4 text-red-500" />
                        <p className="font-semibold text-sm">#{incident.incident_id}</p>
                        <Badge variant="destructive" className="text-xs">
                          {incident.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">
                        {incident.description || 'Emergency incident'}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <MapPin className="w-3 h-3" />
                        <span>{incident.latitude.toFixed(4)}, {incident.longitude.toFixed(4)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {new Date(incident.created_at).toLocaleString()}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => resolveIncident(incident.incident_id)}
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Resolve
                    </Button>
                  </div>
                </div>
              ))}
              {incidents.length === 0 && (
                <div className="text-center py-8">
                  <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
                  <p className="text-muted-foreground">No active incidents</p>
                  <p className="text-sm text-muted-foreground">You're safe and secure</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Alerts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Recent Alerts
            </CardTitle>
            <CardDescription>
              {alerts.filter(alert => !alert.is_read).length} unread alerts
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {alerts.map((alert) => (
                <div 
                  key={alert.id} 
                  className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                    !alert.is_read ? 'bg-blue-50 border-blue-200' : ''
                  }`}
                  onClick={() => !alert.is_read && markAlertAsRead(alert.id)}
                >
                  <div className="flex items-start gap-3">
                    <AlertTriangle className={`w-4 h-4 mt-0.5 ${
                      alert.severity === 'high' ? 'text-red-500' : 
                      alert.severity === 'medium' ? 'text-yellow-500' : 'text-blue-500'
                    }`} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold text-sm">{alert.type}</p>
                        {!alert.is_read && (
                          <Badge variant="secondary" className="text-xs">New</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mb-1">
                        {alert.message}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(alert.created_at).toLocaleString()}
                      </p>
                    </div>
                    <Badge variant={
                      alert.severity === 'high' ? 'destructive' :
                      alert.severity === 'medium' ? 'secondary' : 'outline'
                    } className="text-xs">
                      {alert.severity}
                    </Badge>
                  </div>
                </div>
              ))}
              {alerts.length === 0 && (
                <p className="text-muted-foreground text-center py-4">No recent alerts</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SOS;