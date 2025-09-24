-- COMPLETE SCHEMA SETUP (FINAL VERSION)
-- This combines all the working parts and skips problematic indexes

-- STEP 1: Enable RLS on all tables (assuming tables already exist)
ALTER TABLE app_a857ad95a4_destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_a857ad95a4_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_a857ad95a4_emergency_contacts ENABLE ROW LEVEL SECURITY;

-- STEP 2: Create RLS policies
-- Destinations policies
CREATE POLICY "Users can manage their own destinations" ON app_a857ad95a4_destinations
FOR ALL USING (auth.uid() = user_id::uuid OR auth.uid() = tourist_id::uuid);

-- Emergency contacts policies  
CREATE POLICY "Users can manage their own emergency contacts" ON app_a857ad95a4_emergency_contacts
FOR ALL USING (auth.uid() = user_id::uuid OR auth.uid() = tourist_id::uuid);

-- Checkins policies (only if table exists with proper columns)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'app_a857ad95a4_checkins') THEN
        EXECUTE 'CREATE POLICY "Users can manage their own checkins" ON app_a857ad95a4_checkins FOR ALL USING (auth.uid() = user_id::uuid OR auth.uid() = tourist_id::uuid)';
        RAISE NOTICE 'Created RLS policy for checkins table';
    ELSE
        RAISE NOTICE 'Checkins table does not exist - skipping policy';
    END IF;
END $$;

-- STEP 3: Create trigger function to auto-fill user_id
CREATE OR REPLACE FUNCTION fill_user_id()
RETURNS TRIGGER AS $$
BEGIN
    -- Set user_id to current authenticated user if not provided
    IF NEW.user_id IS NULL THEN
        NEW.user_id := auth.uid();
    END IF;
    
    -- Set tourist_id to current authenticated user if not provided  
    IF NEW.tourist_id IS NULL THEN
        NEW.tourist_id := auth.uid();
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- STEP 4: Create triggers for auto-filling user_id
CREATE OR REPLACE TRIGGER destinations_fill_user_id
    BEFORE INSERT ON app_a857ad95a4_destinations
    FOR EACH ROW EXECUTE FUNCTION fill_user_id();

CREATE OR REPLACE TRIGGER emergency_contacts_fill_user_id  
    BEFORE INSERT ON app_a857ad95a4_emergency_contacts
    FOR EACH ROW EXECUTE FUNCTION fill_user_id();

-- Checkins trigger (only if table exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'app_a857ad95a4_checkins') THEN
        EXECUTE 'CREATE OR REPLACE TRIGGER checkins_fill_user_id BEFORE INSERT ON app_a857ad95a4_checkins FOR EACH ROW EXECUTE FUNCTION fill_user_id()';
        RAISE NOTICE 'Created trigger for checkins table';
    ELSE
        RAISE NOTICE 'Checkins table does not exist - skipping trigger';
    END IF;
END $$;

-- STEP 5: Create safe indexes (only for columns that exist)
CREATE INDEX IF NOT EXISTS idx_destinations_itinerary_id ON app_a857ad95a4_destinations(itinerary_id);
CREATE INDEX IF NOT EXISTS idx_destinations_user_id ON app_a857ad95a4_destinations(user_id);
CREATE INDEX IF NOT EXISTS idx_destinations_tourist_id ON app_a857ad95a4_destinations(tourist_id);
CREATE INDEX IF NOT EXISTS idx_destinations_status ON app_a857ad95a4_destinations(status);

CREATE INDEX IF NOT EXISTS idx_emergency_contacts_user_id ON app_a857ad95a4_emergency_contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_emergency_contacts_tourist_id ON app_a857ad95a4_emergency_contacts(tourist_id);

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Database schema setup completed successfully!';
    RAISE NOTICE 'All policies, triggers, and safe indexes have been created.';
END $$;