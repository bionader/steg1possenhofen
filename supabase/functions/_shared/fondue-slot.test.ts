import { test } from "node:test";
import assert from "node:assert/strict";
import { hhmm, slotLabel, terminLabelDe, berlinToDate } from "./fondue-slot.ts";

test("hhmm schneidet Sekunden ab", () => {
  assert.equal(hhmm("17:15:00"), "17:15");
  assert.equal(hhmm("19:30"), "19:30");
  assert.equal(hhmm(null), "");
});

test("slotLabel", () => {
  assert.equal(slotLabel("17:15:00", "19:15:00"), "17:15–19:15 Uhr");
});

test("terminLabelDe mit und ohne Slot", () => {
  assert.equal(terminLabelDe("2026-10-22", "19:30:00", "21:30:00"), "22.10.2026, 19:30–21:30 Uhr");
  assert.equal(terminLabelDe("2026-10-22"), "22.10.2026");
});

test("berlinToDate: Sommerzeit (22.10.2026 = CEST, +02:00)", () => {
  assert.equal(berlinToDate("2026-10-22", "17:15").toISOString(), "2026-10-22T15:15:00.000Z");
});

test("berlinToDate: Winterzeit (12.11.2026 = CET, +01:00)", () => {
  assert.equal(berlinToDate("2026-11-12", "19:30:00").toISOString(), "2026-11-12T18:30:00.000Z");
});
