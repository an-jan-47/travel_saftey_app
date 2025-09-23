import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { QrCode, Shield, MapPin, AlertTriangle, CheckCircle, Clock, User, Phone, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { authHelpers, dbHelpers, getCurrentLocation, reverseGeocode, Tourist, Alert, Incident } from '@/lib/supabase';

const Dashboard: React.FC = () => {
  const [touristProfile, setTouristProfile] = useState<Tourist | null>(null);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number; address: string } | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [safetyScore, setSafetyScore] = useState(85);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
    updateLocation();
    
    // Update location every 30 seconds
    const locationInterval = setInterval(updateLocation, 30000);
    
    return () => clearInterval(locationInterval);
  }, []);

  const loadDashboardData = async () => {
    try {
      const user = await authHelpers.getCurrentUser();
      if (!user) return;

      // Load tourist profile
      const { data: profile, error: profileError } = await dbHelpers.getTouristProfile(user.id);
      if (profileError) {
        console.error('Error loading profile:', profileError);
      } else if (profile) {
        setTouristProfile(profile);
      }

      // Load alerts
      const { data: alertsData, error: alertsError } = await dbHelpers.getUserAlerts(user.id);
      if (alertsError) {
        console.error('Error loading alerts:', alertsError);
      } else if (alertsData) {
        setAlerts(alertsData);
      }

      // Load active incidents
      const { data: incidentsData, error: incidentsError } = await dbHelpers.getActiveIncidents(user.id);
      if (incidentsError) {
        console.error('Error loading incidents:', incidentsError);
      } else if (incidentsData) {
        setIncidents(incidentsData);
      }

    } catch (error) {
      console.error('Error loading dashboard data:', error);
      toast.error('Failed to load dashboard data');
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

      // Update location in database
      const user = await authHelpers.getCurrentUser();
      if (user && touristProfile) {
        await dbHelpers.updateTouristProfile(user.id, {
          last_known_location: location
        });

        // Log location
        await dbHelpers.addLocationLog({
          user_id: user.id,
          tourist_id: touristProfile.tourist_id,
          latitude: location.lat,
          longitude: location.lng,
          address,
          in_restricted_zone: false
        });
      }
    } catch (error) {
      console.error('Error updating location:', error);
    }
  };

  const calculateSafetyScore = () => {
    let score = 100;
    
    // Deduct points for unread alerts
    const unreadAlerts = alerts.filter(alert => !alert.is_read);
    score -= unreadAlerts.length * 5;
    
    // Deduct points for active incidents
    score -= incidents.length * 20;
    
    // Deduct points for high severity alerts
    const highSeverityAlerts = alerts.filter(alert => alert.severity === 'high');
    score -= highSeverityAlerts.length * 10;
    
    return Math.max(score, 0);
  };

  useEffect(() => {
    setSafetyScore(calculateSafetyScore());
  }, [alerts, incidents]);

  const getSafetyScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getSafetyScoreBadge = (score: number) => {
    if (score >= 80) return { variant: 'default' as const, text: 'Safe' };
    if (score >= 60) return { variant: 'secondary' as const, text: 'Caution' };
    return { variant: 'destructive' as const, text: 'Alert' };
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
          <h1 className="text-3xl font-bold">Safety Dashboard</h1>
          <p className="text-muted-foreground">Welcome back, {touristProfile?.name || 'Tourist'}</p>
        </div>
        <Badge {...getSafetyScoreBadge(safetyScore)}>
          Safety Score: {safetyScore}%
        </Badge>
      </div>

      {/* Digital Tourist ID Card */}
      <Card className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-6 h-6" />
            Digital Tourist ID
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-blue-100 text-sm">Tourist ID</p>
                  <p className="font-mono font-bold">{touristProfile?.tourist_id || 'Loading...'}</p>
                </div>
                <div>
                  <p className="text-blue-100 text-sm">Name</p>
                  <p className="font-semibold">{touristProfile?.name || 'Loading...'}</p>
                </div>
                <div>
                  <p className="text-blue-100 text-sm">Nationality</p>
                  <p className="font-semibold">{touristProfile?.nationality || 'Loading...'}</p>
                </div>
                <div>
                  <p className="text-blue-100 text-sm">Document</p>
                  <p className="font-semibold">{touristProfile?.doc_type?.toUpperCase()} - {touristProfile?.doc_id}</p>
                </div>
              </div>
              <div>
                <p className="text-blue-100 text-sm">Blockchain Hash</p>
                <p className="font-mono text-xs break-all">{touristProfile?.blockchain_hash}</p>
              </div>
            </div>
            <div className="flex flex-col items-center justify-center">
              <div className="bg-white p-4 rounded-lg">
                {touristProfile?.qr_code_url && (
                  <img 
                    src={touristProfile.qr_code_url} 
                    alt="QR Code" 
                    className="w-32 h-32"
                  />
                )}
              </div>
              <Button variant="secondary" size="sm" className="mt-2">
                <QrCode className="w-4 h-4 mr-2" />
                Show QR
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Current Location */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5" />
              Current Location
            </CardTitle>
          </CardHeader>
          <CardContent>
            {currentLocation ? (
              <div className="space-y-2">
                <p className="font-semibold">{currentLocation.address}</p>
                <p className="text-sm text-muted-foreground">
                  {currentLocation.lat.toFixed(4)}, {currentLocation.lng.toFixed(4)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Last updated: {new Date().toLocaleTimeString()}
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground">Locating...</p>
            )}
          </CardContent>
        </Card>

        {/* Emergency Contact */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="w-5 h-5" />
              Emergency Contact
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-semibold">{touristProfile?.emergency_contact || 'Not set'}</p>
            <Button size="sm" className="mt-2 w-full">
              Call Emergency Contact
            </Button>
          </CardContent>
        </Card>

        {/* Medical Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Medical Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              {touristProfile?.medical_info || 'No medical information provided'}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Alerts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Recent Alerts
            </CardTitle>
            <CardDescription>
              {alerts.filter(alert => !alert.is_read).length} unread alerts
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {alerts.slice(0, 5).map((alert) => (
                <div key={alert.id} className="flex items-start gap-3 p-3 border rounded-lg">
                  <AlertTriangle className={`w-4 h-4 mt-0.5 ${
                    alert.severity === 'high' ? 'text-red-500' : 
                    alert.severity === 'medium' ? 'text-yellow-500' : 'text-blue-500'
                  }`} />
                  <div className="flex-1">
                    <p className="font-semibold text-sm">{alert.type}</p>
                    <p className="text-sm text-muted-foreground">{alert.message}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(alert.created_at).toLocaleString()}
                    </p>
                  </div>
                  {!alert.is_read && (
                    <Badge variant="secondary" className="text-xs">New</Badge>
                  )}
                </div>
              ))}
              {alerts.length === 0 && (
                <p className="text-muted-foreground text-center py-4">No alerts</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Active Incidents */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Active Incidents
            </CardTitle>
            <CardDescription>
              {incidents.length} active incidents
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {incidents.map((incident) => (
                <div key={incident.id} className="flex items-start gap-3 p-3 border rounded-lg">
                  <AlertTriangle className="w-4 h-4 mt-0.5 text-red-500" />
                  <div className="flex-1">
                    <p className="font-semibold text-sm">Incident #{incident.incident_id}</p>
                    <p className="text-sm text-muted-foreground">
                      {incident.description || 'Emergency incident reported'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(incident.created_at).toLocaleString()}
                    </p>
                  </div>
                  <Badge variant="destructive" className="text-xs">Active</Badge>
                </div>
              ))}
              {incidents.length === 0 && (
                <div className="text-center py-4">
                  <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
                  <p className="text-muted-foreground">No active incidents</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;