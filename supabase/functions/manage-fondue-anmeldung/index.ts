// Edge Function: manage-fondue-anmeldung
// Token-basierter Zugriff auf eine Fondue-Anmeldung (load/cancel).
// RLS auf fondue_anmeldungen ist für anon komplett zu — nur diese Function
// (Service-Role) darf lesen/ändern, nur mit gültigem Token.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
  const url = `${SUPABASE_URL}/rest/v1/fondue_anmeldungen?manage_token=eq.${encodeURIComponent(token)}`;
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
        return jsonResponse(existing, 200, cors); // idempotent
      }
      const result = await patchAnmeldungByToken(token, { status: "storniert" });
      if (!result.ok) return jsonResponse({ error: "patch_failed", detail: result.error }, 500, cors);
      return jsonResponse(result.row, 200, cors);
    }

    return jsonResponse({ error: "unknown_action" }, 400, cors);
  }

  return jsonResponse({ error: "method_not_allowed" }, 405, cors);
});
