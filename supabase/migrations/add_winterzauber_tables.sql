-- Winterzauber am Steg 1 — Käsefondue-Vormerksystem
-- Führe dieses Skript im Supabase Dashboard > SQL Editor aus.

-- 1. Feature-Flag (Single-Row-Pattern, analog job_settings)
CREATE TABLE IF NOT EXISTS winterzauber_settings (
  id INT PRIMARY KEY DEFAULT 1,
  active BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT winterzauber_settings_single_row CHECK (id = 1)
);
INSERT INTO winterzauber_settings (id, active) VALUES (1, false)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE winterzauber_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "winterzauber_settings_anon_select" ON winterzauber_settings;
CREATE POLICY "winterzauber_settings_anon_select"
  ON winterzauber_settings FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "winterzauber_settings_auth_all" ON winterzauber_settings;
CREATE POLICY "winterzauber_settings_auth_all"
  ON winterzauber_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2. Termine
CREATE TABLE IF NOT EXISTS fondue_termine (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  capacity_min INT NOT NULL DEFAULT 10,
  capacity_max INT NOT NULL DEFAULT 28,
  status TEXT NOT NULL DEFAULT 'offen'
    CHECK (status IN ('offen', 'schwelle_erreicht', 'bestaetigt', 'ausgebucht', 'abgesagt')),
  note TEXT,
  -- Denormalisierter Anmeldungszähler für die öffentliche "X / Mindestteilnehmerzahl"-Anzeige
  -- (fondue_termine hat eine anon-SELECT-Policy, fondue_anmeldungen nicht — daher hier
  -- gepflegt statt live aus fondue_anmeldungen aggregiert, siehe Finding 7).
  personen_gesamt INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
-- Falls die Tabelle bereits existiert (Migration wird erneut ausgeführt): Spalte nachrüsten.
ALTER TABLE fondue_termine ADD COLUMN IF NOT EXISTS personen_gesamt INT NOT NULL DEFAULT 0;

ALTER TABLE fondue_termine ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fondue_termine_anon_select" ON fondue_termine;
CREATE POLICY "fondue_termine_anon_select"
  ON fondue_termine FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "fondue_termine_auth_all" ON fondue_termine;
CREATE POLICY "fondue_termine_auth_all"
  ON fondue_termine FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. Varianten (analog menu_items, voll editierbar)
CREATE TABLE IF NOT EXISTS fondue_varianten (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  price_per_person NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0
);

ALTER TABLE fondue_varianten ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fondue_varianten_anon_select" ON fondue_varianten;
CREATE POLICY "fondue_varianten_anon_select"
  ON fondue_varianten FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "fondue_varianten_auth_all" ON fondue_varianten;
CREATE POLICY "fondue_varianten_auth_all"
  ON fondue_varianten FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Seed: die drei Varianten aus dem Konzept, Preise auf 0 (Mama trägt sie im Admin nach)
INSERT INTO fondue_varianten (name, description, price_per_person, is_active, sort_order) VALUES
  ('Klassisches Schweizer Käsefondue', 'Mit gewürfeltem Baguette und Bauern-/Roggenbrot', 0, true, 1),
  ('Alkoholfreies Käsefondue', 'Für Schwangere, Kinder oder Gäste ohne Alkohol', 0, true, 2),
  ('Veganes Käsefondue', 'Auf Anfrage — noch in Prüfung', 0, false, 3)
ON CONFLICT DO NOTHING;

-- 4. Beilagen (analog menu_items, voll editierbar)
CREATE TABLE IF NOT EXISTS fondue_beilagen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0
);

ALTER TABLE fondue_beilagen ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fondue_beilagen_anon_select" ON fondue_beilagen;
CREATE POLICY "fondue_beilagen_anon_select"
  ON fondue_beilagen FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "fondue_beilagen_auth_all" ON fondue_beilagen;
