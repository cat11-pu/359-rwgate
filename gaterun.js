// gaterun.js：按共用处理预算判定闸门；用尽的事件连着压账，close 不限预算补齐
import { readIn, writeIn } from "./gate.js";

const KINDS = ["read_in", "read_out", "write_in", "write_out"];

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function code(spec, key, fallback) {
  return (spec && spec[key]) || fallback;
}

function startState(state) {
  return {
    readers: (state && state.readers) || 0,
    writer: (state && state.writer) || 0,
    records: (state && state.records) ? state.records.slice() : [],
    ledger: (state && state.ledger) ? state.ledger.map(function (row) { return row.slice(); }) : [],
    applied: (state && state.applied) ? state.applied.slice() : []
  };
}

function validate(events, spec) {
  if (!Array.isArray(events)) {
    fail(code(spec, "event_error_code", "E_BAD_EVENT"), "events 必须是数组");
  }
  for (const event of events) {
    if (!event || typeof event !== "object" || KINDS.indexOf(event.kind) === -1) {
      fail(code(spec, "event_error_code", "E_BAD_EVENT"), "事件结构不合法");
    }
  }
}

function applyKind(kind, next, spec) {
  if (kind === "read_in") {
    if (next.writer > 0) {
      fail(code(spec, "busy_code", "E_BUSY"), "有写者，进读不合法");
    }
    next.readers += 1;
  } else if (kind === "read_out") {
    if (next.readers <= 0) {
      fail(code(spec, "no_reader_code", "E_NO_READER"), "没有读者，出读不合法");
    }
    next.readers -= 1;
  } else if (kind === "write_in") {
    if (next.readers > 0 || next.writer > 0) {
      fail(code(spec, "busy_code", "E_BUSY"), "有人读或在写，进写不合法");
    }
    next.writer += 1;
  } else {
    if (next.writer <= 0) {
      fail(code(spec, "no_writer_code", "E_NO_WRITER"), "没有写者，出写不合法");
    }
    next.writer -= 1;
  }
  next.records.push([kind, next.readers, next.writer]);
}

function run(spec, budget) {
  const events = spec.events || [];
  validate(events, spec);

  const next = startState(spec.state);
  const ledgerBefore = next.ledger.length;

  const source = [];
  const queuedIds = {};
  next.ledger.forEach(function (row) {
    const item = { kind: row[0], fromLedger: true };
    if (typeof row[1] !== "undefined") {
      item.id = row[1];
      queuedIds[row[1]] = true;
    }
    source.push(item);
  });
  events.forEach(function (event) {
    const queued = typeof event.id !== "undefined"
      && Object.prototype.hasOwnProperty.call(queuedIds, event.id);
    if (!queued && next.applied.indexOf(event.id) === -1) {
      source.push({ id: event.id, kind: event.kind, fromLedger: false });
    }
  });

  let served = 0;
  let judged = 0;
  let reachLedger = false;

  for (let i = 0; i < source.length; i += 1) {
    const item = source[i];
    if (item.fromLedger) {
      reachLedger = true;
    }

    if (!item.fromLedger && typeof item.id !== "undefined"
      && next.applied.indexOf(item.id) !== -1) {
      continue;
    }

    if (judged >= budget) {
      if (!item.fromLedger) {
        next.ledger.push(typeof item.id === "undefined"
          ? [item.kind]
          : [item.kind, item.id]);
      }
      continue;
    }

    judged += 1;
    applyKind(item.kind, next, spec);
    if (typeof item.id !== "undefined" && next.applied.indexOf(item.id) === -1) {
      next.applied.push(item.id);
    }
    served += 1;
  }

  if (reachLedger) {
    next.ledger.splice(0, Math.min(ledgerBefore, served));
  }

  return {
    state: next,
    served: served,
    ledger_before: next.ledger.length,
    ledger: next.ledger.map(function (row) { return [row[0]]; }),
    judged: judged,
    judged_bound: ledgerBefore + events.length
  };
}

export function step(spec) {
  return run(spec, spec.budget);
}

export function close(spec) {
  const result = run(spec, Number.POSITIVE_INFINITY);
  return { state: result.state, catchup: result.served };
}
