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
    <div style="font-family:'DM Sans',Arial,sans-serif;max-width:520px;margin:0 auto;background:#FDFAF4;border-radius:16px;overflow:hidden">
      <!-- Header -->
      <div style="background:#163D36;padding:32px 28px 24px;text-align:center">
        <h1 style="font-family:'Cormorant Garamond',Georgia,serif;color:#FDFAF4;font-size:22px;font-weight:600;margin:0">Steg 1 Possenhofen</h1>
        <p style="color:rgba(255,255,255,.7);font-size:13px;margin:6px 0 0">Biergarten &amp; SUP-Verleih am Starnberger See</p>
      </div>

      <!-- SUP Foto -->
      <img src="https://raw.githubusercontent.com/bionader/steg1possenhofen/main/images/sup-mail.jpg" alt="Steg 1 Possenhofen am Starnberger See" style="width:100%;display:block;max-height:260px;object-fit:cover;object-position:center 70%" />

      <!-- Body -->
      <div style="padding:28px">
        <h2 style="font-family:'Cormorant Garamond',Georgia,serif;color:#163D36;font-size:20px;font-weight:600;margin:0 0 8px">Deine SUP-Reservierung</h2>
        <p style="color:#4A4840;font-size:14px;margin:0 0 20px">Hallo ${name}, deine Reservierung ist best&auml;tigt!</p>

        <!-- Details Card -->
        <div style="background:#F4EDD8;border-radius:12px;padding:20px;margin-bottom:20px">
          <table style="width:100%;border-collapse:collapse;font-size:14px;color:#18180F">
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
          </table>
        </div>

        <!-- Maps Link -->
        <a href="https://maps.app.goo.gl/zWXKJMa6xTqqu4ot9?g_st=ic" style="display:flex;align-items:center;gap:12px;padding:14px 16px;background:#fff;border:1.5px solid #E6D9B8;border-radius:12px;text-decoration:none;color:#18180F;margin-bottom:20px">
          <span style="flex-shrink:0;width:36px;height:36px;background:#163D36;border-radius:50%;display:flex;align-items:center;justify-content:center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="#FDFAF4"/></svg>
          </span>
          <span>
            <strong style="font-size:14px;display:block">Steg 1, Possenhofen am Starnberger See</strong>
            <span style="font-size:12px;color:#163D36">In Google Maps &ouml;ffnen &rarr;</span>
          </span>
        </a>

        <p style="color:#4A4840;font-size:14px;margin:0 0 4px">Bei Fragen erreichst du uns unter:</p>
        <p style="margin:0 0 20px"><a href="mailto:hallo@steg1possenhofen.de" style="color:#163D36;font-weight:500;text-decoration:none">hallo@steg1possenhofen.de</a></p>

        <p style="color:#4A4840;font-size:15px;margin:0 0 8px">Wir freuen uns auf deinen Besuch am Steg 1.</p>
        <p style="color:#4A4840;font-size:15px;margin:0">Bis bald am See! &#x1F30A;</p>
      </div>

      <!-- Footer -->
      <div style="border-top:1px solid #E6D9B8;padding:20px 28px;text-align:center">
        <a href="https://instagram.com/steg1possenhofen" style="display:inline-block;padding:10px 24px;background:#163D36;color:#FDFAF4;border-radius:100px;text-decoration:none;font-size:13px;font-weight:500">&#x1F4F7; @steg1possenhofen</a>
        <p style="color:#7A7668;font-size:12px;margin:12px 0 0">Steg 1 Possenhofen &middot; Am Starnberger See</p>
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
