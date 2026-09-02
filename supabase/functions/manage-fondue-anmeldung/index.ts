// Edge Function: manage-fondue-anmeldung
// Token-basierter Zugriff auf eine Fondue-Anmeldung (load/cancel).
// RLS auf fondue_anmeldungen ist für anon komplett zu — nur diese Function
// (Service-Role) darf lesen/ändern, nur mit gültigem Token.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const ALLOWED_ORIGINS = [
  "https://steg1possenhofen.de",
  "https://www.steg1possenhofen.de",
];

function corsHeadersFor(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function dateFormattedDe(yyyymmdd: string): string {
  return yyyymmdd.split("-").reverse().join(".");
}

async function bumpQuota(times = 1) {
  for (let i = 0; i < times; i++) {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/rpc/increment_email_quota`, {
        method: "POST",
        headers: {
          "apikey": SUPABASE_SERVICE_ROLE_KEY,
          "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: "{}",
      });
    } catch (_) {
      // Silent fail — Quota-Zähler ist nicht kritisch für den Stornierungs-Flow
    }
  }
}

// Storno-Mail: 1:1 übernommen aus dem ehemaligen send-fondue-cancel/index.ts
// (Finding 1 — dieser Endpoint hier hat bereits Service-Role-Zugriff und einen
// verifizierten UUID-Token, das ist die korrekte Vertrauensgrenze für den Mailversand).
async function sendStornoMail(email: string, name: string, dateFormattedStr: string, anmeldungId: string, personen: number | string) {
  const html = `
    <style>@import url('https://fonts.googleapis.com/css2?family=Albert+Sans:wght@300;400;500;600&family=Petrona:ital,wght@0,500;0,600;1,400;1,600&display=swap');</style>
    <div style="font-family:'Albert Sans',Arial,sans-serif;max-width:520px;margin:0 auto;background:#FDFAF4;border-radius:16px;overflow:hidden">
      <div style="background:#163D36;padding:32px 28px 24px;text-align:center">
        <h1 style="font-family:'Petrona',Georgia,serif;color:#FDFAF4;font-size:22px;font-weight:600;margin:0">Steg 1 Possenhofen</h1>
        <p style="color:rgba(255,255,255,.7);font-size:13px;margin:6px 0 0">Winterzauber &mdash; K&auml;sefondue im beheizten Zelt</p>
      </div>
      <div style="padding:28px">
        <h2 style="font-family:'Petrona',Georgia,serif;color:#163D36;font-size:20px;font-weight:600;margin:0 0 8px">Anmeldung storniert</h2>
        <p style="color:#4A4840;font-size:14px;margin:0 0 16px">Hallo ${esc(name)}, deine Anmeldung zum Winterzauber am ${esc(dateFormattedStr)} wurde storniert.</p>
        <div style="background:#F2EBD9;border-radius:12px;padding:20px;margin:0 0 20px">
          <table style="width:100%;border-collapse:collapse;font-size:14px;color:#1A2421">
            ${anmeldungId ? `<tr><td style="padding:6px 0;color:#6C7871;width:110px">Anmeldung</td><td style="padding:6px 0;font-weight:500">${esc(anmeldungId)}</td></tr>` : ""}
            <tr><td style="padding:6px 0;color:#6C7871">Name</td><td style="padding:6px 0;font-weight:500">${esc(name)}</td></tr>
            <tr><td style="padding:6px 0;color:#6C7871">Termin</td><td style="padding:6px 0;font-weight:500">${esc(dateFormattedStr)}</td></tr>
            <tr><td style="padding:6px 0;color:#6C7871">Personen</td><td style="padding:6px 0;font-weight:500">${esc(personen)}</td></tr>
          </table>
        </div>
        <p style="color:#4A4840;font-size:14px;margin:0">Schade, dass es diesmal nicht klappt &mdash; wir hoffen, dich bald am Steg 1 begr&uuml;&szlig;en zu d&uuml;rfen.</p>
      </div>
      <div style="border-top:1px solid #E4D9C4;padding:20px 28px;text-align:center">
        <p style="color:#6C7871;font-size:12px;margin:0">Steg 1 Possenhofen &middot; Am Starnberger See</p>
      </div>
    </div>
  `;

  const text = [
    `Steg 1 Possenhofen — Winterzauber`,
    ``,
    `ANMELDUNG STORNIERT`,
    ``,
    `Hallo ${name}, deine Anmeldung zum Winterzauber am ${dateFormattedStr} wurde storniert.`,
    anmeldungId ? `Anmeldung: ${anmeldungId}` : null,
    `Name: ${name}`,
    `Personen: ${personen}`,
    ``,
    `Wir hoffen, dich bald am Steg 1 begrüßen zu dürfen.`,
  ].filter(Boolean).join("\n");

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: "Steg 1 Possenhofen <reservierung@steg1possenhofen.de>",
        to: [email],
        bcc: ["reservierung@steg1possenhofen.de"],
        reply_to: "reservierung@steg1possenhofen.de",
        subject: `Deine Winterzauber-Anmeldung am ${dateFormattedStr} wurde storniert`,
        html,
        text,
      }),
    });
    if (res.ok) {
      await bumpQuota(2);
    } else {
      console.error("[manage-fondue-anmeldung] storno mail failed", res.status, await res.text());
    }
  } catch (e) {
    console.error("[manage-fondue-anmeldung] storno mail exception", e);
  }
}

function jsonResponse(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

async function findAnmeldungByToken(token: string) {
  const url = `${SUPABASE_URL}/rest/v1/fondue_anmeldungen?manage_token=eq.${encodeURIComponent(token)}&select=*,fondue_termine(date,status)&limit=1`;
  const res = await fetch(url, {
    headers: {
      "apikey": SUPABASE_SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

async function patchAnmeldungByToken(token: string, patch: Record<string, unknown>) {
  const url = `${SUPABASE_URL}/rest/v1/fondue_anmeldungen?manage_token=eq.${encodeURIComponent(token)}&select=*,fondue_termine(date,status)`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      "apikey": SUPABASE_SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
    },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const errText = await res.text();
    return { ok: false, status: res.status, error: errText };
  }
  const rows = await res.json();
  return { ok: true, row: Array.isArray(rows) && rows.length > 0 ? rows[0] : null };
}

serve(async (req) => {
  const cors = corsHeadersFor(req.headers.get("origin"));

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  if (req.method === "GET") {
    const url = new URL(req.url);
    const token = url.searchParams.get("token") ?? "";
    if (!UUID_RE.test(token)) return jsonResponse({ error: "invalid_token" }, 400, cors);
    const row = await findAnmeldungByToken(token);
    if (!row) return jsonResponse({ error: "not_found" }, 404, cors);
    return jsonResponse(row, 200, cors);
  }

  if (req.method === "POST") {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "invalid_json" }, 400, cors);
    }

    const token = String(body?.token ?? "");
    const action = String(body?.action ?? "");
    if (!UUID_RE.test(token)) return jsonResponse({ error: "invalid_token" }, 400, cors);

    const existing = await findAnmeldungByToken(token);
    if (!existing) return jsonResponse({ error: "not_found" }, 404, cors);

    if (action === "cancel") {
      if (existing.status === "storniert") {
        return jsonResponse(existing, 200, cors); // idempotent — keine erneute Mail
      }
      const result = await patchAnmeldungByToken(token, { status: "storniert" });
      if (!result.ok) return jsonResponse({ error: "patch_failed", detail: result.error }, 500, cors);
      // Storno-Mail nur bei echtem vorgemerkt/bestaetigt → storniert Übergang (dieser Zweig
      // hier, nicht der idempotente Early-Return oben) — verhindert Endlos-Resend bei
      // wiederholten Cancel-Aufrufen (Finding 1).
      const row = result.row;
      if (row) {
        const dateFmt = row.fondue_termine?.date ? dateFormattedDe(row.fondue_termine.date) : "";
        await sendStornoMail(row.customer_email, row.customer_name, dateFmt, row.anmeldung_id, row.personen_anzahl);
      }
      return jsonResponse(row, 200, cors);
    }

    return jsonResponse({ error: "unknown_action" }, 400, cors);
  }

  return jsonResponse({ error: "method_not_allowed" }, 405, cors);
});
