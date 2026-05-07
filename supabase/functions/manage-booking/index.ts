// Edge Function: manage-booking
// Zweck: Token-basierter Zugriff auf eine einzelne Buchung (load/cancel/update),
// ersetzt die bisherigen direkten /rest/v1/bookings?manage_token=eq.X-Aufrufe
// im Frontend. RLS auf `bookings` ist für anon zugemacht — nur diese Function
// (mit Service-Role) darf lesen/ändern, und nur, wenn ein gültiger Token
// mitgeschickt wird.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Allowlist: nur unsere eigene Domain darf diese Function aus dem Browser rufen.
// (Punkt #3 aus dem Review — wird hier direkt mit umgesetzt.)
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

// Strenger UUID-Check, bevor wir den Token an PostgREST weitergeben.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonResponse(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

async function findBookingByToken(token: string) {
  const url = `${SUPABASE_URL}/rest/v1/bookings?manage_token=eq.${encodeURIComponent(token)}&select=*&limit=1`;
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

async function patchBookingByToken(token: string, patch: Record<string, unknown>) {
  const url = `${SUPABASE_URL}/rest/v1/bookings?manage_token=eq.${encodeURIComponent(token)}`;
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

// Whitelist der Felder, die per "update" überschrieben werden dürfen.
// Verhindert, dass ein Angreifer z.B. status, manage_token, booking_id oder
// customer_email manipuliert.
const UPDATABLE_FIELDS = new Set([
  "date",
  "start_time",
  "end_time",
  "board_count",
  "total_price",
]);

function sanitizeUpdatePayload(input: Record<string, unknown>) {
  const clean: Record<string, unknown> = {};
  for (const k of Object.keys(input)) {
    if (UPDATABLE_FIELDS.has(k)) clean[k] = input[k];
  }
  return clean;
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const cors = corsHeadersFor(origin);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  // ── GET: Buchung laden ────────────────────────────────────────────────────
  if (req.method === "GET") {
    const url = new URL(req.url);
    const token = url.searchParams.get("token") ?? "";
    if (!UUID_RE.test(token)) {
      return jsonResponse({ error: "invalid_token" }, 400, cors);
    }
    const row = await findBookingByToken(token);
    if (!row) return jsonResponse({ error: "not_found" }, 404, cors);
    return jsonResponse(row, 200, cors);
  }

  // ── POST: cancel / update ─────────────────────────────────────────────────
  if (req.method === "POST") {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "invalid_json" }, 400, cors);
    }

    const token = String(body?.token ?? "");
    const action = String(body?.action ?? "");
    if (!UUID_RE.test(token)) {
      return jsonResponse({ error: "invalid_token" }, 400, cors);
    }

    // Existenz prüfen, damit wir bei "update" auf einer toten Buchung nicht still PATCHen
    const existing = await findBookingByToken(token);
    if (!existing) return jsonResponse({ error: "not_found" }, 404, cors);

    if (action === "cancel") {
      if (existing.status === "cancelled") {
        return jsonResponse(existing, 200, cors); // idempotent
      }
      const result = await patchBookingByToken(token, { status: "cancelled" });
      if (!result.ok) return jsonResponse({ error: "patch_failed", detail: result.error }, 500, cors);
      return jsonResponse(result.row, 200, cors);
    }

    if (action === "update") {
      if (existing.status === "cancelled") {
        return jsonResponse({ error: "already_cancelled" }, 409, cors);
      }
      const patch = sanitizeUpdatePayload(body?.patch ?? {});
      if (Object.keys(patch).length === 0) {
        return jsonResponse({ error: "empty_patch" }, 400, cors);
      }
      const result = await patchBookingByToken(token, patch);
      if (!result.ok) return jsonResponse({ error: "patch_failed", detail: result.error }, 500, cors);
      return jsonResponse(result.row, 200, cors);
    }

    return jsonResponse({ error: "unknown_action" }, 400, cors);
  }

  return jsonResponse({ error: "method_not_allowed" }, 405, cors);
});
