-- COMPREHENSIVE ITINERARY DATABASE SETUP
-- This file fixes all the database issues including RLS policies and table creation

-- Step 1: Create missing itineraries table if it doesn't exist
CREATE TABLE IF NOT EXISTS app_a857ad95a4_itineraries (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tourist_id TEXT NOT NULL,
    user_id TEXT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    destinations JSONB DEFAULT '[]'::jsonb,
    waypoints JSONB DEFAULT '[]'::jsonb,
    auto_checkin_interval INTEGER DEFAULT 21600,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
    notes TEXT,
    title TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Step 2: Ensure destinations table has proper foreign key
ALTER TABLE app_a857ad95a4_destinations 
ADD COLUMN IF NOT EXISTS itinerary_id UUID;

-- Add foreign key constraint if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_destinations_itinerary'
    ) THEN
        ALTER TABLE app_a857ad95a4_destinations 
        ADD CONSTRAINT fk_destinations_itinerary 
        FOREIGN KEY (itinerary_id) REFERENCES app_a857ad95a4_itineraries(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Step 3: Enable RLS on all tables
ALTER TABLE app_a857ad95a4_itineraries ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_a857ad95a4_destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_a857ad95a4_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_a857ad95a4_emergency_contacts ENABLE ROW LEVEL SECURITY;

-- Step 4: Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can manage their own itineraries" ON app_a857ad95a4_itineraries;
DROP POLICY IF EXISTS "Users can manage their own destinations" ON app_a857ad95a4_destinations;
DROP POLICY IF EXISTS "Users can manage their own checkins" ON app_a857ad95a4_checkins;
DROP POLICY IF EXISTS "Users can manage their own emergency contacts" ON app_a857ad95a4_emergency_contacts;

-- Step 5: Create comprehensive RLS policies
-- Itineraries policies
CREATE POLICY "Users can manage their own itineraries" ON app_a857ad95a4_itineraries
FOR ALL USING (
    auth.uid()::text = tourist_id OR 
    auth.uid()::text = user_id OR
    auth.uid() = tourist_id::uuid OR
    auth.uid() = user_id::uuid
);

-- Destinations policies  
CREATE POLICY "Users can manage their own destinations" ON app_a857ad95a4_destinations
FOR ALL USING (
    auth.uid()::text = tourist_id OR 
    auth.uid()::text = user_id OR
    auth.uid() = tourist_id::uuid OR
    auth.uid() = user_id::uuid
);

-- Checkins policies (conditional creation)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'app_a857ad95a4_checkins') THEN
        EXECUTE 'CREATE POLICY "Users can manage their own checkins" ON app_a857ad95a4_checkins FOR ALL USING (
            auth.uid()::text = tourist_id OR 
            auth.uid()::text = user_id OR
            auth.uid() = tourist_id::uuid OR
            auth.uid() = user_id::uuid
        )';
    END IF;
END $$;

-- Emergency contacts policies
CREATE POLICY "Users can manage their own emergency contacts" ON app_a857ad95a4_emergency_contacts
FOR ALL USING (
    auth.uid()::text = tourist_id OR 
    auth.uid()::text = user_id OR
    auth.uid() = tourist_id::uuid OR
    auth.uid() = user_id::uuid
);

-- Step 6: Create or replace trigger function for auto-filling user fields
CREATE OR REPLACE FUNCTION fill_user_fields()
RETURNS TRIGGER AS $$
BEGIN
    -- Set user_id to current authenticated user if not provided
    IF NEW.user_id IS NULL AND auth.uid() IS NOT NULL THEN
        NEW.user_id := auth.uid()::text;
    END IF;
    
    -- Set tourist_id to current authenticated user if not provided  
    IF NEW.tourist_id IS NULL AND auth.uid() IS NOT NULL THEN
        NEW.tourist_id := auth.uid()::text;
    END IF;
    
    -- Update the updated_at timestamp
    NEW.updated_at := NOW();
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 7: Create triggers for all tables
-- Itineraries triggers
DROP TRIGGER IF EXISTS itineraries_fill_user_fields ON app_a857ad95a4_itineraries;
CREATE TRIGGER itineraries_fill_user_fields
    BEFORE INSERT OR UPDATE ON app_a857ad95a4_itineraries
    FOR EACH ROW EXECUTE FUNCTION fill_user_fields();

-- Destinations triggers
DROP TRIGGER IF EXISTS destinations_fill_user_fields ON app_a857ad95a4_destinations;
CREATE TRIGGER destinations_fill_user_fields
    BEFORE INSERT OR UPDATE ON app_a857ad95a4_destinations
    FOR EACH ROW EXECUTE FUNCTION fill_user_fields();

-- Emergency contacts triggers
DROP TRIGGER IF EXISTS emergency_contacts_fill_user_fields ON app_a857ad95a4_emergency_contacts;
CREATE TRIGGER emergency_contacts_fill_user_fields  
    BEFORE INSERT OR UPDATE ON app_a857ad95a4_emergency_contacts
    FOR EACH ROW EXECUTE FUNCTION fill_user_fields();

-- Checkins triggers (conditional)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'app_a857ad95a4_checkins') THEN
        EXECUTE 'DROP TRIGGER IF EXISTS checkins_fill_user_fields ON app_a857ad95a4_checkins';
        EXECUTE 'CREATE TRIGGER checkins_fill_user_fields BEFORE INSERT OR UPDATE ON app_a857ad95a4_checkins FOR EACH ROW EXECUTE FUNCTION fill_user_fields()';
    END IF;
END $$;

-- Step 8: Create safe indexes
CREATE INDEX IF NOT EXISTS idx_itineraries_tourist_id ON app_a857ad95a4_itineraries(tourist_id);
CREATE INDEX IF NOT EXISTS idx_itineraries_user_id ON app_a857ad95a4_itineraries(user_id);
CREATE INDEX IF NOT EXISTS idx_itineraries_status ON app_a857ad95a4_itineraries(status);
CREATE INDEX IF NOT EXISTS idx_itineraries_dates ON app_a857ad95a4_itineraries(start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_destinations_itinerary_id ON app_a857ad95a4_destinations(itinerary_id);
CREATE INDEX IF NOT EXISTS idx_destinations_tourist_id ON app_a857ad95a4_destinations(tourist_id);
CREATE INDEX IF NOT EXISTS idx_destinations_user_id ON app_a857ad95a4_destinations(user_id);

CREATE INDEX IF NOT EXISTS idx_emergency_contacts_tourist_id ON app_a857ad95a4_emergency_contacts(tourist_id);
CREATE INDEX IF NOT EXISTS idx_emergency_contacts_user_id ON app_a857ad95a4_emergency_contacts(user_id);

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Itinerary database schema setup completed successfully!';
    RAISE NOTICE '🔐 RLS policies created with flexible authentication';
    RAISE NOTICE '🔄 Auto-fill triggers configured for all tables';
    RAISE NOTICE '📊 Performance indexes created';
    RAISE NOTICE '🚀 Ready for itinerary operations!';
END $$;