-- Migration: bookings-INSERT für anon zumachen
-- Vorher: anon konnte direkt POST /rest/v1/bookings — Spam-Inserts möglich,
-- Preis vom Client manipulierbar (z.B. total_price = 0).
-- Nachher: Insert läuft ausschließlich über Edge Function `create-booking`,
-- die mit Service-Role insertet (RLS umgangen). create-booking verifiziert
-- hCaptcha, validiert Input, prüft Slot-Verfügbarkeit und berechnet den
-- Preis serverseitig aus sup_settings.price_per_hour.
--
-- Zusammen mit der vorherigen Migration `secure_bookings_rls.sql`:
--   * anon kann bookings NICHT mehr lesen (Manage-Flow läuft über `manage-booking`)
--   * anon kann bookings NICHT mehr schreiben (Neu-Buchung läuft über `create-booking`)
--   * anon kann bookings NICHT mehr ändern (Cancel/Edit läuft über `manage-booking`)
-- Slot-Verfügbarkeit ohne PII bleibt über die View `bookings_public` lesbar.

-- Run im Supabase Dashboard > SQL Editor.

-- =============================================================================
-- 1. Bestehende anon-INSERT-Policies auf bookings entfernen
-- =============================================================================
-- Wir kennen den genauen Namen der bestehenden Policy nicht aus den Migrations
-- (die initiale Policy wurde direkt im Dashboard erstellt). Daher droppen wir
-- alle INSERT-Policies, die anon erlauben — anhand der pg_policies-Tabelle.
DO $$
DECLARE
  pol_name text;
BEGIN
  FOR pol_name IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'bookings'
      AND cmd = 'INSERT'
      AND 'anon' = ANY(roles)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON bookings', pol_name);
    RAISE NOTICE 'Dropped INSERT policy on bookings: %', pol_name;
  END LOOP;
END $$;

-- =============================================================================
-- 2. Sanity-Check (manuell im SQL Editor als anon-Role ausführen)
-- =============================================================================
--   INSERT INTO bookings (date, start_time, end_time, board_count,
--     customer_name, customer_email, customer_phone, total_price, booking_type)
--   VALUES ('2026-12-31', '14:00:00', '15:00:00', 1,
--     'Test', 'test@example.com', '0', 15, 'rental');
--   -- als anon → "new row violates row-level security policy"
--
-- Echte Inserts laufen jetzt nur noch über die Edge Function:
--   POST /functions/v1/create-booking
