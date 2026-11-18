import test from "node:test";
import assert from "node:assert/strict";
import { preset, validateModel, scenarioIds } from "@/tools/ai-roi/model";
import { calculate } from "@/tools/ai-roi/calculate";
import { parseModel, serializeModel, encodeShare, decodeShare, HASH_PREFIX, MAX_ENCODED_LENGTH, MAX_JSON_BYTES } from "@/tools/ai-roi/codec";
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
function reference() { const m = preset(); m.scenarios.expected.realization = 50; return m; }
test("hand-calculated contract: capacity, cash, costs, payback and ROI", () => {
  const r = calculate(reference(), "expected"); const first = r.months[1];
  assert.equal(first.automated, 600); assert.equal(first.hours, 60); assert.equal(first.laborValue, 3000);
  assert.equal(first.cash, 1500); assert.equal(first.net, 1100); assert.equal(r.breakEven, 3);
  assert.equal(r.payback, 3); assert.equal(r.costs, 8100); assert.equal(r.net, 9900); close(r.roi, 122.22222222222223);
  assert.equal(r.months[0].setup, 3300); assert.equal(r.hours, 720);
});
test("zero volume, adoption, coverage and cash realization retain recurring costs", () => {
  for (const key of ["volume", "adoption", "coverage", "realization"]) {
    const m = reference(); if (key === "volume") m.volume = 0; else m.scenarios.expected[key] = 0;
    const r = calculate(m, "expected"); assert.equal(r.cash, 0); assert.equal(r.costs, 8100); assert.equal(r.net, -8100); assert.equal(r.breakEven, null);
    assert.equal(r.hours, key === "realization" ? 720 : 0);
  }
});
test("extra labor costs are fully counted at zero realization, without double-counting review", () => {
  const m = reference(); Object.assign(m.scenarios.expected, { residual: 8, review: 4, realization: 0 });
  const r = calculate(m, "expected"); assert.equal(r.months[1].hours, -20); assert.equal(r.months[1].extraLabor, 1000);
  assert.equal(r.months[1].costs, 1400); assert.equal(r.cash, 0); assert.equal(r.costs, 20100); assert.equal(r.net, -20100);
});
test("zero costs have undefined ROI, positive cash and no upfront capital to recover", () => {
  const m = reference(); Object.assign(m.scenarios.expected, { setup: 0, software: 0, usage: 0, maintenance: 0 });
  const r = calculate(m, "expected"); assert.equal(r.costs, 0); assert.equal(r.roi, null); assert.equal(r.breakEven, 0); assert.equal(r.payback, 0); assert.equal(r.net, 18000);
});
test("fractional payback interpolates without rounding accumulated cash", () => {
  const m = reference(); m.scenarios.expected.setup = 2750;
  const r = calculate(m, "expected"); assert.equal(r.breakEven, 3); assert.equal(r.payback, 2.5);
  m.volume = 1 / 3; m.scenarios.expected.setup = 1;
  const tiny = calculate(m, "expected"); close(tiny.hours, .24);
  close(tiny.net, tiny.months.reduce((n, row) => n + row.net, 0));
});
test("delay and ramp boundaries, including go-live beyond horizon", () => {
  const m = reference(); Object.assign(m.scenarios.expected, { delay: 2, ramp: 3 });
  const r = calculate(m, "expected"); assert.equal(r.months[2].costs, 0); assert.equal(r.months[2].automated, 0);
  close(r.months[3].automated, 200); close(r.months[4].automated, 400); close(r.months[5].automated, 600);
  assert.equal(r.months[3].costs, 400); close(r.months[3].cash, 500);
  for (const ramp of [0, 1]) { m.scenarios.expected.ramp = ramp; assert.equal(calculate(m, "expected").months[3].automated, 600); }
  m.scenarios.expected.delay = 36; m.horizon = 36;
  const never = calculate(m, "expected"); assert.equal(never.costs, 3300); assert.equal(never.cash, 0); assert.equal(never.hours, 0); assert.equal(never.breakEven, null);
  m.scenarios.expected.delay = 35; m.scenarios.expected.ramp = 36;
  close(calculate(m, "expected").months[36].automated, 600 / 36);
});
test("valid presets have all three independent scenarios and default zero cash realization", () => {
  for (const id of ["invoice", "enquiry", "reporting"]) { const m = preset(id); assert.ok(validateModel(m)); for (const scenario of scenarioIds) { assert.equal(m.scenarios[scenario].realization, 0); assert.equal(calculate(m, scenario).cash, 0); } }
});
test("wrong tools, versions, types, keys, ranges, nonfinite numbers and collection sizes are rejected", () => {
  const mutations = [m => m.tool = "token-simulator", m => m.schemaVersion = 2, m => m.methodologyVersion = "2.0", m => m.volume = "100", m => m.volume = NaN, m => m.hourlyCost = Infinity, m => m.baseline = -1, m => m.horizon = 37, m => m.horizon = 1.5, m => m.currency = ["CHF"], m => m.currency = "BTC", m => m.title = "x".repeat(121), m => m.notes = "x".repeat(2001), m => m.scenarios = [], m => m.scenarios.extra = {}, m => delete m.scenarios.expected, m => m.scenarios.expected.adoption = 101, m => m.scenarios.expected.delay = -.1, m => m.scenarios.expected.ramp = .5, m => m.scenarios.expected.review = null, m => m.extra = "unknown"];
  for (const mutate of mutations) { const m = preset(); mutate(m); assert.equal(validateModel(m), false); assert.throws(() => calculate(m, "expected")); assert.throws(() => parseModel(JSON.stringify(m))); }
  for (const value of [null, [], {}, true, "x", 3]) assert.equal(validateModel(value), false);
});
test("JSON round trip retains all edits; malformed and oversized input rejects atomically", () => {
  const m = reference(); m.notes = '<script>alert("x")</script> ä €'; m.title = "Business case";
  assert.deepEqual(parseModel(serializeModel(m)), m);
  for (const text of ["{", "null", "[]", " ".repeat(MAX_JSON_BYTES + 1)]) assert.throws(() => parseModel(text));
});
test("shared-link round trip excludes text by default and preserves text only on opt-in", () => {
  const m = reference(); m.title = "Sensitive client"; m.notes = "https://example.com/private?ref=1 🧪";
  assert.deepEqual(decodeShare(encodeShare(m)), { ...m, title: "", notes: "" });
  assert.deepEqual(decodeShare(encodeShare(m, true)), m); assert.equal(m.title, "Sensitive client");
});
test("malformed, foreign, unsupported and oversized share payloads reject", () => {
  for (const hash of ["#m=abc", "#ai-roi=v2.abc", HASH_PREFIX + "!", HASH_PREFIX + "A", HASH_PREFIX + "a".repeat(MAX_ENCODED_LENGTH + 1), HASH_PREFIX + btoa("null"), HASH_PREFIX + btoa(JSON.stringify({ ...preset(), tool: "other" }))]) assert.throws(() => decodeShare(hash));
  const m = preset(); m.notes = "漢".repeat(2000); assert.ok(validateModel(m)); assert.throws(() => encodeShare(m, true), /size/); assert.doesNotThrow(() => encodeShare(m));
});
