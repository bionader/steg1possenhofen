-- Winterzauber: Anmeldung im Admin aendern (Spec: docs/superpowers/specs/2026-10-06-anmeldung-aendern-design.md)
-- Fuehre dieses Skript im Supabase Dashboard > SQL Editor aus. Additiv + idempotent.

-- true, sobald eine Reduzierung innerhalb der kostenpflichtigen Frist (5 Tage) stattfand
ALTER TABLE fondue_anmeldungen ADD COLUMN IF NOT EXISTS spaet_reduziert boolean NOT NULL DEFAULT false;
-- Protokoll: [{zeit, personen_alt, personen_neu, varianten_alt, varianten_neu, beilagen_alt, beilagen_neu, spaet}]
ALTER TABLE fondue_anmeldungen ADD COLUMN IF NOT EXISTS aenderungen jsonb NOT NULL DEFAULT '[]'::jsonb;
