import assert from "node:assert";
import { readIn, writeIn } from "../gate.js";
import { step, close } from "../gaterun.js";
import { render } from "../app.js";

const base = {
  budget: 1,
  state: { readers: 0, writer: 0, records: [], ledger: [], applied: [] },
  events: [{ id: 1, kind: "read_in" }],
  busy_code: "E_BUSY", no_reader_code: "E_NO_READER",
  no_writer_code: "E_NO_WRITER", event_error_code: "E_BAD_EVENT"
};

let failed = 0;
function check(name, fn) {
  try { fn(); console.log("ok " + name); } catch (e) { failed += 1; console.log("FAIL " + name + " :: " + e.message); }
}

check("readIn returns a state", () => {
  assert.strictEqual(typeof readIn({ readers: 0, writer: 0 }), "object");
});

check("writeIn returns a state", () => {
  assert.strictEqual(typeof writeIn({ readers: 0, writer: 0 }), "object");
});

check("step returns a state", () => {
  assert.strictEqual(typeof step(base).state, "object");
});

check("close returns a state", () => {
  assert.strictEqual(typeof close(base).state, "object");
});

check("render counts events", () => {
  assert.strictEqual(typeof render(base).count_events, "number");
});

console.log("5 cases, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);
