import {
  NOTE_NAMES,
  KO_SYLLABLE,
  BASE_MIN,
  BASE_MAX,
  BUILD_DISPLAY,
} from "./constants.js";
import * as Facade from "./audio/facade.js";
import * as Legacy from "./legacy/engine.js";

let baseMidi = 48;
let showLabels = true;
let rangeSemitones = 24;

function isBlackKey(midi) {
  const pc = midi % 12;
  return pc === 1 || pc === 3 || pc === 6 || pc === 8 || pc === 10;
}

function formatMidiRange(low, high) {
  return (
    NOTE_NAMES[low % 12] +
    Math.floor(low / 12) +
    " – " +
    NOTE_NAMES[high % 12] +
    Math.floor(high / 12)
  );
}

function updateRangeLabel() {
  const el = document.getElementById("range-label");
  const low = baseMidi;
  const high = baseMidi + rangeSemitones - 1;
  const oct = rangeSemitones / 12;
  el.textContent = formatMidiRange(low, high) + " (" + oct + "옥타브)";
}

function octavesFromSemitones(semi) {
  return semi / 12;
}

function syllableForMidi(midi) {
  return KO_SYLLABLE[midi % 12] || "";
}

function getMaxBase() {
  return Math.max(BASE_MIN, BASE_MAX + 12 - rangeSemitones);
}

