// Ausfuehren: node --test supabase/functions/_shared/iglu-verteilung.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  teileGruppe, belegung, ergaenze, platziere, maxGruppe,
  verteileNeu, umsetzen, iglusText, aufteilungsSatz,
} from "./iglu-verteilung.js";

const g = (id, personen, verteilung = null, fixiert = false) => ({ id, personen, verteilung, fixiert });

test("teileGruppe teilt gleichmaessig", () => {
  assert.deepEqual(teileGruppe(10), [10]);
  assert.deepEqual(teileGruppe(12), [12]);
  assert.deepEqual(teileGruppe(13), [7, 6]);
  assert.deepEqual(teileGruppe(16), [8, 8]);
  assert.deepEqual(teileGruppe(25), [9, 8, 8]);
  assert.deepEqual(teileGruppe(0), []);
});

test("Mats-Beispiel: 10/10/10 + 6 wird abgelehnt, max 2", () => {
  const gr = [g("a", 10, { 1: 10 }), g("b", 10, { 2: 10 }), g("c", 10, { 3: 10 })];
  assert.equal(platziere(gr, 6).ok, false);
  assert.equal(maxGruppe(gr), 2);
});

test("7/7/7 + 6 wird abgelehnt, max 5", () => {
  const gr = [g("a", 7, { 1: 7 }), g("b", 7, { 2: 7 }), g("c", 7, { 3: 7 })];
  assert.equal(platziere(gr, 6).ok, false);
  assert.equal(maxGruppe(gr), 5);
});

test("maxGruppe ist zusammenhaengend: 13 passt, 12 nicht -> 7", () => {
  const gr = [g("a", 6, { 1: 6 }, true), g("b", 5, { 2: 5 }, true), g("c", 12, { 3: 12 }, true)];
  assert.equal(platziere(gr, 13).ok, true);
  assert.equal(platziere(gr, 12).ok, false);
  assert.equal(maxGruppe(gr), 7);
});

test("16 Personen -> 8 + 8 in verschiedenen Iglus", () => {
  const r = platziere([], 16);
  assert.equal(r.ok, true);
  assert.deepEqual(Object.values(r.neu).sort(), [8, 8]);
  assert.equal(Object.keys(r.neu).length, 2);
});

test("25 Personen -> 9 + 8 + 8, 37 -> abgelehnt", () => {
  const r = platziere([], 25);
  assert.equal(r.ok, true);
  assert.deepEqual(Object.values(r.neu).sort(), [8, 8, 9]);
  assert.equal(platziere([], 37).ok, false);
});

test("Stufe 1: bestehende Gruppen bleiben stehen", () => {
  const gr = [g("a", 6, { 1: 6 })];
  const r = platziere(gr, 4);
  assert.equal(r.ok, true);
  assert.deepEqual(r.verschoben, {});
});

test("Stufe 2: Umordnen schafft Platz fuer 12er-Gruppe", () => {
  const gr = [g("a", 6, { 1: 6 }), g("b", 6, { 2: 6 }), g("c", 1, { 3: 1 })];
  const r = platziere(gr, 12);
  assert.equal(r.ok, true);
  const alle = gr.map((x) => ({ ...x, verteilung: r.verschoben[x.id] || x.verteilung }))
    .concat([g("neu", 12, r.neu)]);
  assert.ok(belegung(alle).every((l) => l <= 12));
});

test("Fixierte Gruppen werden nie verschoben", () => {
  const gr = [g("a", 6, { 1: 6 }, true), g("b", 6, { 2: 6 }, true), g("c", 1, { 3: 1 })];
  const r = platziere(gr, 12);
  assert.equal(r.ok, true);
  assert.equal(r.verschoben.a, undefined);
  assert.equal(r.verschoben.b, undefined);
  assert.ok(r.verschoben.c);
  const alleFix = gr.map((x) => ({ ...x, fixiert: true }));
  assert.equal(platziere(alleFix, 12).ok, false);
});

test("Altdaten ohne (oder mit ungueltiger) Verteilung werden ergaenzt", () => {
  const gr = [g("a", 10), g("b", 5, { 1: 4 }), g("c", 3, { 1: 3 })];
  const r = ergaenze(gr);
  assert.equal(r.ok, true);
  assert.ok(r.verschoben.a);
  assert.ok(r.verschoben.b); // Summe 4 != 5 -> ungueltig -> neu verteilt
  assert.equal(r.verschoben.c, undefined);
});

