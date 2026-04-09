import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Cache-Control": "public, max-age=900", // 15 min cache
};

serve(async (req) => {
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
