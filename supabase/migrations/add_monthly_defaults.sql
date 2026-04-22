-- Migration: Monthly default opening hours + auto_default flag on daily_schedule
-- Führe das im Supabase Dashboard > SQL Editor aus.

-- 1. monthly_defaults Tabelle
CREATE TABLE IF NOT EXISTS monthly_defaults (
  month INT PRIMARY KEY CHECK (month BETWEEN 1 AND 12),
  open_time TIME NOT NULL,
  close_time TIME NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Seed mit Saison-Defaults
INSERT INTO monthly_defaults (month, open_time, close_time) VALUES
  (1,  '12:00', '17:00'),
  (2,  '12:00', '17:00'),
  (3,  '12:00', '17:00'),
  (4,  '12:00', '18:00'),
  (5,  '12:00', '19:00'),
  (6,  '10:30', '20:00'),
  (7,  '09:30', '21:00'),
  (8,  '09:30', '21:00'),
  (9,  '10:30', '20:00'),
  (10, '12:00', '18:00'),
  (11, '12:00', '17:00'),
  (12, '12:00', '17:00')
ON CONFLICT (month) DO NOTHING;

-- 3. RLS: anon darf lesen (für index.html), authenticated darf alles
ALTER TABLE monthly_defaults ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "monthly_defaults_anon_select" ON monthly_defaults;
CREATE POLICY "monthly_defaults_anon_select"
  ON monthly_defaults FOR SELECT TO anon
  USING (true);

DROP POLICY IF EXISTS "monthly_defaults_auth_all" ON monthly_defaults;
CREATE POLICY "monthly_defaults_auth_all"
  ON monthly_defaults FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- 4. daily_schedule: auto_default Spalte
-- true = Eintrag wurde vom Monats-Default erzeugt und darf vom Rollout überschrieben werden
-- false = manuell im Admin gesetzt, bleibt unverändert
ALTER TABLE daily_schedule
  ADD COLUMN IF NOT EXISTS auto_default BOOLEAN DEFAULT false;
