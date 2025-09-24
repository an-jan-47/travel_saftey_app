# Advanced Travel Safety App - Itinerary System Implementation Guide

## Database Setup Instructions

Run the following SQL commands in your Supabase SQL editor to set up the comprehensive itinerary system:

### 1. Update Existing Tables

```sql
-- Update existing app_a857ad95a4_itineraries table
ALTER TABLE app_a857ad95a4_itineraries 
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
```

### 2. Create New Tables

```sql
-- Create destinations table for individual destinations
CREATE TABLE IF NOT EXISTS app_a857ad95a4_destinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_id UUID NOT NULL REFERENCES app_a857ad95a4_itineraries(id) ON DELETE CASCADE,
  user_id UUID,
  tourist_id TEXT,
  name TEXT NOT NULL,
  latitude NUMERIC,
  longitude NUMERIC,
  planned_arrival TIMESTAMPTZ NOT NULL,
  auto_checkin_interval INTEGER NOT NULL DEFAULT 21600, -- 6 hours in seconds
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'completed', 'missed', 'cancelled')),
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create check-ins table to track all check-in attempts
CREATE TABLE IF NOT EXISTS app_a857ad95a4_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  destination_id UUID NOT NULL REFERENCES app_a857ad95a4_destinations(id) ON DELETE CASCADE,
  user_id UUID,
  tourist_id TEXT,
  checkin_type TEXT NOT NULL CHECK (checkin_type IN ('auto', 'manual', 'grace')),
  status TEXT NOT NULL CHECK (status IN ('completed', 'missed')),
  latitude NUMERIC NOT NULL,
  longitude NUMERIC NOT NULL,
  address TEXT,
  distance_from_destination NUMERIC, -- distance in meters
  scheduled_time TIMESTAMPTZ,
  actual_time TIMESTAMPTZ DEFAULT NOW(),
  grace_period_end TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create emergency contacts table
CREATE TABLE IF NOT EXISTS app_a857ad95a4_emergency_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  tourist_id TEXT,
  name TEXT NOT NULL,
  relationship TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  is_primary BOOLEAN DEFAULT FALSE,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3. Create Indexes

```sql
-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_destinations_itinerary_id ON app_a857ad95a4_destinations(itinerary_id);
CREATE INDEX IF NOT EXISTS idx_destinations_user_id ON app_a857ad95a4_destinations(user_id);
CREATE INDEX IF NOT EXISTS idx_destinations_tourist_id ON app_a857ad95a4_destinations(tourist_id);
CREATE INDEX IF NOT EXISTS idx_destinations_status ON app_a857ad95a4_destinations(status);
CREATE INDEX IF NOT EXISTS idx_checkins_destination_id ON app_a857ad95a4_checkins(destination_id);
CREATE INDEX IF NOT EXISTS idx_checkins_user_id ON app_a857ad95a4_checkins(user_id);
CREATE INDEX IF NOT EXISTS idx_checkins_tourist_id ON app_a857ad95a4_checkins(tourist_id);
CREATE INDEX IF NOT EXISTS idx_emergency_contacts_user_id ON app_a857ad95a4_emergency_contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_emergency_contacts_tourist_id ON app_a857ad95a4_emergency_contacts(tourist_id);
```

### 4. Create Triggers

```sql
-- Add trigger to auto-update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply update trigger to relevant tables
CREATE OR REPLACE TRIGGER update_itineraries_updated_at 
  BEFORE UPDATE ON app_a857ad95a4_itineraries 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_destinations_updated_at 
  BEFORE UPDATE ON app_a857ad95a4_destinations 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_emergency_contacts_updated_at 
  BEFORE UPDATE ON app_a857ad95a4_emergency_contacts 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 5. Setup RLS Policies

