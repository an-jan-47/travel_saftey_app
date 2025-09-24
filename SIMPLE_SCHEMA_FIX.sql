-- SIMPLE SCHEMA FIX - Add missing title column only
-- This version only adds the essential missing column without complex RLS policies

-- ================================
-- 1. ADD MISSING TITLE COLUMN
-- ================================

-- Check if the itineraries table exists first
DO $$
BEGIN
    -- Add title column to itineraries table if it doesn't exist
    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'app_a857ad95a4_itineraries') THEN
        -- Add title column if it doesn't exist
        ALTER TABLE app_a857ad95a4_itineraries 
        ADD COLUMN IF NOT EXISTS title TEXT;
        
        -- Set default titles for existing itineraries that don't have one
        UPDATE app_a857ad95a4_itineraries 
        SET title = 'Trip ' || TO_CHAR(start_date, 'MM/DD/YYYY')
        WHERE title IS NULL OR title = '';
        
        RAISE NOTICE 'Title column added to itineraries table';
    ELSE
        RAISE NOTICE 'Itineraries table does not exist';
    END IF;
END $$;

-- ================================
-- 2. ADD OTHER USEFUL COLUMNS (OPTIONAL)
-- ================================

-- Add other potentially useful columns if they don't exist
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'app_a857ad95a4_itineraries') THEN
        -- Add waypoints column for storing route information
        ALTER TABLE app_a857ad95a4_itineraries 
        ADD COLUMN IF NOT EXISTS waypoints JSONB DEFAULT '[]'::jsonb;
        
        -- Add auto check-in interval (in seconds, default 6 hours)
        ALTER TABLE app_a857ad95a4_itineraries 
        ADD COLUMN IF NOT EXISTS auto_checkin_interval INTEGER DEFAULT 21600;
        
        -- Add status column
        ALTER TABLE app_a857ad95a4_itineraries 
        ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
        
        -- Add notes column if it doesn't exist
        ALTER TABLE app_a857ad95a4_itineraries 
        ADD COLUMN IF NOT EXISTS notes TEXT;
        
        -- Add timestamps if they don't exist
        ALTER TABLE app_a857ad95a4_itineraries 
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
        
        ALTER TABLE app_a857ad95a4_itineraries 
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
        
        RAISE NOTICE 'Additional columns added to itineraries table';
    END IF;
END $$;

-- ================================
-- 3. VERIFY COLUMN ADDITIONS
-- ================================

-- Query to show the current structure of the itineraries table
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'app_a857ad95a4_itineraries' 
ORDER BY ordinal_position;