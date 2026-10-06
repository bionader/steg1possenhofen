// Reine Helfer fuer update-fondue-anmeldung (Admin "Anmeldung aendern"), per node testbar.
export type Mengen = Record<string, number>;

// Uebernimmt nur erlaubte ids mit ganzzahligen Mengen 0..max; Mengen von 0 entfallen.
export function bereinigeMengen(input: unknown, erlaubteIds: string[], max: number): { ok: true; mengen: Mengen } | { ok: false; id: string } {
  const mengen: Mengen = {};
  if (!input || typeof input !== "object") return { ok: true, mengen };
  for (const [id, roh] of Object.entries(input as Record<string, unknown>)) {
    const n = Number(roh);
    if (!Number.isInteger(n) || n < 0 || n > max) return { ok: false, id };
    if (n === 0) continue;
    if (!erlaubteIds.includes(id)) return { ok: false, id };
    mengen[id] = n;
  }
  return { ok: true, mengen };
}

export function summe(m: Mengen): number {
  return Object.values(m).reduce((a, n) => a + Number(n || 0), 0);
}

// Vergleich zweier Mengen-Maps; eine fehlende id zaehlt als 0
export function gleicheMengen(a: Mengen, b: Mengen): boolean {
  const ids = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const id of ids) {
    if (Number(a[id] || 0) !== Number(b[id] || 0)) return false;
  }
  return true;
}

// Reduzierung = weniger Personen oder weniger einer Beilage. Ein Wechsel der
// Fondue-Variante bei gleicher Personenzahl ist keine Reduzierung.
export function istReduzierung(altPersonen: number, neuPersonen: number, beilagenAlt: Mengen, beilagenNeu: Mengen): boolean {
  if (neuPersonen < altPersonen) return true;
  return Object.keys(beilagenAlt).some((id) => Number(beilagenNeu[id] || 0) < Number(beilagenAlt[id] || 0));
}
