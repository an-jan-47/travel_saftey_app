-- ITINERARY SYSTEM DATABASE OPTIMIZATIONS
-- This file contains SQL optimizations for proper CRUD operations

-- ================================
-- 1. ENSURE PROPER CASCADE DELETES
-- ================================

-- Drop existing foreign key constraints and recreate with CASCADE
-- Note: You may need to check actual constraint names in your database

-- For destinations table
ALTER TABLE app_a857ad95a4_destinations
DROP CONSTRAINT IF EXISTS destinations_itinerary_id_fkey;

ALTER TABLE app_a857ad95a4_destinations
ADD CONSTRAINT destinations_itinerary_id_fkey
FOREIGN KEY (itinerary_id) REFERENCES app_a857ad95a4_itineraries(id)
ON DELETE CASCADE ON UPDATE CASCADE;

-- For checkins table  
ALTER TABLE app_a857ad95a4_checkins
DROP CONSTRAINT IF EXISTS checkins_itinerary_id_fkey;

ALTER TABLE app_a857ad95a4_checkins
ADD CONSTRAINT checkins_itinerary_id_fkey
FOREIGN KEY (itinerary_id) REFERENCES app_a857ad95a4_itineraries(id)
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE app_a857ad95a4_checkins
DROP CONSTRAINT IF EXISTS checkins_destination_id_fkey;

ALTER TABLE app_a857ad95a4_checkins
ADD CONSTRAINT checkins_destination_id_fkey
FOREIGN KEY (destination_id) REFERENCES app_a857ad95a4_destinations(id)
ON DELETE CASCADE ON UPDATE CASCADE;

-- ================================
-- 2. ADD HELPFUL INDEXES
-- ================================

-- Index for faster itinerary lookups by tourist_id
CREATE INDEX IF NOT EXISTS idx_itineraries_tourist_id 
ON app_a857ad95a4_itineraries(tourist_id);

-- Index for faster itinerary lookups by user_id (for RLS compatibility)
CREATE INDEX IF NOT EXISTS idx_itineraries_user_id 
ON app_a857ad95a4_itineraries(user_id);

-- Index for faster destination lookups by itinerary_id
CREATE INDEX IF NOT EXISTS idx_destinations_itinerary_id 
ON app_a857ad95a4_destinations(itinerary_id);

-- Index for faster destination lookups by order_index (for sorting)
CREATE INDEX IF NOT EXISTS idx_destinations_order_index 
ON app_a857ad95a4_destinations(order_index);

-- Index for faster checkin lookups by destination_id
CREATE INDEX IF NOT EXISTS idx_checkins_destination_id 
ON app_a857ad95a4_checkins(destination_id);

-- Index for faster checkin lookups by itinerary_id
CREATE INDEX IF NOT EXISTS idx_checkins_itinerary_id 
ON app_a857ad95a4_checkins(itinerary_id);

-- Index for faster emergency contact lookups
CREATE INDEX IF NOT EXISTS idx_emergency_contacts_tourist_id 
ON app_a857ad95a4_emergency_contacts(tourist_id);

-- ================================
-- 3. UPDATE RLS POLICIES FOR EDIT/DELETE
-- ================================

-- Ensure RLS policies allow updates and deletes for the owner

-- Itineraries table policies
DROP POLICY IF EXISTS "Users can update their own itineraries" ON app_a857ad95a4_itineraries;
CREATE POLICY "Users can update their own itineraries"
ON app_a857ad95a4_itineraries
FOR UPDATE
TO authenticated
USING (
  tourist_id = (SELECT value FROM app_a857ad95a4_profiles WHERE id = auth.uid())::text
  OR user_id = (SELECT value FROM app_a857ad95a4_profiles WHERE id = auth.uid())::text
);

