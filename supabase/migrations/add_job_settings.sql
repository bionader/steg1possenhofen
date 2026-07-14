-- Migration: Job-Anzeige (Pop-up + Nav-Tab "Jobs") — Admin-steuerbarer Ein/Aus-Schalter + Motiv-Auswahl.
-- Analog zu sup_settings (Single-Row-Pattern). Führe das im Supabase Dashboard > SQL Editor
-- aus, oder via `supabase db execute --file supabase/migrations/add_job_settings.sql`.

CREATE TABLE IF NOT EXISTS job_settings (
  id INT PRIMARY KEY DEFAULT 1,
  active BOOLEAN NOT NULL DEFAULT true,
  motif TEXT NOT NULL DEFAULT 'service' CHECK (motif IN ('sup', 'service')),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT job_settings_single_row CHECK (id = 1)
);

INSERT INTO job_settings (id, active, motif) VALUES (1, true, 'service')
ON CONFLICT (id) DO NOTHING;

-- RLS: anon liest (Pop-up/Nav auf allen öffentlichen Seiten), authenticated darf alles (Admin)
ALTER TABLE job_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "job_settings_anon_select" ON job_settings;
CREATE POLICY "job_settings_anon_select"
  ON job_settings FOR SELECT TO anon
  USING (true);

DROP POLICY IF EXISTS "job_settings_auth_all" ON job_settings;
CREATE POLICY "job_settings_auth_all"
  ON job_settings FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
