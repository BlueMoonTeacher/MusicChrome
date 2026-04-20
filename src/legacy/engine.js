import { BUILD_DISPLAY } from "../constants.js";
import { getEngineMode } from "../audio/engineModeState.js";

  const BASE_MIN = 24;
  const BASE_MAX = 84;
  /** 2·3·4옥타브 = 24·36·48반음 — 프리로드는 최대 폭 기준 */
  const MAX_RANGE_SEMITONES = 48;
  const _useLocal = import.meta.env.VITE_LOCAL_SAMPLES === "1";
  const _root = (import.meta.env.BASE_URL || "/").replace(/\/?$/, "/");
  const SAMPLE_PRIMARY_BASE = _useLocal
    ? `${_root}samples/musyng/`
    : "https://cdn.jsdelivr.net/gh/gleitz/midi-js-soundfonts@gh-pages/MusyngKite/acoustic_grand_piano-mp3/";
  const SAMPLE_PRIMARY_MIRROR = _useLocal
    ? `${_root}samples/musyng/`
    : "https://raw.githubusercontent.com/gleitz/midi-js-soundfonts/gh-pages/MusyngKite/acoustic_grand_piano-mp3/";
  const SAMPLE_FALLBACK_BASE =
    "https://unpkg.com/@audio-samples/piano-mp3-release@1.0.5/audio/";
  const SAMPLE_FALLBACK_MIRROR =
    "https://cdn.jsdelivr.net/npm/@audio-samples/piano-mp3-release@1.0.5/audio/";

  const FLAT_FILE_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

  function midiToMusyngFile(midi) {
    return FLAT_FILE_NAMES[midi % 12] + (Math.floor(midi / 12) - 1) + ".mp3";
  }

  function midiToSalamanderRelFile(midi) {
    return "rel" + (midi - 20) + ".mp3";
  }

  let audioCtx = null;
  const activeVoices = new Map();

  let masterDry = null;
  let masterOut = null;
  let convolver = null;
  let reverbWet = null;
  let compressor = null;
  let masterMakeup = null;
  let masterUiGain = null;

  const sampleBuffers = new Map();
  let sampleState = "idle";

  function getAudioContext() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC();
    }
    return audioCtx;
  }


  function setSampleStatus(msg, tier) {
    const el = document.getElementById("sample-status");
    if (!el) return;
    el.textContent = msg;
    el.className = "sample-status" + (tier ? " sample-status--" + tier : "");
  }

  function syncVolumeFromUi() {
    var el = document.getElementById("gain-slider");
    var g = el ? parseFloat(el.value) / 100 : 2;
    if (isNaN(g) || g < 0) g = 0;
    if (g > 3) g = 3;
    if (masterUiGain) masterUiGain.gain.value = g;
  }

  function syncReverbFromUi() {
    var el = document.getElementById("reverb-slider");
    var w = el ? (parseFloat(el.value) / 100) * 0.95 : 0.24;
    if (isNaN(w) || w < 0) w = 0;
    if (w > 0.95) w = 0.95;
    if (reverbWet) reverbWet.gain.value = w;
  }

  function makeImpulseBuffer(ctx, seconds, decay) {
    const rate = ctx.sampleRate;
    const n = Math.max(1, Math.floor(rate * seconds));
    const buf = ctx.createBuffer(2, n, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < n; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
      }
    }
    return buf;
  }

  function ensureMasterBus() {
    if (masterOut) return;
    const ctx = getAudioContext();
    masterDry = ctx.createGain();
    masterDry.gain.value = 1.06;
    convolver = ctx.createConvolver();
    convolver.buffer = makeImpulseBuffer(ctx, 0.62, 2.0);
    reverbWet = ctx.createGain();
    reverbWet.gain.value = 0.24;
    masterOut = ctx.createGain();
    /* 청취 환경 대비 출력 (이전 대비 믹스 진폭 약 4배) */
    masterOut.gain.value = 8;
    compressor = ctx.createDynamicsCompressor();
    /* 길게 누른 뒤 다음 음이 눌리거나 씹히는 완화: 덜 세게·해제 조금 더 길게 */
    compressor.threshold.value = -14;
    compressor.knee.value = 20;
    compressor.ratio.value = 2.5;
    compressor.attack.value = 0.006;
    compressor.release.value = 0.42;
    masterMakeup = ctx.createGain();
    masterMakeup.gain.value = 1.18;
    masterUiGain = ctx.createGain();
    masterDry.connect(masterOut);
    convolver.connect(reverbWet);
    reverbWet.connect(masterOut);
    masterOut.connect(compressor);
    compressor.connect(masterMakeup);
    masterMakeup.connect(masterUiGain);
    masterUiGain.connect(ctx.destination);
    syncVolumeFromUi();
    syncReverbFromUi();
  }

  function resumeAudio() {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") {
      ctx.resume().catch(function () {});
    }
  }

  function initLegacyListeners() {
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) resumeAudio();
    });
    window.addEventListener("focus", resumeAudio);
    window.addEventListener("pageshow", function (ev) {
      if (ev.persisted) resumeAudio();
    });
  }

  function preloadSamples() {
    if (sampleState !== "idle") return Promise.resolve();
    sampleState = "loading";
    setSampleStatus("음원 파일 다운로드 중… (Network에 .mp3 표시)", "loading");

    const low = BASE_MIN;
    const high = BASE_MAX + MAX_RANGE_SEMITONES - 1;
    const midis = [];
    for (let m = low; m <= high; m++) midis.push(m);

    const concurrency = 8;
    const fetched = new Map();
    let fromPrimary = 0;
    let fromFallback = 0;

    function decodeBuffer(ctx, ab) {
      return new Promise(function (resolve, reject) {
        ctx.decodeAudioData(
          ab.slice(0),
          function (buf) {
            resolve(buf);
          },
          reject
        );
      });
    }

    function loadFromUrl(url) {
      return fetch(url).then(function (res) {
        if (!res.ok) throw new Error("bad status");
        return res.arrayBuffer();
      });
    }

    function fetchOne(midi) {
      const file = midiToMusyngFile(midi);
      const rel = midi - 20;
      const salName = rel >= 1 && rel <= 88 ? midiToSalamanderRelFile(midi) : null;
      const primaryUrls = [SAMPLE_PRIMARY_BASE + file, SAMPLE_PRIMARY_MIRROR + file];
      const fallbackUrls = salName
        ? [SAMPLE_FALLBACK_BASE + salName, SAMPLE_FALLBACK_MIRROR + salName]
        : [];

      function tryUrls(urls, isPrimary) {
        if (urls.length === 0) return Promise.reject();
        return loadFromUrl(urls[0])
          .then(function (ab) {
            if (isPrimary) fromPrimary++;
            else fromFallback++;
            fetched.set(midi, ab);
          })
          .catch(function () {
            return tryUrls(urls.slice(1), isPrimary);
          });
      }

      return tryUrls(primaryUrls, true)
        .catch(function () {
          return tryUrls(fallbackUrls, false);
        })
        .catch(function () {
          return null;
        });
    }

    function decodeOne(ctx, midi) {
      const ab = fetched.get(midi);
      if (!ab) return Promise.resolve();
      return decodeBuffer(ctx, ab).then(function (buf) {
        sampleBuffers.set(midi, buf);
      });
    }

    function finalizeSampleState() {
      if (sampleBuffers.size === 0) {
        sampleState = "error";
        setSampleStatus(
          "샘플 로드 실패 → 합성음입니다. 새로고침(Ctrl+F5) 또는 망 차단 확인",
          "synth"
        );
        console.warn("[Piano] Sample load failed — using synth. Build:", BUILD_DISPLAY);
        return;
      }
      sampleState = "ready";
      var miss = midis.filter(function (m) {
        return !sampleBuffers.has(m);
      });
      if (miss.length > 0) {
        console.warn("[Piano] Keys still without sample (will use synth):", miss.join(","));
      }
      if (fromFallback === 0) {
        setSampleStatus("고음질 샘플 적용됨 (MusyngKite) · " + BUILD_DISPLAY, "ok");
        console.info("[Piano] MusyngKite samples OK. Build:", BUILD_DISPLAY);
      } else if (fromPrimary === 0) {
        setSampleStatus(
          "저화질 샘플만 로드됨(jsDelivr 차단 의심) · " + BUILD_DISPLAY,
          "warn"
        );
        console.warn("[Piano] Only fallback samples. Primary CDN may be blocked.");
      } else {
        setSampleStatus("고음질+백업 혼합 로드 · " + BUILD_DISPLAY, "warn");
        console.warn("[Piano] Mixed primary/fallback samples.", fromPrimary, fromFallback);
      }
    }

    function runFetchChunk(start) {
      const chunk = midis.slice(start, start + concurrency);
      if (chunk.length === 0) {
        return Promise.resolve();
      }
      return Promise.all(chunk.map(fetchOne)).then(function () {
        const done = Math.min(start + concurrency, midis.length);
        setSampleStatus("음원 다운로드 " + done + "/" + midis.length, "loading");
        return runFetchChunk(start + concurrency);
      });
    }

    return runFetchChunk(0)
      .then(function () {
        const missF = midis.filter(function (m) {
          return !fetched.has(m);
        });
        if (missF.length === 0) return Promise.resolve();
        setSampleStatus("누락 음 재다운로드 " + missF.length + "개…", "loading");
        return Promise.all(missF.map(fetchOne));
      })
      .then(function () {
        setSampleStatus("음원 디코딩 중…", "loading");
        const ctx = getAudioContext();
        return Promise.all(midis.map(function (m) {
          return decodeOne(ctx, m);
        }));
      })
      .then(function () {
        const missD = midis.filter(function (m) {
          return !sampleBuffers.has(m);
        });
        if (missD.length === 0) {
          finalizeSampleState();
          return;
        }
        setSampleStatus("디코딩 재시도 " + missD.length + "개…", "loading");
        const ctx = getAudioContext();
        return Promise.all(missD.map(function (m) {
          return decodeOne(ctx, m);
        })).then(function () {
          finalizeSampleState();
        });
      })
      .catch(function () {
        sampleState = "error";
        setSampleStatus("음원 오류 · 합성음", "synth");
      });
  }

  function ensureSamplesLoading() {
    if (getEngineMode() !== "legacy") return;
    if (sampleState === "idle") {
      preloadSamples();
    }
  }

  function useSampleForMidi(midi) {
    return sampleState === "ready" && sampleBuffers.has(midi);
  }

  function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function isBlackKey(midi) {
    const pc = midi % 12;
    return pc === 1 || pc === 3 || pc === 6 || pc === 8 || pc === 10;
  }

  /**
   * 건반 간 체감 음량 보정: 샘플·합성 공통. 고음이 작게 느껴지는 경향을 줄이기 위해
   * 중·고역에서 2차 항으로 추가 게인(대략 36~106 MIDI 구간).
   */
  function perNoteLevelMultiplier(midi) {
    var low = 36;
    var high = 106;
    var u = (midi - low) / (high - low);
    if (u < 0) u = 0;
    if (u > 1) u = 1;
    return 0.92 + u * 0.3 + u * u * 0.48;
  }

  function hardStopVoice(midi) {
    const v = activeVoices.get(midi);
    if (!v) return;
    if (v.kind === "sample") {
      try {
        v.source.stop(0);
      } catch (e) {}
    } else if (v.oscs) {
      v.oscs.forEach(function (o) {
        try {
          o.stop(0);
        } catch (e) {}
      });
    }
    activeVoices.delete(midi);
  }

  function noteOnSynth(midi) {
    const ctx = getAudioContext();
    ensureMasterBus();

    const freq = midiToFreq(midi);
    const t = ctx.currentTime;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 0.35;
    const bright = Math.min(8800, 750 + midi * 52);
    const body = Math.min(5800, 400 + midi * 42);
    filter.frequency.setValueAtTime(bright, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(350, body), t + 0.09);

    const harmonics = [
      { n: 1, level: 1, type: "sine", detune: 0 },
      { n: 2, level: 0.2, type: "sine", detune: 4.5 },
      { n: 3, level: 0.09, type: "sine", detune: -3.5 },
      { n: 4, level: 0.045, type: "sine", detune: 2.5 },
      { n: 5, level: 0.022, type: "triangle", detune: -2 }
    ];

    const oscs = [];
    harmonics.forEach(function (h) {
      const o = ctx.createOscillator();
      o.type = h.type;
      o.frequency.value = freq * h.n;
      o.detune.value = h.detune;
      const hg = ctx.createGain();
      hg.gain.value = h.level;
      o.connect(hg);
      hg.connect(filter);
      o.start(t);
      oscs.push(o);
    });

    const vGain = ctx.createGain();
    filter.connect(vGain);

    var lvl = perNoteLevelMultiplier(midi);
    const peak = 0.28 * lvl;
    const afterHammer = peak * 0.55;
    const sustainLvl = peak * 0.42;
    vGain.gain.setValueAtTime(0, t);
    vGain.gain.linearRampToValueAtTime(peak, t + 0.004);
    vGain.gain.exponentialRampToValueAtTime(Math.max(afterHammer, 0.001), t + 0.08);
    vGain.gain.linearRampToValueAtTime(Math.max(sustainLvl, 0.001), t + 0.35);
    /* sustainLvl 이후로 게인이 더 줄지 않음 → 손을 뗄 때 noteOff에서 릴리스 */

    const drySend = ctx.createGain();
    drySend.gain.value = 1;
    const wetSend = ctx.createGain();
    wetSend.gain.value = 0.3;
    vGain.connect(drySend);
    vGain.connect(wetSend);
    drySend.connect(masterDry);
    wetSend.connect(convolver);

    activeVoices.set(midi, { kind: "synth", oscs: oscs, vGain: vGain, filter: filter, drySend: drySend, wetSend: wetSend });
  }

  function noteOnSample(midi, buf) {
    const ctx = getAudioContext();
    ensureMasterBus();
    const t = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    /* 루프 범위: 안정적인 서스테인 구간만 반복 (어택 제외) */
    var loopStart = Math.min(0.4, buf.duration * 0.15);
    var loopEnd = buf.duration - 0.01;
    if (loopEnd > loopStart + 0.1) {
      src.loopStart = loopStart;
      src.loopEnd = loopEnd;
    }

    const vGain = ctx.createGain();
    var samplePeak = Math.min(1.58, 1.02 * perNoteLevelMultiplier(midi));
    vGain.gain.setValueAtTime(0, t);
    vGain.gain.linearRampToValueAtTime(samplePeak, t + 0.02);

    src.connect(vGain);

    const drySend = ctx.createGain();
    drySend.gain.value = 1;
    const wetSend = ctx.createGain();
    wetSend.gain.value = 0.26;
    vGain.connect(drySend);
    vGain.connect(wetSend);
    drySend.connect(masterDry);
    wetSend.connect(convolver);

    src.start(t);
    activeVoices.set(midi, { kind: "sample", source: src, vGain: vGain, drySend: drySend, wetSend: wetSend });
  }

  function noteOn(midi) {
    resumeAudio();
    ensureSamplesLoading();
    ensureMasterBus();

    hardStopVoice(midi);

    if (useSampleForMidi(midi)) {
      noteOnSample(midi, sampleBuffers.get(midi));
    } else {
      noteOnSynth(midi);
    }
  }

  function noteOffSynth(v, midi) {
    const ctx = getAudioContext();
    const t = ctx.currentTime;
    const g = v.vGain.gain;
    g.cancelScheduledValues(t);
    const cur = Math.max(g.value, 0.0001);
    g.setValueAtTime(cur, t);
    g.exponentialRampToValueAtTime(0.0001, t + 0.36);
    const stopT = t + 0.48;
    v.oscs.forEach(function (o) {
      try {
        o.stop(stopT);
      } catch (e) {}
    });
    activeVoices.delete(midi);
  }

  function noteOffSample(v, midi) {
    const ctx = getAudioContext();
    const t = ctx.currentTime;
    const g = v.vGain.gain;
    g.cancelScheduledValues(t);
    const cur = Math.max(g.value, 0.0001);
    g.setValueAtTime(cur, t);
    const damped = Math.max(cur * 0.42, 0.035);
    g.exponentialRampToValueAtTime(damped, t + 0.08);
    g.exponentialRampToValueAtTime(0.0001, t + 0.85);
    const stopT = t + 0.95;
    try {
      v.source.stop(stopT);
    } catch (e) {}
    activeVoices.delete(midi);
  }

  function noteOff(midi) {
    const v = activeVoices.get(midi);
    if (!v) return;
    if (v.kind === "sample") {
      noteOffSample(v, midi);
    } else {
      noteOffSynth(v, midi);
    }
  }

  function legacyStopAll() {
    for (const midi of [...activeVoices.keys()]) {
      hardStopVoice(midi);
    }
  }

  export {
    noteOn as legacyNoteOn,
    noteOff as legacyNoteOff,
    resumeAudio as legacyResume,
    ensureSamplesLoading,
    ensureMasterBus,
    syncVolumeFromUi,
    syncReverbFromUi,
    initLegacyListeners,
    legacyStopAll,
  };
