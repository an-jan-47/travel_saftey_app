-- FIX_CHECKINS_TABLE_DESTINATION_ID.sql
-- This script checks and fixes issues with the destination_id column in the app_a857ad95a4_checkins table

-- ================================
-- 1. DISABLE RLS POLICY TEMPORARILY
-- ================================

-- Disable RLS on checkins table
ALTER TABLE IF EXISTS app_a857ad95a4_checkins DISABLE ROW LEVEL SECURITY;

-- ================================
-- 2. ENSURE DESTINATION_ID IS UUID TYPE
-- ================================

DO $$
DECLARE
    is_uuid BOOLEAN;
BEGIN
    -- Check if destination_id is already UUID type
    SELECT data_type = 'uuid' INTO is_uuid
    FROM information_schema.columns 
    WHERE table_name = 'app_a857ad95a4_checkins'
    AND column_name = 'destination_id';

    -- If it's not UUID, try to convert it
    IF NOT is_uuid THEN
        -- Create a backup column
        ALTER TABLE app_a857ad95a4_checkins ADD COLUMN destination_id_backup TEXT;
        
        -- Copy the data to backup
        UPDATE app_a857ad95a4_checkins SET destination_id_backup = destination_id::TEXT;
        
        -- Remove the old column
        ALTER TABLE app_a857ad95a4_checkins DROP COLUMN destination_id;
        
        -- Create the new UUID column
        ALTER TABLE app_a857ad95a4_checkins ADD COLUMN destination_id UUID;
        
        -- Copy back data that is valid UUID format
        UPDATE app_a857ad95a4_checkins 
        SET destination_id = destination_id_backup::UUID 
        WHERE destination_id_backup ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
        
        -- Drop the backup column
        ALTER TABLE app_a857ad95a4_checkins DROP COLUMN destination_id_backup;
        
        RAISE NOTICE 'Converted destination_id column from TEXT to UUID';
    ELSE
        RAISE NOTICE 'destination_id column is already UUID type';
    END IF;
    
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Error converting destination_id: %', SQLERRM;
END $$;

-- ================================
-- 3. ADD FOREIGN KEY CONSTRAINT IF MISSING
-- ================================

DO $$
BEGIN
    -- Check if the foreign key constraint already exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'app_a857ad95a4_checkins_destination_id_fkey'
        AND table_name = 'app_a857ad95a4_checkins'
    ) THEN
        -- Add foreign key constraint
        ALTER TABLE app_a857ad95a4_checkins
        ADD CONSTRAINT app_a857ad95a4_checkins_destination_id_fkey
        FOREIGN KEY (destination_id) REFERENCES app_a857ad95a4_destinations(id);
        
        RAISE NOTICE 'Added foreign key constraint for destination_id column';
    ELSE
        RAISE NOTICE 'Foreign key constraint already exists for destination_id column';
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Error adding foreign key constraint: %', SQLERRM;
END $$;

-- ================================
-- 4. RE-ENABLE RLS WITH PROPER POLICIES
-- ================================

ALTER TABLE app_a857ad95a4_checkins ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies
DROP POLICY IF EXISTS checkins_select_own ON app_a857ad95a4_checkins;
DROP POLICY IF EXISTS checkins_insert_own ON app_a857ad95a4_checkins;
DROP POLICY IF EXISTS checkins_update_own ON app_a857ad95a4_checkins;
DROP POLICY IF EXISTS checkins_delete_own ON app_a857ad95a4_checkins;

-- Create proper RLS policies for checkins
CREATE POLICY checkins_select_own ON app_a857ad95a4_checkins
FOR SELECT USING (user_id = auth.uid() OR tourist_id = auth.uid()::text);

CREATE POLICY checkins_insert_own ON app_a857ad95a4_checkins
FOR INSERT WITH CHECK (user_id = auth.uid() OR tourist_id = auth.uid()::text);

CREATE POLICY checkins_update_own ON app_a857ad95a4_checkins
FOR UPDATE USING (user_id = auth.uid() OR tourist_id = auth.uid()::text);

CREATE POLICY checkins_delete_own ON app_a857ad95a4_checkins
FOR DELETE USING (user_id = auth.uid() OR tourist_id = auth.uid()::text);

-- ================================
-- 5. VERIFICATION
-- ================================

-- Show checkins table structure to verify the changes
SELECT 
    table_name,
    column_name, 
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'app_a857ad95a4_checkins' AND column_name = 'destination_id';

-- Final success message
SELECT 'The destination_id column in app_a857ad95a4_checkins is now UUID type with proper constraints.' as status;