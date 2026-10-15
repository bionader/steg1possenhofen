-- Winterzauber: bestehende Termine von 28 auf 36 Plaetze (3 Iglus x 12) anheben.
-- set_fondue_capacity_default_36.sql hatte nur den DEFAULT fuer neue Termine geaendert.
-- Nur Termine mit 28 werden angepasst, manuell gesetzte andere Werte bleiben erhalten. Idempotent.
ALTER TABLE fondue_termine ALTER COLUMN capacity_max SET DEFAULT 36;
UPDATE fondue_termine SET capacity_max = 36 WHERE capacity_max = 28;
