// Iglu-Verteilung fuer den Winterzauber (3 Iglus x 12 Plaetze pro Slot).
// ORIGINAL: js/iglu-verteilung.js — supabase/functions/_shared/iglu-verteilung.js ist eine
// byte-identische Kopie fuer die Edge Function (der Test prueft die Gleichheit).
// Nach jeder Aenderung: cp js/iglu-verteilung.js supabase/functions/_shared/iglu-verteilung.js
//
// Gruppe (= aktive Anmeldung):
//   { id: string, personen: number, verteilung: {"1": 8, "3": 8} | null, fixiert: boolean }
// verteilung: Iglu-Nummer ("1".."3") -> Personen in diesem Iglu.

export const IGLU_ANZAHL = 3;
export const PLAETZE_PRO_IGLU = 12;

const NEU_ID = "__neu__";
const ZAHLWORT = { 2: "zwei", 3: "drei" };

// Teilt eine Gruppe gleichmaessig auf ceil(n/12) Teile auf (absteigend).
// 10 -> [10], 13 -> [7, 6], 16 -> [8, 8], 25 -> [9, 8, 8]
export function teileGruppe(n) {
  if (!Number.isInteger(n) || n < 1) return [];
  const k = Math.ceil(n / PLAETZE_PRO_IGLU);
  const basis = Math.floor(n / k);
  const rest = n % k;
  const teile = [];
  for (let i = 0; i < k; i++) teile.push(basis + (i < rest ? 1 : 0));
  return teile;
}

// Verteilung nur uebernehmen, wenn sie formal gueltig ist und zur Personenzahl passt:
// - Iglunummern 1..3, positive Personen
// - Summe = personen
// - Keine Komponente ueber PLAETZE_PRO_IGLU
// - Teilezahl muss mit teileGruppe() uebereinstimmen (um falsch gespeicherte Splits zu erkennen)
function gueltigeVerteilung(personen, v) {
  if (!v || typeof v !== "object") return null;
  let summe = 0;
  for (const [k, p] of Object.entries(v)) {
    const nr = Number(k);
    if (!Number.isInteger(nr) || nr < 1 || nr > IGLU_ANZAHL) return null;
    if (!Number.isInteger(p) || p < 1 || p > PLAETZE_PRO_IGLU) return null;
    summe += p;
  }
  if (summe !== personen) return null;
  // Teilezahl muss mit teileGruppe() uebereinstimmen
  const teile = teileGruppe(personen);
  if (Object.keys(v).length !== teile.length) return null;
  return v;
}

function normalisiere(gruppen) {
  return (gruppen || []).map((g) => {
    const personen = Number(g.personen);
    return {
      id: String(g.id),
      personen,
      verteilung: gueltigeVerteilung(personen, g.verteilung),
      fixiert: !!g.fixiert,
    };
  });
}

function lastenVon(gruppen) {
  const last = new Array(IGLU_ANZAHL).fill(0);
  gruppen.forEach((g) => {
    if (!g.verteilung) return;
    for (const [k, p] of Object.entries(g.verteilung)) last[Number(k) - 1] += p;
  });
  return last;
}

// Personen je Iglu (Index 0..2) aus allen Gruppen mit gueltiger Verteilung
export function belegung(gruppen) {
  return lastenVon(normalisiere(gruppen));
}

// Lexikografischer Vergleich zweier Belegungen: true, wenn a Iglu 1 voller macht
// (bei Gleichstand Iglu 2, dann Iglu 3) als b.
function besser(a, b) {
  for (let k = 0; k < IGLU_ANZAHL; k++) {
    if (a[k] !== b[k]) return a[k] > b[k];
  }
  return false;
}

function zustandsSchluessel(last, maske) {
  return last.join(",") + "|" + maske;
}

