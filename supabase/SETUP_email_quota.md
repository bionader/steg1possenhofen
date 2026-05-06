# Email-Quota-Watcher — Setup

Schutz gegen das Resend-Free-Tier-Limit (3.000 Mails/Monat). Warnt automatisch bei 80% und 95%.

**Status: LIVE seit 2026-04-26**

## Architektur

```
send-booking-email   ─┐
send-cancel-email    ─┼─→ RPC increment_email_quota() → email_quota Tabelle
send-contact-email   ─┘                                          │
                                                                 ▼
                          (täglich 06:00 UTC via pg_cron)  check-email-quota
                                                                 │
                                                                 ▼
                                       Mail an cathrin@ + matsdierks@outlook.com
```

## Was zählt als 1 Mail?

Resend zählt jede empfangende Adresse einzeln. BCC = +1.

| Function | Mails pro Aufruf |
|---|---|
| `send-booking-email` | 2 (Gast + BCC hallo@) |
| `send-cancel-email` | 2 (Gast + BCC hallo@) |
| `send-contact-email` | 1 (nur info@) |
| `check-email-quota` (Warning selbst) | 2 (cathrin + mats) — wird **nicht** mitgezählt |

Counter wird in `bumpQuota(times)` der jeweiligen send-* Function entsprechend hochgezählt.

## Sicherheitsmodell

`check-email-quota` läuft mit `--no-verify-jwt` (= ohne Auth aufrufbar).

**Warum:** Mail-Versand ist durch `warned_at_80/95` rate-limited (max 2 Mails/Monat möglich). URL nicht öffentlich bekannt. Vermeidet, den Service-Role-Key in `cron.job.command` zu speichern (war Auslöser mehrerer JWT-Format-Fehler beim ersten Setup-Versuch).

Wenn später Härtung gewünscht: CRON_SECRET als Custom Header — siehe Abschnitt „Optional: Härtung mit CRON_SECRET" am Ende.

---

## Re-Deploy / Neuaufbau

Falls die Function neu deployed werden muss (z.B. nach Code-Änderung):

```bash
cd ~/Desktop/Claude/Projects/Steg\ 1/steg1possenhofen
supabase functions deploy check-email-quota --no-verify-jwt
```

⚠️ **`--no-verify-jwt` Flag ist Pflicht** — sonst bricht der Cron-Job (sendet keinen Auth-Header).

Die anderen send-* Functions normal deployen (mit JWT-Verify):
```bash
supabase functions deploy send-booking-email
supabase functions deploy send-cancel-email
supabase functions deploy send-contact-email
```

---

## Komplett-Setup von 0 (für Disaster Recovery)

### 1. SQL-Migration ausführen

Supabase Dashboard → SQL Editor → Inhalt von `migrations/add_email_quota.sql` einfügen → Run.

Erstellt: Tabelle `email_quota` + RPC `increment_email_quota()`.

### 2. Extensions aktivieren

Dashboard → Database → Extensions:
- `pg_cron` einschalten
- `pg_net` einschalten

### 3. Edge Functions deployen

```bash
cd ~/Desktop/Claude/Projects/Steg\ 1/steg1possenhofen
supabase functions deploy send-booking-email
supabase functions deploy send-cancel-email
supabase functions deploy send-contact-email
supabase functions deploy check-email-quota --no-verify-jwt
```

### 4. Smoke-Test

SQL Editor:
```sql
-- Sofort-Test
SELECT net.http_post(
  url := 'https://tdnnfmfaymnzukjhoidq.supabase.co/functions/v1/check-email-quota',
  headers := jsonb_build_object('Content-Type', 'application/json'),
  body := '{}'::jsonb
);

-- Nach 5 Sek. Antwort prüfen
SELECT id, status_code, content::text
FROM net._http_response
ORDER BY created DESC
LIMIT 1;
```

Erwartet: `status_code = 200` + JSON mit `{yearMonth, count, limit, percent, ...}`.

### 5. Mail-Test (optional, aber empfohlen)

