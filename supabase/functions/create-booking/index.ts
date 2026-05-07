// Edge Function: create-booking
// Atomarer SUP-Buchungs-Flow: Captcha → Validierung → Slot-Verfügbarkeit →
// Insert → Bestätigungs-Mail. Ersetzt den bisherigen Client-Flow,
// der Captcha-Verify und Booking-Insert separat im Browser hatte.
//
// Sicherheits-Vorteile:
// - hCaptcha-Token wird genau 1× verifiziert (one-time-use).
// - Insert läuft nur nach erfolgreichem Captcha (kein Insert-Spam mehr).
// - Preis wird serverseitig aus sup_settings.price_per_hour berechnet
//   (Client kann keinen 0-Preis schmuggeln).
// - Slot-Verfügbarkeit serverseitig geprüft (Doppelbuchung blockiert).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const HCAPTCHA_SECRET = Deno.env.get("HCAPTCHA_SECRET")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;

// CORS-Whitelist: nur eigene Domain
const ALLOWED_ORIGINS = [
  "https://steg1possenhofen.de",
  "https://www.steg1possenhofen.de",
];

function corsHeadersFor(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function jsonResponse(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// hCaptcha serverseitig verifizieren
async function verifyCaptcha(token: string): Promise<boolean> {
  if (!token) return false;
  try {
    const res = await fetch("https://api.hcaptcha.com/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `response=${encodeURIComponent(token)}&secret=${encodeURIComponent(HCAPTCHA_SECRET)}`,
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
}

// Hilfs-Funktion: Service-Role-Fetch auf PostgREST
async function pg(path: string, init: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      "apikey": SUPABASE_SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

// Atomic-Increment der Mail-Quota — Mail-Versand darf der Counter niemals blockieren
async function bumpQuota(times = 1) {
  for (let i = 0; i < times; i++) {
    try {
      await pg("rpc/increment_email_quota", { method: "POST", body: "{}" });
    } catch (_) {
      // Silent fail
    }
  }
}

// Validierungs-Regex (ASCII-Email-Format reicht hier völlig)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

function minutesFromTime(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function timeFromMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

function dateFormattedDe(yyyymmdd: string): string {
  return yyyymmdd.split("-").reverse().join(".");
}

// Mail-HTML (1:1 aus send-booking-email übernommen, damit Optik konsistent bleibt)
function buildMailHtml(opts: {
  name: string;
  bookingId: string;
  manageToken: string;
  dateFormatted: string;
  startTime: string;
  endTime: string;
  boards: number;
  price: number;
}): string {
  const { name, bookingId, manageToken, dateFormatted, startTime, endTime, boards, price } = opts;
  return `
    <div style="font-family:'DM Sans',Arial,sans-serif;max-width:520px;margin:0 auto;background:#FDFAF4;border-radius:16px;overflow:hidden">
      <div style="background:#163D36;padding:32px 28px 24px;text-align:center">
        <h1 style="font-family:'Cormorant Garamond',Georgia,serif;color:#FDFAF4;font-size:22px;font-weight:600;margin:0">Steg 1 Possenhofen</h1>
        <p style="color:rgba(255,255,255,.7);font-size:13px;margin:6px 0 0">Biergarten &amp; SUP-Verleih am Starnberger See</p>
      </div>
      <img src="https://raw.githubusercontent.com/bionader/steg1possenhofen/main/images/sup-mail.jpg" alt="Steg 1 Possenhofen am Starnberger See" style="width:100%;display:block;max-height:260px;object-fit:cover;object-position:center 85%" />
      <div style="padding:28px">
        <h2 style="font-family:'Cormorant Garamond',Georgia,serif;color:#163D36;font-size:20px;font-weight:600;margin:0 0 8px">Deine SUP-Reservierung</h2>
        <p style="color:#4A4840;font-size:14px;margin:0 0 20px">Hallo ${name}, deine Reservierung ist best&auml;tigt!</p>
        <div style="background:#F4EDD8;border-radius:12px;padding:20px;margin-bottom:20px">
          <table style="width:100%;border-collapse:collapse;font-size:14px;color:#18180F">
            <tr><td style="padding:6px 0;color:#7A7668;width:100px">Buchung</td><td style="padding:6px 0;font-weight:500">${bookingId}</td></tr>
            <tr><td style="padding:6px 0;color:#7A7668">Datum</td><td style="padding:6px 0;font-weight:500">${dateFormatted}</td></tr>
            <tr><td style="padding:6px 0;color:#7A7668">Zeit</td><td style="padding:6px 0;font-weight:500">${startTime} &ndash; ${endTime} Uhr</td></tr>
            <tr><td style="padding:6px 0;color:#7A7668">Boards</td><td style="padding:6px 0;font-weight:500">${boards}</td></tr>
            <tr><td style="padding:6px 0;color:#7A7668">Preis</td><td style="padding:6px 0;font-weight:500">${price} &euro; &middot; Bezahlung vor Ort</td></tr>
          </table>
        </div>
        <a href="https://maps.app.goo.gl/zWXKJMa6xTqqu4ot9?g_st=ic" style="display:flex;align-items:center;gap:12px;padding:14px 16px;background:#fff;border:1.5px solid #E6D9B8;border-radius:12px;text-decoration:none;color:#18180F;margin-bottom:20px">
          <span style="flex-shrink:0;width:36px;height:36px;background:#163D36;border-radius:50%;display:flex;align-items:center;justify-content:center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="#FDFAF4"/></svg>
          </span>
          <span>
            <strong style="font-size:14px;display:block">Steg 1, Possenhofen am Starnberger See</strong>
            <span style="font-size:12px;color:#163D36">In Google Maps &ouml;ffnen &rarr;</span>
          </span>
        </a>
        <div style="margin-bottom:20px;text-align:center">
          <a href="https://steg1possenhofen.de/buchung.html?token=${manageToken}" style="display:inline-block;padding:12px 28px;background:#fff;border:1.5px solid #2A7B6F;border-radius:100px;text-decoration:none;color:#2A7B6F;font-size:13px;font-weight:500">Buchung &auml;ndern oder stornieren</a>
        </div>
        <p style="color:#4A4840;font-size:14px;margin:0 0 4px">Bei Fragen erreichst du uns unter:</p>
        <p style="margin:0 0 6px"><a href="mailto:hallo@steg1possenhofen.de" style="color:#163D36;font-weight:500;text-decoration:none">hallo@steg1possenhofen.de</a></p>
        <p style="margin:0 0 20px;font-size:14px">Anruf/WhatsApp: <a href="tel:+4917881189224" style="color:#163D36;font-weight:500;text-decoration:none">+4917881189224</a></p>
        <p style="color:#4A4840;font-size:15px;margin:0 0 8px">Wir freuen uns auf deinen Besuch am Steg 1.</p>
        <p style="color:#4A4840;font-size:15px;margin:0">Bis bald am See! &#x1F30A;</p>
      </div>
      <div style="border-top:1px solid #E6D9B8;padding:20px 28px;text-align:center">
        <a href="https://instagram.com/steg1possenhofen" style="display:inline-block;padding:10px 24px;background:#163D36;color:#FDFAF4;border-radius:100px;text-decoration:none;font-size:13px;font-weight:500">&#x1F4F7; @steg1possenhofen</a>
        <p style="color:#7A7668;font-size:12px;margin:12px 0 0">Steg 1 Possenhofen &middot; Am Starnberger See</p>
      </div>
    </div>
  `;
}

serve(async (req) => {
  const corsHeaders = corsHeadersFor(req.headers.get("origin"));

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405, corsHeaders);
  }

  // ── Body parsen ──────────────────────────────────────────────────────────
  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400, corsHeaders);
  }

  const captchaToken = String(body?.captchaToken ?? "");
  const name = String(body?.name ?? "").trim();
  const email = String(body?.email ?? "").trim().toLowerCase();
  const phone = String(body?.phone ?? "").trim();
  const date = String(body?.date ?? "").trim();
  const startTime = String(body?.startTime ?? "").trim();
  const durationMinutes = Number(body?.durationMinutes);
  const boards = Number(body?.boards);

  // ── Captcha zuerst — bevor wir irgendetwas anderes tun ───────────────────
  const captchaOk = await verifyCaptcha(captchaToken);
  if (!captchaOk) {
    return jsonResponse({ error: "captcha_failed" }, 403, corsHeaders);
  }

  // ── Input-Validierung (defensiv, alle Pflichtfelder + Format) ────────────
  if (!name || name.length > 100) {
    return jsonResponse({ error: "invalid_name" }, 400, corsHeaders);
  }
  if (!EMAIL_RE.test(email) || email.length > 200) {
    return jsonResponse({ error: "invalid_email" }, 400, corsHeaders);
  }
  if (!phone || phone.length > 30) {
    return jsonResponse({ error: "invalid_phone" }, 400, corsHeaders);
  }
  if (!DATE_RE.test(date)) {
    return jsonResponse({ error: "invalid_date" }, 400, corsHeaders);
  }
  if (!TIME_RE.test(startTime)) {
    return jsonResponse({ error: "invalid_start_time" }, 400, corsHeaders);
  }
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0 || durationMinutes > 600) {
    return jsonResponse({ error: "invalid_duration" }, 400, corsHeaders);
  }
  if (!Number.isInteger(boards) || boards < 1 || boards > 20) {
    return jsonResponse({ error: "invalid_boards" }, 400, corsHeaders);
  }

  // Datum darf nicht in der Vergangenheit liegen (Tagesgrenze in Europe/Berlin)
  const todayBerlin = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
  if (date < todayBerlin) {
    return jsonResponse({ error: "date_in_past" }, 400, corsHeaders);
  }

  // ── sup_settings laden (Preis, total_boards, duration_step, min_duration) ─
  const settingsRes = await pg("sup_settings?select=total_boards,price_per_hour,duration_step,min_duration&limit=1");
  if (!settingsRes.ok) {
    return jsonResponse({ error: "settings_unavailable" }, 500, corsHeaders);
  }
  const settingsRows = await settingsRes.json();
  if (!Array.isArray(settingsRows) || settingsRows.length === 0) {
    return jsonResponse({ error: "settings_missing" }, 500, corsHeaders);
  }
  const { total_boards, price_per_hour, duration_step, min_duration } = settingsRows[0];

  if (durationMinutes < min_duration || durationMinutes % duration_step !== 0) {
    return jsonResponse({ error: "invalid_duration_step" }, 400, corsHeaders);
  }
  if (boards > total_boards) {
    return jsonResponse({ error: "boards_exceed_total" }, 400, corsHeaders);
  }

  // ── End-Time berechnen + Slot-Verfügbarkeit prüfen ───────────────────────
  const startMin = minutesFromTime(startTime);
  const endMin = startMin + durationMinutes;
  const endTimeSql = timeFromMinutes(endMin);
  const startTimeSql = timeFromMinutes(startMin);

  // Wie viele Boards sind in diesem Zeitfenster bereits gebucht?
  // Überlappung: existing.start < new.end UND existing.end > new.start
  const overlapRes = await pg(
    `bookings?date=eq.${date}&status=eq.confirmed&start_time=lt.${endTimeSql}&end_time=gt.${startTimeSql}&select=board_count`
  );
  if (!overlapRes.ok) {
    return jsonResponse({ error: "availability_check_failed" }, 500, corsHeaders);
  }
  const overlapping = (await overlapRes.json()) as Array<{ board_count: number }>;
  const bookedBoards = overlapping.reduce((sum, r) => sum + (r.board_count ?? 0), 0);
  if (bookedBoards + boards > total_boards) {
    return jsonResponse({ error: "slot_full", available: total_boards - bookedBoards }, 409, corsHeaders);
  }

  // ── Preis serverseitig berechnen — niemals Client-Wert übernehmen ────────
  const hours = durationMinutes / 60;
  const totalPrice = +(hours * price_per_hour * boards).toFixed(2);

  // ── Insert via Service-Role ──────────────────────────────────────────────
  const insertRes = await pg("bookings?select=id,booking_id,manage_token", {
    method: "POST",
    headers: { "Prefer": "return=representation" },
    body: JSON.stringify({
      date,
      start_time: startTimeSql,
      end_time: endTimeSql,
      board_count: boards,
      customer_name: name,
      customer_email: email,
      customer_phone: phone,
      total_price: totalPrice,
      booking_type: "rental",
    }),
  });
  if (!insertRes.ok) {
    const errText = await insertRes.text();
    console.error("[create-booking] insert failed", insertRes.status, errText);
    return jsonResponse({ error: "insert_failed", detail: errText }, 500, corsHeaders);
  }
  const inserted = (await insertRes.json())[0];

  // ── Bestätigungs-Mail (Gast + BCC hallo@) ────────────────────────────────
  // Mail-Fehler darf User-Feedback NICHT blockieren — Buchung steht ja schon.
  const dateFormatted = dateFormattedDe(date);
  const startTimeShort = startTimeSql.slice(0, 5);
  const endTimeShort = endTimeSql.slice(0, 5);
  try {
    const mailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Steg 1 Possenhofen <hallo@steg1possenhofen.de>",
        to: [email],
        bcc: ["hallo@steg1possenhofen.de"],
        subject: `Deine SUP-Reservierung am ${dateFormatted}`,
        html: buildMailHtml({
          name,
          bookingId: inserted.booking_id,
          manageToken: inserted.manage_token,
          dateFormatted,
          startTime: startTimeShort,
          endTime: endTimeShort,
          boards,
          price: totalPrice,
        }),
      }),
    });
    if (mailRes.ok) {
      await bumpQuota(2); // Gast + BCC
    } else {
      const errBody = await mailRes.text();
      console.error("[create-booking] mail failed", mailRes.status, errBody);
    }
  } catch (e) {
    console.error("[create-booking] mail exception", e);
  }

  // ── Response für Client ──────────────────────────────────────────────────
  return jsonResponse({
    bookingId: inserted.booking_id,
    manageToken: inserted.manage_token,
    date,
    dateFormatted,
    startTime: startTimeShort,
    endTime: endTimeShort,
    boards,
    price: totalPrice,
  }, 200, corsHeaders);
});
