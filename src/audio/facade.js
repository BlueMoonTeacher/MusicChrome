import * as Legacy from "../legacy/engine.js";
import { ENGINE_STORAGE_KEY } from "../constants.js";

/** @typedef {"legacy" | "tone" | "magenta"} EngineId */

let mode = /** @type {EngineId} */ ("legacy");
let toneApi = null;
let magentaApi = null;
let switching = false;

function getSavedMode() {
  try {
    const v = localStorage.getItem(ENGINE_STORAGE_KEY);
    if (v === "tone" || v === "magenta" || v === "legacy") return v;
  } catch (e) {}
  return "legacy";
}

export function getMode() {
  return mode;
}

export async function initAudioFacade() {
  mode = getSavedMode();
  Legacy.initLegacyListeners();
  const sel = document.getElementById("engine-mode");
  if (sel) sel.value = mode;
}

async function stopAlternateEngines() {
  if (toneApi) {
    try {
      toneApi.stopAll();
      await toneApi.dispose();
    } catch (e) {}
    toneApi = null;
  }
  if (magentaApi) {
    try {
      magentaApi.stopAll();
      await magentaApi.dispose();
    } catch (e) {}
    magentaApi = null;
  }
}

export async function setEngineMode(next) {
  if (switching || next === mode) return;
  switching = true;
  const status = document.getElementById("sample-status");
  try {
    if (status) {
      status.textContent = "음원 모드 전환 중…";
      status.className = "sample-status sample-status--loading";
    }

    Legacy.legacyStopAll();
    await stopAlternateEngines();

    if (next === "legacy") {
      mode = "legacy";
    } else if (next === "tone") {
      const { createTonePianoEngine } = await import("./toneEngine.js");
      toneApi = await createTonePianoEngine();
      mode = "tone";
      if (status) {
        status.textContent = "Tone·Salamander 피아노 준비됨 (리버브는 기본 엔진 전용)";
        status.className = "sample-status sample-status--ok";
      }
    } else if (next === "magenta") {
      const { createMagentaEngine } = await import("./magentaEngine.js");
      magentaApi = await createMagentaEngine();
      mode = "magenta";
      if (status) {
        status.textContent = "Magenta SGM+ 피아노 준비됨";
        status.className = "sample-status sample-status--ok";
      }
    }

    try {
      localStorage.setItem(ENGINE_STORAGE_KEY, mode);
    } catch (e) {}

    applySlidersToEngine();
  } catch (err) {
    console.error("[Piano] Engine switch failed:", err);
    mode = "legacy";
    if (status) {
      status.textContent = "모드 전환 실패 → 기본 엔진 사용";
      status.className = "sample-status sample-status--warn";
    }
  } finally {
    switching = false;
  }
}

function gainLinearFromUi() {
  const el = document.getElementById("gain-slider");
  let g = el ? parseFloat(el.value) / 100 : 2;
  if (isNaN(g) || g < 0) g = 0;
  if (g > 3) g = 3;
  return g;
}

export function applySlidersToEngine() {
  const g = gainLinearFromUi();
  if (mode === "legacy") {
    Legacy.ensureMasterBus();
    Legacy.syncVolumeFromUi();
    Legacy.syncReverbFromUi();
  } else if (mode === "tone" && toneApi) {
    toneApi.applyGainLinear(g);
  } else if (mode === "magenta" && magentaApi) {
    magentaApi.applyGainLinear(g);
  }
}

export async function resumeAll() {
  Legacy.legacyResume();
  if (mode === "tone" || mode === "magenta") {
    const Tone = (await import("tone")).default || (await import("tone"));
    await Tone.start();
  }
}

async function ensureAlternateLoaded() {
  if (mode === "tone" && !toneApi) {
    const { createTonePianoEngine } = await import("./toneEngine.js");
    toneApi = await createTonePianoEngine();
    const st = document.getElementById("sample-status");
    if (st) {
      st.textContent = "Tone·Salamander 피아노 준비됨";
      st.className = "sample-status sample-status--ok";
    }
  }
  if (mode === "magenta" && !magentaApi) {
    const { createMagentaEngine } = await import("./magentaEngine.js");
    magentaApi = await createMagentaEngine();
    const st = document.getElementById("sample-status");
    if (st) {
      st.textContent = "Magenta SGM+ 피아노 준비됨";
      st.className = "sample-status sample-status--ok";
    }
  }
}

export async function noteOn(midi) {
  await resumeAll();
  if (mode === "tone" || mode === "magenta") {
    await ensureAlternateLoaded();
    applySlidersToEngine();
  }
  if (mode === "legacy") {
    Legacy.legacyNoteOn(midi);
  } else if (mode === "tone" && toneApi) {
    toneApi.noteOn(midi);
  } else if (mode === "magenta" && magentaApi) {
    magentaApi.noteOn(midi);
  } else {
    Legacy.legacyNoteOn(midi);
  }
}

export async function noteOff(midi) {
  if (mode === "legacy") {
    Legacy.legacyNoteOff(midi);
  } else if (mode === "tone" && toneApi) {
    toneApi.noteOff(midi);
  } else if (mode === "magenta" && magentaApi) {
    magentaApi.noteOff(midi);
  } else {
    Legacy.legacyNoteOff(midi);
  }
}
