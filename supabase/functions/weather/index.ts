import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Live-Wetter für Possenhofen (Starnberger See) via OpenWeatherMap.
// API-Key bleibt serverseitig — Frontend bekommt nur das fertige JSON.
const OWM_API_KEY = Deno.env.get("OWM_API_KEY");

// Possenhofen Koordinaten
const LAT = 47.9705;
const LON = 11.3074;

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

// Wetter-Hauptkategorie -> Unicode-Icon (gleiches Mapping wie vorher im Frontend)
const ICONS: Record<string, string> = {
  Clear: "☀",
  Clouds: "☁",
  Rain: "🌧",
  Drizzle: "🌧",
  Snow: "❄",
  Thunderstorm: "⚡",
};

const DIRS = ["N", "NO", "O", "SO", "S", "SW", "W", "NW"];

serve(async (req) => {
  const corsHeaders = corsHeadersFor(req.headers.get("origin"));

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!OWM_API_KEY) {
    console.error("[weather] OWM_API_KEY missing");
    return new Response(JSON.stringify({ error: "config_missing" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${LAT}&lon=${LON}&appid=${OWM_API_KEY}&units=metric&lang=de`;
    const res = await fetch(url);
    const d = await res.json();

    if (!res.ok || (d.cod && d.cod !== 200)) {
      console.error("[weather] OWM error", d);
      return new Response(JSON.stringify({ error: "owm_error" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const main = d.weather?.[0]?.main ?? "Clear";
    const result = {
      icon: ICONS[main] || "☀",
      temp: Math.round(d.main.temp),
      windSpeed: Math.round(d.wind.speed * 3.6), // m/s -> km/h
      windDir: DIRS[Math.round(d.wind.deg / 45) % 8],
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[weather] fetch exception", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
