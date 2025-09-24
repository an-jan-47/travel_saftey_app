-- FIX THE REMAINING UUID COLUMN IN ITINERARIES TABLE
-- The user_id column is still UUID type and needs to be changed to TEXT

DO $$
BEGIN
    -- Check if the itineraries table exists and user_id column is still UUID
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'app_a857ad95a4_itineraries' 
        AND column_name = 'user_id' 
        AND data_type = 'uuid'
    ) THEN
        -- Temporarily disable RLS
        ALTER TABLE app_a857ad95a4_itineraries DISABLE ROW LEVEL SECURITY;
        
        -- Drop any policies that might reference user_id
        DROP POLICY IF EXISTS allow_all_operations ON app_a857ad95a4_itineraries;
        
        -- Change user_id column from UUID to TEXT
        ALTER TABLE app_a857ad95a4_itineraries 
        ALTER COLUMN user_id TYPE TEXT;
        
        -- Re-enable RLS with permissive policy
        ALTER TABLE app_a857ad95a4_itineraries ENABLE ROW LEVEL SECURITY;
        
        CREATE POLICY allow_all_operations ON app_a857ad95a4_itineraries
        FOR ALL
        TO authenticated
        USING (true)
        WITH CHECK (true);
        
        RAISE NOTICE 'Successfully changed user_id column from UUID to TEXT in itineraries table';
    ELSE
        RAISE NOTICE 'user_id column is already TEXT or table does not exist';
    END IF;
END $$;

-- Verify the change
SELECT 
    column_name, 
    data_type 
FROM information_schema.columns 
WHERE table_name = 'app_a857ad95a4_itineraries' 
AND column_name IN ('user_id', 'tourist_id')
ORDER BY column_name;