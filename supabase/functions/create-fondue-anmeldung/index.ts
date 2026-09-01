// Edge Function: create-fondue-anmeldung
// Käsefondue-Vormerkung: Captcha → Validierung → Preis serverseitig berechnen →
// Insert → Eingangsbestätigungs-Mail. Modelliert 1:1 nach create-booking.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const HCAPTCHA_SECRET = Deno.env.get("HCAPTCHA_SECRET")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;

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

async function bumpQuota(times = 1) {
  for (let i = 0; i < times; i++) {
    try {
      await pg("rpc/increment_email_quota", { method: "POST", body: "{}" });
    } catch (_) {
      // Silent fail
    }
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function dateFormattedDe(yyyymmdd: string): string {
  return yyyymmdd.split("-").reverse().join(".");
}

function buildMailHtml(opts: {
  name: string;
  anmeldungId: string;
  manageToken: string;
  dateFormatted: string;
  personen: number;
  variantenLines: string[];
  beilagenLines: string[];
  gesamtpreis: number;
}): string {
  const { name, anmeldungId, manageToken, dateFormatted, personen, variantenLines, beilagenLines, gesamtpreis } = opts;
  return `
    <style>@import url('https://fonts.googleapis.com/css2?family=Albert+Sans:wght@300;400;500;600&family=Petrona:ital,wght@0,500;0,600;1,400;1,600&display=swap');</style>
    <div style="font-family:'Albert Sans',Arial,sans-serif;max-width:520px;margin:0 auto;background:#FDFAF4;border-radius:16px;overflow:hidden">
      <div style="background:#163D36;padding:32px 28px 24px;text-align:center">
        <h1 style="font-family:'Petrona',Georgia,serif;color:#FDFAF4;font-size:22px;font-weight:600;margin:0">Steg 1 Possenhofen</h1>
        <p style="color:rgba(255,255,255,.7);font-size:13px;margin:6px 0 0">Winterzauber &mdash; K&auml;sefondue im beheizten Zelt</p>
      </div>
      <div style="padding:28px">
        <h2 style="font-family:'Petrona',Georgia,serif;color:#163D36;font-size:20px;font-weight:600;margin:0 0 8px">Deine Vormerkung ist eingegangen</h2>
        <p style="color:#4A4840;font-size:14px;margin:0 0 20px">Hallo ${esc(name)}, vielen Dank f&uuml;r deine Anmeldung zum Winterzauber.</p>
        <div style="background:#fff;border:1.5px solid #D4883A;border-left-width:4px;border-radius:12px;padding:16px 18px;margin-bottom:20px">
          <p style="color:#163D36;font-size:14px;font-weight:600;margin:0 0 4px">Wichtiger Hinweis</p>
          <p style="color:#4A4840;font-size:13px;margin:0">Ihre Anmeldung ist zun&auml;chst eine unverbindliche Vormerkung. Der Termin findet ab insgesamt zehn angemeldeten Personen statt. Sobald die Mindestteilnehmerzahl erreicht ist, erhalten Sie von uns eine verbindliche Buchungsbest&auml;tigung.</p>
        </div>
        <div style="background:#F2EBD9;border-radius:12px;padding:20px;margin-bottom:20px">
          <table style="width:100%;border-collapse:collapse;font-size:14px;color:#1A2421">
            <tr><td style="padding:6px 0;color:#6C7871;width:110px">Anmeldung</td><td style="padding:6px 0;font-weight:500">${esc(anmeldungId)}</td></tr>
            <tr><td style="padding:6px 0;color:#6C7871">Termin</td><td style="padding:6px 0;font-weight:500">${esc(dateFormatted)}</td></tr>
            <tr><td style="padding:6px 0;color:#6C7871">Personen</td><td style="padding:6px 0;font-weight:500">${personen}</td></tr>
            <tr><td style="padding:6px 0;color:#6C7871;vertical-align:top">Fondue</td><td style="padding:6px 0;font-weight:500">${variantenLines.map(esc).join("<br>")}</td></tr>
            ${beilagenLines.length ? `<tr><td style="padding:6px 0;color:#6C7871;vertical-align:top">Beilagen</td><td style="padding:6px 0;font-weight:500">${beilagenLines.map(esc).join("<br>")}</td></tr>` : ""}
            <tr><td style="padding:6px 0;color:#6C7871">Voraussichtl. Preis</td><td style="padding:6px 0;font-weight:500">${gesamtpreis.toFixed(2)} &euro;</td></tr>
          </table>
        </div>
        <div style="margin-bottom:20px;text-align:center">
          <a href="https://steg1possenhofen.de/fondue-anmeldung?token=${manageToken}" style="display:inline-block;padding:12px 28px;background:#fff;border:1.5px solid #2A7B6F;border-radius:100px;text-decoration:none;color:#2A7B6F;font-size:13px;font-weight:500">Anmeldung ansehen oder stornieren</a>
        </div>
        <p style="color:#4A4840;font-size:14px;margin:0">Wir melden uns, sobald der Termin verbindlich best&auml;tigt ist oder falls er leider nicht zustande kommt.</p>
      </div>
      <div style="border-top:1px solid #E4D9C4;padding:20px 28px;text-align:center">
        <p style="color:#6C7871;font-size:12px;margin:0">Steg 1 Possenhofen &middot; Am Starnberger See</p>
      </div>
    </div>
  `;
}

serve(async (req) => {
  const corsHeaders = corsHeadersFor(req.headers.get("origin"));

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405, corsHeaders);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400, corsHeaders);
  }

  const captchaToken = String(body?.captchaToken ?? "");
  const terminId = String(body?.terminId ?? "");
  const name = String(body?.name ?? "").trim();
  const email = String(body?.email ?? "").trim().toLowerCase();
  const phone = String(body?.phone ?? "").trim();
  const phoneDigits = phone.replace(/[^0-9]/g, "");
  const personen = Number(body?.personen);
  const varianten = (body?.varianten && typeof body.varianten === "object") ? body.varianten : {};
  const beilagen = (body?.beilagen && typeof body.beilagen === "object") ? body.beilagen : {};
  const allergien = String(body?.allergien ?? "").trim().slice(0, 500);
  const allergienConsent = body?.allergienConsent === true;
  const agb = body?.agb === true;

  const captchaOk = await verifyCaptcha(captchaToken);
  if (!captchaOk) return jsonResponse({ error: "captcha_failed" }, 403, corsHeaders);

  // Feature-Flag prüfen: eine deaktivierte Seite darf keine neuen Anmeldungen mehr annehmen
  // (Cancel über manage-fondue-anmeldung bleibt bewusst davon unberührt — Finding 3).
  const settingsRes = await pg("winterzauber_settings?id=eq.1&select=active");
  const settingsRows = settingsRes.ok ? await settingsRes.json() : [];
  const featureActive = !!(settingsRows[0]?.active);
  if (!featureActive) return jsonResponse({ error: "feature_disabled" }, 409, corsHeaders);

  if (!UUID_RE.test(terminId)) return jsonResponse({ error: "invalid_termin" }, 400, corsHeaders);
  if (!name || name.length > 100) return jsonResponse({ error: "invalid_name" }, 400, corsHeaders);
  if (!EMAIL_RE.test(email) || email.length > 200) return jsonResponse({ error: "invalid_email" }, 400, corsHeaders);
  if (phoneDigits.length < 6 || phone.length > 40) return jsonResponse({ error: "invalid_phone" }, 400, corsHeaders);
  if (!Number.isInteger(personen) || personen < 1 || personen > 30) return jsonResponse({ error: "invalid_personen" }, 400, corsHeaders);
  if (!agb) return jsonResponse({ error: "agb_required" }, 400, corsHeaders);
  // Art. 9 DSGVO: gesonderte, ausdrückliche Einwilligung nötig, sobald Gesundheitsdaten
  // (Allergien/Unverträglichkeiten) angegeben werden — Finding 6.
  if (allergien && !allergienConsent) return jsonResponse({ error: "allergien_consent_required" }, 400, corsHeaders);

  // Termin laden + Status prüfen
  const terminRes = await pg(`fondue_termine?id=eq.${terminId}&select=id,date,status,capacity_max`);
  if (!terminRes.ok) return jsonResponse({ error: "termin_lookup_failed" }, 500, corsHeaders);
  const terminRows = await terminRes.json();
  if (!Array.isArray(terminRows) || terminRows.length === 0) return jsonResponse({ error: "termin_not_found" }, 404, corsHeaders);
  const termin = terminRows[0];
  if (!["offen", "schwelle_erreicht"].includes(termin.status)) {
    return jsonResponse({ error: "termin_not_open", status: termin.status }, 409, corsHeaders);
  }

  // Kapazität serverseitig durchsetzen (Finding 4) — Trigger setzt den Termin-Status erst
  // NACH dem Insert auf 'ausgebucht', daher hier vorab die Summe der aktiven Anmeldungen
  // prüfen, mirrored von admin.html's Termine-Ladepattern (status in vorgemerkt/bestaetigt).
  const sumRes = await pg(`fondue_anmeldungen?termin_id=eq.${terminId}&status=in.(vorgemerkt,bestaetigt)&select=personen_anzahl`);
  if (!sumRes.ok) return jsonResponse({ error: "capacity_lookup_failed" }, 500, corsHeaders);
  const sumRows = await sumRes.json();
  const existingSum = Array.isArray(sumRows) ? sumRows.reduce((sum: number, r: any) => sum + Number(r.personen_anzahl || 0), 0) : 0;
  if (existingSum + personen > Number(termin.capacity_max)) {
    return jsonResponse({ error: "capacity_exceeded", available: Number(termin.capacity_max) - existingSum }, 409, corsHeaders);
  }

  // Varianten + Beilagen serverseitig validieren und Preis berechnen — Client-Preis wird ignoriert
  const variantenRes = await pg("fondue_varianten?is_active=eq.true&select=id,name,price_per_person");
  const beilagenRes = await pg("fondue_beilagen?is_active=eq.true&select=id,name,price");
  if (!variantenRes.ok || !beilagenRes.ok) return jsonResponse({ error: "zutaten_lookup_failed" }, 500, corsHeaders);
  const variantenList = await variantenRes.json();
  const beilagenList = await beilagenRes.json();

  let gesamtpreis = 0;
  const variantenLines: string[] = [];
  for (const [vid, anzahl] of Object.entries(varianten)) {
    const count = Number(anzahl);
    if (!Number.isInteger(count) || count <= 0) continue;
    const v = variantenList.find((x: any) => x.id === vid);
    if (!v) return jsonResponse({ error: "invalid_variante", id: vid }, 400, corsHeaders);
    gesamtpreis += count * Number(v.price_per_person);
    variantenLines.push(`${count}x ${v.name}`);
  }
  if (variantenLines.length === 0) return jsonResponse({ error: "no_variante_selected" }, 400, corsHeaders);

  const beilagenLines: string[] = [];
  for (const [bid, menge] of Object.entries(beilagen)) {
    const count = Number(menge);
    if (!Number.isInteger(count) || count <= 0) continue;
    const b = beilagenList.find((x: any) => x.id === bid);
    if (!b) return jsonResponse({ error: "invalid_beilage", id: bid }, 400, corsHeaders);
    gesamtpreis += count * Number(b.price);
    beilagenLines.push(`${count}x ${b.name}`);
  }

  // Insert via Service-Role
  const insertRes = await pg("fondue_anmeldungen?select=id,anmeldung_id,manage_token", {
    method: "POST",
    headers: { "Prefer": "return=representation" },
    body: JSON.stringify({
      termin_id: terminId,
      customer_name: name,
      customer_email: email,
      customer_phone: phone,
      personen_anzahl: personen,
      varianten_auswahl: varianten,
      beilagen_auswahl: beilagen,
      allergien_hinweis: allergien || null,
      agb_akzeptiert: true,
      status: "vorgemerkt",
    }),
  });
  if (!insertRes.ok) {
    const errText = await insertRes.text();
    console.error("[create-fondue-anmeldung] insert failed", insertRes.status, errText);
    return jsonResponse({ error: "insert_failed", detail: errText }, 500, corsHeaders);
  }
  const inserted = (await insertRes.json())[0];

  // Aktualisierten Termin-Status nach dem Trigger nachladen (für Response)
  const updatedTerminRes = await pg(`fondue_termine?id=eq.${terminId}&select=status`);
  const updatedTerminRows = updatedTerminRes.ok ? await updatedTerminRes.json() : [];
  const terminStatus = updatedTerminRows[0]?.status ?? termin.status;

  const dateFormatted = dateFormattedDe(termin.date);
  try {
    const mailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: "Steg 1 Possenhofen <reservierung@steg1possenhofen.de>",
        to: [email],
        bcc: ["reservierung@steg1possenhofen.de"],
        reply_to: "reservierung@steg1possenhofen.de",
        subject: `Deine Vormerkung für den Winterzauber am ${dateFormatted}`,
        html: buildMailHtml({
          name,
          anmeldungId: inserted.anmeldung_id,
          manageToken: inserted.manage_token,
          dateFormatted,
          personen,
          variantenLines,
          beilagenLines,
          gesamtpreis,
        }),
      }),
    });
    if (mailRes.ok) {
      await bumpQuota(2);
    } else {
      console.error("[create-fondue-anmeldung] mail failed", mailRes.status, await mailRes.text());
    }
  } catch (e) {
    console.error("[create-fondue-anmeldung] mail exception", e);
  }

  return jsonResponse({
    anmeldungId: inserted.anmeldung_id,
    manageToken: inserted.manage_token,
    terminStatus,
    gesamtpreis,
  }, 200, corsHeaders);
});
