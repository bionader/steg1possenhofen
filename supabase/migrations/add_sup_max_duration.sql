-- Migration: max_duration Spalte zu sup_settings
-- Zweck: maximale Buchungsdauer pro SUP-Buchung erzwingen (default 180 min = 3h).
-- Kombiniert mit Late-Booking-Cutoff (letzte Startzeit = slot_end - 60 min)
-- in der create-booking Edge Function + sup.html Frontend.
--
-- Cathrin kann den Wert über das Admin-Panel anpassen.
--
-- Run im Supabase Dashboard > SQL Editor.

ALTER TABLE sup_settings
  ADD COLUMN IF NOT EXISTS max_duration integer NOT NULL DEFAULT 180;

-- Sanity-Check: aktuellen Wert anzeigen
SELECT id, min_duration, max_duration, duration_step, slot_start, slot_end
FROM sup_settings;
