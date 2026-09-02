-- Winterzauber / Käsefondue — Anmeldungs-Nummer spiegelt den Termin
--
-- Neu: WZ-YY-MM-DD-NNN aus dem TERMINDATUM, Zaehler pro Termin.
-- Beispiel: Anmeldung fuer den 06.11.2026 -> WZ-26-11-06-001, -002, ...
-- Ersetzt das alte Format WZ-YYYY-MM-NNNN (Zaehler pro Anmeldemonat).
-- Bestehende Nummern bleiben unveraendert, nur neue Anmeldungen bekommen das Format.
--
-- Ausfuehrung: manuell im Supabase SQL-Editor. Nur die Funktion wird ersetzt,
-- der Trigger set_fondue_anmeldung_id bleibt bestehen.

CREATE OR REPLACE FUNCTION generate_fondue_anmeldung_id()
RETURNS TRIGGER AS $$
DECLARE
  termin_date date;
  prefix text;
  next_num integer;
BEGIN
  SELECT date INTO termin_date FROM fondue_termine WHERE id = NEW.termin_id;
  IF termin_date IS NULL THEN
    -- Sollte durch die FK nie eintreten; kein NULL-Prefix riskieren
    prefix := 'WZ-' || to_char(now(), 'YY-MM-DD');
  ELSE
    prefix := 'WZ-' || to_char(termin_date, 'YY-MM-DD');
  END IF;

  SELECT COALESCE(MAX(
    CAST(split_part(anmeldung_id, '-', 5) AS integer)
  ), 0) + 1 INTO next_num
  FROM fondue_anmeldungen
  WHERE anmeldung_id LIKE prefix || '-%';

  NEW.anmeldung_id := prefix || '-' || lpad(next_num::text, 3, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
