-- FIXED INDEXES - Only create indexes for columns that actually exist
-- Run these commands ONLY if the tables were created successfully

-- First, let's drop any existing problematic indexes
DROP INDEX IF EXISTS idx_checkins_destination_id;
DROP INDEX IF EXISTS idx_destinations_itinerary_id;
DROP INDEX IF EXISTS idx_destinations_user_id;
DROP INDEX IF EXISTS idx_destinations_tourist_id;
DROP INDEX IF EXISTS idx_destinations_status;
DROP INDEX IF EXISTS idx_checkins_user_id;
DROP INDEX IF EXISTS idx_checkins_tourist_id;
DROP INDEX IF EXISTS idx_emergency_contacts_user_id;
DROP INDEX IF EXISTS idx_emergency_contacts_tourist_id;

-- Now create indexes only for existing columns
-- Indexes for destinations table
CREATE INDEX IF NOT EXISTS idx_destinations_itinerary_id ON app_a857ad95a4_destinations(itinerary_id);
CREATE INDEX IF NOT EXISTS idx_destinations_user_id ON app_a857ad95a4_destinations(user_id);
CREATE INDEX IF NOT EXISTS idx_destinations_tourist_id ON app_a857ad95a4_destinations(tourist_id);
CREATE INDEX IF NOT EXISTS idx_destinations_status ON app_a857ad95a4_destinations(status);

-- Indexes for emergency contacts table  
CREATE INDEX IF NOT EXISTS idx_emergency_contacts_user_id ON app_a857ad95a4_emergency_contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_emergency_contacts_tourist_id ON app_a857ad95a4_emergency_contacts(tourist_id);

-- For checkins table, we'll be more careful and check if the table exists and has the right columns
-- First check if the checkins table was actually created with destination_id column
DO $$
BEGIN
    -- Try to create index for checkins destination_id if column exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'app_a857ad95a4_checkins' 
        AND column_name = 'destination_id'
    ) THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_checkins_destination_id ON app_a857ad95a4_checkins(destination_id)';
        RAISE NOTICE 'Created index on destination_id';
    ELSE
        RAISE NOTICE 'Column destination_id does not exist in checkins table';
    END IF;

    -- Try to create index for checkins user_id if column exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'app_a857ad95a4_checkins' 
        AND column_name = 'user_id'
    ) THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_checkins_user_id ON app_a857ad95a4_checkins(user_id)';
        RAISE NOTICE 'Created index on user_id for checkins';
    END IF;

    -- Try to create index for checkins tourist_id if column exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'app_a857ad95a4_checkins' 
        AND column_name = 'tourist_id'  
    ) THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_checkins_tourist_id ON app_a857ad95a4_checkins(tourist_id)';
        RAISE NOTICE 'Created index on tourist_id for checkins';
    END IF;
END $$;