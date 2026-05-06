import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

// Resend Free Tier: 3000 Mails/Monat
const MONTHLY_LIMIT = 3000;
const THRESHOLD_80 = Math.floor(MONTHLY_LIMIT * 0.8); // 2400
const THRESHOLD_95 = Math.floor(MONTHLY_LIMIT * 0.95); // 2850

const RECIPIENTS = [
  "cathrin@steg1possenhofen.de",
  "matsdierks@outlook.com",
];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Aktueller Monat in Europe/Berlin (z.B. "2026-04")
function currentMonth(): string {
  const now = new Date();
  const berlin = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Berlin" }));
  return `${berlin.getFullYear()}-${String(berlin.getMonth() + 1).padStart(2, "0")}`;
}

// fetch mit 10s-Timeout, damit wir nie das 60s-Function-Limit reissen
async function timedFetch(url: string, init: RequestInit, label: string, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const t0 = Date.now();
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    console.log(`[${label}] ${res.status} in ${Date.now() - t0}ms`);
    return res;
  } catch (err) {
    console.error(`[${label}] FAILED after ${Date.now() - t0}ms:`, (err as Error).message);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function getQuotaRow(yearMonth: string) {
  const res = await timedFetch(
    `${SUPABASE_URL}/rest/v1/email_quota?year_month=eq.${yearMonth}&select=*`,
    {
      headers: {
        "apikey": SUPABASE_SERVICE_ROLE_KEY!,
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    },
    "getQuotaRow",
  );
  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

// Setzt warned_at_80 oder warned_at_95 — verhindert Doppel-Alerts
async function markWarned(yearMonth: string, level: 80 | 95) {
  const column = level === 80 ? "warned_at_80" : "warned_at_95";
  await timedFetch(
    `${SUPABASE_URL}/rest/v1/email_quota?year_month=eq.${yearMonth}`,
    {
      method: "PATCH",
      headers: {
        "apikey": SUPABASE_SERVICE_ROLE_KEY!,
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ [column]: new Date().toISOString() }),
    },
    "markWarned",
  );
}

function buildHtml(level: 80 | 95, count: number, percent: number, yearMonth: string) {
  const isCritical = level === 95;
  const headerColor = isCritical ? "#A03020" : "#163D36";
  const pillBg = isCritical ? "#A03020" : "#2A7B6F";
  const headline = isCritical ? "Resend-Limit fast erreicht" : "Resend-Limit zu 80% verbraucht";
  const intro = isCritical
    ? `Achtung: Im Monat <strong>${yearMonth}</strong> wurden bereits <strong>${count} von ${MONTHLY_LIMIT}</strong> E-Mails verschickt (${percent}%). Sobald das Limit erreicht ist, werden Buchungs- und Kontaktmails nicht mehr versendet.`
    : `Hinweis: Im Monat <strong>${yearMonth}</strong> wurden bereits <strong>${count} von ${MONTHLY_LIMIT}</strong> E-Mails verschickt (${percent}%). Bitte den Verbrauch im Auge behalten.`;

  return `
    <div style="font-family:'DM Sans',Arial,sans-serif;max-width:520px;margin:0 auto;background:#FDFAF4;border-radius:16px;overflow:hidden">
      <div style="background:${headerColor};padding:28px 28px 22px;text-align:center">
        <h1 style="font-family:'Cormorant Garamond',Georgia,serif;color:#FDFAF4;font-size:22px;font-weight:600;margin:0;letter-spacing:.02em">Steg <span style="font-family:'DM Sans',Arial,sans-serif">1</span> Possenhofen</h1>
        <p style="color:rgba(253,250,244,.7);font-size:12px;margin:6px 0 0;letter-spacing:.06em;text-transform:uppercase">System-Warnung</p>
      </div>
      <div style="padding:28px">
        <h2 style="font-family:'Cormorant Garamond',Georgia,serif;color:${headerColor};font-size:22px;font-weight:600;margin:0 0 12px">${headline}</h2>
        <p style="color:#18180F;font-size:14px;line-height:1.6;margin:0 0 20px">${intro}</p>

        <div style="background:#F4EDD8;border-radius:12px;padding:18px 20px;margin-bottom:20px">
          <table style="width:100%;border-collapse:collapse;font-size:14px;color:#18180F">
            <tr>
              <td style="padding:6px 0;color:#7A7668;width:140px">Monat</td>
              <td style="padding:6px 0;font-weight:500">${yearMonth}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#7A7668">Versandt</td>
              <td style="padding:6px 0;font-weight:500">${count} / ${MONTHLY_LIMIT}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#7A7668">Auslastung</td>
              <td style="padding:6px 0;font-weight:500">${percent}%</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#7A7668">Verbleibend</td>
              <td style="padding:6px 0;font-weight:500">${MONTHLY_LIMIT - count}</td>
            </tr>
          </table>
        </div>

        <div style="background:#FDFAF4;border:1px solid #E6D9B8;border-radius:12px;padding:18px 20px;margin-bottom:22px">
          <p style="font-size:12px;color:#7A7668;letter-spacing:.06em;text-transform:uppercase;margin:0 0 10px">Empfohlene Aktion</p>
          <p style="color:#18180F;font-size:14px;line-height:1.6;margin:0">
            ${isCritical
              ? "Jetzt auf Resend Pro upgraden (20 $/Monat fuer 50.000 Mails) oder Verbrauch reduzieren."
              : "Resend-Verbrauch beobachten. Bei 95% folgt eine Eskalations-Mail."}
          </p>
        </div>

        <div style="text-align:center;margin-bottom:6px">
          <a href="https://resend.com/emails" style="display:inline-block;padding:12px 28px;background:${pillBg};color:#FDFAF4;border-radius:100px;text-decoration:none;font-size:13px;font-weight:500;letter-spacing:.02em">Im Resend-Dashboard pruefen</a>
        </div>
      </div>
      <div style="border-top:1px solid #E6D9B8;padding:16px 28px;text-align:center">
        <p style="color:#7A7668;font-size:12px;margin:0">Automatische Warnung des Quota-Watchers &middot; <a href="https://steg1possenhofen.de" style="color:#163D36;text-decoration:none;font-weight:500">steg1possenhofen.de</a></p>
      </div>
    </div>
  `;
}

async function sendWarning(level: 80 | 95, count: number, yearMonth: string) {
  if (!RESEND_API_KEY) {
    console.error("[sendWarning] RESEND_API_KEY missing!");
    return false;
  }
  const percent = Math.round((count / MONTHLY_LIMIT) * 100);
  const subject = level === 95
    ? `[Kritisch] Resend-Limit zu ${percent}% erreicht (${yearMonth})`
    : `[Warnung] Resend-Limit zu ${percent}% verbraucht (${yearMonth})`;

  const res = await timedFetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: "Steg 1 System <info@steg1possenhofen.de>",
      to: RECIPIENTS,
      subject,
      html: buildHtml(level, count, percent, yearMonth),
    }),
  }, "resendSend");

  if (!res.ok) {
    const errBody = await res.text();
    console.error(`[sendWarning] Resend ${res.status}: ${errBody}`);
  }
  return res.ok;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const yearMonth = currentMonth();
    console.log(`[check] start month=${yearMonth} hasResendKey=${!!RESEND_API_KEY}`);

    const row = await getQuotaRow(yearMonth);
    const count = row?.count ?? 0;
    const warned80 = !!row?.warned_at_80;
    const warned95 = !!row?.warned_at_95;
    console.log(`[check] count=${count} warned80=${warned80} warned95=${warned95}`);

    const result: Record<string, unknown> = {
      yearMonth,
      count,
      limit: MONTHLY_LIMIT,
      percent: Math.round((count / MONTHLY_LIMIT) * 100),
      warned80,
      warned95,
      sent: [] as string[],
      error: null as string | null,
    };

    if (count >= THRESHOLD_95 && !warned95) {
      const ok = await sendWarning(95, count, yearMonth);
      if (ok) {
        await markWarned(yearMonth, 95);
        (result.sent as string[]).push("95");
      } else {
        result.error = "Resend-Send fehlgeschlagen (95%)";
      }
    } else if (count >= THRESHOLD_80 && !warned80) {
      const ok = await sendWarning(80, count, yearMonth);
      if (ok) {
        await markWarned(yearMonth, 80);
        (result.sent as string[]).push("80");
      } else {
        result.error = "Resend-Send fehlgeschlagen (80%)";
      }
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = (err as Error).message;
    console.error(`[check] CRASH: ${msg}`);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
