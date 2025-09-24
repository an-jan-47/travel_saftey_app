-- First, let's check what columns actually exist in the checkins table
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'app_a857ad95a4_checkins' 
ORDER BY ordinal_position;

-- Also check the destinations table
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'app_a857ad95a4_destinations' 
ORDER BY ordinal_position;

-- And check the emergency contacts table
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'app_a857ad95a4_emergency_contacts' 
ORDER BY ordinal_position;