```sql
-- Counter künstlich auf 80% setzen
INSERT INTO email_quota (year_month, count, warned_at_80, warned_at_95)
VALUES (to_char(now() AT TIME ZONE 'Europe/Berlin', 'YYYY-MM'), 2400, NULL, NULL)
ON CONFLICT (year_month) DO UPDATE
  SET count = 2400, warned_at_80 = NULL, warned_at_95 = NULL;

-- Function manuell triggern
SELECT net.http_post(
  url := 'https://tdnnfmfaymnzukjhoidq.supabase.co/functions/v1/check-email-quota',
  headers := jsonb_build_object('Content-Type', 'application/json'),
  body := '{}'::jsonb
);
```

Posteingänge prüfen: `cathrin@steg1possenhofen.de` + `matsdierks@outlook.com` (auch Spam-Ordner!).

Counter danach zurücksetzen:
```sql
DELETE FROM email_quota WHERE year_month = to_char(now() AT TIME ZONE 'Europe/Berlin', 'YYYY-MM');
```

### 6. Cron-Job einrichten

```sql
SELECT cron.schedule(
  'check-email-quota-daily',
  '0 6 * * *',  -- taeglich 06:00 UTC = 08:00 CEST (Sommer) / 07:00 CET (Winter)
  $$
  SELECT net.http_post(
    url := 'https://tdnnfmfaymnzukjhoidq.supabase.co/functions/v1/check-email-quota',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);
```

### 7. Cron-Job verifizieren

```sql
SELECT jobid, jobname, schedule, active FROM cron.job;
```

Sollte: `check-email-quota-daily`, `0 6 * * *`, `active = true` zeigen.

---

## Monitoring

**Aktuellen Verbrauch ablesen:**
```sql
SELECT * FROM email_quota ORDER BY year_month DESC LIMIT 12;
```

**Letzte Cron-Runs anschauen:**
```sql
SELECT
  job_run_details.runid,
  job.jobname,
  job_run_details.status,
  job_run_details.start_time,
  job_run_details.return_message
FROM cron.job_run_details
JOIN cron.job USING (jobid)
ORDER BY start_time DESC
LIMIT 10;
```

**Letzte HTTP-Responses (was die Function geantwortet hat):**
```sql
SELECT id, status_code, content::text, created
FROM net._http_response
ORDER BY created DESC
LIMIT 10;
```

**Edge Function Logs:** Supabase Dashboard → Edge Functions → check-email-quota → Logs

---

## Schwellen anpassen

In `check-email-quota/index.ts`:
- `MONTHLY_LIMIT` (3000) — bei Resend-Plan-Wechsel anpassen
- `THRESHOLD_80` / `THRESHOLD_95` — Prozent-Schwellen
- `RECIPIENTS` — wer bekommt die Warning-Mail

Nach Änderung: re-deploy mit `--no-verify-jwt`.

---

## Optional: Härtung mit CRON_SECRET

Aktuell ist `check-email-quota` ohne Auth aufrufbar. Wenn das später ungewollt ist:

1. Custom Secret setzen: `supabase secrets set CRON_SECRET=<random-string-32-chars>`
2. In `check-email-quota/index.ts` am Anfang der `serve(...)` Funktion:
   ```typescript
   const cronSecret = Deno.env.get("CRON_SECRET");
   const providedSecret = req.headers.get("x-cron-secret");
   if (cronSecret && providedSecret !== cronSecret) {
     return new Response("Forbidden", { status: 403 });
   }
   ```
3. Im pg_cron-Job den Header mitsenden:
   ```sql
   headers := jsonb_build_object(
     'Content-Type', 'application/json',
     'x-cron-secret', '<dein-cron-secret>'
   )
   ```
4. Function neu deployen, Cron-Job updaten.

---

## Fehlersuche

| Symptom | Ursache | Fix |
|---|---|---|
| Cron-Run `succeeded` aber Function nicht aufgerufen | URL falsch oder Function down | Function-URL & Status prüfen |
| `net._http_response` zeigt 401 | `--no-verify-jwt` Flag beim Deploy vergessen | Re-deploy mit Flag |
| Function liefert 200 aber Mail kommt nicht | Bei Outlook: Spam-Ordner | „Kein Junk" + Sender als Kontakt |
| `count` springt nicht hoch trotz Buchung | RPC-Aufruf in send-* failed silent | Edge Function Logs der send-* checken |
| Doppel-Warnings | `warned_at_80/95` wurde gelöscht | Logik prüfen, normalerweise unmöglich |
