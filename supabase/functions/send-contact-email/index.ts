import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

// Atomic-Increment via RPC — schlaegt Quota-Limit fehl, wird Mail trotzdem versendet
async function bumpQuota() {
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
    // Silent fail — Counter darf Mail-Versand niemals blockieren
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const { name, email, phone, subject, message } = await req.json();

  // Minimal escape for HTML interpolation (user input)
  const esc = (s: string) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const nameH = esc(name);
  const emailH = esc(email);
  const phoneH = phone ? esc(phone) : "nicht angegeben";
  const subjectH = esc(subject);
  const messageH = esc(message);

  // Prefilled reply-mailto so we can answer directly from inbox
  const replySubject = encodeURIComponent(`Re: ${subject}`);
  const replyBody = encodeURIComponent(
    `Hallo ${name},\n\n\n\n---\nUrsprüngliche Nachricht:\n${message}`
  );
  const replyHref = `mailto:${email}?subject=${replySubject}&body=${replyBody}`;

  const html = `
    <div style="font-family:'DM Sans',Arial,sans-serif;max-width:520px;margin:0 auto;background:#FDFAF4;border-radius:16px;overflow:hidden">
      <!-- Header -->
      <div style="background:#163D36;padding:28px 28px 22px;text-align:center">
        <h1 style="font-family:'Cormorant Garamond',Georgia,serif;color:#FDFAF4;font-size:22px;font-weight:600;margin:0;letter-spacing:.02em">Steg 1 Possenhofen</h1>
        <p style="color:rgba(253,250,244,.7);font-size:12px;margin:6px 0 0;letter-spacing:.06em;text-transform:uppercase">Neue Kontaktanfrage</p>
      </div>

      <!-- Body -->
      <div style="padding:28px">
        <h2 style="font-family:'Cormorant Garamond',Georgia,serif;color:#163D36;font-size:22px;font-weight:600;margin:0 0 6px">Nachricht von ${nameH}</h2>
        <p style="color:#7A7668;font-size:13px;margin:0 0 20px">${subjectH}</p>

        <!-- Absender-Card -->
        <div style="background:#F4EDD8;border-radius:12px;padding:18px 20px;margin-bottom:16px">
          <table style="width:100%;border-collapse:collapse;font-size:14px;color:#18180F">
            <tr>
              <td style="padding:6px 0;color:#7A7668;width:90px;vertical-align:top">Name</td>
              <td style="padding:6px 0;font-weight:500">${nameH}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#7A7668;vertical-align:top">E-Mail</td>
              <td style="padding:6px 0;font-weight:500"><a href="mailto:${emailH}" style="color:#163D36;text-decoration:none">${emailH}</a></td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#7A7668;vertical-align:top">Telefon</td>
              <td style="padding:6px 0;font-weight:500">${phoneH}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#7A7668;vertical-align:top">Betreff</td>
              <td style="padding:6px 0;font-weight:500">${subjectH}</td>
            </tr>
          </table>
        </div>

        <!-- Nachricht-Card -->
        <div style="background:#FDFAF4;border:1px solid #E6D9B8;border-radius:12px;padding:18px 20px;margin-bottom:22px">
          <p style="font-size:12px;color:#7A7668;letter-spacing:.06em;text-transform:uppercase;margin:0 0 10px">Nachricht</p>
          <p style="white-space:pre-wrap;color:#18180F;font-size:14px;line-height:1.6;margin:0">${messageH}</p>
        </div>

        <!-- Reply CTA -->
        <div style="text-align:center;margin-bottom:6px">
          <a href="${replyHref}" style="display:inline-block;padding:12px 28px;background:#2A7B6F;color:#FDFAF4;border-radius:100px;text-decoration:none;font-size:13px;font-weight:500;letter-spacing:.02em">Direkt antworten</a>
        </div>
      </div>

      <!-- Footer -->
      <div style="border-top:1px solid #E6D9B8;padding:16px 28px;text-align:center">
        <p style="color:#7A7668;font-size:12px;margin:0">Gesendet über das Kontaktformular auf <a href="https://steg1possenhofen.de" style="color:#163D36;text-decoration:none;font-weight:500">steg1possenhofen.de</a></p>
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
      from: "Steg 1 Website <info@steg1possenhofen.de>",
      to: ["info@steg1possenhofen.de"],
      reply_to: email,
      subject: `Kontaktanfrage: ${subject}`,
      html: html,
    }),
  });

  const data = await res.json();
  if (res.ok) await bumpQuota();
  return new Response(JSON.stringify(data), {
    status: res.ok ? 200 : 500,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
