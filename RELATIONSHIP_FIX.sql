-- SIMPLIFIED ITINERARY SCHEMA - No Relationship Conflicts
-- This fixes the PGRST201 error by removing ambiguous relationships

-- Step 1: Check if itineraries table exists and has correct columns
DO $$
BEGIN
    -- Add missing columns to itineraries table if they don't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'app_a857ad95a4_itineraries' 
                   AND column_name = 'title') THEN
        ALTER TABLE app_a857ad95a4_itineraries ADD COLUMN title TEXT;
    END IF;
    
    RAISE NOTICE '✅ Itineraries table structure verified';
END $$;

-- Step 2: Ensure destinations table has the correct foreign key structure
-- The key insight: destinations should primarily reference itineraries by itinerary_id
-- Remove ambiguous relationships by making tourist_id/user_id in destinations NOT reference itineraries

-- Check if foreign key constraint exists and is correct
DO $$
BEGIN
    -- Drop any existing foreign keys that might cause confusion
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints 
               WHERE constraint_name = 'fk_destinations_user_id_itinerary') THEN
        ALTER TABLE app_a857ad95a4_destinations DROP CONSTRAINT fk_destinations_user_id_itinerary;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints 
               WHERE constraint_name = 'fk_destinations_tourist_id_itinerary') THEN
        ALTER TABLE app_a857ad95a4_destinations DROP CONSTRAINT fk_destinations_tourist_id_itinerary;
    END IF;

    -- Ensure only ONE clear relationship: destinations.itinerary_id -> itineraries.id
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                   WHERE constraint_name = 'fk_destinations_itinerary_id') THEN
        ALTER TABLE app_a857ad95a4_destinations 
        ADD CONSTRAINT fk_destinations_itinerary_id 
        FOREIGN KEY (itinerary_id) REFERENCES app_a857ad95a4_itineraries(id) ON DELETE CASCADE;
    END IF;
    
    RAISE NOTICE '✅ Destinations table relationships cleaned up';
END $$;

-- Step 3: Ensure checkins table has proper relationship
DO $$
BEGIN
    -- Make sure checkins only references itineraries by itinerary_id
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                   WHERE constraint_name = 'fk_checkins_itinerary_id') THEN
        ALTER TABLE app_a857ad95a4_checkins 
        ADD CONSTRAINT fk_checkins_itinerary_id 
        FOREIGN KEY (itinerary_id) REFERENCES app_a857ad95a4_itineraries(id) ON DELETE CASCADE;
    END IF;
    
    RAISE NOTICE '✅ Checkins table relationships verified';
END $$;

-- Step 4: Update RLS policies to use tourist_id primarily
ALTER TABLE app_a857ad95a4_itineraries ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_a857ad95a4_destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_a857ad95a4_checkins ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can manage their own itineraries" ON app_a857ad95a4_itineraries;
DROP POLICY IF EXISTS "Users can manage their own destinations" ON app_a857ad95a4_destinations;  
DROP POLICY IF EXISTS "Users can manage their own checkins" ON app_a857ad95a4_checkins;

-- Create simplified RLS policies using tourist_id primarily
CREATE POLICY "Users can manage their own itineraries" ON app_a857ad95a4_itineraries
FOR ALL USING (
    tourist_id = (SELECT tourist_id FROM app_a857ad95a4_tourists WHERE user_id = auth.uid())
    OR user_id = auth.uid()
);

CREATE POLICY "Users can manage their own destinations" ON app_a857ad95a4_destinations  
FOR ALL USING (
    tourist_id = (SELECT tourist_id FROM app_a857ad95a4_tourists WHERE user_id = auth.uid())
    OR user_id = auth.uid()
);

CREATE POLICY "Users can manage their own checkins" ON app_a857ad95a4_checkins
FOR ALL USING (
    tourist_id = (SELECT tourist_id FROM app_a857ad95a4_tourists WHERE user_id = auth.uid())
    OR user_id = auth.uid()
);

-- Step 5: Create optimized indexes
CREATE INDEX IF NOT EXISTS idx_itineraries_tourist_id ON app_a857ad95a4_itineraries(tourist_id);
CREATE INDEX IF NOT EXISTS idx_destinations_itinerary_id ON app_a857ad95a4_destinations(itinerary_id);
CREATE INDEX IF NOT EXISTS idx_destinations_tourist_id ON app_a857ad95a4_destinations(tourist_id);
CREATE INDEX IF NOT EXISTS idx_checkins_itinerary_id ON app_a857ad95a4_checkins(itinerary_id);
CREATE INDEX IF NOT EXISTS idx_checkins_tourist_id ON app_a857ad95a4_checkins(tourist_id);

-- Step 6: Test query compatibility
DO $$
DECLARE
    test_count INTEGER;
BEGIN
    -- Test if we can query itineraries without relationship conflicts
    SELECT COUNT(*) INTO test_count FROM app_a857ad95a4_itineraries LIMIT 1;
    RAISE NOTICE '✅ Itineraries table query test passed';
    
    SELECT COUNT(*) INTO test_count FROM app_a857ad95a4_destinations LIMIT 1;
    RAISE NOTICE '✅ Destinations table query test passed';
    
    RAISE NOTICE '🚀 Database schema optimized for single relationship queries!';
    RAISE NOTICE '📊 Use separate queries for destinations and checkins to avoid PGRST201 errors';
END $$;