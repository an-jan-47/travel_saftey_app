-- FIX destination_id COLUMN TYPE (TEXT to UUID)
-- This script changes the destination_id column type from TEXT to UUID

-- ================================
-- 1. DISABLE ROW LEVEL SECURITY TEMPORARILY
-- ================================
ALTER TABLE app_a857ad95a4_checkins DISABLE ROW LEVEL SECURITY;

-- ================================
-- 2. CHANGE COLUMN TYPE FROM TEXT TO UUID
-- ================================
DO $$
BEGIN
    -- Change destination_id column from TEXT to UUID
    ALTER TABLE app_a857ad95a4_checkins 
    ALTER COLUMN destination_id TYPE UUID USING destination_id::uuid;
    
    RAISE NOTICE 'Changed destination_id column from TEXT to UUID';
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error changing column type: %', SQLERRM;
END $$;

-- ================================
-- 3. RE-ENABLE ROW LEVEL SECURITY
-- ================================
ALTER TABLE app_a857ad95a4_checkins ENABLE ROW LEVEL SECURITY;

-- ================================
-- 4. VERIFY THE CHANGE
-- ================================
SELECT 
    table_name,
    column_name, 
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'app_a857ad95a4_checkins' AND column_name = 'destination_id';