// Edge Function: update-fondue-anmeldung
// Von Mama im Admin ausgelöst ("Ändern" in der Teilnehmerliste): passt Fondue-Varianten
// (= Personenzahl) und Beilagen einer aktiven Anmeldung an, prüft Kapazität + Iglu-Platz,
// protokolliert die Änderung, markiert späte Reduzierungen und informiert den Gast per Mail.
// Auth: Supabase-Access-Token (authenticated, nicht Rolle sup/schedule_events).
// Spec: docs/superpowers/specs/2026-10-06-anmeldung-aendern-design.md

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { terminLabelDe, isWithinFeeWindow } from "../_shared/fondue-slot.ts";
import { aendere, aufteilungsSatz } from "../_shared/iglu-verteilung.js";
import { bereinigeMengen, summe, gleicheMengen, istReduzierung, type Mengen } from "../_shared/fondue-aenderung.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;

const ALLOWED_ORIGINS = [
  "https://steg1possenhofen.de",
  "https://www.steg1possenhofen.de",
];

function corsHeadersFor(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function jsonResponse(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

async function pg(path: string, init: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      "apikey": SUPABASE_SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

async function bumpQuota(times = 1) {
  for (let i = 0; i < times; i++) {
    try { await pg("rpc/increment_email_quota", { method: "POST", body: "{}" }); } catch (_) {}
  }
}

// Wie send-fondue-confirmation: eingeloggt UND nicht auf sup/schedule_events eingeschränkt
async function verifyAdmin(authHeader: string | null): Promise<boolean> {
  if (!authHeader) return false;
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { "apikey": SUPABASE_SERVICE_ROLE_KEY, "Authorization": `Bearer ${token}` },
  });
  if (!res.ok) return false;
  const user = await res.json();
  const role = user?.user_metadata?.role;
  return role !== "sup" && role !== "schedule_events";
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// "2x Klassisch" je Eintrag, Reihenfolge wie in der Stammdaten-Liste
function zeilen(mengen: Mengen, liste: { id: string; name: string }[]): string[] {
  return liste.filter((x) => mengen[x.id]).map((x) => `${mengen[x.id]}x ${x.name}`);
}

async function sendAenderungsMail(opts: {
  email: string; name: string; anmeldungId: string; manageToken: string; dateFormatted: string;
  personenAlt: number; personenNeu: number; fondueZeilen: string[]; beilagenZeilen: string[];
  preis: number; aufteilung: string;
}): Promise<boolean> {
  const { email, name, anmeldungId, manageToken, dateFormatted, personenAlt, personenNeu, fondueZeilen, beilagenZeilen, preis, aufteilung } = opts;
  const personenText = personenAlt === personenNeu ? String(personenNeu) : `${personenAlt} → ${personenNeu}`;
  const preheader = `Deine Anmeldung zum Winterzauber am ${dateFormatted} wurde angepasst.`;
  const html = `
    <style>@import url('https://fonts.googleapis.com/css2?family=Albert+Sans:wght@300;400;500;600&family=Petrona:ital,wght@0,500;0,600;1,400;1,600&display=swap');</style>
    <div style="display:none;max-height:0;overflow:hidden">${esc(preheader)}</div>
    <div style="font-family:'Albert Sans',Arial,sans-serif;max-width:520px;margin:0 auto;background:#FDFAF4;border-radius:16px;overflow:hidden">
      <div style="background:#163D36;padding:32px 28px 24px;text-align:center">
        <h1 style="font-family:'Petrona',Georgia,serif;color:#FDFAF4;font-size:22px;font-weight:600;margin:0">Steg 1 Possenhofen</h1>
        <p style="color:rgba(255,255,255,.7);font-size:13px;margin:6px 0 0">Winterzauber &mdash; K&auml;sefondue im beheizten Zelt</p>
      </div>
      <div style="padding:28px">
        <h2 style="font-family:'Petrona',Georgia,serif;color:#163D36;font-size:20px;font-weight:600;margin:0 0 8px">Deine Anmeldung wurde angepasst</h2>
        <p style="color:#4A4840;font-size:14px;margin:0 0 16px">Hallo ${esc(name)}, wie besprochen haben wir deine Anmeldung zum Winterzauber am ${esc(dateFormatted)} angepasst. So sieht sie jetzt aus:</p>
        <div style="background:#F2EBD9;border-radius:12px;padding:20px;margin:0 0 20px">
          <table style="width:100%;border-collapse:collapse;font-size:14px;color:#1A2421">
            <tr><td style="padding:6px 0;color:#6C7871;width:110px">Anmeldung</td><td style="padding:6px 0;font-weight:500">${esc(anmeldungId)}</td></tr>
            <tr><td style="padding:6px 0;color:#6C7871">Termin</td><td style="padding:6px 0;font-weight:500">${esc(dateFormatted)}</td></tr>
            <tr><td style="padding:6px 0;color:#6C7871">Personen</td><td style="padding:6px 0;font-weight:500">${esc(personenText)}</td></tr>
            ${aufteilung ? `<tr><td style="padding:6px 0;color:#6C7871;vertical-align:top">Iglus</td><td style="padding:6px 0;font-weight:500">${esc(aufteilung)}</td></tr>` : ""}
            <tr><td style="padding:6px 0;color:#6C7871;vertical-align:top">Fondue</td><td style="padding:6px 0;font-weight:500">${fondueZeilen.map(esc).join("<br>")}</td></tr>
            ${beilagenZeilen.length ? `<tr><td style="padding:6px 0;color:#6C7871;vertical-align:top">Beilagen</td><td style="padding:6px 0;font-weight:500">${beilagenZeilen.map(esc).join("<br>")}</td></tr>` : ""}
            <tr><td style="padding:6px 0;color:#6C7871">Voraussichtl. Preis</td><td style="padding:6px 0;font-weight:500">${preis.toFixed(2)} &euro;</td></tr>
          </table>
        </div>
        <div style="margin-bottom:20px;text-align:center">
          <a href="https://steg1possenhofen.de/fondue-anmeldung?token=${manageToken}" style="display:inline-block;padding:12px 28px;background:#fff;border:1.5px solid #2A7B6F;border-radius:100px;text-decoration:none;color:#2A7B6F;font-size:13px;font-weight:500">Anmeldung ansehen</a>
        </div>
        <p style="color:#4A4840;font-size:14px;margin:0">Bei Fragen antworte einfach auf diese Mail. Wir freuen uns auf euch!</p>
      </div>
      <div style="border-top:1px solid #E4D9C4;padding:20px 28px;text-align:center">
        <p style="color:#6C7871;font-size:12px;margin:0">Steg 1 Possenhofen &middot; Am Starnberger See</p>
      </div>
    </div>
  `;
  const text = [
    `Steg 1 Possenhofen — Winterzauber`,
    ``,
    `ANMELDUNG ANGEPASST`,
    ``,
    `Hallo ${name}, wie besprochen haben wir deine Anmeldung zum Winterzauber am ${dateFormatted} angepasst.`,
    ``,
    `Anmeldung: ${anmeldungId}`,
    `Termin:    ${dateFormatted}`,
    `Personen:  ${personenText}`,
    aufteilung ? `Iglus:     ${aufteilung}` : null,
    `Fondue:    ${fondueZeilen.join(", ")}`,
    beilagenZeilen.length ? `Beilagen:  ${beilagenZeilen.join(", ")}` : null,
    `Voraussichtl. Preis: ${preis.toFixed(2)} EUR`,
    ``,
    `Anmeldung ansehen: https://steg1possenhofen.de/fondue-anmeldung?token=${manageToken}`,
    ``,
    `Bei Fragen antworte einfach auf diese Mail.`,
  ].filter((l) => l !== null).join("\n");

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: "Steg 1 Possenhofen <reservierung@steg1possenhofen.de>",
        to: [email],
        bcc: ["reservierung@steg1possenhofen.de"],
        reply_to: "reservierung@steg1possenhofen.de",
        subject: `Deine Winterzauber-Anmeldung am ${dateFormatted} wurde angepasst`,
        html,
        text,
      }),
    });
    if (!res.ok) {
      console.error("[update-fondue-anmeldung] mail failed", res.status, await res.text());
      return false;
    }
    await bumpQuota(2); // Gast + BCC
    return true;
  } catch (e) {
    console.error("[update-fondue-anmeldung] mail exception", e);
    return false;
  }
}

