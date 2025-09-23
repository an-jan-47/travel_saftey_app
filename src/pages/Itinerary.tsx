import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { MapPin, Plus, Calendar as CalendarIcon, Clock, CheckCircle, AlertCircle, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { authHelpers, dbHelpers, getCurrentLocation, reverseGeocode, Itinerary as ItineraryType, CheckIn } from '@/lib/supabase';

const Itinerary: React.FC = () => {
  const [itineraries, setItineraries] = useState<ItineraryType[]>([]);
  const [currentItinerary, setCurrentItinerary] = useState<ItineraryType | null>(null);
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  
  // New itinerary form
  const [newItinerary, setNewItinerary] = useState({
    destinations: [''],
    startDate: new Date(),
    endDate: new Date(),
    autoCheckinInterval: 6
  });

  useEffect(() => {
    loadItineraryData();
  }, []);

  const loadItineraryData = async () => {
    try {
      const user = await authHelpers.getCurrentUser();
      if (!user) return;

      // Load all itineraries
      const { data: itinerariesData, error: itinerariesError } = await dbHelpers.getUserItineraries(user.id);
      if (itinerariesError) {
        console.error('Error loading itineraries:', itinerariesError);
      } else if (itinerariesData) {
        setItineraries(itinerariesData);
        
        // Set current active itinerary
        const active = itinerariesData.find(it => it.status === 'active');
        if (active) {
          setCurrentItinerary(active);
        }
      }

      // Load recent check-ins
      const { data: checkInsData, error: checkInsError } = await dbHelpers.getRecentCheckIns(user.id, 20);
      if (checkInsError) {
        console.error('Error loading check-ins:', checkInsError);
      } else if (checkInsData) {
        setCheckIns(checkInsData);
      }

    } catch (error) {
      console.error('Error loading itinerary data:', error);
      toast.error('Failed to load itinerary data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateItinerary = async () => {
    try {
      const user = await authHelpers.getCurrentUser();
      if (!user) return;

      // Get tourist profile for tourist_id
      const { data: profile } = await dbHelpers.getTouristProfile(user.id);
      if (!profile) {
        toast.error('Tourist profile not found');
        return;
      }

      setIsCreating(true);

      const filteredDestinations = newItinerary.destinations.filter(dest => dest.trim() !== '');
      
      if (filteredDestinations.length === 0) {
        toast.error('Please add at least one destination');
        return;
      }

      const { data, error } = await dbHelpers.createItinerary({
        user_id: user.id,
        tourist_id: profile.tourist_id,
        destinations: filteredDestinations,
        start_date: format(newItinerary.startDate, 'yyyy-MM-dd'),
        end_date: format(newItinerary.endDate, 'yyyy-MM-dd'),
        waypoints: [],
        auto_checkin_interval: newItinerary.autoCheckinInterval,
        status: 'active'
      });

      if (error) {
        toast.error('Failed to create itinerary: ' + error.message);
        return;
      }

      if (data) {
        toast.success('Itinerary created successfully!');
        setCurrentItinerary(data);
        setItineraries(prev => [data, ...prev]);
        
        // Reset form
        setNewItinerary({
          destinations: [''],
          startDate: new Date(),
          endDate: new Date(),
          autoCheckinInterval: 6
        });
      }
    } catch (error) {
      console.error('Error creating itinerary:', error);
      toast.error('Failed to create itinerary');
    } finally {
      setIsCreating(false);
    }
  };

  const handleCheckIn = async () => {
    try {
      const user = await authHelpers.getCurrentUser();
      if (!user || !currentItinerary) return;

      const location = await getCurrentLocation();
      const address = await reverseGeocode(location.lat, location.lng);

      const { data: profile } = await dbHelpers.getTouristProfile(user.id);
      if (!profile) return;

      const { data, error } = await dbHelpers.addCheckIn({
        user_id: user.id,
        tourist_id: profile.tourist_id,
        itinerary_id: currentItinerary.id,
        latitude: location.lat,
        longitude: location.lng,
        address,
        status: 'success',
        notes: `Auto check-in at ${address}`
      });

      if (error) {
        toast.error('Check-in failed: ' + error.message);
        return;
      }

      if (data) {
        toast.success('Check-in successful!');
        setCheckIns(prev => [data, ...prev]);
      }
    } catch (error) {
      console.error('Error during check-in:', error);
      toast.error('Check-in failed');
    }
  };

  const addDestination = () => {
    setNewItinerary(prev => ({
      ...prev,
      destinations: [...prev.destinations, '']
    }));
  };

  const updateDestination = (index: number, value: string) => {
    setNewItinerary(prev => ({
      ...prev,
      destinations: prev.destinations.map((dest, i) => i === index ? value : dest)
    }));
  };

  const removeDestination = (index: number) => {
    if (newItinerary.destinations.length > 1) {
      setNewItinerary(prev => ({
        ...prev,
        destinations: prev.destinations.filter((_, i) => i !== index)
      }));
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
          <h1 className="text-3xl font-bold">Trip Planning</h1>
          <p className="text-muted-foreground">Manage your itinerary and track your journey</p>
        </div>
        
        <Dialog>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              New Trip
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create New Itinerary</DialogTitle>
              <DialogDescription>
                Plan your trip with destinations and check-in intervals
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Destinations</Label>
                {newItinerary.destinations.map((destination, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      placeholder={`Destination ${index + 1}`}
                      value={destination}
                      onChange={(e) => updateDestination(index, e.target.value)}
                    />
                    {newItinerary.destinations.length > 1 && (
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => removeDestination(index)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button variant="outline" onClick={addDestination} className="w-full">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Destination
                </Button>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {format(newItinerary.startDate, 'PPP')}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={newItinerary.startDate}
                        onSelect={(date) => date && setNewItinerary(prev => ({ ...prev, startDate: date }))}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                
                <div className="space-y-2">
                  <Label>End Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {format(newItinerary.endDate, 'PPP')}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={newItinerary.endDate}
                        onSelect={(date) => date && setNewItinerary(prev => ({ ...prev, endDate: date }))}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Auto Check-in Interval (hours)</Label>
                <Select 
                  value={newItinerary.autoCheckinInterval.toString()} 
                  onValueChange={(value) => setNewItinerary(prev => ({ ...prev, autoCheckinInterval: parseInt(value) }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2">Every 2 hours</SelectItem>
                    <SelectItem value="4">Every 4 hours</SelectItem>
                    <SelectItem value="6">Every 6 hours</SelectItem>
                    <SelectItem value="8">Every 8 hours</SelectItem>
                    <SelectItem value="12">Every 12 hours</SelectItem>
                    <SelectItem value="24">Daily</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <Button onClick={handleCreateItinerary} disabled={isCreating} className="w-full">
                {isCreating ? 'Creating...' : 'Create Itinerary'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Current Active Itinerary */}
      {currentItinerary && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5" />
              Current Trip
            </CardTitle>
            <CardDescription>
              {format(new Date(currentItinerary.start_date), 'PPP')} - {format(new Date(currentItinerary.end_date), 'PPP')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {currentItinerary.destinations.map((destination, index) => (
                  <Badge key={index} variant="secondary">
                    {destination}
                  </Badge>
                ))}
              </div>
              
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  <span className="text-sm">Check-in every {currentItinerary.auto_checkin_interval} hours</span>
                </div>
                <Badge variant="outline" className="text-green-600">
                  {currentItinerary.status}
                </Badge>
              </div>
              
              <Button onClick={handleCheckIn} className="w-full md:w-auto">
                <CheckCircle className="w-4 h-4 mr-2" />
                Check In Now
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* All Itineraries */}
        <Card>
          <CardHeader>
            <CardTitle>All Trips</CardTitle>
            <CardDescription>{itineraries.length} trips planned</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {itineraries.map((itinerary) => (
                <div key={itinerary.id} className="p-3 border rounded-lg">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex flex-wrap gap-1 mb-2">
                        {itinerary.destinations.slice(0, 3).map((dest, index) => (
                          <Badge key={index} variant="outline" className="text-xs">
                            {dest}
                          </Badge>
                        ))}
                        {itinerary.destinations.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{itinerary.destinations.length - 3} more
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(itinerary.start_date), 'MMM dd')} - {format(new Date(itinerary.end_date), 'MMM dd, yyyy')}
                      </p>
                    </div>
                    <Badge variant={itinerary.status === 'active' ? 'default' : 'secondary'}>
                      {itinerary.status}
                    </Badge>
                  </div>
                </div>
              ))}
              {itineraries.length === 0 && (
                <p className="text-muted-foreground text-center py-4">No trips planned yet</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Check-ins */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Check-ins</CardTitle>
            <CardDescription>{checkIns.length} check-ins recorded</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {checkIns.map((checkIn) => (
                <div key={checkIn.id} className="flex items-start gap-3 p-3 border rounded-lg">
                  <CheckCircle className={`w-4 h-4 mt-0.5 ${
                    checkIn.status === 'success' ? 'text-green-500' : 'text-red-500'
                  }`} />
                  <div className="flex-1">
                    <p className="font-semibold text-sm">{checkIn.address || 'Unknown location'}</p>
                    <p className="text-xs text-muted-foreground">
                      {checkIn.latitude.toFixed(4)}, {checkIn.longitude.toFixed(4)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(checkIn.created_at).toLocaleString()}
                    </p>
                    {checkIn.notes && (
                      <p className="text-xs text-muted-foreground mt-1">{checkIn.notes}</p>
                    )}
                  </div>
                  <Badge variant={checkIn.status === 'success' ? 'default' : 'destructive'} className="text-xs">
                    {checkIn.status}
                  </Badge>
                </div>
              ))}
              {checkIns.length === 0 && (
                <p className="text-muted-foreground text-center py-4">No check-ins yet</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Itinerary;