```sql
-- Enable RLS on new tables
ALTER TABLE app_a857ad95a4_destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_a857ad95a4_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_a857ad95a4_emergency_contacts ENABLE ROW LEVEL SECURITY;

-- Destinations policies
CREATE POLICY "Users can manage their own destinations"
ON app_a857ad95a4_destinations FOR ALL
TO authenticated
USING (
  user_id = auth.uid() OR 
  (user_id IS NULL AND tourist_id IN (SELECT tourist_id FROM app_a857ad95a4_tourists WHERE user_id = auth.uid()))
)
WITH CHECK (
  user_id = auth.uid() OR 
  (user_id IS NULL AND tourist_id IN (SELECT tourist_id FROM app_a857ad95a4_tourists WHERE user_id = auth.uid()))
);

-- Check-ins policies
CREATE POLICY "Users can manage their own checkins"
ON app_a857ad95a4_checkins FOR ALL
TO authenticated
USING (
  user_id = auth.uid() OR 
  (user_id IS NULL AND tourist_id IN (SELECT tourist_id FROM app_a857ad95a4_tourists WHERE user_id = auth.uid()))
)
WITH CHECK (
  user_id = auth.uid() OR 
  (user_id IS NULL AND tourist_id IN (SELECT tourist_id FROM app_a857ad95a4_tourists WHERE user_id = auth.uid()))
);

-- Emergency contacts policies
CREATE POLICY "Users can manage their own emergency contacts"
ON app_a857ad95a4_emergency_contacts FOR ALL
TO authenticated
USING (
  user_id = auth.uid() OR 
  (user_id IS NULL AND tourist_id IN (SELECT tourist_id FROM app_a857ad95a4_tourists WHERE user_id = auth.uid()))
)
WITH CHECK (
  user_id = auth.uid() OR 
  (user_id IS NULL AND tourist_id IN (SELECT tourist_id FROM app_a857ad95a4_tourists WHERE user_id = auth.uid()))
);

-- Update existing itineraries policy if needed
DROP POLICY IF EXISTS "Users can manage their own itineraries" ON app_a857ad95a4_itineraries;
CREATE POLICY "Users can manage their own itineraries"
ON app_a857ad95a4_itineraries FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
```

### 6. Auto-fill user_id Triggers

```sql
-- Function to auto-fill user_id from tourist_id for destinations
CREATE OR REPLACE FUNCTION auto_fill_user_id_destinations()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.user_id IS NULL AND NEW.tourist_id IS NOT NULL THEN
    SELECT user_id INTO NEW.user_id 
    FROM app_a857ad95a4_tourists 
    WHERE tourist_id = NEW.tourist_id 
    LIMIT 1;
    
    IF NEW.user_id IS NULL THEN
      RAISE EXCEPTION 'No user found for tourist_id: %', NEW.tourist_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to auto-fill user_id from tourist_id for checkins
CREATE OR REPLACE FUNCTION auto_fill_user_id_checkins()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.user_id IS NULL AND NEW.tourist_id IS NOT NULL THEN
    SELECT user_id INTO NEW.user_id 
    FROM app_a857ad95a4_tourists 
    WHERE tourist_id = NEW.tourist_id 
    LIMIT 1;
    
    IF NEW.user_id IS NULL THEN
      RAISE EXCEPTION 'No user found for tourist_id: %', NEW.tourist_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to auto-fill user_id from tourist_id for emergency contacts
CREATE OR REPLACE FUNCTION auto_fill_user_id_emergency_contacts()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.user_id IS NULL AND NEW.tourist_id IS NOT NULL THEN
    SELECT user_id INTO NEW.user_id 
    FROM app_a857ad95a4_tourists 
    WHERE tourist_id = NEW.tourist_id 
    LIMIT 1;
    
    IF NEW.user_id IS NULL THEN
      RAISE EXCEPTION 'No user found for tourist_id: %', NEW.tourist_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
CREATE OR REPLACE TRIGGER trigger_auto_fill_user_id_destinations
  BEFORE INSERT ON app_a857ad95a4_destinations
  FOR EACH ROW
  EXECUTE FUNCTION auto_fill_user_id_destinations();

CREATE OR REPLACE TRIGGER trigger_auto_fill_user_id_checkins
  BEFORE INSERT ON app_a857ad95a4_checkins
  FOR EACH ROW
  EXECUTE FUNCTION auto_fill_user_id_checkins();

CREATE OR REPLACE TRIGGER trigger_auto_fill_user_id_emergency_contacts
  BEFORE INSERT ON app_a857ad95a4_emergency_contacts
  FOR EACH ROW
  EXECUTE FUNCTION auto_fill_user_id_emergency_contacts();
```

## System Features

### ✅ Comprehensive Itinerary Management
- **Multiple Itineraries**: Create and manage multiple travel itineraries
- **Date-based Organization**: Set start and end dates for each trip
- **Status Tracking**: Active, completed, or cancelled itineraries

### ✅ Editable Destinations
- **Place Search Integration**: Search for destinations using OpenStreetMap Nominatim API
- **Manual Entry**: Add destinations manually with custom names
- **Coordinates Support**: Optional latitude/longitude for precise locations
- **Planned Arrival Times**: Set expected arrival times for each destination
- **Custom Notes**: Add personal notes for each destination
- **Reorderable**: Destinations are ordered and can be rearranged

### ✅ Auto Check-in System
- **Configurable Intervals**: Set check-in frequency (1-24 hours) per destination
- **Distance-based**: 2km radius detection for automatic check-ins
- **Grace Periods**: 10-minute grace period for missed check-ins
- **Status Tracking**: upcoming → completed/missed/cancelled
- **Background Service**: Runs every 30 seconds to monitor check-ins
- **Notification System**: Browser notifications for check-in events

