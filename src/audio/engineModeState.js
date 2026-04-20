/** @typedef {"legacy" | "tone" | "magenta"} EngineId */

let mode = /** @type {EngineId} */ ("legacy");

export function getEngineMode() {
  return mode;
}

export function setEngineModeState(next) {
  mode = next;
}
