-- Winterzauber: zwei Zeitslots pro Termin-Datum (17:15–19:15, 19:30–21:30).
-- Ein Slot = eine Zeile in fondue_termine. Additiv + idempotent, alte Seite läuft weiter.
ALTER TABLE fondue_termine ADD COLUMN IF NOT EXISTS start_time TIME NOT NULL DEFAULT '17:15';
ALTER TABLE fondue_termine ADD COLUMN IF NOT EXISTS end_time   TIME NOT NULL DEFAULT '19:15';

-- Pro Datum jede Startzeit nur einmal
CREATE UNIQUE INDEX IF NOT EXISTS fondue_termine_date_start_uniq
  ON fondue_termine(date, start_time);

-- Bestehende Termine (= Slot 1) um Slot 2 ergänzen (gleiche Kapazität, Aktiv-Status, Notiz)
INSERT INTO fondue_termine (date, start_time, end_time, capacity_min, capacity_max, is_active, note)
SELECT date, '19:30', '21:30', capacity_min, capacity_max, is_active, note
FROM fondue_termine
-- Nur künftige, nicht abgesagte Termine: sonst entstünde für abgesagte oder
-- vergangene Daten ein buchbarer Slot 2.
WHERE start_time = '17:15' AND status <> 'abgesagt' AND date >= current_date
ON CONFLICT (date, start_time) DO NOTHING;
