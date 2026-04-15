-- Migration: Add manage_token + booking_id to bookings table
-- Run this in Supabase Dashboard > SQL Editor

-- 1. Add manage_token column (secure URL access token)
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS manage_token uuid DEFAULT gen_random_uuid() UNIQUE NOT NULL;

-- 2. Add booking_id column (human-readable ID, initially nullable for ALTER)
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS booking_id text UNIQUE;

-- 3. Create trigger function for auto-generating booking_id (format: YYYY-MM-NNNN)
CREATE OR REPLACE FUNCTION generate_booking_id()
RETURNS TRIGGER AS $$
DECLARE
  prefix text;
  next_num integer;
BEGIN
  prefix := to_char(NEW.date, 'YYYY-MM');
  SELECT COALESCE(MAX(
    CAST(split_part(booking_id, '-', 3) AS integer)
  ), 0) + 1 INTO next_num
  FROM bookings
  WHERE booking_id LIKE prefix || '-%';
  NEW.booking_id := prefix || '-' || lpad(next_num::text, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Create trigger
DROP TRIGGER IF EXISTS set_booking_id ON bookings;
CREATE TRIGGER set_booking_id
  BEFORE INSERT ON bookings
  FOR EACH ROW EXECUTE FUNCTION generate_booking_id();

-- 5. Backfill existing bookings that have no booking_id
DO $$
DECLARE
  rec RECORD;
  prefix text;
  next_num integer;
BEGIN
  FOR rec IN SELECT id, date FROM bookings WHERE booking_id IS NULL ORDER BY created_at, id LOOP
    prefix := to_char(rec.date, 'YYYY-MM');
    SELECT COALESCE(MAX(
      CAST(split_part(booking_id, '-', 3) AS integer)
    ), 0) + 1 INTO next_num
    FROM bookings
    WHERE booking_id LIKE prefix || '-%';
    UPDATE bookings SET booking_id = prefix || '-' || lpad(next_num::text, 4, '0') WHERE id = rec.id;
  END LOOP;
END $$;

-- 6. Now make booking_id NOT NULL
ALTER TABLE bookings ALTER COLUMN booking_id SET NOT NULL;

-- 7. RLS policies for anonymous token-based access
-- Allow anon to read bookings (filtered by manage_token in query)
CREATE POLICY "anon_select_by_manage_token"
  ON bookings FOR SELECT TO anon
  USING (true);

-- Allow anon to update bookings (for cancel/edit via manage_token)
CREATE POLICY "anon_update_by_manage_token"
  ON bookings FOR UPDATE TO anon
  USING (true)
  WITH CHECK (true);
