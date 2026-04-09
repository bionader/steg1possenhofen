import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const HCAPTCHA_SECRET = Deno.env.get("HCAPTCHA_SECRET");

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

  const { token } = await req.json();

  if (!token) {
    return new Response(JSON.stringify({ success: false, error: "Missing captcha token" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Verify token with hCaptcha API
  const res = await fetch("https://api.hcaptcha.com/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `response=${token}&secret=${HCAPTCHA_SECRET}`,
  });

  const data = await res.json();

  return new Response(JSON.stringify({ success: data.success }), {
    status: data.success ? 200 : 403,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
