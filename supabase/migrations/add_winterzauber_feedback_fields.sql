-- Migration: Winterzauber Feedback-Runde (2026-09-04)
-- Additive Spalten für Termin-Storno-Grund und Gast-Adresse.
-- Zweck: Admin-Grund bei Termin-Absage + Anschrift des Gastes für Einkaufsplanung + Stornobedingungen.
-- Spec: docs/superpowers/specs/2026-09-04-winterzauber-feedback-runde-design.md
--
-- Run im Supabase Dashboard > SQL Editor (Projekt tdnnfmfaymnzukjhoidq).

-- Punkt 1: Grund einer Termin-Absage (durch den Betrieb), im Admin eingetragen.
ALTER TABLE fondue_termine
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

-- Punkt 3: Anschrift des Gastes (Pflicht im Formular + serverseitig; DB nullable
-- wegen Bestandszeilen). Zweck: Einkaufsplanung + Durchsetzung der Stornobedingungen.
ALTER TABLE fondue_anmeldungen
  ADD COLUMN IF NOT EXISTS addr_street      TEXT,
  ADD COLUMN IF NOT EXISTS addr_house_no    TEXT,
  ADD COLUMN IF NOT EXISTS addr_postal_code TEXT,
  ADD COLUMN IF NOT EXISTS addr_city        TEXT;
