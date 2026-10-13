-- Winterzauber: Dessert als dritte Kategorie neben Varianten und Beilagen.
-- Desserts liegen in fondue_beilagen (kategorie = 'dessert'), die bestellten Mengen
-- laufen wie Beilagen in fondue_anmeldungen.beilagen_auswahl. Preis, Validierung und
-- "Anmeldung aendern" funktionieren dadurch ohne Logik-Umbau.
-- Idempotent: kann mehrfach ausgefuehrt werden.

ALTER TABLE fondue_beilagen
  ADD COLUMN IF NOT EXISTS kategorie TEXT NOT NULL DEFAULT 'beilage';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fondue_beilagen_kategorie_check') THEN
    ALTER TABLE fondue_beilagen
      ADD CONSTRAINT fondue_beilagen_kategorie_check CHECK (kategorie IN ('beilage', 'dessert'));
  END IF;
END $$;

-- Erstes Dessert (sort_order ab 100, damit Desserts in allen Listen nach den Beilagen stehen)
INSERT INTO fondue_beilagen (name, description, price, is_active, sort_order, kategorie)
SELECT 'Warmer Apfelstrudel', 'mit Vanillesoße oder Vanilleeis und Sahne', 8.90, true, 100, 'dessert'
WHERE NOT EXISTS (SELECT 1 FROM fondue_beilagen WHERE name = 'Warmer Apfelstrudel');
