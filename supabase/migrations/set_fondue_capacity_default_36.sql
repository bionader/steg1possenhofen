-- Winterzauber: Standard-Kapazitaet neuer Termine = 3 Iglus x 12 Plaetze (siehe js/iglu-verteilung.js)
-- Fuehre dieses Skript im Supabase Dashboard > SQL Editor aus. Idempotent.
ALTER TABLE fondue_termine ALTER COLUMN capacity_max SET DEFAULT 36;
