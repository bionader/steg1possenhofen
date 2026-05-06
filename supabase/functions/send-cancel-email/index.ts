import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Atomic-Increment via RPC — Counter darf Mail-Versand niemals blockieren
// Mail an Gast + BCC an hallo@ = 2 Mails pro Storno
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
    } catch (_) {
      // Silent fail
    }
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const { email, name, date, startTime, endTime, boards, price, bookingId, reason } = await req.json();
  const dateFormatted = date.split("-").reverse().join(".");

  const html = `
    <div style="font-family:'DM Sans',Arial,sans-serif;max-width:520px;margin:0 auto;background:#FDFAF4;border-radius:16px;overflow:hidden">
      <!-- Header -->
      <div style="background:#163D36;padding:32px 28px 24px;text-align:center">
        <h1 style="font-family:'Cormorant Garamond',Georgia,serif;color:#FDFAF4;font-size:22px;font-weight:600;margin:0">Steg 1 Possenhofen</h1>
        <p style="color:rgba(255,255,255,.7);font-size:13px;margin:6px 0 0">Biergarten &amp; SUP-Verleih am Starnberger See</p>
      </div>

      <!-- Body -->
      <div style="padding:28px">
        <h2 style="font-family:'Cormorant Garamond',Georgia,serif;color:#163D36;font-size:20px;font-weight:600;margin:0 0 8px">Buchung storniert</h2>
        <p style="color:#4A4840;font-size:14px;margin:0 0 20px">Hallo ${name}, deine Buchung wurde leider storniert.</p>

        <!-- Details Card -->
        <div style="background:#F4EDD8;border-radius:12px;padding:20px;margin-bottom:20px">
          <table style="width:100%;border-collapse:collapse;font-size:14px;color:#18180F">
            ${bookingId ? `<tr>
              <td style="padding:6px 0;color:#7A7668;width:100px">Buchung</td>
              <td style="padding:6px 0;font-weight:500">${bookingId}</td>
            </tr>` : ""}
            <tr>
              <td style="padding:6px 0;color:#7A7668;width:100px">Datum</td>
              <td style="padding:6px 0;font-weight:500">${dateFormatted}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#7A7668">Zeit</td>
              <td style="padding:6px 0;font-weight:500">${startTime} &ndash; ${endTime} Uhr</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#7A7668">Boards</td>
              <td style="padding:6px 0;font-weight:500">${boards}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#7A7668">Preis</td>
              <td style="padding:6px 0;font-weight:500">${price} &euro; &middot; Bezahlung vor Ort</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#7A7668">Status</td>
              <td style="padding:6px 0;font-weight:600;color:#D94F4F">Storniert</td>
            </tr>
          </table>
        </div>

        <!-- Stornierungsgrund -->
        <div style="background:#fff;border-left:3px solid #D94F4F;padding:14px 16px;border-radius:0 12px 12px 0;margin-bottom:20px">
          <p style="color:#7A7668;font-size:12px;margin:0 0 4px">Grund der Stornierung:</p>
          <p style="color:#18180F;font-size:14px;margin:0">${reason}</p>
        </div>

        <p style="color:#4A4840;font-size:14px;margin:0 0 4px">Bei Fragen erreichst du uns unter:</p>
        <p style="margin:0 0 6px"><a href="mailto:hallo@steg1possenhofen.de" style="color:#163D36;font-weight:500;text-decoration:none">hallo@steg1possenhofen.de</a></p>
        <p style="margin:0 0 20px;font-size:14px">Anruf/WhatsApp: <a href="tel:+4917881189224" style="color:#163D36;font-weight:500;text-decoration:none">+4917881189224</a></p>

        <p style="color:#4A4840;font-size:15px;margin:0">Dein Steg <span style="font-family:'DM Sans',Arial,sans-serif">1</span> Team</p>
      </div>

      <!-- Footer -->
      <div style="border-top:1px solid #E6D9B8;padding:20px 28px;text-align:center">
        <a href="https://instagram.com/steg1possenhofen" style="display:inline-block;padding:10px 24px;background:#163D36;color:#FDFAF4;border-radius:100px;text-decoration:none;font-size:13px;font-weight:500">&#x1F4F7; @steg1possenhofen</a>
        <p style="color:#7A7668;font-size:12px;margin:12px 0 0">Steg <span style="font-family:'DM Sans',Arial,sans-serif">1</span> Possenhofen &middot; Am Starnberger See</p>
      </div>
    </div>
  `;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: "Steg 1 Possenhofen <hallo@steg1possenhofen.de>",
      to: [email],
      bcc: ["hallo@steg1possenhofen.de"],
      subject: `Deine SUP-Buchung am ${dateFormatted} wurde storniert`,
      html: html,
    }),
  });

  const data = await res.json();
  if (res.ok) await bumpQuota(2); // Gast + BCC hallo@
  return new Response(JSON.stringify(data), {
    status: res.ok ? 200 : 500,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
