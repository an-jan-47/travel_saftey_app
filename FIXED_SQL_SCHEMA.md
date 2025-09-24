# Fixed SQL Schema for Itinerary System

Based on your table structure, I can see the issue. Your existing `app_a857ad95a4_itineraries` table has:
- `destinations` as JSONB (not a separate table)
- Missing several columns we need

Let me provide the correct SQL that matches your existing structure.

## Step 1: Add Missing Columns to Existing Itineraries Table

```sql
-- Add missing columns to your existing itineraries table
ALTER TABLE app_a857ad95a4_itineraries 
ADD COLUMN IF NOT EXISTS waypoints JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS auto_checkin_interval INTEGER DEFAULT 21600,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
```

## Step 2: Create New Tables (Corrected for Your Schema)

### Create Destinations Table
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
```

### Create Check-ins Table
```sql
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
```

### Create Emergency Contacts Table
```sql
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

## Step 3: Create Indexes

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

## Step 4: Create Update Triggers

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

## Step 5: Enable RLS and Create Policies

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
```

## Step 6: Auto-fill user_id Triggers

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

## Important Changes Made:

1. **Fixed Foreign Key References**: The destinations table correctly references `app_a857ad95a4_itineraries(id)` 
2. **Made user_id Optional**: Since we have triggers to auto-fill it, it can be NULL initially
3. **Enhanced RLS Policies**: Now handle cases where user_id might be NULL initially
4. **Added tourist_id Indexes**: For better performance when auto-filling user_id

## Troubleshooting:

If you still get errors, please run this query first to see your existing table structure:

```sql
\d app_a857ad95a4_itineraries
```

Or:

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'app_a857ad95a4_itineraries';
```

This will help us identify the exact column names in your existing table.