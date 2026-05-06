-- Migration Phase 4: sup_closed_days droppen
-- Voraussetzung: add_sup_monthly_defaults.sql wurde erfolgreich ausgeführt
-- (Daten wurden bereits idempotent nach sup_daily_schedule migriert).
-- Frontend (sup.html, buchung.html) liest seit Phase 3 nicht mehr aus
-- sup_closed_days, Admin schreibt seit Phase 4 nicht mehr dorthin.
-- Führe das im Supabase Dashboard > SQL Editor aus.

DROP TABLE IF EXISTS sup_closed_days;
