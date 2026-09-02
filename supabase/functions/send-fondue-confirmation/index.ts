// Edge Function: send-fondue-confirmation
// Von Mama im Admin ausgelöst ("Termin bestätigen"): setzt alle vorgemerkten
// Anmeldungen eines Termins auf 'bestaetigt' und verschickt je eine
// verbindliche Bestätigungsmail. Auth: Supabase-Access-Token (authenticated Rolle).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
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
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
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
    try { await pg("rpc/increment_email_quota", { method: "POST", body: "{}" }); } catch (_) {}
  }
}

// Verifiziert, dass der mitgeschickte Bearer-Token zu einem eingeloggten Supabase-User gehört.
// Verhindert, dass diese Function anonym aufrufbar ist (Auth-Check statt Captcha, da
// interner Admin-Endpoint).
async function verifyAdmin(authHeader: string | null): Promise<boolean> {
  if (!authHeader) return false;
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { "apikey": SUPABASE_SERVICE_ROLE_KEY, "Authorization": `Bearer ${token}` },
  });
  if (!res.ok) return false;
  // Nicht nur Login prüfen, sondern auch dass die Rolle nicht auf "sup" oder
  // "schedule_events" eingeschränkt ist — diese Accounts dürfen keine
  // Winterzauber-Massenmails auslösen oder Gästedaten sehen.
  const user = await res.json();
  const role = user?.user_metadata?.role;
  return role !== "sup" && role !== "schedule_events";
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function dateFormattedDe(yyyymmdd: string): string {
  return yyyymmdd.split("-").reverse().join(".");
}

function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildConfirmationHtml(name: string, anmeldungId: string, manageToken: string, dateFormatted: string, personen: number | string): string {
  return `
    <style>@import url('https://fonts.googleapis.com/css2?family=Albert+Sans:wght@300;400;500;600&family=Petrona:ital,wght@0,500;0,600;1,400;1,600&display=swap');</style>
    <div style="font-family:'Albert Sans',Arial,sans-serif;max-width:520px;margin:0 auto;background:#FDFAF4;border-radius:16px;overflow:hidden">
      <div style="background:#163D36;padding:32px 28px 24px;text-align:center">
        <h1 style="font-family:'Petrona',Georgia,serif;color:#FDFAF4;font-size:22px;font-weight:600;margin:0">Steg 1 Possenhofen</h1>
        <p style="color:rgba(255,255,255,.7);font-size:13px;margin:6px 0 0">Winterzauber &mdash; K&auml;sefondue im beheizten Zelt</p>
      </div>
      <div style="padding:28px">
        <h2 style="font-family:'Petrona',Georgia,serif;color:#2E9E4A;font-size:20px;font-weight:600;margin:0 0 8px">Dein Termin ist verbindlich best&auml;tigt! &#127853;</h2>
        <p style="color:#4A4840;font-size:14px;margin:0 0 16px">Hallo ${esc(name)}, die Mindestteilnehmerzahl wurde erreicht &mdash; euer Winterzauber am ${esc(dateFormatted)} findet statt.</p>
        <div style="background:#F2EBD9;border-radius:12px;padding:20px;margin:0 0 20px">
          <table style="width:100%;border-collapse:collapse;font-size:14px;color:#1A2421">
            <tr><td style="padding:6px 0;color:#6C7871;width:110px">Anmeldung</td><td style="padding:6px 0;font-weight:500">${esc(anmeldungId)}</td></tr>
            <tr><td style="padding:6px 0;color:#6C7871">Name</td><td style="padding:6px 0;font-weight:500">${esc(name)}</td></tr>
            <tr><td style="padding:6px 0;color:#6C7871">Termin</td><td style="padding:6px 0;font-weight:500">${esc(dateFormatted)}</td></tr>
            <tr><td style="padding:6px 0;color:#6C7871">Personen</td><td style="padding:6px 0;font-weight:500">${esc(personen)}</td></tr>
          </table>
        </div>
        <div style="margin-bottom:20px;text-align:center">
          <a href="https://steg1possenhofen.de/fondue-anmeldung?token=${manageToken}" style="display:inline-block;padding:12px 28px;background:#fff;border:1.5px solid #2A7B6F;border-radius:100px;text-decoration:none;color:#2A7B6F;font-size:13px;font-weight:500">Anmeldung ansehen</a>
        </div>
        <p style="color:#4A4840;font-size:14px;margin:0">Wir freuen uns auf einen gem&uuml;tlichen Abend im Zelt!</p>
      </div>
      <div style="border-top:1px solid #E4D9C4;padding:20px 28px;text-align:center">
        <p style="color:#6C7871;font-size:12px;margin:0">Steg 1 Possenhofen &middot; Am Starnberger See</p>
      </div>
    </div>
  `;
}

serve(async (req) => {
  const cors = corsHeadersFor(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405, cors);

  const isAdmin = await verifyAdmin(req.headers.get("authorization"));
  if (!isAdmin) return jsonResponse({ error: "unauthorized" }, 401, cors);

  let body: any;
  try { body = await req.json(); } catch { return jsonResponse({ error: "invalid_json" }, 400, cors); }
  const terminId = String(body?.terminId ?? "");
  if (!UUID_RE.test(terminId)) return jsonResponse({ error: "invalid_termin" }, 400, cors);

  const terminRes = await pg(`fondue_termine?id=eq.${terminId}&select=id,date`);
  const terminRows = terminRes.ok ? await terminRes.json() : [];
  if (!terminRows.length) return jsonResponse({ error: "termin_not_found" }, 404, cors);
  const dateFormatted = dateFormattedDe(terminRows[0].date);

  const anmeldRes = await pg(`fondue_anmeldungen?termin_id=eq.${terminId}&status=eq.vorgemerkt&select=id,anmeldung_id,manage_token,customer_name,customer_email,personen_anzahl`);
  if (!anmeldRes.ok) return jsonResponse({ error: "anmeldungen_lookup_failed" }, 500, cors);
  const anmeldungen = await anmeldRes.json();

  let sent = 0;
  for (const a of anmeldungen) {
    const patchRes = await pg(`fondue_anmeldungen?id=eq.${a.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "bestaetigt" }),
    });
    if (!patchRes.ok) {
      console.error("[send-fondue-confirmation] status update failed", a.id);
      continue;
    }
    try {
      const mailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify({
          from: "Steg 1 Possenhofen <reservierung@steg1possenhofen.de>",
          to: [a.customer_email],
          bcc: ["reservierung@steg1possenhofen.de"],
          reply_to: "reservierung@steg1possenhofen.de",
          subject: `Dein Winterzauber-Termin am ${dateFormatted} ist bestätigt`,
          html: buildConfirmationHtml(a.customer_name, a.anmeldung_id, a.manage_token, dateFormatted, a.personen_anzahl),
        }),
      });
      if (mailRes.ok) {
        await bumpQuota(2);
        sent++;
      } else {
        console.error("[send-fondue-confirmation] mail failed", a.id, mailRes.status);
      }
    } catch (e) {
      console.error("[send-fondue-confirmation] mail exception", a.id, e);
    }
  }

  // Termin explizit auf bestaetigt setzen (Trigger überschreibt bestaetigt/abgesagt nicht mehr automatisch)
  await pg(`fondue_termine?id=eq.${terminId}`, { method: "PATCH", body: JSON.stringify({ status: "bestaetigt" }) });

  return jsonResponse({ total: anmeldungen.length, sent }, 200, cors);
});
