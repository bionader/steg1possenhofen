import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const { email, name, date, startTime, endTime, boards, price } = await req.json();
  const dateFormatted = date.split("-").reverse().join(".");

  const html = `
    <div style="font-family:'DM Sans',Arial,sans-serif;max-width:500px;margin:0 auto;padding:24px">
      <h2 style="font-family:Georgia,serif;color:#E8732A">Deine SUP-Reservierung</h2>
      <p>Hallo ${name},</p>
      <p>deine Reservierung bei <strong>Steg 1 Possenhofen</strong> ist best&auml;tigt!</p>
      <div style="background:#F4EDD8;border-radius:12px;padding:16px;margin:16px 0">
        <p style="margin:4px 0"><strong>Datum:</strong> ${dateFormatted}</p>
        <p style="margin:4px 0"><strong>Zeit:</strong> ${startTime} &ndash; ${endTime} Uhr</p>
        <p style="margin:4px 0"><strong>Boards:</strong> ${boards}</p>
        <p style="margin:4px 0"><strong>Preis:</strong> ${price} &euro; (Bezahlung vor Ort)</p>
      </div>
      <a href="https://maps.app.goo.gl/zWXKJMa6xTqqu4ot9?g_st=ic" style="display:block;margin:16px 0;padding:14px 16px;background:#FDFAF4;border:1.5px solid #E6D9B8;border-radius:12px;text-decoration:none;color:#18180F">
        <strong style="font-size:14px">&#x1F4CD; Steg 1, Possenhofen am Starnberger See</strong>
        <span style="display:block;font-size:12px;color:#E8732A;margin-top:4px">In Google Maps &ouml;ffnen &rarr;</span>
      </a>
      <p>Bei Fragen: <a href="mailto:hallo@steg1possenhofen.de" style="color:#E8732A">hallo@steg1possenhofen.de</a></p>
      <p style="margin-top:16px">Bis bald am See! &#x1F30A;</p>
      <hr style="border:none;border-top:1px solid #E6D9B8;margin:20px 0">
      <div style="text-align:center">
        <a href="https://instagram.com/steg1possenhofen" style="display:inline-block;padding:8px 20px;background:#E8732A;color:white;border-radius:100px;text-decoration:none;font-size:13px;font-weight:600">&#x1F4F7; @steg1possenhofen</a>
      </div>
      <p style="color:#7A7668;font-size:13px;text-align:center;margin-top:16px">Steg 1 Possenhofen &middot; Biergarten &amp; SUP-Verleih</p>
    </div>
  `;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: "Steg 1 Possenhofen <noreply@steg1possenhofen.de>",
      to: [email],
      subject: `Deine SUP-Reservierung am ${dateFormatted}`,
      html: html,
    }),
  });

  const data = await res.json();
  return new Response(JSON.stringify(data), {
    status: res.ok ? 200 : 500,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
