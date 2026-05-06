-- Migration: SUP-Öffnungszeiten als Monatsdefault + Tages-Override-Tabelle
-- Analog zu add_monthly_defaults.sql (Restaurant) — gleiche Logik für SUP-Verleih.
-- Führe das im Supabase Dashboard > SQL Editor aus.

-- =============================================================================
-- 1. sup_monthly_defaults: Öffnungszeiten pro Monat
-- =============================================================================
CREATE TABLE IF NOT EXISTS sup_monthly_defaults (
  month INT PRIMARY KEY CHECK (month BETWEEN 1 AND 12),
  open_time TIME NOT NULL,
  close_time TIME NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed: SUP-Saison (Mai–September) mit Standard 10:00–21:00.
-- Außerhalb der Saison bewusst kein Default → Frontend fällt auf sup_settings zurück
-- bzw. zeigt "geschlossen" wenn auch dort nichts gepflegt ist.
INSERT INTO sup_monthly_defaults (month, open_time, close_time) VALUES
  (5, '10:00', '21:00'),
  (6, '10:00', '21:00'),
  (7, '10:00', '21:00'),
  (8, '10:00', '21:00'),
  (9, '10:00', '20:00')
ON CONFLICT (month) DO NOTHING;

-- RLS: anon liest (für sup.html, buchung.html), authenticated darf alles (Admin)
ALTER TABLE sup_monthly_defaults ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sup_monthly_defaults_anon_select" ON sup_monthly_defaults;
CREATE POLICY "sup_monthly_defaults_anon_select"
  ON sup_monthly_defaults FOR SELECT TO anon
  USING (true);

DROP POLICY IF EXISTS "sup_monthly_defaults_auth_all" ON sup_monthly_defaults;
CREATE POLICY "sup_monthly_defaults_auth_all"
  ON sup_monthly_defaults FOR ALL TO authenticated
  USING (true) WITH CHECK (true);


-- =============================================================================
-- 2. sup_daily_schedule: Tages-Override (ersetzt sup_closed_days)
-- =============================================================================
CREATE TABLE IF NOT EXISTS sup_daily_schedule (
  date DATE PRIMARY KEY,
  is_open BOOLEAN NOT NULL DEFAULT true,
  open_time TIME,
  close_time TIME,
  auto_default BOOLEAN DEFAULT false,  -- true = vom Monats-Default ausgerollt, darf überschrieben werden
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sup_daily_schedule_date ON sup_daily_schedule(date);

ALTER TABLE sup_daily_schedule ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sup_daily_schedule_anon_select" ON sup_daily_schedule;
CREATE POLICY "sup_daily_schedule_anon_select"
  ON sup_daily_schedule FOR SELECT TO anon
  USING (true);

DROP POLICY IF EXISTS "sup_daily_schedule_auth_all" ON sup_daily_schedule;
CREATE POLICY "sup_daily_schedule_auth_all"
  ON sup_daily_schedule FOR ALL TO authenticated
  USING (true) WITH CHECK (true);


-- =============================================================================
-- 3. Datenmigration: sup_closed_days → sup_daily_schedule (is_open=false)
-- =============================================================================
-- Idempotent: ON CONFLICT DO NOTHING, mehrfach ausführbar
INSERT INTO sup_daily_schedule (date, is_open, auto_default)
SELECT date, false, false
FROM sup_closed_days
ON CONFLICT (date) DO NOTHING;

-- HINWEIS: sup_closed_days wird vorerst NICHT gedroppt, damit Frontend (sup.html,
-- buchung.html) zwischenzeitlich noch beide Quellen lesen können. Cleanup in
-- Phase 4 nach erfolgreichem Test.
