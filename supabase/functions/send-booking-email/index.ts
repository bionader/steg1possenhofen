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
      <p>deine Reservierung bei <strong>Steg eins Possenhofen</strong> ist best&auml;tigt!</p>
      <div style="background:#F4EDD8;border-radius:12px;padding:16px;margin:16px 0">
        <p style="margin:4px 0"><strong>Datum:</strong> ${dateFormatted}</p>
        <p style="margin:4px 0"><strong>Zeit:</strong> ${startTime} &ndash; ${endTime} Uhr</p>
        <p style="margin:4px 0"><strong>Boards:</strong> ${boards}</p>
        <p style="margin:4px 0"><strong>Preis:</strong> ${price} &euro; (Bezahlung vor Ort)</p>
      </div>
      <p><strong>Adresse:</strong> Steg 1, Possenhofen am Starnberger See</p>
      <p style="margin-top:16px">Bis bald am See! &#x1F30A;</p>
      <hr style="border:none;border-top:1px solid #E6D9B8;margin:20px 0">
      <p style="color:#7A7668;font-size:13px">Steg eins Possenhofen &middot; Biergarten &amp; SUP-Verleih</p>
    </div>
  `;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: "Steg eins <noreply@steg1possenhofen.de>",
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