// Exakte Optimierung per dynamischer Programmierung ueber die Iglu-Belegungen.
// Unter allen gueltigen Zuordnungen (je Iglu <= 12, Teile einer Gruppe in
// verschiedenen Iglus) wird die gewaehlt, die Iglu 1 am vollsten macht, dann
// Iglu 2, Iglu 3 bleibt so lange wie moeglich leer ("Iglu 1 zuerst fuellen").
// Zustand = Belegung aller Iglus + Bitmaske der Iglus, die die aktuelle Gruppe
// schon nutzt; die Zustandsmenge bleibt klein (hoechstens 13^3 * 8).
// Rueckgabe: { [id]: verteilung } oder null.
function loese(grundlast, gruppen) {
  const teile = [];
  for (const g of gruppen) {
    const t = teileGruppe(g.personen);
    if (!t.length || t.length > IGLU_ANZAHL) return null;
    // Teile einer Gruppe stehen direkt hintereinander; "start" setzt die Maske zurueck
    t.forEach((s, i) => teile.push({ id: g.id, s, start: i === 0 }));
  }
  const frei = grundlast.reduce((a, l) => a + Math.max(0, PLAETZE_PRO_IGLU - l), 0);
  if (teile.reduce((a, t) => a + t.s, 0) > frei) return null;

  // schichten[i] = erreichbare Zustaende nach den ersten i Teilen (mit Rueckverweis)
  const startLast = grundlast.slice();
  const schichten = [new Map([[zustandsSchluessel(startLast, 0), { last: startLast, maske: 0, vor: null, k: -1 }]])];
  for (const t of teile) {
    const naechste = new Map();
    for (const [schluessel, z] of schichten[schichten.length - 1]) {
      const maske = t.start ? 0 : z.maske;
      for (let k = 0; k < IGLU_ANZAHL; k++) {
        if (maske & (1 << k)) continue;
        if (z.last[k] + t.s > PLAETZE_PRO_IGLU) continue;
        const last = z.last.slice();
        last[k] += t.s;
        const neueMaske = maske | (1 << k);
        const nk = zustandsSchluessel(last, neueMaske);
        if (!naechste.has(nk)) naechste.set(nk, { last, maske: neueMaske, vor: schluessel, k });
      }
    }
    if (!naechste.size) return null;
    schichten.push(naechste);
  }

  // Besten Endzustand waehlen und die Zuordnung rueckwaerts rekonstruieren
  let bestSchluessel = null, best = null;
  for (const [schluessel, z] of schichten[schichten.length - 1]) {
    if (!best || besser(z.last, best.last)) { best = z; bestSchluessel = schluessel; }
  }
  const zuordnung = new Array(teile.length);
  let schluessel = bestSchluessel;
  for (let i = teile.length; i >= 1; i--) {
    const z = schichten[i].get(schluessel);
    zuordnung[i - 1] = z.k;
    schluessel = z.vor;
  }

  const ergebnis = {};
  gruppen.forEach((g) => { ergebnis[g.id] = {}; });
  teile.forEach((t, i) => {
    const key = String(zuordnung[i] + 1);
    ergebnis[t.id][key] = (ergebnis[t.id][key] || 0) + t.s;
  });
  return ergebnis;
}

function gleicheVerteilung(a, b) {
  if (!a || !b) return false;
  const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a[k] === b[k]);
}

// Gibt allen Gruppen ohne gueltige Verteilung eine.
// Stufe 1: bestehende Verteilungen bleiben stehen.
// Stufe 2: alle nicht fixierten Gruppen werden neu verteilt.
// In beiden Stufen gilt die Fuellreihenfolge Iglu 1 -> 2 -> 3 (siehe loese).
// Rueckgabe: { ok: true, verschoben: { [id]: verteilung } } (nur geaenderte Gruppen) oder { ok: false }
export function ergaenze(gruppen) {
  const alle = normalisiere(gruppen);
  const offen = alle.filter((g) => !g.verteilung);
  if (!offen.length) return { ok: true, verschoben: {} };

  const stufe1 = loese(lastenVon(alle), offen);
  if (stufe1) return { ok: true, verschoben: stufe1 };

  const fix = alle.filter((g) => g.fixiert && g.verteilung);
  const beweglich = alle.filter((g) => !(g.fixiert && g.verteilung));
  const stufe2 = loese(lastenVon(fix), beweglich);
  if (!stufe2) return { ok: false };
  const verschoben = {};
  beweglich.forEach((g) => {
    if (!gleicheVerteilung(g.verteilung, stufe2[g.id])) verschoben[g.id] = stufe2[g.id];
  });
  return { ok: true, verschoben };
}

// Platziert eine neue Gruppe mit `neu` Personen.
// Rueckgabe: { ok: true, neu: verteilung, verschoben: { [id]: verteilung } } oder { ok: false }
export function platziere(gruppen, neu) {
  if (!Number.isInteger(neu) || neu < 1) return { ok: false };
  const r = ergaenze([...(gruppen || []), { id: NEU_ID, personen: neu, verteilung: null, fixiert: false }]);
  if (!r.ok) return { ok: false };
  const verschoben = { ...r.verschoben };
  const neuV = verschoben[NEU_ID];
  delete verschoben[NEU_ID];
  return { ok: true, neu: neuV, verschoben };
}

// Groesste Zahl X, fuer die JEDE Gruppengroesse 1..X noch platziert werden kann
// (0 = nichts mehr frei). Nicht monoton: bei freien Plaetzen 6/7/0 passt 13 (7+6),
// 12 aber nicht -> X = 7. Ob eine konkrete Groesse passt, immer mit platziere() pruefen.
export function maxGruppe(gruppen) {
  for (let n = 1; n <= IGLU_ANZAHL * PLAETZE_PRO_IGLU; n++) {
    if (!platziere(gruppen, n).ok) return n - 1;
  }
  return IGLU_ANZAHL * PLAETZE_PRO_IGLU;
}