CREATE POLICY "fondue_beilagen_auth_all"
  ON fondue_beilagen FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO fondue_beilagen (name, price, is_active, sort_order) VALUES
  ('Kleine Pellkartoffeln', 0, true, 1),
  ('Charcuterie (Salami & Schinken)', 0, true, 2),
  ('Perlzwiebeln', 0, true, 3),
  ('Gewürzgurken', 0, true, 4),
  ('Ananas', 0, true, 5),
  ('Weintrauben', 0, true, 6),
  ('Zwiebel-Crumble', 0, true, 7),
  ('Speck-Crumble', 0, true, 8),
  ('Röstzwiebel-Crumble', 0, true, 9)
ON CONFLICT DO NOTHING;

-- 5. Anmeldungen
CREATE TABLE IF NOT EXISTS fondue_anmeldungen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  termin_id UUID NOT NULL REFERENCES fondue_termine(id),
  manage_token UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  anmeldung_id TEXT UNIQUE,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  personen_anzahl INT NOT NULL,
  varianten_auswahl JSONB NOT NULL DEFAULT '{}'::jsonb,
  beilagen_auswahl JSONB NOT NULL DEFAULT '{}'::jsonb,
  allergien_hinweis TEXT,
  agb_akzeptiert BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'vorgemerkt'
    CHECK (status IN ('vorgemerkt', 'bestaetigt', 'storniert', 'abgesagt')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- anmeldung_id Trigger: Format WZ-YYYY-MM-NNNN, Zähler pro Monat (Anmeldedatum, nicht Termin)
CREATE OR REPLACE FUNCTION generate_fondue_anmeldung_id()
RETURNS TRIGGER AS $$
DECLARE
  prefix text;
  next_num integer;
BEGIN
  prefix := 'WZ-' || to_char(now(), 'YYYY-MM');
  SELECT COALESCE(MAX(
    CAST(split_part(anmeldung_id, '-', 4) AS integer)
  ), 0) + 1 INTO next_num
  FROM fondue_anmeldungen
  WHERE anmeldung_id LIKE prefix || '-%';
  NEW.anmeldung_id := prefix || '-' || lpad(next_num::text, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_fondue_anmeldung_id ON fondue_anmeldungen;
CREATE TRIGGER set_fondue_anmeldung_id
  BEFORE INSERT ON fondue_anmeldungen
  FOR EACH ROW EXECUTE FUNCTION generate_fondue_anmeldung_id();

-- Termin-Status-Trigger: nach jedem Insert/Update/Delete einer Anmeldung neu berechnen.
-- offen/schwelle_erreicht/ausgebucht werden automatisch gesetzt; bestaetigt/abgesagt
-- werden NUR von Mama im Admin gesetzt und hier bewusst nicht überschrieben.
CREATE OR REPLACE FUNCTION recompute_fondue_termin_status()
RETURNS TRIGGER AS $$
DECLARE
  t_id uuid;
  total_personen integer;
  t_min integer;
  t_max integer;
  t_status text;
BEGIN
  t_id := COALESCE(NEW.termin_id, OLD.termin_id);

  SELECT COALESCE(SUM(personen_anzahl), 0) INTO total_personen
  FROM fondue_anmeldungen
  WHERE termin_id = t_id AND status IN ('vorgemerkt', 'bestaetigt');

  SELECT capacity_min, capacity_max, status INTO t_min, t_max, t_status
  FROM fondue_termine WHERE id = t_id;

  -- Gästezähler für die öffentliche Anzeige immer aktuell halten — unabhängig vom
  -- Status-Guard unten, damit auch bei bestätigten/abgesagten Terminen die Anzahl stimmt.
  UPDATE fondue_termine SET personen_gesamt = total_personen WHERE id = t_id;

  -- bestaetigt/abgesagt sind manuelle Endzustände, nicht automatisch überschreiben
  IF t_status NOT IN ('bestaetigt', 'abgesagt') THEN
    IF total_personen >= t_max THEN
      UPDATE fondue_termine SET status = 'ausgebucht' WHERE id = t_id;
    ELSIF total_personen >= t_min THEN
      UPDATE fondue_termine SET status = 'schwelle_erreicht' WHERE id = t_id;
    ELSE
      UPDATE fondue_termine SET status = 'offen' WHERE id = t_id;
    END IF;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_recompute_fondue_termin_status ON fondue_anmeldungen;
CREATE TRIGGER trg_recompute_fondue_termin_status
  AFTER INSERT OR UPDATE OF status, personen_anzahl OR DELETE ON fondue_anmeldungen
  FOR EACH ROW EXECUTE FUNCTION recompute_fondue_termin_status();

-- RLS: anon hat KEINEN Zugriff — alles läuft über Edge Functions mit Service-Role,
-- exakt wie bei `bookings`. Authenticated-Zugriff ist zusätzlich auf Accounts ohne
-- eingeschränkte Rolle beschränkt: fondue_anmeldungen enthält Gesundheitsdaten
-- (Allergien) — 'sup'- und 'schedule_events'-Accounts (siehe admin.html applyRole())
-- dürfen diese Tabelle nicht direkt lesen/schreiben, nur die volladministrative Rolle.
-- HINWEIS: Diese Migration wurde bislang nicht live angewendet — die JWT-Claim-Syntax
-- unten (auth.jwt() -> 'user_metadata' ->> 'role') basiert auf Supabases dokumentierter
-- JWT-Struktur, ist aber noch nicht gegen eine echte Supabase-JWT getestet. Vor Merge/Go-Live
-- unbedingt mit einem echten 'sup'- oder 'schedule_events'-Test-Login gegen
-- GET /rest/v1/fondue_anmeldungen verifizieren.
ALTER TABLE fondue_anmeldungen ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fondue_anmeldungen_auth_all" ON fondue_anmeldungen;
CREATE POLICY "fondue_anmeldungen_auth_all"
  ON fondue_anmeldungen FOR ALL TO authenticated
  USING (COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', '') NOT IN ('sup', 'schedule_events'))
  WITH CHECK (COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', '') NOT IN ('sup', 'schedule_events'));

-- 6. Termin-Status + personen_gesamt auch bei nachträglicher Änderung von
-- capacity_min / capacity_max neu berechnen. Der Trigger auf fondue_anmeldungen
-- feuert nur bei Anmeldungs-Änderungen; wird die Mindest-/Max-Zahl im Admin
-- editiert, muss der Status ebenfalls nachziehen (z.B. Mindestzahl gesenkt →
-- Termin springt auf 'schwelle_erreicht'). BEFORE-Trigger: ändert NEW direkt,
-- kein zusätzliches UPDATE, keine Rekursion.
CREATE OR REPLACE FUNCTION recompute_fondue_termin_status_on_capacity()
RETURNS TRIGGER AS $$
DECLARE
  total_personen integer;
BEGIN
  SELECT COALESCE(SUM(personen_anzahl), 0) INTO total_personen
  FROM fondue_anmeldungen
  WHERE termin_id = NEW.id AND status IN ('vorgemerkt', 'bestaetigt');

  NEW.personen_gesamt := total_personen;

  IF NEW.status NOT IN ('bestaetigt', 'abgesagt') THEN
    IF total_personen >= NEW.capacity_max THEN
      NEW.status := 'ausgebucht';
    ELSIF total_personen >= NEW.capacity_min THEN
      NEW.status := 'schwelle_erreicht';
    ELSE
      NEW.status := 'offen';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_recompute_fondue_termin_on_capacity ON fondue_termine;
CREATE TRIGGER trg_recompute_fondue_termin_on_capacity
  BEFORE UPDATE OF capacity_min, capacity_max ON fondue_termine
  FOR EACH ROW EXECUTE FUNCTION recompute_fondue_termin_status_on_capacity();
