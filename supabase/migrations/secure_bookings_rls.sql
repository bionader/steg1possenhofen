-- Migration: bookings RLS härten
-- Vorher: anon konnte ALLE bookings lesen + ALLE updaten (Policies USING(true)).
-- Nachher:
--   * anon hat KEINEN direkten SELECT/UPDATE auf bookings mehr.
--   * Buchungs-Detail/Cancel/Edit laufen über Edge Function `manage-booking`
--     (mit Service-Role + manage_token-Validierung).
--   * Slot-Verfügbarkeit (Public-Read) läuft über View `bookings_public`,
--     die nur die nicht-personenbezogenen Spalten exportiert.
--   * INSERT-Policy für anon bleibt unverändert (sup.html legt Buchungen direkt an).
--     Diese wird in einer späteren Migration weiter eingeengt (Punkt #8 im Review).

-- Run im Supabase Dashboard > SQL Editor.

-- =============================================================================
-- 1. Offene anon-Policies entfernen
-- =============================================================================
DROP POLICY IF EXISTS "anon_select_by_manage_token" ON bookings;
DROP POLICY IF EXISTS "anon_update_by_manage_token" ON bookings;

-- =============================================================================
-- 2. Public-View für Slot-Verfügbarkeit (keine PII)
-- =============================================================================
-- security_invoker=false → View läuft mit Rechten des Owners (postgres),
-- daher muss anon KEINE SELECT-Policy auf bookings haben.
DROP VIEW IF EXISTS bookings_public;
CREATE VIEW bookings_public
WITH (security_invoker = false)
AS
  SELECT
    id,
    date,
    start_time,
    end_time,
    board_count,
    status
  FROM bookings
  WHERE status = 'confirmed';

GRANT SELECT ON bookings_public TO anon;
GRANT SELECT ON bookings_public TO authenticated;

-- =============================================================================
-- 3. Sanity-Check (manuell im SQL Editor ausführen, als anon-Role)
-- =============================================================================
--   SELECT * FROM bookings;            -- als anon → 0 rows / permission denied
--   SELECT * FROM bookings_public;     -- als anon → nur confirmed, keine PII
--   INSERT INTO bookings (...) ...     -- als anon → erlaubt (bestehende Policy)
