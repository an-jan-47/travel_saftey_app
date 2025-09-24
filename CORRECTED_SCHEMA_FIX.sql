-- CORRECTED SCHEMA FIX - NO MISSING COLUMNS
-- This version only references columns that actually exist

-- ================================
-- 1. ADD MISSING TITLE COLUMN
-- ================================

-- Add title column to itineraries table
ALTER TABLE app_a857ad95a4_itineraries 
ADD COLUMN IF NOT EXISTS title TEXT;

-- Set default titles for existing itineraries that don't have one
UPDATE app_a857ad95a4_itineraries 
SET title = 'Trip ' || TO_CHAR(start_date, 'MM/DD/YYYY')
WHERE title IS NULL OR title = '';

-- ================================
-- 2. VERIFY AND ADD OTHER MISSING COLUMNS
-- ================================

-- Ensure all required columns exist
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

-- ================================
-- 3. CHECK IF DESTINATIONS TABLE EXISTS, CREATE IF NOT
-- ================================

-- Create destinations table ONLY if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_tables WHERE tablename = 'app_a857ad95a4_destinations') THEN
        CREATE TABLE app_a857ad95a4_destinations (
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
          CONSTRAINT fk_destinations_itinerary FOREIGN KEY (itinerary_id) REFERENCES app_a857ad95a4_itineraries(id) ON DELETE CASCADE
        );
    END IF;
END $$;

-- ================================
-- 4. CHECK IF CHECKINS TABLE EXISTS, CREATE IF NOT
-- ================================

-- Create checkins table ONLY if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_tables WHERE tablename = 'app_a857ad95a4_checkins') THEN
        CREATE TABLE app_a857ad95a4_checkins (
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
          CONSTRAINT fk_checkins_destination FOREIGN KEY (destination_id) REFERENCES app_a857ad95a4_destinations(id) ON DELETE CASCADE
        );
    END IF;
END $$;

-- ================================
-- 5. CHECK IF EMERGENCY CONTACTS TABLE EXISTS, CREATE IF NOT
-- ================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_tables WHERE tablename = 'app_a857ad95a4_emergency_contacts') THEN
        CREATE TABLE app_a857ad95a4_emergency_contacts (
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
    END IF;
END $$;

-- ================================
-- 6. ADD HELPFUL INDEXES (ONLY IF THEY DON'T EXIST)
-- ================================

-- Index for faster itinerary lookups
CREATE INDEX IF NOT EXISTS idx_itineraries_tourist_id ON app_a857ad95a4_itineraries(tourist_id);
CREATE INDEX IF NOT EXISTS idx_itineraries_user_id ON app_a857ad95a4_itineraries(user_id);

-- Only create destination indexes if table exists
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'app_a857ad95a4_destinations') THEN
        CREATE INDEX IF NOT EXISTS idx_destinations_itinerary_id ON app_a857ad95a4_destinations(itinerary_id);
        CREATE INDEX IF NOT EXISTS idx_destinations_tourist_id ON app_a857ad95a4_destinations(tourist_id);
        CREATE INDEX IF NOT EXISTS idx_destinations_status ON app_a857ad95a4_destinations(status);
    END IF;
END $$;

-- Only create checkin indexes if table exists
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'app_a857ad95a4_checkins') THEN
        CREATE INDEX IF NOT EXISTS idx_checkins_destination_id ON app_a857ad95a4_checkins(destination_id);
        CREATE INDEX IF NOT EXISTS idx_checkins_tourist_id ON app_a857ad95a4_checkins(tourist_id);
    END IF;
END $$;

-- Only create emergency contact indexes if table exists
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'app_a857ad95a4_emergency_contacts') THEN
        CREATE INDEX IF NOT EXISTS idx_emergency_contacts_tourist_id ON app_a857ad95a4_emergency_contacts(tourist_id);
    END IF;
END $$;

-- ================================
-- 7. ENABLE RLS ON TABLES (ONLY IF THEY EXIST)
-- ================================

-- Enable RLS on destinations table if it exists
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'app_a857ad95a4_destinations') THEN
        ALTER TABLE app_a857ad95a4_destinations ENABLE ROW LEVEL SECURITY;
    END IF;
END $$;

-- Enable RLS on checkins table if it exists
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'app_a857ad95a4_checkins') THEN
        ALTER TABLE app_a857ad95a4_checkins ENABLE ROW LEVEL SECURITY;
    END IF;
END $$;

-- Enable RLS on emergency contacts table if it exists
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'app_a857ad95a4_emergency_contacts') THEN
        ALTER TABLE app_a857ad95a4_emergency_contacts ENABLE ROW LEVEL SECURITY;
    END IF;
