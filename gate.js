// gate.js：进出后的闸门状态（纯状态转移；不合法时保持原样）
export function readIn(state) {
  if (state.writer > 0) {
    return state;
  }
  return {
    readers: state.readers + 1,
    writer: state.writer,
    records: state.records,
    ledger: state.ledger,
    applied: state.applied
  };
}

export function writeIn(state) {
  if (state.readers > 0 || state.writer > 0) {
    return state;
  }
  return {
    readers: state.readers,
    writer: state.writer + 1,
    records: state.records,
    ledger: state.ledger,
    applied: state.applied
  };
}
