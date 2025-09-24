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

const Itinerary = () => {
  const [itineraries, setItineraries] = useState<ItineraryWithDestinations[]>([]);
  const [selectedItinerary, setSelectedItinerary] = useState<ItineraryWithDestinations | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isCreatingItinerary, setIsCreatingItinerary] = useState(false);
  const [newItinerary, setNewItinerary] = useState({
    start_date: '',
    end_date: '',
    notes: '',
    title: '',
    destinations: [] as Destination[]
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlaceSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

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
      destinations: newItinerary.destinations,
      status: 'active'
    });

    if (created) {
      await loadItineraries();
      setIsCreatingItinerary(false);
      setNewItinerary({ 
        start_date: '', 
        end_date: '', 
        notes: '', 
        title: '', 
        destinations: [] 
      });
      setSearchQuery('');
      setSearchResults([]);
      setSelectedItinerary(created);
    }
  };

  // Search destinations for itinerary creation
  const searchDestinations = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const results = await itineraryService.searchPlaces(query);
      setSearchResults(results);
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Add destination to new itinerary
  const addDestinationToNewItinerary = (place: PlaceSearchResult) => {
    const newDestination: Destination = {
      id: `temp_${Date.now()}`,
      itinerary_id: '',
      tourist_id: localStorage.getItem('tourist_id') || '',
      name: place.name,
      address: place.address,
      latitude: place.latitude,
      longitude: place.longitude,
      visit_date: new Date().toISOString().split('T')[0],
      visit_time: '09:00',
      status: 'pending',
      notes: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    setNewItinerary(prev => ({
      ...prev,
      destinations: [...prev.destinations, newDestination]
    }));
    setSearchQuery('');
    setSearchResults([]);
  };

  // Remove destination from new itinerary
  const removeDestinationFromNewItinerary = (destinationId: string) => {
    setNewItinerary(prev => ({
      ...prev,
      destinations: prev.destinations.filter(d => d.id !== destinationId)
    }));
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
    <div className="container mx-auto px-4 py-4 md:py-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 md:mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Travel Itinerary</h1>
            <div className="flex items-center gap-2 text-sm mt-2">
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
          </div>
          <Button 
            onClick={() => setIsCreatingItinerary(true)}
            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Itinerary
          </Button>
        </div>

        {/* Create New Itinerary Dialog */}
        {isCreatingItinerary && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Create New Itinerary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Title Field */}
              <div>
                <label className="text-sm font-medium mb-2 block">Itinerary Title</label>
                <Input
                  placeholder="e.g., Tokyo Adventure, Europe Tour..."
                  value={newItinerary.title}
                  onChange={(e) => setNewItinerary(prev => ({ ...prev, title: e.target.value }))}
                />
              </div>

              {/* Date Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Start Date</label>
                  <Input
                    type="date"
                    value={newItinerary.start_date}
                    onChange={(e) => setNewItinerary(prev => ({ ...prev, start_date: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">End Date</label>
                  <Input
                    type="date"
                    value={newItinerary.end_date}
                    onChange={(e) => setNewItinerary(prev => ({ ...prev, end_date: e.target.value }))}
                  />
                </div>
              </div>

              {/* Destination Search */}
              <div>
                <label className="text-sm font-medium mb-2 block">Add Destinations (Optional)</label>
                <div className="relative">
                  <Input
                    placeholder="Search for places to visit..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      searchDestinations(e.target.value);
                    }}
                  />
                  {isSearching && (
                    <div className="absolute right-3 top-3">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                    </div>
                  )}
                </div>
                
                {/* Search Results */}
                {searchResults.length > 0 && (
                  <div className="mt-2 border rounded-lg max-h-48 overflow-y-auto bg-white dark:bg-gray-800">
                    {searchResults.map((place, index) => (
                      <button
                        key={index}
                        onClick={() => addDestinationToNewItinerary(place)}
                        className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-200 dark:border-gray-600 last:border-b-0"
                      >
                        <div className="font-medium text-sm">{place.name}</div>
                        <div className="text-xs text-gray-500 mt-1">{place.address}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Added Destinations List */}
              {newItinerary.destinations.length > 0 && (
                <div>
                  <label className="text-sm font-medium mb-2 block">Added Destinations</label>
                  <div className="space-y-2">
                    {newItinerary.destinations.map((destination) => (
                      <div key={destination.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <div className="flex-1">
                          <div className="font-medium text-sm">{destination.name}</div>
                          <div className="text-xs text-gray-500 mt-1">{destination.address}</div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeDestinationFromNewItinerary(destination.id)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes Field */}
              <div>
                <label className="text-sm font-medium mb-2 block">Notes</label>
                <Textarea
                  placeholder="Trip notes, preferences, important information..."
                  value={newItinerary.notes}
                  onChange={(e) => setNewItinerary(prev => ({ ...prev, notes: e.target.value }))}
                  rows={3}
                />
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col-reverse sm:flex-row gap-3 pt-4">
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setIsCreatingItinerary(false);
                    setNewItinerary({ 
                      start_date: '', 
                      end_date: '', 
                      notes: '', 
                      title: '', 
                      destinations: [] 
                    });
                    setSearchQuery('');
                    setSearchResults([]);
                  }}
                  className="w-full sm:w-auto"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={createItinerary}
                  disabled={!newItinerary.start_date || !newItinerary.end_date}
                  className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700"
                >
                  Create Itinerary
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main Content */}
        {itineraries.length === 0 ? (
          <Card>
            <CardContent className="p-8 md:p-12 text-center">
              <MapIcon className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <h3 className="text-xl font-semibold mb-2">No Itineraries Yet</h3>
              <p className="text-gray-600 mb-6 max-w-md mx-auto">
                Create your first travel itinerary to get started with planning your adventures.
              </p>
              <Button 
                onClick={() => setIsCreatingItinerary(true)}
                className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Itinerary
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 lg:gap-8">
            {/* Itinerary Sidebar */}
            <div className="xl:col-span-1 order-2 xl:order-1">
              <Card className="h-fit">
                <CardHeader>
                  <CardTitle className="text-lg">Your Itineraries</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 max-h-96 xl:max-h-[600px] overflow-y-auto">
                  {itineraries.map((itinerary) => (
                    <div
                      key={itinerary.id}
                      className={`p-3 rounded-lg border cursor-pointer transition-all duration-200 ${
                        selectedItinerary?.id === itinerary.id 
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-sm' 
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:border-gray-600 dark:hover:bg-gray-800'
                      }`}
                      onClick={() => setSelectedItinerary(itinerary)}
                    >
                      <div className="space-y-2">
                        <div className="font-medium text-sm md:text-base line-clamp-1">
                          {itinerary.title || `Trip ${new Date(itinerary.start_date).toLocaleDateString()}`}
                        </div>
                        <div className="text-xs md:text-sm text-gray-600">
                          {new Date(itinerary.start_date).toLocaleDateString()} - {' '}
                          {new Date(itinerary.end_date).toLocaleDateString()}
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-500">
                            {itinerary.destination_details?.length || 0} destinations
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {itinerary.status}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            {/* Main Content Area */}
            <div className="xl:col-span-3 order-1 xl:order-2">
              {selectedItinerary && (
                <Tabs defaultValue="destinations" className="w-full">
                  <TabsList className="grid w-full grid-cols-3 h-auto">
                    <TabsTrigger 
                      value="destinations" 
                      className="text-xs sm:text-sm px-2 py-2"
                    >
                      <span className="hidden sm:inline">Destinations</span>
                      <span className="sm:hidden">Places</span>
                    </TabsTrigger>
                    <TabsTrigger 
                      value="map" 
                      className="text-xs sm:text-sm px-2 py-2"
                    >
                      <span className="hidden sm:inline">Map View</span>
                      <span className="sm:hidden">Map</span>
                    </TabsTrigger>
                    <TabsTrigger 
                      value="emergency" 
                      className="text-xs sm:text-sm px-2 py-2"
                    >
                      <span className="hidden sm:inline">Emergency</span>
                      <span className="sm:hidden">SOS</span>
                    </TabsTrigger>
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

export default Itinerary;