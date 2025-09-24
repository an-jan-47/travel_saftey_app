-- STEP-BY-STEP SQL EXECUTION
-- Run these commands one by one to avoid errors

-- STEP 1: Add missing columns to existing itineraries table
ALTER TABLE app_a857ad95a4_itineraries 
ADD COLUMN IF NOT EXISTS waypoints JSONB DEFAULT '[]'::jsonb;

ALTER TABLE app_a857ad95a4_itineraries 
ADD COLUMN IF NOT EXISTS auto_checkin_interval INTEGER DEFAULT 21600;

ALTER TABLE app_a857ad95a4_itineraries 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

ALTER TABLE app_a857ad95a4_itineraries 
ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE app_a857ad95a4_itineraries 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE app_a857ad95a4_itineraries 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add check constraint for status (run this after adding the column)
ALTER TABLE app_a857ad95a4_itineraries 
ADD CONSTRAINT check_itinerary_status 
CHECK (status IN ('active', 'completed', 'cancelled'));

-- STEP 2: Create destinations table
CREATE TABLE IF NOT EXISTS app_a857ad95a4_destinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_id UUID NOT NULL,
  user_id UUID,
  tourist_id TEXT,
  name TEXT NOT NULL,
  latitude NUMERIC,
  longitude NUMERIC,
  planned_arrival TIMESTAMPTZ NOT NULL,
  auto_checkin_interval INTEGER NOT NULL DEFAULT 21600,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'upcoming',
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT fk_destinations_itinerary FOREIGN KEY (itinerary_id) REFERENCES app_a857ad95a4_itineraries(id) ON DELETE CASCADE,
  CONSTRAINT check_destination_status CHECK (status IN ('upcoming', 'completed', 'missed', 'cancelled'))
);

-- STEP 3: Create check-ins table
CREATE TABLE IF NOT EXISTS app_a857ad95a4_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  destination_id UUID NOT NULL,
  user_id UUID,
  tourist_id TEXT,
  checkin_type TEXT NOT NULL,
  status TEXT NOT NULL,
  latitude NUMERIC NOT NULL,
  longitude NUMERIC NOT NULL,
  address TEXT,
  distance_from_destination NUMERIC,
  scheduled_time TIMESTAMPTZ,
  actual_time TIMESTAMPTZ DEFAULT NOW(),
  grace_period_end TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT fk_checkins_destination FOREIGN KEY (destination_id) REFERENCES app_a857ad95a4_destinations(id) ON DELETE CASCADE,
  CONSTRAINT check_checkin_type CHECK (checkin_type IN ('auto', 'manual', 'grace')),
  CONSTRAINT check_checkin_status CHECK (status IN ('completed', 'missed'))
);

-- STEP 4: Create emergency contacts table
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

-- STEP 5: Create indexes
CREATE INDEX IF NOT EXISTS idx_destinations_itinerary_id ON app_a857ad95a4_destinations(itinerary_id);
CREATE INDEX IF NOT EXISTS idx_destinations_user_id ON app_a857ad95a4_destinations(user_id);
CREATE INDEX IF NOT EXISTS idx_destinations_tourist_id ON app_a857ad95a4_destinations(tourist_id);
CREATE INDEX IF NOT EXISTS idx_destinations_status ON app_a857ad95a4_destinations(status);
CREATE INDEX IF NOT EXISTS idx_checkins_destination_id ON app_a857ad95a4_checkins(destination_id);
CREATE INDEX IF NOT EXISTS idx_checkins_user_id ON app_a857ad95a4_checkins(user_id);
CREATE INDEX IF NOT EXISTS idx_checkins_tourist_id ON app_a857ad95a4_checkins(tourist_id);
CREATE INDEX IF NOT EXISTS idx_emergency_contacts_user_id ON app_a857ad95a4_emergency_contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_emergency_contacts_tourist_id ON app_a857ad95a4_emergency_contacts(tourist_id);

-- STEP 6: Enable RLS on new tables
ALTER TABLE app_a857ad95a4_destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_a857ad95a4_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_a857ad95a4_emergency_contacts ENABLE ROW LEVEL SECURITY;

-- STEP 7: Create RLS policies
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

-- STEP 8: Create update timestamp function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- STEP 9: Create update triggers
CREATE OR REPLACE TRIGGER update_itineraries_updated_at 
  BEFORE UPDATE ON app_a857ad95a4_itineraries 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_destinations_updated_at 
  BEFORE UPDATE ON app_a857ad95a4_destinations 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_emergency_contacts_updated_at 
  BEFORE UPDATE ON app_a857ad95a4_emergency_contacts 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- STEP 10: Create auto-fill user_id functions
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

-- STEP 11: Create auto-fill triggers
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

-- FINAL STEP: Verify tables were created
SELECT table_name, table_type 
FROM information_schema.tables 
WHERE table_name IN (
  'app_a857ad95a4_itineraries',
  'app_a857ad95a4_destinations', 
  'app_a857ad95a4_checkins',
  'app_a857ad95a4_emergency_contacts'
);