END $$;

-- ================================
-- 8. UPDATE RLS POLICIES FOR ITINERARIES
-- ================================

-- Drop and recreate policies to ensure they work with the new schema
DROP POLICY IF EXISTS "Users can view their own itineraries" ON app_a857ad95a4_itineraries;
CREATE POLICY "Users can view their own itineraries"
ON app_a857ad95a4_itineraries
FOR SELECT
TO authenticated
USING (
  tourist_id = (SELECT value FROM app_a857ad95a4_profiles WHERE id = auth.uid())::text
  OR user_id::text = (SELECT value FROM app_a857ad95a4_profiles WHERE id = auth.uid())::text
);

DROP POLICY IF EXISTS "Users can insert their own itineraries" ON app_a857ad95a4_itineraries;
CREATE POLICY "Users can insert their own itineraries"
ON app_a857ad95a4_itineraries
FOR INSERT
TO authenticated
WITH CHECK (
  tourist_id = (SELECT value FROM app_a857ad95a4_profiles WHERE id = auth.uid())::text
  OR user_id::text = (SELECT value FROM app_a857ad95a4_profiles WHERE id = auth.uid())::text
);

DROP POLICY IF EXISTS "Users can update their own itineraries" ON app_a857ad95a4_itineraries;
CREATE POLICY "Users can update their own itineraries"
ON app_a857ad95a4_itineraries
FOR UPDATE
TO authenticated
USING (
  tourist_id = (SELECT value FROM app_a857ad95a4_profiles WHERE id = auth.uid())::text
  OR user_id::text = (SELECT value FROM app_a857ad95a4_profiles WHERE id = auth.uid())::text
);

DROP POLICY IF EXISTS "Users can delete their own itineraries" ON app_a857ad95a4_itineraries;
CREATE POLICY "Users can delete their own itineraries"
ON app_a857ad95a4_itineraries
FOR DELETE
TO authenticated
USING (
  tourist_id = (SELECT value FROM app_a857ad95a4_profiles WHERE id = auth.uid())::text
  OR user_id::text = (SELECT value FROM app_a857ad95a4_profiles WHERE id = auth.uid())::text
);

-- ================================
-- 9. ADD CONSTRAINTS (ONLY IF COLUMNS EXIST)
-- ================================

-- Add constraints if the columns exist
DO $$
BEGIN
    -- Check if end_date and start_date columns exist
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'app_a857ad95a4_itineraries' AND column_name = 'end_date') AND
       EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'app_a857ad95a4_itineraries' AND column_name = 'start_date') THEN
        
        -- Drop existing constraint if it exists
        ALTER TABLE app_a857ad95a4_itineraries DROP CONSTRAINT IF EXISTS check_date_order;
        
        -- Add the constraint
        ALTER TABLE app_a857ad95a4_itineraries
        ADD CONSTRAINT check_date_order CHECK (end_date >= start_date);
    END IF;
    
    -- Check if status column exists for itineraries
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'app_a857ad95a4_itineraries' AND column_name = 'status') THEN
        ALTER TABLE app_a857ad95a4_itineraries DROP CONSTRAINT IF EXISTS check_itinerary_status;
        ALTER TABLE app_a857ad95a4_itineraries
        ADD CONSTRAINT check_itinerary_status CHECK (status IN ('active', 'completed', 'cancelled', 'draft'));
    END IF;
END $$;

-- ================================
-- 10. ADD TRIGGERS FOR AUTOMATIC UPDATES
-- ================================

-- Function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for itineraries table (only if updated_at column exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'app_a857ad95a4_itineraries' AND column_name = 'updated_at') THEN
        DROP TRIGGER IF EXISTS update_itineraries_updated_at ON app_a857ad95a4_itineraries;
        CREATE TRIGGER update_itineraries_updated_at
            BEFORE UPDATE ON app_a857ad95a4_itineraries
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- ================================
-- 11. REFRESH SCHEMA CACHE
-- ================================

-- Force PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';

-- ================================
-- 12. VERIFY SCHEMA (OPTIONAL)
-- ================================

-- Query to verify all columns exist in itineraries table
SELECT 
  'app_a857ad95a4_itineraries' as table_name,
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'app_a857ad95a4_itineraries'
ORDER BY ordinal_position;

-- ================================
-- SUCCESS MESSAGE
-- ================================

DO $$
BEGIN
    RAISE NOTICE 'Schema fixes applied successfully! The title column has been added to the itineraries table.';
END $$;