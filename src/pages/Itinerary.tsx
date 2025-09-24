import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { 
  MapPin, 
  Clock, 
  Plus, 
  Edit, 
  Trash2, 
  Navigation, 
  CheckCircle, 
  AlertTriangle,
  Users,
  Phone,
  Calendar,
  MapIcon,
  Timer,
  Wifi,
  WifiOff
} from 'lucide-react';

import { ItineraryService } from '../lib/itineraryService';
import { 
  ItineraryWithDestinations, 
  Destination, 
  EmergencyContact, 
  CheckInStatus,
  LocationCoordinates,
  PlaceSearchResult 
} from '../lib/itineraryTypes';

// Emergency Contacts Component
const EmergencyContactsManager = () => {
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [isAddingContact, setIsAddingContact] = useState(false);
  const [newContact, setNewContact] = useState({
    name: '',
    relationship: '',
    phone: '',
    email: ''
  });

  const itineraryService = ItineraryService.getInstance();

  useEffect(() => {
    loadEmergencyContacts();
  }, []);

  const loadEmergencyContacts = async () => {
    const loadedContacts = await itineraryService.getEmergencyContacts();
    setContacts(loadedContacts);
  };

  const addContact = async () => {
    if (!newContact.name || !newContact.phone) return;

    const added = await itineraryService.addEmergencyContact(newContact);
    if (added) {
      await loadEmergencyContacts();
      setNewContact({ name: '', relationship: '', phone: '', email: '' });
      setIsAddingContact(false);
    }
  };

  const deleteContact = async (contactId: string) => {
    const deleted = await itineraryService.deleteEmergencyContact(contactId);
    if (deleted) {
      await loadEmergencyContacts();
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Emergency Contacts ({contacts.length}/3)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {contacts.map((contact) => (
          <div key={contact.id} className="flex items-center justify-between p-3 border rounded-lg">
            <div>
              <div className="font-semibold">{contact.name}</div>
              <div className="text-sm text-gray-600">{contact.relationship}</div>
              <div className="text-sm text-blue-600">{contact.phone}</div>
              {contact.email && <div className="text-sm text-gray-500">{contact.email}</div>}
              {contact.is_primary && <Badge variant="default" className="text-xs">Primary</Badge>}
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => deleteContact(contact.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}

        {contacts.length < 3 && (
          <>
            {!isAddingContact ? (
              <Button 
                variant="outline" 
                onClick={() => setIsAddingContact(true)}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Emergency Contact
              </Button>
            ) : (
              <div className="space-y-3 p-4 border rounded-lg">
                <Input
                  placeholder="Contact Name"
                  value={newContact.name}
                  onChange={(e) => setNewContact(prev => ({ ...prev, name: e.target.value }))}
                />
                <Input
                  placeholder="Relationship"
                  value={newContact.relationship}
                  onChange={(e) => setNewContact(prev => ({ ...prev, relationship: e.target.value }))}
                />
                <Input
                  placeholder="Phone Number"
                  value={newContact.phone}
                  onChange={(e) => setNewContact(prev => ({ ...prev, phone: e.target.value }))}
                />
                <Input
                  placeholder="Email (optional)"
                  value={newContact.email}
                  onChange={(e) => setNewContact(prev => ({ ...prev, email: e.target.value }))}
                />
                <div className="flex gap-2">
                  <Button onClick={addContact} size="sm">Add Contact</Button>
                  <Button variant="outline" onClick={() => setIsAddingContact(false)} size="sm">
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

// Destination Manager Component
const DestinationManager = ({ 
  itinerary, 
  onDestinationAdded, 
  onDestinationUpdated 
}: {
  itinerary: ItineraryWithDestinations;
  onDestinationAdded: () => void;
  onDestinationUpdated: () => void;
}) => {
  const [isAddingDestination, setIsAddingDestination] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlaceSearchResult[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<PlaceSearchResult | null>(null);
  const [newDestination, setNewDestination] = useState({
    name: '',
    latitude: null as number | null,
    longitude: null as number | null,
    planned_arrival: '',
    auto_checkin_interval: 21600, // 6 hours
    notes: ''
  });
  const [checkInStatuses, setCheckInStatuses] = useState<{ [key: string]: CheckInStatus }>({});
  const [currentLocation, setCurrentLocation] = useState<LocationCoordinates | null>(null);

  const itineraryService = ItineraryService.getInstance();

  useEffect(() => {
    getCurrentLocation();
    if (itinerary.destination_details) {
      checkAllDestinationStatuses();
    }
  }, [itinerary.destination_details]);

  const getCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setCurrentLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => console.error('Error getting location:', error)
      );
    }
  };

  const searchPlaces = async (query: string) => {
    if (query.length < 3) return;
    
    const results = await itineraryService.searchPlaces(query);
    setSearchResults(results);
  };

  const selectPlace = (place: PlaceSearchResult) => {
    setSelectedPlace(place);
    setNewDestination(prev => ({
      ...prev,
      name: place.display_name.split(',')[0], // Use first part as name
      latitude: parseFloat(place.lat),
      longitude: parseFloat(place.lon)
    }));
    setSearchResults([]);
    setSearchQuery('');
  };

  const addDestination = async () => {
    if (!newDestination.name || !newDestination.planned_arrival) return;

    const added = await itineraryService.addDestination(itinerary.id, {
      ...newDestination,
      planned_arrival: new Date(newDestination.planned_arrival).toISOString()
    });

    if (added) {
      setIsAddingDestination(false);
      setNewDestination({
        name: '',
        latitude: null,
        longitude: null,
        planned_arrival: '',
        auto_checkin_interval: 21600,
        notes: ''
      });
      setSelectedPlace(null);
      onDestinationAdded();
    }
  };

  const checkAllDestinationStatuses = async () => {
    if (!currentLocation) return;

    const statuses: { [key: string]: CheckInStatus } = {};
    
    for (const destination of itinerary.destination_details) {
      const status = await itineraryService.checkAutoCheckInStatus(
        destination.id, 
        currentLocation
      );
      statuses[destination.id] = status;
    }
    
    setCheckInStatuses(statuses);
  };

  const performCheckIn = async (destinationId: string) => {
    if (!currentLocation) return;

    const result = await itineraryService.performManualCheckIn(
      destinationId,
      currentLocation,
      'Manual check-in'
    );

    if (result) {
      onDestinationUpdated();
      await checkAllDestinationStatuses();
    }
  };

  const formatInterval = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    return `${hours} hour${hours !== 1 ? 's' : ''}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-500';
      case 'upcoming': return 'bg-blue-500';
      case 'missed': return 'bg-red-500';
      case 'cancelled': return 'bg-gray-500';
      default: return 'bg-gray-300';
    }
  };

  return (
    <div className="space-y-6">
      {/* Add Destination Button */}
      {!isAddingDestination ? (
        <Button 
          onClick={() => setIsAddingDestination(true)}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Destination
        </Button>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Add New Destination</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Place Search */}
            <div className="space-y-2">
              <Input
                placeholder="Search for a place..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  searchPlaces(e.target.value);
                }}
              />
              {searchResults.length > 0 && (
                <div className="border rounded-md max-h-48 overflow-y-auto">
                  {searchResults.map((result) => (
                    <div
                      key={result.place_id}
                      className="p-2 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
                      onClick={() => selectPlace(result)}
                    >
                      <div className="font-medium">{result.display_name.split(',')[0]}</div>
                      <div className="text-sm text-gray-600">{result.display_name}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Selected Place or Manual Entry */}
            {selectedPlace ? (
              <Alert>
                <MapPin className="h-4 w-4" />
                <AlertDescription>
                  Selected: {selectedPlace.display_name}
                </AlertDescription>
              </Alert>
            ) : (
              <Input
                placeholder="Or enter destination name manually"
                value={newDestination.name}
                onChange={(e) => setNewDestination(prev => ({ ...prev, name: e.target.value }))}
              />
            )}

            {/* Planned Arrival */}
            <Input
              type="datetime-local"
              placeholder="Planned Arrival"
              value={newDestination.planned_arrival}
              onChange={(e) => setNewDestination(prev => ({ ...prev, planned_arrival: e.target.value }))}
            />

            {/* Check-in Interval */}
            <Select
              value={newDestination.auto_checkin_interval.toString()}
              onValueChange={(value) => setNewDestination(prev => ({ 
                ...prev, 
                auto_checkin_interval: parseInt(value) 
              }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3600">1 hour</SelectItem>
                <SelectItem value="7200">2 hours</SelectItem>
                <SelectItem value="10800">3 hours</SelectItem>
                <SelectItem value="21600">6 hours</SelectItem>
                <SelectItem value="43200">12 hours</SelectItem>
                <SelectItem value="86400">24 hours</SelectItem>
              </SelectContent>
            </Select>

            {/* Notes */}
            <Textarea
              placeholder="Notes (optional)"
              value={newDestination.notes}
              onChange={(e) => setNewDestination(prev => ({ ...prev, notes: e.target.value }))}
            />

            {/* Action Buttons */}
            <div className="flex gap-2">
              <Button onClick={addDestination}>Add Destination</Button>
              <Button 
                variant="outline" 
                onClick={() => setIsAddingDestination(false)}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Destinations List */}
      <div className="space-y-4">
        {itinerary.destination_details
          ?.sort((a, b) => a.order_index - b.order_index)
          .map((destination, index) => {
            const status = checkInStatuses[destination.id];
            const isOverdue = status?.is_overdue;
            const canCheckIn = status?.can_checkin;

            return (
              <Card key={destination.id} className={`border-l-4 ${getStatusColor(destination.status)}`}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <CardTitle className="flex items-center gap-2">
                        <span className="bg-gray-100 rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold">
                          {index + 1}
                        </span>
                        {destination.name}
                      </CardTitle>
                      <div className="mt-2 space-y-1 text-sm text-gray-600">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          {new Date(destination.planned_arrival).toLocaleString()}
                        </div>
                        <div className="flex items-center gap-2">
                          <Timer className="h-4 w-4" />
                          Check-in every {formatInterval(destination.auto_checkin_interval)}
                        </div>
                        {destination.latitude && destination.longitude && (
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4" />
                            {destination.latitude.toFixed(4)}, {destination.longitude.toFixed(4)}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={destination.status === 'completed' ? 'default' : 'secondary'}>
                        {destination.status}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Check-in Status */}
                  {status && (
                    <div className="mb-4">
                      {isOverdue && (
                        <Alert className="mb-2">
                          <AlertTriangle className="h-4 w-4" />
                          <AlertDescription>
                            Check-in overdue! 
                            {status.grace_period_active && 
                              ` Grace period ends at ${new Date(status.grace_period_end!).toLocaleTimeString()}`
                            }
                          </AlertDescription>
                        </Alert>
                      )}
                      
                      {status.next_checkin_time && (
                        <div className="text-sm text-gray-600 mb-2">
                          Next check-in: {new Date(status.next_checkin_time).toLocaleString()}
                        </div>
                      )}

                      {status.distance_from_destination && (
                        <div className="text-sm text-gray-600 mb-2">
                          Distance: {(status.distance_from_destination / 1000).toFixed(2)} km away
                        </div>
                      )}
                    </div>
                  )}

                  {/* Notes */}
                  {destination.notes && (
                    <div className="mb-4 p-3 bg-gray-50 rounded-md">
                      <div className="text-sm">{destination.notes}</div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2">
                    {canCheckIn && (
                      <Button 
                        size="sm" 
                        onClick={() => performCheckIn(destination.id)}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Check In
                      </Button>
                    )}
                    <Button variant="outline" size="sm">
                      <Edit className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                    <Button variant="outline" size="sm" className="text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
      </div>
    </div>
  );
};

export const Itinerary = () => {
  const [itineraries, setItineraries] = useState<ItineraryWithDestinations[]>([]);
  const [selectedItinerary, setSelectedItinerary] = useState<ItineraryWithDestinations | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isCreatingItinerary, setIsCreatingItinerary] = useState(false);
  const [newItinerary, setNewItinerary] = useState({
    start_date: '',
    end_date: '',
    notes: ''
  });

  const itineraryService = ItineraryService.getInstance();

  useEffect(() => {
    loadItineraries();

    // Monitor online status
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Sync offline data when coming back online
    if (isOnline) {
      itineraryService.syncOfflineData();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [isOnline]);

  const loadItineraries = async () => {
    const loadedItineraries = await itineraryService.getItineraries();
    setItineraries(loadedItineraries);
    
    // Select first itinerary if none selected
    if (!selectedItinerary && loadedItineraries.length > 0) {
      setSelectedItinerary(loadedItineraries[0]);
    }
  };

  const createItinerary = async () => {
    if (!newItinerary.start_date || !newItinerary.end_date) return;

    const created = await itineraryService.createItinerary({
      ...newItinerary,
      destinations: [],
      status: 'active'
    });

    if (created) {
      await loadItineraries();
      setIsCreatingItinerary(false);
      setNewItinerary({ start_date: '', end_date: '', notes: '' });
      setSelectedItinerary(created);
    }
  };

  const refreshSelectedItinerary = async () => {
    if (selectedItinerary) {
      const updated = await itineraryService.getItinerary(selectedItinerary.id);
      if (updated) {
        setSelectedItinerary(updated);
        await loadItineraries();
      }
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Travel Itinerary</h1>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm">
              {isOnline ? (
                <>
                  <Wifi className="h-4 w-4 text-green-500" />
                  <span className="text-green-600">Online</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-4 w-4 text-red-500" />
                  <span className="text-red-600">Offline</span>
                </>
              )}
            </div>
            <Button onClick={() => setIsCreatingItinerary(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Itinerary
            </Button>
          </div>
        </div>

        {/* Create New Itinerary Dialog */}
        {isCreatingItinerary && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Create New Itinerary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Start Date</label>
                  <Input
                    type="date"
                    value={newItinerary.start_date}
                    onChange={(e) => setNewItinerary(prev => ({ ...prev, start_date: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">End Date</label>
                  <Input
                    type="date"
                    value={newItinerary.end_date}
                    onChange={(e) => setNewItinerary(prev => ({ ...prev, end_date: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Notes</label>
                <Textarea
                  placeholder="Trip notes..."
                  value={newItinerary.notes}
                  onChange={(e) => setNewItinerary(prev => ({ ...prev, notes: e.target.value }))}
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={createItinerary}>Create Itinerary</Button>
                <Button variant="outline" onClick={() => setIsCreatingItinerary(false)}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main Content */}
        {itineraries.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <MapIcon className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <h3 className="text-xl font-semibold mb-2">No Itineraries Yet</h3>
              <p className="text-gray-600 mb-4">Create your first travel itinerary to get started.</p>
              <Button onClick={() => setIsCreatingItinerary(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Itinerary
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Itinerary Sidebar */}
            <div className="lg:col-span-1">
              <Card>
                <CardHeader>
                  <CardTitle>Your Itineraries</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {itineraries.map((itinerary) => (
                    <div
                      key={itinerary.id}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedItinerary?.id === itinerary.id 
                          ? 'border-blue-500 bg-blue-50' 
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => setSelectedItinerary(itinerary)}
                    >
                      <div className="font-medium">
                        {new Date(itinerary.start_date).toLocaleDateString()} - {' '}
                        {new Date(itinerary.end_date).toLocaleDateString()}
                      </div>
                      <div className="text-sm text-gray-600">
                        {itinerary.destination_details?.length || 0} destinations
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {itinerary.status}
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            {/* Main Content Area */}
            <div className="lg:col-span-3">
              {selectedItinerary && (
                <Tabs defaultValue="destinations" className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="destinations">Destinations</TabsTrigger>
                    <TabsTrigger value="map">Map View</TabsTrigger>
                    <TabsTrigger value="emergency">Emergency</TabsTrigger>
                  </TabsList>

                  <TabsContent value="destinations">
                    <DestinationManager
                      itinerary={selectedItinerary}
                      onDestinationAdded={refreshSelectedItinerary}
                      onDestinationUpdated={refreshSelectedItinerary}
                    />
                  </TabsContent>

                  <TabsContent value="map">
                    <Card>
                      <CardContent className="p-8 text-center">
                        <MapIcon className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                        <h3 className="text-lg font-semibold mb-2">Interactive Map</h3>
                        <p className="text-gray-600">
                          Map integration with destination markers and real-time tracking coming soon.
                        </p>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="emergency">
                    <EmergencyContactsManager />
                  </TabsContent>
                </Tabs>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};