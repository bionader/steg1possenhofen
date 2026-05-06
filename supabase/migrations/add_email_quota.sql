-- Migration: Email-Quota-Tracker fuer Resend-Limit (3000 Mails/Monat im Free Tier)
-- Run this in Supabase Dashboard > SQL Editor

-- 1. Quota-Tabelle: ein Row pro Monat (YYYY-MM als PK)
CREATE TABLE IF NOT EXISTS email_quota (
  year_month text PRIMARY KEY,
  count integer NOT NULL DEFAULT 0,
  warned_at_80 timestamptz,
  warned_at_95 timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Atomic-Increment-Function (laeuft mit SECURITY DEFINER, umgeht RLS)
-- Wird von den send-* Edge Functions nach erfolgreichem Versand aufgerufen
CREATE OR REPLACE FUNCTION increment_email_quota()
RETURNS integer AS $$
DECLARE
  current_month text;
  new_count integer;
BEGIN
  current_month := to_char(now() AT TIME ZONE 'Europe/Berlin', 'YYYY-MM');

  INSERT INTO email_quota (year_month, count, updated_at)
  VALUES (current_month, 1, now())
  ON CONFLICT (year_month) DO UPDATE
    SET count = email_quota.count + 1,
        updated_at = now()
  RETURNING count INTO new_count;

  RETURN new_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. RLS aktivieren — nur service_role darf schreiben/lesen
ALTER TABLE email_quota ENABLE ROW LEVEL SECURITY;

-- Service-Role hat ohnehin Vollzugriff, anon/authenticated bekommen NICHTS
-- (Default-Deny durch RLS ohne Policies)