test("verteileNeu ignoriert Fixierungen", () => {
  const gr = [g("a", 7, { 1: 7 }, true), g("b", 5, { 1: 5 }, true), g("c", 12, { 2: 12 }, true)];
  const r = verteileNeu(gr);
  assert.equal(r.ok, true);
  const neu = gr.map((x) => ({ ...x, verteilung: r.verteilungen[x.id] }));
  assert.ok(belegung(neu).every((l) => l <= 12));
});

test("umsetzen: erlaubt bis 12, lehnt darueber mit Grund ab", () => {
  const gr = [g("a", 10, { 1: 10 }), g("b", 2, { 2: 2 }), g("c", 3, { 3: 3 })];
  assert.deepEqual(umsetzen(gr, "b", 2, 1), { ok: true, verteilung: { 1: 2 } });
  const nein = umsetzen(gr, "c", 3, 1);
  assert.equal(nein.ok, false);
  assert.equal(nein.grund, "Iglu 1 hätte dann 13 Personen. Maximal 12 möglich.");
});

test("umsetzen: Teile einer Grossgruppe lassen sich nicht ueber 12 zusammenlegen", () => {
  const gr = [g("a", 16, { 1: 8, 2: 8 })];
  assert.equal(umsetzen(gr, "a", 2, 1).ok, false);
  assert.deepEqual(umsetzen(gr, "a", 2, 3), { ok: true, verteilung: { 1: 8, 3: 8 } });
});

test("Gespeicherte Verteilung ueber 12 oder mit falscher Teilezahl wird ergaenzt", () => {
  // Gruppe a: 13 Personen mit { 1: 13 } — ueber 12-Limit, wird rejected
  // Gruppe b: 12 Personen mit { 1: 6, 2: 6 } — falsche Teilezahl (sollte 1 sein), wird rejected
  const gr = [g("a", 13, { 1: 13 }), g("b", 12, { 1: 6, 2: 6 })];
  const r = ergaenze(gr);
  assert.equal(r.ok, true);
  // a sollte neu verteilt werden: 13 -> [7, 6]
  assert.ok(r.verschoben.a);
  assert.deepEqual(Object.values(r.verschoben.a).sort(), [6, 7]);
  assert.equal(Object.keys(r.verschoben.a).length, 2);
  // b sollte neu verteilt werden: 12 -> [12]
  assert.ok(r.verschoben.b);
  assert.deepEqual(r.verschoben.b, { 1: 12 });
  // belegung mit ungueltig gespeicherter a sollte [0,0,0] sein
  const belegungA = belegung([g("a", 13, { 1: 13 })]);
  assert.deepEqual(belegungA, [0, 0, 0]);
});

test("iglusText und aufteilungsSatz", () => {
  assert.equal(iglusText({ 1: 10 }), "1");
  assert.equal(iglusText({ 3: 8, 2: 8 }), "2 + 3");
  assert.equal(iglusText(null), "–");
  assert.equal(aufteilungsSatz(10), "");
  assert.equal(aufteilungsSatz(16), "Bei 16 Personen verteilt ihr euch auf zwei Iglus (8 + 8).");
  assert.equal(aufteilungsSatz(25), "Bei 25 Personen verteilt ihr euch auf drei Iglus (9 + 8 + 8).");
});

test("Performance: viele kleine Gruppen < 200 ms", () => {
  const gr = [];
  for (let i = 0; i < 17; i++) gr.push(g("p" + i, 2));
  const t0 = performance.now();
  const r = ergaenze(gr);
  maxGruppe(gr.map((x) => ({ ...x, verteilung: r.verschoben[x.id] })));
  assert.ok(r.ok);
  assert.ok(performance.now() - t0 < 200);
});

test("Kopie fuer die Edge Function ist identisch mit js/iglu-verteilung.js", () => {
  const original = readFileSync(new URL("../../../js/iglu-verteilung.js", import.meta.url), "utf8");
  const kopie = readFileSync(new URL("./iglu-verteilung.js", import.meta.url), "utf8");
  assert.equal(kopie, original, "Nach Aenderungen: cp js/iglu-verteilung.js supabase/functions/_shared/iglu-verteilung.js");
});
