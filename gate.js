// gate.js：进出后的闸门状态（不合法时保持原样，不改动入参）
export function readIn(state) {
  if (state.writer > 0) return state;
  return Object.assign({}, state, { readers: state.readers + 1 });
}

export function writeIn(state) {
  if (state.readers > 0 || state.writer > 0) return state;
  return Object.assign({}, state, { writer: 1 });
}