export function setRangeModeSemitones(semi) {
  if (semi !== 24 && semi !== 36 && semi !== 48) return;
  rangeSemitones = semi;
  let maxBase = getMaxBase();
  if (baseMidi > maxBase) baseMidi = maxBase;
  document.querySelectorAll(".btn--mode").forEach(function (b) {
    const on = parseInt(b.getAttribute("data-octaves"), 10) * 12 === semi;
    b.classList.toggle("is-active", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  });
  const main = document.getElementById("piano");
  if (main) {
    main.setAttribute("aria-label", String(octavesFromSemitones(semi)) + "옥타브 피아노 건반");
  }
  buildKeyboard();
}

function buildKeyboard() {
  const piano = document.getElementById("piano");
  piano.innerHTML = "";
  piano.dataset.octaves = String(octavesFromSemitones(rangeSemitones));

  const low = baseMidi;
  const high = baseMidi + rangeSemitones - 1;
  const notes = [];
  for (let m = low; m <= high; m++) notes.push(m);

  const whites = notes.filter(function (m) {
    return !isBlackKey(m);
  });
  const blacks = notes.filter(isBlackKey);

  const row = document.createElement("div");
  row.className = "keys-white";
  row.style.setProperty("--white-count", String(whites.length));

  const nw = whites.length;
  const oneWhitePct = 100 / nw;
  const blackWpct = oneWhitePct * 0.52;

  whites.forEach(function (midi) {
    const key = document.createElement("button");
    key.type = "button";
    key.className = "key key-white";
    key.dataset.midi = String(midi);
    key.setAttribute("aria-label", NOTE_NAMES[midi % 12] + Math.floor(midi / 12));

    const lab = document.createElement("span");
    lab.className = "key-label" + (showLabels ? "" : " is-hidden");
    lab.textContent = showLabels ? syllableForMidi(midi) : "";
    key.appendChild(lab);

    bindKeyPointer(key, midi);
    row.appendChild(key);
  });

  blacks.forEach(function (midi) {
    let wb = -1;
    for (let i = 0; i < whites.length; i++) {
      if (whites[i] < midi) wb = i;
    }
    const leftPct = (wb + 1) * oneWhitePct - blackWpct / 2;

    const key = document.createElement("button");
    key.type = "button";
    key.className = "key key-black";
    key.dataset.midi = String(midi);
    key.style.left = leftPct + "%";
    key.style.width = blackWpct + "%";
    key.setAttribute("aria-label", NOTE_NAMES[midi % 12] + Math.floor(midi / 12));

    const lab = document.createElement("span");
    lab.className = "key-label" + (showLabels ? "" : " is-hidden");
    lab.textContent = showLabels ? syllableForMidi(midi) : "";
    key.appendChild(lab);

    bindKeyPointer(key, midi);
    row.appendChild(key);
  });

  piano.appendChild(row);
  updateRangeLabel();
}

function bindKeyPointer(el, midi) {
  let activePointerId = null;

  el.addEventListener(
    "pointerdown",
    function (e) {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      e.preventDefault();
      void Facade.resumeAll();
      if (Facade.getMode() === "legacy") {
        void Legacy.ensureSamplesLoading();
      }
      activePointerId = e.pointerId;
      try {
        el.setPointerCapture(e.pointerId);
      } catch (err) {}
      el.classList.add("is-active");
      void Facade.noteOn(midi);
    },
    { passive: false }
  );

  function release(e) {
    if (activePointerId === null || e.pointerId !== activePointerId) return;
    try {
      el.releasePointerCapture(activePointerId);
    } catch (err) {}
    activePointerId = null;
    el.classList.remove("is-active");
    void Facade.noteOff(midi);
    void Facade.resumeAll();
  }

  el.addEventListener("pointerup", release);
  el.addEventListener("pointercancel", release);
  el.addEventListener("lostpointercapture", function (e) {
    if (activePointerId === null || e.pointerId !== activePointerId) return;
    activePointerId = null;
    el.classList.remove("is-active");
    void Facade.noteOff(midi);
    void Facade.resumeAll();
  });
}

function setOctaveDelta(delta) {
  let next = baseMidi + delta;
  if (next < BASE_MIN) next = BASE_MIN;
  const mb = getMaxBase();
  if (next > mb) next = mb;
  if (next === baseMidi) return;
  baseMidi = next;
  buildKeyboard();
}

function toggleLabels() {
  showLabels = !showLabels;
  const btn = document.getElementById("toggle-labels");
  btn.setAttribute("aria-pressed", showLabels ? "true" : "false");
  btn.textContent = showLabels ? "계이름 끄기" : "계이름 켜기";
  document.querySelectorAll(".key-label").forEach(function (lab) {
    lab.classList.toggle("is-hidden", !showLabels);
    const key = lab.closest(".key");
    if (!key) return;
    const midi = parseInt(key.dataset.midi, 10);
    if (showLabels) {
      lab.textContent = syllableForMidi(midi);
    }
  });
}

function toggleFullscreen() {
  const root = document.documentElement;
  if (!document.fullscreenElement) {
    try {
      const p = root.requestFullscreen({ navigationUI: "hide" });
      if (p !== undefined && p !== null && typeof p.then === "function") {
        p.catch(function () {
          root.requestFullscreen().catch(function () {});
        });
      }
    } catch (err) {
      root.requestFullscreen().catch(function () {});
    }
  } else {
    document.exitFullscreen().catch(function () {});
  }
}

function wireAudioSliders() {
  const vol = document.getElementById("gain-slider");
  const rev = document.getElementById("reverb-slider");
  function onVol() {
    Legacy.ensureMasterBus();
    Facade.applySlidersToEngine();
  }
  function onRev() {
    Legacy.ensureMasterBus();
    Facade.applySlidersToEngine();
  }
  if (vol) {
    vol.addEventListener("input", onVol);
    vol.addEventListener("change", onVol);
  }
  if (rev) {
    rev.addEventListener("input", onRev);
    rev.addEventListener("change", onRev);
  }
}

function wireEngineModeSelect() {
  const sel = document.getElementById("engine-mode");
  if (!sel) return;
  sel.addEventListener("change", function () {
    const v = sel.value;
    if (v === "legacy" || v === "tone" || v === "magenta") {
      void Facade.setEngineMode(v);
    }
  });
}

export function initPianoUi() {
  document.addEventListener(
    "contextmenu",
    function (e) {
      e.preventDefault();
    },
    true
  );
  document.addEventListener(
    "auxclick",
    function (e) {
      if (e.button === 2) e.preventDefault();
    },
    true
  );

  wireAudioSliders();
  wireEngineModeSelect();

  const pianoHost = document.getElementById("piano");
  if (pianoHost) {
    pianoHost.addEventListener("dragstart", function (e) {
      e.preventDefault();
    });
  }

  document.getElementById("octave-down").addEventListener("click", function () {
    setOctaveDelta(-12);
  });
  document.getElementById("octave-up").addEventListener("click", function () {
    setOctaveDelta(12);
  });
  document.getElementById("toggle-labels").addEventListener("click", toggleLabels);
  document.getElementById("fullscreen").addEventListener("click", toggleFullscreen);

  document.querySelectorAll(".btn--mode").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const oct = parseInt(btn.getAttribute("data-octaves"), 10);
      if (oct >= 2 && oct <= 4) setRangeModeSemitones(oct * 12);
    });
  });

  document.body.addEventListener(
    "click",
    function firstResume() {
      Legacy.legacyResume();
      if (Facade.getMode() === "legacy") {
        Legacy.ensureSamplesLoading();
      }
      document.body.removeEventListener("click", firstResume);
    },
    { once: true }
  );

  setRangeModeSemitones(24);

  const tb = document.querySelector(".toolbar-build");
  if (tb) tb.textContent = "빌드 " + BUILD_DISPLAY;
}
