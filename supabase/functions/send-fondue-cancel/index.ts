import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

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

async function bumpQuota(times = 1) {
  for (let i = 0; i < times; i++) {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/rpc/increment_email_quota`, {
        method: "POST",
        headers: {
          "apikey": SUPABASE_SERVICE_ROLE_KEY!,
          "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: "{}",
      });
    } catch (_) {}
  }
}

function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

serve(async (req) => {
  const corsHeaders = corsHeadersFor(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  const { email, name, dateFormatted, anmeldungId } = await req.json();
  if (!email || !name || !dateFormatted) {
    return new Response(JSON.stringify({ error: "missing_fields" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const html = `
    <style>@import url('https://fonts.googleapis.com/css2?family=Albert+Sans:wght@300;400;500;600&family=Petrona:ital,wght@0,500;0,600;1,400;1,600&display=swap');</style>
    <div style="font-family:'Albert Sans',Arial,sans-serif;max-width:520px;margin:0 auto;background:#FDFAF4;border-radius:16px;overflow:hidden">
      <div style="background:#163D36;padding:32px 28px 24px;text-align:center">
        <h1 style="font-family:'Petrona',Georgia,serif;color:#FDFAF4;font-size:22px;font-weight:600;margin:0">Steg 1 Possenhofen</h1>
        <p style="color:rgba(255,255,255,.7);font-size:13px;margin:6px 0 0">Winterzauber &mdash; K&auml;sefondue im beheizten Zelt</p>
      </div>
      <div style="padding:28px">
        <h2 style="font-family:'Petrona',Georgia,serif;color:#163D36;font-size:20px;font-weight:600;margin:0 0 8px">Anmeldung storniert</h2>
        <p style="color:#4A4840;font-size:14px;margin:0 0 16px">Hallo ${esc(name)}, deine Anmeldung zum Winterzauber am ${esc(dateFormatted)} wurde storniert.</p>
        <p style="color:#6C7871;font-size:12px;margin:0 0 20px">${anmeldungId ? "Anmeldung " + esc(anmeldungId) : ""}</p>
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
    `Hallo ${name}, deine Anmeldung zum Winterzauber am ${dateFormatted} wurde storniert.`,
    anmeldungId ? `Anmeldung: ${anmeldungId}` : null,
    ``,
    `Wir hoffen, dich bald am Steg 1 begrüßen zu dürfen.`,
  ].filter(Boolean).join("\n");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({
      from: "Steg 1 Possenhofen <hallo@steg1possenhofen.de>",
      to: [email],
      bcc: ["hallo@steg1possenhofen.de"],
      subject: `Deine Winterzauber-Anmeldung am ${dateFormatted} wurde storniert`,
      html,
      text,
    }),
  });

  const data = await res.json();
  if (res.ok) await bumpQuota(2);
  return new Response(JSON.stringify(data), {
    status: res.ok ? 200 : 500,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
