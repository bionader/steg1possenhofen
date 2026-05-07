import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// CORS-Whitelist: nur eigene Domain darf diese Function aus dem Browser rufen.
const ALLOWED_ORIGINS = [
  "https://steg1possenhofen.de",
  "https://www.steg1possenhofen.de",
];

function corsHeadersFor(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Cache-Control": "public, max-age=900", // 15 min cache
    "Vary": "Origin",
  };
}

serve(async (req) => {
  const corsHeaders = corsHeadersFor(req.headers.get("origin"));

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = "https://www.gkd.bayern.de/en/lakes/watertemperature/isar/starnberg-16663002/current-values/table";
    const res = await fetch(url, {
      headers: { "User-Agent": "Steg1Possenhofen/1.0" },
    });
    const html = await res.text();

    // Parse temperature from HTML table — last value in the table
    const matches = [...html.matchAll(/<td[^>]*class="[^"]*center[^"]*"[^>]*>([\d]+[.,]\d+)<\/td>/g)];
    let temp = null;

    if (matches.length > 0) {
      // Take the last match (most recent measurement)
      temp = parseFloat(matches[matches.length - 1][1].replace(",", "."));
    }

    return new Response(JSON.stringify({ temperature: temp }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ temperature: null, error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
