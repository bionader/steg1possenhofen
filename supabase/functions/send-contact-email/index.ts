import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

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

  const html = `
    <div style="font-family:'DM Sans',Arial,sans-serif;max-width:500px;margin:0 auto;padding:24px">
      <h2 style="font-family:Georgia,serif;color:#E8732A">Neue Kontaktanfrage</h2>
      <div style="background:#F4EDD8;border-radius:12px;padding:16px;margin:16px 0">
        <p style="margin:4px 0"><strong>Name:</strong> ${name}</p>
        <p style="margin:4px 0"><strong>E-Mail:</strong> ${email}</p>
        <p style="margin:4px 0"><strong>Telefon:</strong> ${phone || 'nicht angegeben'}</p>
        <p style="margin:4px 0"><strong>Betreff:</strong> ${subject}</p>
      </div>
      <div style="background:#FDFAF4;border:1px solid #E6D9B8;border-radius:12px;padding:16px;margin:16px 0">
        <p style="white-space:pre-wrap">${message}</p>
      </div>
      <hr style="border:none;border-top:1px solid #E6D9B8;margin:20px 0">
      <p style="color:#7A7668;font-size:13px">Gesendet über das Kontaktformular auf steg1possenhofen.de</p>
    </div>
  `;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: "Steg 1 Website <noreply@steg1possenhofen.de>",
      to: ["info@steg1possenhofen.de"],
      reply_to: email,
      subject: `Kontaktanfrage: ${subject}`,
      html: html,
    }),
  });

  const data = await res.json();
  return new Response(JSON.stringify(data), {
    status: res.ok ? 200 : 500,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
