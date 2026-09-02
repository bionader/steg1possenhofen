-- Winterzauber / Käsefondue — Aufbewahrung der Allergie-Angaben (Art. 9 DSGVO)
--
-- Die Datenschutzerklärung (§10) sagt zu: freiwillige Angaben zu Allergien /
-- Unverträglichkeiten (Gesundheitsdaten i. S. v. Art. 9 DSGVO) werden
-- "spätestens 3 Monate nach dem Veranstaltungstermin gelöscht".
-- Für die übrigen Anmeldedaten gelten die handels-/steuerrechtlichen Fristen;
-- diese Sonderfrist betrifft ausschließlich das Freitext-Feld `allergien_hinweis`.
--
-- Umsetzung: täglicher pg_cron-Job, der das Feld auf NULL setzt, sobald der
-- zugehörige Termin länger als 3 Monate zurückliegt. Kein Service-Role-Key im
-- Job-Command nötig (reine DB-Operation).
--
-- Ausführung: manuell im Supabase SQL-Editor (analog add_email_quota.sql).

-- 1. pg_cron aktivieren (idempotent — ist ggf. schon durch add_email_quota aktiv)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Purge-Funktion
CREATE OR REPLACE FUNCTION purge_expired_fondue_allergien()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE fondue_anmeldungen a
  SET allergien_hinweis = NULL
  FROM fondue_termine t
  WHERE a.termin_id = t.id
    AND a.allergien_hinweis IS NOT NULL
    AND t.date < (CURRENT_DATE - INTERVAL '3 months');
$$;

-- 3. Täglich um 03:30 UTC einplanen (idempotent: alten Job vorher entfernen)
SELECT cron.unschedule('purge-fondue-allergien')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-fondue-allergien');

SELECT cron.schedule(
  'purge-fondue-allergien',
  '30 3 * * *',
  $$SELECT purge_expired_fondue_allergien();$$
);