DROP POLICY IF EXISTS "Users can delete their own itineraries" ON app_a857ad95a4_itineraries;
CREATE POLICY "Users can delete their own itineraries"
ON app_a857ad95a4_itineraries
FOR DELETE
TO authenticated
USING (
  tourist_id = (SELECT value FROM app_a857ad95a4_profiles WHERE id = auth.uid())::text
  OR user_id = (SELECT value FROM app_a857ad95a4_profiles WHERE id = auth.uid())::text
);

-- Destinations table policies
DROP POLICY IF EXISTS "Users can update destinations in their itineraries" ON app_a857ad95a4_destinations;
CREATE POLICY "Users can update destinations in their itineraries"
ON app_a857ad95a4_destinations
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM app_a857ad95a4_itineraries 
    WHERE id = itinerary_id 
    AND (
      tourist_id = (SELECT value FROM app_a857ad95a4_profiles WHERE id = auth.uid())::text
      OR user_id = (SELECT value FROM app_a857ad95a4_profiles WHERE id = auth.uid())::text
    )
  )
);

DROP POLICY IF EXISTS "Users can delete destinations in their itineraries" ON app_a857ad95a4_destinations;
CREATE POLICY "Users can delete destinations in their itineraries"
ON app_a857ad95a4_destinations
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM app_a857ad95a4_itineraries 
    WHERE id = itinerary_id 
    AND (
      tourist_id = (SELECT value FROM app_a857ad95a4_profiles WHERE id = auth.uid())::text
      OR user_id = (SELECT value FROM app_a857ad95a4_profiles WHERE id = auth.uid())::text
    )
  )
);

-- Checkins table policies (usually handled by cascade, but good to have)
DROP POLICY IF EXISTS "Users can update checkins in their itineraries" ON app_a857ad95a4_checkins;
CREATE POLICY "Users can update checkins in their itineraries"
ON app_a857ad95a4_checkins
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM app_a857ad95a4_itineraries 
    WHERE id = itinerary_id 
    AND (
      tourist_id = (SELECT value FROM app_a857ad95a4_profiles WHERE id = auth.uid())::text
      OR user_id = (SELECT value FROM app_a857ad95a4_profiles WHERE id = auth.uid())::text
    )
  )
);

DROP POLICY IF EXISTS "Users can delete checkins in their itineraries" ON app_a857ad95a4_checkins;
CREATE POLICY "Users can delete checkins in their itineraries"
ON app_a857ad95a4_checkins
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM app_a857ad95a4_itineraries 
    WHERE id = itinerary_id 
    AND (
      tourist_id = (SELECT value FROM app_a857ad95a4_profiles WHERE id = auth.uid())::text
      OR user_id = (SELECT value FROM app_a857ad95a4_profiles WHERE id = auth.uid())::text
    )
  )
);

-- ================================
-- 4. ADD HELPFUL TRIGGERS
-- ================================

-- Trigger to automatically set order_index for new destinations
CREATE OR REPLACE FUNCTION set_destination_order()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.order_index IS NULL THEN
    SELECT COALESCE(MAX(order_index), 0) + 1 
    INTO NEW.order_index
    FROM app_a857ad95a4_destinations 
    WHERE itinerary_id = NEW.itinerary_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_destination_order ON app_a857ad95a4_destinations;
CREATE TRIGGER trigger_set_destination_order
  BEFORE INSERT ON app_a857ad95a4_destinations
  FOR EACH ROW
  EXECUTE FUNCTION set_destination_order();

