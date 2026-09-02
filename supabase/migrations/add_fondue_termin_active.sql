-- Winterzauber / Käsefondue — Termine aktiv/inaktiv schalten
--
-- Neuer Bool `is_active` auf fondue_termine. Deaktivierte Termine sind fuer
-- die oeffentliche Seite unsichtbar (RLS) und nehmen keine Vormerkungen an
-- (Check in create-fondue-anmeldung). Im Admin bleiben sie sichtbar
-- (authenticated-Policy USING (true)) und lassen sich wieder aktivieren.
--
-- Ausfuehrung: manuell im Supabase SQL-Editor.

ALTER TABLE fondue_termine ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- anon (oeffentliche Seite) sieht nur noch aktive Termine
DROP POLICY IF EXISTS "fondue_termine_anon_select" ON fondue_termine;
CREATE POLICY "fondue_termine_anon_select"
  ON fondue_termine FOR SELECT TO anon USING (is_active = true);
