// gaterun.js：按处理预算处理并留账，收尾不限预算把账做完
import { readIn, writeIn } from "./gate.js";

const KINDS = ["read_in", "read_out", "write_in", "write_out"];

function GateError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function code(spec, name, fallback) {
  return (spec && spec[name]) || fallback;
}

function cloneState(source) {
  const state = source || {};
  return {
    readers: state.readers || 0,
    writer: state.writer || 0,
    records: Array.isArray(state.records)
      ? state.records.map(function (row) { return [row[0], row[1], row[2]]; })
      : [],
    // 内部账行：[动作名, 稳定键]；对外只暴露 [动作名]。
    ledger: Array.isArray(state.ledger)
      ? state.ledger.map(function (row) { return [row[0], row[1]]; })
      : [],
    applied: Array.isArray(state.applied) ? state.applied.slice() : []
  };
}

// 事件的稳定键：优先用 id；没有 id 时用“旧账数 + 本轮序号”。
function eventKey(event, index, ledgerBefore) {
  return event && event.id != null ? String(event.id) : "ev#" + (ledgerBefore + index);
}

// 按当前闸门判一条事件；不合法抛错，合法则推进状态并记一条动作。
function judge(state, kind, spec) {
  if (kind === "read_in") {
    if (state.writer > 0) {
      throw GateError(code(spec, "busy_code", "E_BUSY"), "read_in while writing");
    }
    const next = readIn(state);
    state.readers = next.readers;
    state.writer = next.writer;
  } else if (kind === "write_in") {
    if (state.readers > 0 || state.writer > 0) {
      throw GateError(code(spec, "busy_code", "E_BUSY"), "write_in while gate is busy");
    }
    const next = writeIn(state);
    state.readers = next.readers;
    state.writer = next.writer;
  } else if (kind === "read_out") {
    if (state.readers <= 0) {
      throw GateError(code(spec, "no_reader_code", "E_NO_READER"), "read_out with no reader");
    }
    state.readers -= 1;
  } else {
    if (state.writer <= 0) {
      throw GateError(code(spec, "no_writer_code", "E_NO_WRITER"), "write_out with no writer");
    }
    state.writer -= 1;
  }
  state.records.push([kind, state.readers, state.writer]);
}

export function step(spec) {
  const input = spec || {};
  const events = Array.isArray(input.events) ? input.events : [];

  // 结构不合法先校验（按当前闸门判之前）。
  for (const event of events) {
    if (!event || typeof event !== "object" || KINDS.indexOf(event.kind) < 0) {
      throw GateError(code(input, "event_error_code", "E_BAD_EVENT"), "bad event");
    }
  }

  const budget = Number.isFinite(input.budget) ? Math.max(0, Math.trunc(input.budget)) : 0;
  const state = cloneState(input.state);
  const carried = state.ledger.length;

  let served = 0;
  let spent = 0;

  // 先压旧账：账上的事件按原顺序优先处理。
  while (state.ledger.length > 0 && spent < budget) {
    const row = state.ledger.shift();
    if (state.applied.indexOf(row[1]) < 0) {
      judge(state, row[0], input);
      state.applied.push(row[1]);
    }
    served += 1;
    spent += 1;
  }

  // 再处理本轮新事件；预算用尽后剩余的连着载压账。
  events.forEach(function (event, index) {
    const key = eventKey(event, index, carried);
    if (state.applied.indexOf(key) >= 0) {
      return; // 重放：已处理过的不再处理，也不花预算。
    }
    if (spent >= budget) {
      state.ledger.push([event.kind, key]);
      return;
    }
    judge(state, event.kind, input);
    state.applied.push(key);
    served += 1;
    spent += 1;
  });

  return {
    state: state,
    served: served,
    ledger_before: state.ledger.length,
    ledger: state.ledger.map(function (row) { return [row[0]]; }),
    judged: served,
    judged_bound: carried + events.length
  };
}

export function close(spec) {
  const input = spec || {};
  const state = cloneState(input.state);
  let catchup = 0;

  while (state.ledger.length > 0) {
    const row = state.ledger.shift();
    if (state.applied.indexOf(row[1]) < 0) {
      judge(state, row[0], input);
      state.applied.push(row[1]);
    }
    catchup += 1;
  }

  return { state: state, catchup: catchup };
}