-- Trigger to update itinerary modified timestamp when destinations change
CREATE OR REPLACE FUNCTION update_itinerary_modified()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE app_a857ad95a4_itineraries 
  SET updated_at = NOW()
  WHERE id = COALESCE(NEW.itinerary_id, OLD.itinerary_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_itinerary_modified ON app_a857ad95a4_destinations;
CREATE TRIGGER trigger_update_itinerary_modified
  AFTER INSERT OR UPDATE OR DELETE ON app_a857ad95a4_destinations
  FOR EACH ROW
  EXECUTE FUNCTION update_itinerary_modified();

-- ================================
-- 5. DATA VALIDATION CONSTRAINTS
-- ================================

-- Ensure end_date is after start_date for itineraries
ALTER TABLE app_a857ad95a4_itineraries
DROP CONSTRAINT IF EXISTS check_date_order;

ALTER TABLE app_a857ad95a4_itineraries
ADD CONSTRAINT check_date_order
CHECK (end_date >= start_date);

-- Ensure positive auto_checkin_interval
ALTER TABLE app_a857ad95a4_destinations
DROP CONSTRAINT IF EXISTS check_positive_interval;

ALTER TABLE app_a857ad95a4_destinations
ADD CONSTRAINT check_positive_interval
CHECK (auto_checkin_interval > 0);

-- Ensure valid status values
ALTER TABLE app_a857ad95a4_itineraries
DROP CONSTRAINT IF EXISTS check_valid_status;

ALTER TABLE app_a857ad95a4_itineraries
ADD CONSTRAINT check_valid_status
CHECK (status IN ('active', 'completed', 'cancelled', 'draft'));

ALTER TABLE app_a857ad95a4_destinations
DROP CONSTRAINT IF EXISTS check_valid_destination_status;

ALTER TABLE app_a857ad95a4_destinations
ADD CONSTRAINT check_valid_destination_status
CHECK (status IN ('upcoming', 'active', 'completed', 'missed', 'cancelled'));

-- ================================
-- 6. OPTIMIZE QUERIES WITH MATERIALIZED VIEW (OPTIONAL)
-- ================================

-- Create a materialized view for itinerary summaries (refresh as needed)
DROP MATERIALIZED VIEW IF EXISTS itinerary_summary;

CREATE MATERIALIZED VIEW itinerary_summary AS
SELECT 
  i.id,
  i.tourist_id,
  i.user_id,
  i.title,
  i.start_date,
  i.end_date,
  i.status,
  i.created_at,
  i.updated_at,
  COUNT(d.id) as destination_count,
  COUNT(c.id) as checkin_count,
  MIN(d.planned_arrival) as first_destination_date,
  MAX(d.planned_arrival) as last_destination_date
FROM app_a857ad95a4_itineraries i
LEFT JOIN app_a857ad95a4_destinations d ON i.id = d.itinerary_id
LEFT JOIN app_a857ad95a4_checkins c ON i.id = c.itinerary_id
GROUP BY i.id, i.tourist_id, i.user_id, i.title, i.start_date, i.end_date, i.status, i.created_at, i.updated_at;

-- Create index on materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_itinerary_summary_id 
ON itinerary_summary(id);

CREATE INDEX IF NOT EXISTS idx_itinerary_summary_tourist_id 
ON itinerary_summary(tourist_id);

-- Function to refresh materialized view (call when needed)
CREATE OR REPLACE FUNCTION refresh_itinerary_summary()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY itinerary_summary;
END;
$$ LANGUAGE plpgsql;

-- ================================
-- 7. CLEANUP AND MAINTENANCE
-- ================================

-- Function to clean up old completed itineraries (optional)
CREATE OR REPLACE FUNCTION cleanup_old_itineraries(days_old INTEGER DEFAULT 365)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  WITH deleted AS (
    DELETE FROM app_a857ad95a4_itineraries 
    WHERE status = 'completed' 
    AND end_date < NOW() - INTERVAL '1 day' * days_old
    RETURNING id
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ================================
-- INSTRUCTIONS FOR EXECUTION
-- ================================

/*
To apply these optimizations:

1. Run this SQL file in your Supabase SQL editor
2. Monitor the execution for any errors
3. Adjust constraint names if they differ in your database
4. Test the CRUD operations in your application
5. Optionally set up a cron job to refresh the materialized view periodically

Note: Some constraints may fail if your existing data violates them.
Review your data first and clean up any inconsistencies.

Performance recommendations:
- Refresh the materialized view daily or when itineraries are modified
- Run cleanup function monthly to remove old completed itineraries
- Monitor query performance and adjust indexes as needed
*/