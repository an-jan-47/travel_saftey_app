-- FIX UUID COLUMN TYPE MISMATCH
-- The tourist_id columns are defined as UUID but the app generates custom strings like "TID-xxx"
-- This script changes tourist_id columns from UUID to TEXT to match the application logic

-- ================================
-- 1. CHANGE TOURIST_ID COLUMNS FROM UUID TO TEXT
-- ================================

-- Fix itineraries table
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'app_a857ad95a4_itineraries') THEN
        -- First, drop any RLS policies that depend on these columns
        DROP POLICY IF EXISTS allow_users_read_own_itineraries ON app_a857ad95a4_itineraries;
        DROP POLICY IF EXISTS allow_users_create_own_itineraries ON app_a857ad95a4_itineraries;
        DROP POLICY IF EXISTS allow_users_update_own_itineraries ON app_a857ad95a4_itineraries;
        DROP POLICY IF EXISTS allow_users_delete_own_itineraries ON app_a857ad95a4_itineraries;
        
        -- Change tourist_id column type
        ALTER TABLE app_a857ad95a4_itineraries 
        ALTER COLUMN tourist_id TYPE TEXT;
        
        -- Also change user_id if it exists and is UUID type
        ALTER TABLE app_a857ad95a4_itineraries 
        ALTER COLUMN user_id TYPE TEXT;
        
        -- Recreate basic RLS policies using TEXT columns (simplified version)
        CREATE POLICY allow_users_read_own_itineraries ON app_a857ad95a4_itineraries
        FOR SELECT USING (user_id = auth.uid()::text OR tourist_id = auth.uid()::text);
        
        CREATE POLICY allow_users_create_own_itineraries ON app_a857ad95a4_itineraries
        FOR INSERT WITH CHECK (user_id = auth.uid()::text OR tourist_id = auth.uid()::text);
        
        CREATE POLICY allow_users_update_own_itineraries ON app_a857ad95a4_itineraries
        FOR UPDATE USING (user_id = auth.uid()::text OR tourist_id = auth.uid()::text);
        
        CREATE POLICY allow_users_delete_own_itineraries ON app_a857ad95a4_itineraries
        FOR DELETE USING (user_id = auth.uid()::text OR tourist_id = auth.uid()::text);
        
        RAISE NOTICE 'Updated tourist_id and user_id columns in itineraries table to TEXT and recreated RLS policies';
    END IF;
END $$;

-- Fix destinations table if it exists
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'app_a857ad95a4_destinations') THEN
        -- Drop RLS policies that might depend on tourist_id
        DROP POLICY IF EXISTS allow_users_read_own_destinations ON app_a857ad95a4_destinations;
        DROP POLICY IF EXISTS allow_users_create_own_destinations ON app_a857ad95a4_destinations;
        DROP POLICY IF EXISTS allow_users_update_own_destinations ON app_a857ad95a4_destinations;
        DROP POLICY IF EXISTS allow_users_delete_own_destinations ON app_a857ad95a4_destinations;
        
        ALTER TABLE app_a857ad95a4_destinations 
        ALTER COLUMN tourist_id TYPE TEXT;
        
        -- Recreate basic RLS policies
        CREATE POLICY allow_users_manage_own_destinations ON app_a857ad95a4_destinations
        FOR ALL USING (tourist_id = auth.uid()::text);
        
        RAISE NOTICE 'Updated tourist_id column in destinations table to TEXT';
    END IF;
END $$;

-- Fix tourists table if it exists
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'app_a857ad95a4_tourists') THEN
        ALTER TABLE app_a857ad95a4_tourists 
        ALTER COLUMN tourist_id TYPE TEXT;
        
        RAISE NOTICE 'Updated tourist_id column in tourists table to TEXT';
    END IF;
END $$;

-- Fix location_logs table if it exists
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'app_a857ad95a4_location_logs') THEN
        ALTER TABLE app_a857ad95a4_location_logs 
        ALTER COLUMN tourist_id TYPE TEXT;
        
        RAISE NOTICE 'Updated tourist_id column in location_logs table to TEXT';
    END IF;
END $$;

-- Fix alerts table if it exists
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'app_a857ad95a4_alerts') THEN
        -- Drop RLS policies that might depend on tourist_id
        DROP POLICY IF EXISTS allow_users_read_own_alerts ON app_a857ad95a4_alerts;
        DROP POLICY IF EXISTS allow_users_create_own_alerts ON app_a857ad95a4_alerts;
        DROP POLICY IF EXISTS allow_users_update_own_alerts ON app_a857ad95a4_alerts;
        
        ALTER TABLE app_a857ad95a4_alerts 
        ALTER COLUMN tourist_id TYPE TEXT;
        
        -- Recreate basic RLS policies
        CREATE POLICY allow_users_manage_own_alerts ON app_a857ad95a4_alerts
        FOR ALL USING (tourist_id = auth.uid()::text);
        
        RAISE NOTICE 'Updated tourist_id column in alerts table to TEXT';
    END IF;
END $$;

-- Fix checkins table if it exists
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'app_a857ad95a4_checkins') THEN
        -- Drop RLS policies that might depend on tourist_id
        DROP POLICY IF EXISTS allow_users_read_own_checkins ON app_a857ad95a4_checkins;
        DROP POLICY IF EXISTS allow_users_create_own_checkins ON app_a857ad95a4_checkins;
        
        ALTER TABLE app_a857ad95a4_checkins 
        ALTER COLUMN tourist_id TYPE TEXT;
        
        -- Recreate basic RLS policies
        CREATE POLICY allow_users_manage_own_checkins ON app_a857ad95a4_checkins
        FOR ALL USING (tourist_id = auth.uid()::text);
        
        RAISE NOTICE 'Updated tourist_id column in checkins table to TEXT';
    END IF;
END $$;

-- Fix incidents table if it exists
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'app_a857ad95a4_incidents') THEN
        ALTER TABLE app_a857ad95a4_incidents 
        ALTER COLUMN tourist_id TYPE TEXT;
        
        RAISE NOTICE 'Updated tourist_id column in incidents table to TEXT';
    END IF;
END $$;

-- Fix emergency_contacts table if it exists
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'app_a857ad95a4_emergency_contacts') THEN
        ALTER TABLE app_a857ad95a4_emergency_contacts 
        ALTER COLUMN tourist_id TYPE TEXT;
        
        RAISE NOTICE 'Updated tourist_id column in emergency_contacts table to TEXT';
    END IF;
END $$;

-- ================================
-- 2. ADD MISSING TITLE COLUMN (from previous fix)
-- ================================

-- Add title column to itineraries table if it doesn't exist
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'app_a857ad95a4_itineraries') THEN
        -- Add title column if it doesn't exist
        ALTER TABLE app_a857ad95a4_itineraries 
        ADD COLUMN IF NOT EXISTS title TEXT;
        
        -- Set default titles for existing itineraries that don't have one
        UPDATE app_a857ad95a4_itineraries 
        SET title = 'Trip ' || TO_CHAR(start_date, 'MM/DD/YYYY')
        WHERE title IS NULL OR title = '';
        
        RAISE NOTICE 'Added title column to itineraries table';
    END IF;
END $$;

-- ================================
-- 3. VERIFY CHANGES
-- ================================

-- Show the column types after the changes
SELECT 
    table_name,
    column_name, 
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name LIKE 'app_a857ad95a4_%' 
AND column_name IN ('tourist_id', 'user_id', 'title')
ORDER BY table_name, column_name;