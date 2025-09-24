-- FIX ITINERARY DATABASE SCHEMA ERRORS
-- This file fixes the missing 'title' column and other schema issues

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
-- 3. ENSURE DESTINATIONS TABLE IS CORRECT
-- ================================

-- Create destinations table if it doesn't exist
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

-- ================================
-- 4. ENSURE CHECKINS TABLE IS CORRECT
-- ================================

-- Create checkins table if it doesn't exist
CREATE TABLE IF NOT EXISTS app_a857ad95a4_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  destination_id UUID NOT NULL,
  itinerary_id UUID NOT NULL,
  user_id UUID,
  tourist_id TEXT,
  actual_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  latitude NUMERIC,
  longitude NUMERIC,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'completed',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT fk_checkins_destination FOREIGN KEY (destination_id) REFERENCES app_a857ad95a4_destinations(id) ON DELETE CASCADE,
  CONSTRAINT fk_checkins_itinerary FOREIGN KEY (itinerary_id) REFERENCES app_a857ad95a4_itineraries(id) ON DELETE CASCADE
);

-- ================================
-- 5. ADD PROPER INDEXES FOR PERFORMANCE
-- ================================

-- Index for faster itinerary lookups
CREATE INDEX IF NOT EXISTS idx_itineraries_tourist_id ON app_a857ad95a4_itineraries(tourist_id);
CREATE INDEX IF NOT EXISTS idx_itineraries_user_id ON app_a857ad95a4_itineraries(user_id);

-- Index for faster destination lookups
CREATE INDEX IF NOT EXISTS idx_destinations_itinerary_id ON app_a857ad95a4_destinations(itinerary_id);
CREATE INDEX IF NOT EXISTS idx_destinations_tourist_id ON app_a857ad95a4_destinations(tourist_id);

-- Index for faster checkin lookups
CREATE INDEX IF NOT EXISTS idx_checkins_destination_id ON app_a857ad95a4_checkins(destination_id);
CREATE INDEX IF NOT EXISTS idx_checkins_itinerary_id ON app_a857ad95a4_checkins(itinerary_id);

-- ================================
-- 6. UPDATE RLS POLICIES TO INCLUDE TITLE
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
-- 7. ADD TRIGGERS FOR AUTOMATIC UPDATES
-- ================================

-- Function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for itineraries table
DROP TRIGGER IF EXISTS update_itineraries_updated_at ON app_a857ad95a4_itineraries;
CREATE TRIGGER update_itineraries_updated_at
    BEFORE UPDATE ON app_a857ad95a4_itineraries
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for destinations table
DROP TRIGGER IF EXISTS update_destinations_updated_at ON app_a857ad95a4_destinations;
CREATE TRIGGER update_destinations_updated_at
    BEFORE UPDATE ON app_a857ad95a4_destinations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ================================
-- 8. REFRESH SCHEMA CACHE
-- ================================

-- Force PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';

-- ================================
-- 9. VERIFY SCHEMA
-- ================================

-- Query to verify all columns exist
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'app_a857ad95a4_itineraries'
ORDER BY ordinal_position;

-- ================================
-- EXECUTION INSTRUCTIONS
-- ================================

/*
1. Run this entire SQL file in your Supabase SQL editor
2. Wait for all commands to complete successfully
3. The schema cache should automatically refresh
4. Test the edit functionality in your app
5. If cache issues persist, you may need to restart your Supabase instance

This will:
✅ Add the missing 'title' column
✅ Set default titles for existing data
✅ Ensure all required columns exist
✅ Update RLS policies
✅ Add performance indexes
✅ Set up automatic timestamp updates
✅ Force schema cache refresh
*/