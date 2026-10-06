-- Winterzauber: Iglu-Verteilung (3 Iglus x 12 Plaetze pro Slot)
-- Fuehre dieses Skript im Supabase Dashboard > SQL Editor aus. Additiv + idempotent.
-- Logik: js/iglu-verteilung.js (Spec: docs/superpowers/specs/2026-10-06-iglu-verteilung-design.md)

-- 1. Verteilung pro Anmeldung: {"1": 10} oder bei Grossgruppen {"2": 8, "3": 8}
ALTER TABLE fondue_anmeldungen ADD COLUMN IF NOT EXISTS iglu_verteilung jsonb;
-- true = vom Admin manuell gesetzt, wird vom Algorithmus nie verschoben
ALTER TABLE fondue_anmeldungen ADD COLUMN IF NOT EXISTS iglu_fixiert boolean NOT NULL DEFAULT false;

-- 2. Oeffentliche Belegung fuer winterzauber.html. anon darf fondue_anmeldungen per RLS
-- nicht lesen (Allergien = Gesundheitsdaten) — diese Funktion gibt deshalb NUR Zahlen
-- und die Iglu-Zuordnung aktiver Anmeldungen heraus, keine Namen/Kontakte.
CREATE OR REPLACE FUNCTION fondue_belegung(p_termin_id uuid)
RETURNS TABLE (personen_anzahl int, iglu_verteilung jsonb, iglu_fixiert boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.personen_anzahl, a.iglu_verteilung, a.iglu_fixiert
  FROM fondue_anmeldungen a
  WHERE a.termin_id = p_termin_id
    AND a.status IN ('vorgemerkt', 'bestaetigt');
$$;

REVOKE ALL ON FUNCTION fondue_belegung(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fondue_belegung(uuid) TO anon, authenticated;