// Verteilt alle Gruppen komplett neu und optimal (Iglu 1 zuerst), Fixierungen werden
// ignoriert (Admin-Button).
// Rueckgabe: { ok: true, verteilungen: { [id]: verteilung } } oder { ok: false }
export function verteileNeu(gruppen) {
  const alle = normalisiere(gruppen);
  const r = loese(new Array(IGLU_ANZAHL).fill(0), alle);
  return r ? { ok: true, verteilungen: r } : { ok: false };
}

// true, wenn "Automatisch neu verteilen" eine bessere Fuellung ergaebe (Iglu 1 voller,
// dann Iglu 2 ...) oder ein Iglu ueberbelegt ist — Grundlage fuer den Admin-Hinweis.
export function optimierbar(gruppen) {
  const alle = normalisiere(gruppen);
  if (!alle.length) return false;
  // Unverteilte Gruppen erst per ergaenze() einsortieren lassen — sonst falscher Alarm
  if (alle.some((g) => !g.verteilung)) return false;
  // Ohne gueltige Neuverteilung waere der Hinweis eine Sackgasse
  const r = verteileNeu(alle);
  if (!r.ok) return false;
  const alt = lastenVon(alle);
  if (alt.some((l) => l > PLAETZE_PRO_IGLU)) return true;
  const neu = lastenVon(alle.map((g) => ({ ...g, verteilung: r.verteilungen[g.id] })));
  return besser(neu, alt);
}

// Setzt den Teil einer Gruppe aus Iglu `von` nach Iglu `ziel` um.
// Liegt dort schon ein Teil derselben Gruppe, werden beide zusammengelegt.
// Rueckgabe: { ok: true, verteilung } oder { ok: false, grund }
export function umsetzen(gruppen, gruppenId, von, ziel) {
  const alle = normalisiere(gruppen);
  const g = alle.find((x) => x.id === String(gruppenId));
  const vonK = String(von), zielK = String(ziel);
  if (!g || !g.verteilung || !g.verteilung[vonK]) return { ok: false, grund: "Gruppe nicht gefunden." };
  const zielNr = Number(zielK);
  if (!Number.isInteger(zielNr) || zielNr < 1 || zielNr > IGLU_ANZAHL) return { ok: false, grund: "Ungültiges Iglu." };
  if (vonK === zielK) return { ok: true, verteilung: { ...g.verteilung } };
  const anzahl = g.verteilung[vonK];
  const neuLast = lastenVon(alle)[zielNr - 1] + anzahl;
  if (neuLast > PLAETZE_PRO_IGLU) {
    return { ok: false, grund: `Iglu ${zielK} hätte dann ${neuLast} Personen. Maximal ${PLAETZE_PRO_IGLU} möglich.` };
  }
  const verteilung = { ...g.verteilung };
  delete verteilung[vonK];
  verteilung[zielK] = (verteilung[zielK] || 0) + anzahl;
  return { ok: true, verteilung };
}

// Aendert die Personenzahl einer bestehenden Gruppe (Admin "Aendern").
// 1. Bis 12 Personen und das bisherige Iglu reicht weiter -> Gruppe bleibt dort,
//    Fixierung bleibt, niemand wird verschoben.
// 2. Sonst wird sie ohne Fixierung per platziere() neu einsortiert (Iglu 1 zuerst).
// Rueckgabe: { ok: true, verteilung, fixiert, verschoben } oder { ok: false, max }
export function aendere(gruppen, gruppenId, n) {
  const alle = normalisiere(gruppen);
  const g = alle.find((x) => x.id === String(gruppenId));
  if (!g || !Number.isInteger(n) || n < 1) return { ok: false, max: 0 };
  const andere = alle.filter((x) => x.id !== g.id);
  const keys = g.verteilung ? Object.keys(g.verteilung) : [];
  if (n <= PLAETZE_PRO_IGLU && keys.length === 1) {
    const k = Number(keys[0]);
    if (lastenVon(andere)[k - 1] + n <= PLAETZE_PRO_IGLU) {
      return { ok: true, verteilung: { [keys[0]]: n }, fixiert: g.fixiert, verschoben: {} };
    }
  }
  const r = platziere(andere, n);
  if (!r.ok) return { ok: false, max: maxGruppe(andere) };
  return { ok: true, verteilung: r.neu, fixiert: false, verschoben: r.verschoben };
}

// Kurztext fuer Listen: {"1":10} -> "1", {"3":8,"2":8} -> "2 + 3", null -> "–"
export function iglusText(verteilung) {
  if (!verteilung || typeof verteilung !== "object") return "–";
  const keys = Object.keys(verteilung).map(Number).sort((a, b) => a - b);
  return keys.length ? keys.join(" + ") : "–";
}

// Hinweis-Satz fuer Website + Mail bei Gruppen ueber 12, sonst ""
export function aufteilungsSatz(n) {
  const teile = teileGruppe(n);
  if (teile.length < 2 || teile.length > IGLU_ANZAHL) return "";
  return `Bei ${n} Personen verteilt ihr euch auf ${ZAHLWORT[teile.length]} Iglus (${teile.join(" + ")}).`;
}
