import * as Tone from "tone";
/* package index는 webmidi 의존 MidiInput을 끌어와 Vite 빌드가 실패하므로 Piano만 직접 로드 */
import { Piano } from "@tonejs/piano/build/piano/Piano.js";

const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function midiToNoteName(midi) {
  const m = Math.round(midi);
  return SHARP_NAMES[m % 12] + (Math.floor(m / 12) - 1);
}

function sliderToDb(linear) {
  if (linear <= 0.001) return -60;
  return Math.max(-48, Math.min(12, 20 * Math.log10(linear * 0.5)));
}

/**
 * Tone.js + @tonejs/piano (Salamander multi-sample, MIT)
 */
export async function createTonePianoEngine() {
  await Tone.start();
  const piano = new Piano({ velocities: 5 }).toDestination();
  await piano.load();

  return {
    async dispose() {
      try {
        piano.dispose();
      } catch (e) {}
    },

    noteOn(midi) {
      const n = midiToNoteName(midi);
      piano.keyDown(n, undefined, 0.82);
    },

    noteOff(midi) {
      const n = midiToNoteName(midi);
      piano.keyUp(n);
    },

    stopAll() {
      for (let m = 21; m <= 108; m++) {
        try {
          piano.keyUp(midiToNoteName(m));
        } catch (e) {}
      }
    },

    applyGainLinear(linear) {
      Tone.Destination.volume.rampTo(sliderToDb(linear), 0.05);
    },

    /** 리버브는 Tone 경로에서 별도 이펙트 없음 — UI 슬라이더는 무시 */
    applyReverb() {},
  };
}