serve(async (req) => {
  const cors = corsHeadersFor(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405, cors);

  const isAdmin = await verifyAdmin(req.headers.get("authorization"));
  if (!isAdmin) return jsonResponse({ error: "unauthorized" }, 401, cors);

  let body: any;
  try { body = await req.json(); } catch { return jsonResponse({ error: "invalid_json" }, 400, cors); }
  const id = String(body?.id ?? "");
  if (!UUID_RE.test(id)) return jsonResponse({ error: "invalid_id" }, 400, cors);

  // Anmeldung + Termin laden
  const aRes = await pg(`fondue_anmeldungen?id=eq.${id}&select=id,termin_id,anmeldung_id,manage_token,customer_name,customer_email,personen_anzahl,varianten_auswahl,beilagen_auswahl,status,iglu_verteilung,iglu_fixiert,spaet_reduziert,aenderungen,fondue_termine(date,start_time,end_time,capacity_max)`);
  if (!aRes.ok) return jsonResponse({ error: "lookup_failed" }, 500, cors);
  const a = (await aRes.json())[0];
  if (!a) return jsonResponse({ error: "not_found" }, 404, cors);
  if (a.status !== "vorgemerkt" && a.status !== "bestaetigt") return jsonResponse({ error: "not_active" }, 409, cors);
  const termin = a.fondue_termine;
  if (!termin) return jsonResponse({ error: "termin_not_found" }, 404, cors);

  // Stammdaten: aktive Varianten/Beilagen plus die, die die Anmeldung schon hat (auch wenn inzwischen inaktiv)
  const [vRes, bRes] = await Promise.all([
    pg("fondue_varianten?select=id,name,price_per_person,is_active&order=sort_order.asc"),
    pg("fondue_beilagen?select=id,name,price,is_active&order=sort_order.asc"),
  ]);
  if (!vRes.ok || !bRes.ok) return jsonResponse({ error: "zutaten_lookup_failed" }, 500, cors);
  const varianten = await vRes.json();
  const beilagen = await bRes.json();
  const variantenAlt: Mengen = a.varianten_auswahl || {};
  const beilagenAlt: Mengen = a.beilagen_auswahl || {};
  const erlaubteV = varianten.filter((v: any) => v.is_active || variantenAlt[v.id]).map((v: any) => v.id);
  const erlaubteB = beilagen.filter((b: any) => b.is_active || beilagenAlt[b.id]).map((b: any) => b.id);

  const vCheck = bereinigeMengen(body?.varianten, erlaubteV, 30);
  if (!vCheck.ok) return jsonResponse({ error: "invalid_variante", id: vCheck.id }, 400, cors);
  const bCheck = bereinigeMengen(body?.beilagen, erlaubteB, 99);
  if (!bCheck.ok) return jsonResponse({ error: "invalid_beilage", id: bCheck.id }, 400, cors);
  const variantenNeu = vCheck.mengen, beilagenNeu = bCheck.mengen;
  const personenAlt = Number(a.personen_anzahl);
  const personenNeu = summe(variantenNeu);
  if (personenNeu < 1) return jsonResponse({ error: "keine_personen" }, 400, cors);
  if (personenNeu > 30) return jsonResponse({ error: "invalid_personen" }, 400, cors);
  if (gleicheMengen(variantenAlt, variantenNeu) && gleicheMengen(beilagenAlt, beilagenNeu)) {
    return jsonResponse({ error: "keine_aenderung" }, 400, cors);
  }

  // Kapazität + Iglu-Platz (nur relevant, wenn sich die Personenzahl ändert)
  let igluVerteilung = a.iglu_verteilung;
  let igluFixiert = !!a.iglu_fixiert;
  let verschoben: Record<string, unknown> = {};
  if (personenNeu !== personenAlt) {
    const sRes = await pg(`fondue_anmeldungen?termin_id=eq.${a.termin_id}&status=in.(vorgemerkt,bestaetigt)&select=id,personen_anzahl,iglu_verteilung,iglu_fixiert`);
    if (!sRes.ok) return jsonResponse({ error: "capacity_lookup_failed" }, 500, cors);
    const rows = await sRes.json();
    const andereSumme = rows.filter((r: any) => r.id !== a.id).reduce((s: number, r: any) => s + Number(r.personen_anzahl || 0), 0);
    if (andereSumme + personenNeu > Number(termin.capacity_max)) {
      return jsonResponse({ error: "capacity_exceeded", available: Math.max(0, Number(termin.capacity_max) - andereSumme) }, 409, cors);
    }
    const gruppen = rows.map((r: any) => ({ id: String(r.id), personen: Number(r.personen_anzahl), verteilung: r.iglu_verteilung, fixiert: !!r.iglu_fixiert }));
    const ergebnis = aendere(gruppen, a.id, personenNeu);
    if (!ergebnis.ok) {
      return jsonResponse({ error: "iglu_kein_platz", max_gruppe: Math.min(ergebnis.max, Math.max(0, Number(termin.capacity_max) - andereSumme)) }, 409, cors);
    }
    igluVerteilung = ergebnis.verteilung;
    igluFixiert = ergebnis.fixiert;
    verschoben = ergebnis.verschoben;
  }

  // Protokoll + Markierung "spät reduziert"
  const spaet = isWithinFeeWindow(termin.date, termin.start_time) && istReduzierung(personenAlt, personenNeu, beilagenAlt, beilagenNeu);
  const eintrag = {
    zeit: new Date().toISOString(),
    personen_alt: personenAlt, personen_neu: personenNeu,
    varianten_alt: variantenAlt, varianten_neu: variantenNeu,
    beilagen_alt: beilagenAlt, beilagen_neu: beilagenNeu,
    spaet,
  };
  const patchRes = await pg(`fondue_anmeldungen?id=eq.${a.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      personen_anzahl: personenNeu,
      varianten_auswahl: variantenNeu,
      beilagen_auswahl: beilagenNeu,
      iglu_verteilung: igluVerteilung,
      iglu_fixiert: igluFixiert,
      spaet_reduziert: !!a.spaet_reduziert || spaet,
      aenderungen: [...(Array.isArray(a.aenderungen) ? a.aenderungen : []), eintrag],
    }),
  });
  if (!patchRes.ok) {
    console.error("[update-fondue-anmeldung] patch failed", patchRes.status, await patchRes.text());
    return jsonResponse({ error: "update_failed" }, 500, cors);
  }

  // Andere (nicht fixierte) Gruppen, die für die neue Größe umgesetzt wurden, nachziehen.
  // Fehler machen die Änderung nicht ungültig; der Admin erkennt Überbelegung beim Laden.
  for (const [anmId, verteilung] of Object.entries(verschoben)) {
    const r = await pg(`fondue_anmeldungen?id=eq.${anmId}`, { method: "PATCH", body: JSON.stringify({ iglu_verteilung: verteilung }) });
    if (!r.ok) console.error("[update-fondue-anmeldung] iglu patch failed", anmId, r.status, await r.text());
  }

  // Preis zu aktuellen Preisen
  const preis = varianten.reduce((s: number, v: any) => s + Number(variantenNeu[v.id] || 0) * Number(v.price_per_person), 0)
    + beilagen.reduce((s: number, b: any) => s + Number(beilagenNeu[b.id] || 0) * Number(b.price), 0);

  const mail = await sendAenderungsMail({
    email: a.customer_email,
    name: a.customer_name,
    anmeldungId: a.anmeldung_id,
    manageToken: a.manage_token,
    dateFormatted: terminLabelDe(termin.date, termin.start_time, termin.end_time),
    personenAlt, personenNeu,
    fondueZeilen: zeilen(variantenNeu, varianten),
    beilagenZeilen: zeilen(beilagenNeu, beilagen),
    preis,
    aufteilung: aufteilungsSatz(personenNeu),
  });

  return jsonResponse({ ok: true, mail, spaet, personen: personenNeu }, 200, cors);
});
