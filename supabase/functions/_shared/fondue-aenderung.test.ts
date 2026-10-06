// Ausfuehren: node --test supabase/functions/_shared/fondue-aenderung.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { bereinigeMengen, summe, gleicheMengen, istReduzierung } from "./fondue-aenderung.ts";

test("bereinigeMengen: uebernimmt erlaubte ganzzahlige Mengen, laesst 0 weg", () => {
  assert.deepEqual(bereinigeMengen({ a: 2, b: 0, c: "1" }, ["a", "b", "c"], 30), { ok: true, mengen: { a: 2, c: 1 } });
  assert.deepEqual(bereinigeMengen(null, ["a"], 30), { ok: true, mengen: {} });
});

test("bereinigeMengen: lehnt unbekannte ids, Kommazahlen, negative und zu grosse Mengen ab", () => {
  assert.deepEqual(bereinigeMengen({ x: 1 }, ["a"], 30), { ok: false, id: "x" });
  assert.deepEqual(bereinigeMengen({ a: 1.5 }, ["a"], 30), { ok: false, id: "a" });
  assert.deepEqual(bereinigeMengen({ a: -1 }, ["a"], 30), { ok: false, id: "a" });
  assert.deepEqual(bereinigeMengen({ a: 100 }, ["a"], 99), { ok: false, id: "a" });
});

test("summe und gleicheMengen (fehlende id = 0)", () => {
  assert.equal(summe({ a: 2, b: 3 }), 5);
  assert.equal(summe({}), 0);
  assert.equal(gleicheMengen({ a: 2 }, { a: 2, b: 0 }), true);
  assert.equal(gleicheMengen({ a: 2 }, { a: 1, b: 1 }), false);
});

test("istReduzierung: weniger Personen oder weniger Beilagen, Variantenwechsel nicht", () => {
  assert.equal(istReduzierung(3, 2, {}, {}), true);
  assert.equal(istReduzierung(3, 3, { brot: 2 }, { brot: 1 }), true);
  assert.equal(istReduzierung(3, 3, { brot: 2 }, {}), true);
  assert.equal(istReduzierung(3, 4, { brot: 1 }, { brot: 1, obst: 1 }), false);
  assert.equal(istReduzierung(3, 3, {}, {}), false);
});