### ✅ Offline Support
- **Encrypted LocalStorage**: AES-256 encryption for sensitive data
- **Offline Caching**: 5-minute cache duration with automatic sync
- **Network Aware**: Detects online/offline status
- **Data Persistence**: Store check-ins offline and sync when online
- **Retry Logic**: Automatic retry for failed uploads

### ✅ Emergency Contacts
- **Maximum 3 Contacts**: Store up to 3 emergency contacts
- **Contact Details**: Name, relationship, phone, optional email
- **Primary Contact**: Designate one primary emergency contact
- **Quick Access**: Available in emergency situations

### ✅ Real-time Tracking Integration
- **Location Services**: Integrated with your existing location tracking
- **Distance Calculation**: Real-time distance to destinations
- **Check-in Validation**: Verify user is within check-in range
- **Manual Override**: Allow manual check-ins when needed

## How to Use the System

### 1. Create Your First Itinerary
1. Navigate to the **Itinerary** page
2. Click **"New Itinerary"**
3. Set your travel start and end dates
4. Add optional trip notes
5. Click **"Create Itinerary"**

### 2. Add Destinations
1. Select your itinerary from the sidebar
2. Go to the **"Destinations"** tab
3. Click **"Add Destination"**
4. Search for a place or enter manually
5. Set planned arrival time
6. Choose check-in frequency (default: 6 hours)
7. Add optional notes

### 3. Configure Auto Check-ins
- **Check-in Intervals**: Choose how often you want to check in (1-24 hours)
- **Location Requirements**: Must be within 2km of destination
- **Grace Period**: 10 minutes after missed check-in
- **Notification Permission**: Allow notifications for alerts

### 4. Set Up Emergency Contacts
1. Go to the **"Emergency"** tab
2. Click **"Add Emergency Contact"**
3. Fill in contact details (name, relationship, phone)
4. Mark one as primary contact
5. Save up to 3 contacts

### 5. Monitor Your Journey
- **Real-time Status**: See current check-in status
- **Distance Tracking**: View distance from next destination
- **Overdue Alerts**: Get notified of missed check-ins
- **Manual Check-ins**: Force check-in if needed

## Technical Architecture

### Frontend Components
- **ItineraryService**: Core business logic and API handling
- **AutoCheckInService**: Background monitoring and notifications
- **itineraryTypes.ts**: TypeScript interfaces and types
- **Itinerary.tsx**: Main UI component with tabs and management

### Data Flow
1. **User Creates Itinerary** → Database with RLS policies
2. **Adds Destinations** → Linked to itinerary with coordinates
3. **Auto Check-in Service** → Monitors every 30 seconds
4. **Location Detection** → Validates proximity (2km radius)
5. **Status Updates** → Real-time status changes
6. **Offline Support** → Encrypted local storage with sync

### Security Features
- **Row Level Security**: Users only see their own data
- **AES-256 Encryption**: All offline data encrypted
- **Auto user_id Resolution**: Database triggers handle user mapping
- **Permission Checks**: Location and notification permissions

## Browser Compatibility

- **Location Services**: HTML5 Geolocation API
- **Notifications**: Web Notifications API
- **Offline Storage**: LocalStorage with encryption
- **Background Tasks**: Service Worker compatible
- **PWA Ready**: Works as Progressive Web App

## Troubleshooting

### Common Issues

1. **Auto Check-ins Not Working**
   - Check location permissions
   - Ensure notifications are enabled
   - Verify you're within 2km of destination

2. **Offline Data Not Syncing**
   - Check internet connection
   - Look for sync errors in console
   - Clear localStorage if corrupted

3. **Destinations Not Saving**
   - Verify database tables are created
   - Check RLS policies
   - Ensure tourist_id is set

### Debug Information
- Open browser console for detailed logs
- Check auto check-in service status
- Monitor network requests in dev tools

## Next Steps

### Potential Enhancements
- **Map Integration**: Visual destination markers and routes
- **Push Notifications**: Mobile app notifications
- **Photo Upload**: Attach photos to check-ins
- **Weather Integration**: Weather info for destinations
- **Travel Documents**: Store passport/visa info
- **Group Travel**: Share itineraries with others

### API Integrations
- **Google Places**: Enhanced place search
- **Weather APIs**: Destination weather
- **Transportation**: Flight/train tracking
- **Accommodation**: Hotel booking integration

The system is now fully functional with all requested features implemented. Users can create comprehensive itineraries, manage destinations, set up automatic check-ins, and maintain emergency contacts, all with full offline support and real-time tracking integration.