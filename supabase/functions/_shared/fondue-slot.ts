// Gemeinsame Helfer für Winterzauber-Zeitslots (von mehreren Edge Functions importiert).
// Frontend-Pendants liegen bewusst dupliziert in winterzauber.html, fondue-anmeldung.html, admin.html.

// "17:15:00" -> "17:15"
export function hhmm(t: string | null | undefined): string {
  return String(t ?? "").slice(0, 5);
}

// "17:15–19:15 Uhr"
export function slotLabel(start: string, end: string): string {
  return `${hhmm(start)}–${hhmm(end)} Uhr`;
}

// "22.10.2026, 17:15–19:15 Uhr" — ohne Zeiten nur das Datum (Altdaten-Fallback)
export function terminLabelDe(dateYmd: string, start?: string | null, end?: string | null): string {
  const date = dateYmd.split("-").reverse().join(".");
  return start && end ? `${date}, ${slotLabel(start, end)}` : date;
}

// Europe/Berlin-Wandzeit -> echter Zeitpunkt, inkl. Sommer-/Winterzeit.
// Deno Deploy läuft in UTC, deshalb Offset über Intl bestimmen statt fest +01:00.
export function berlinToDate(dateYmd: string, time: string): Date {
  const [y, m, d] = dateYmd.split("-").map(Number);
  const [hh, mm] = hhmm(time).split(":").map(Number);
  const asUtc = Date.UTC(y, m - 1, d, hh, mm);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin", hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date(asUtc));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const berlinAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return new Date(asUtc - (berlinAsUtc - asUtc));
}
