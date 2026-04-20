import * as Tone from "tone";

const SGM_PLUS =
  "https://storage.googleapis.com/magentadata/js/soundfonts/sgm_plus";

/**
 * SGM+ 는 velocity 를 instrument.json 의 단계(15…127)로 스냅함.
 * 예: 재생 velocity 100 → nearest 95 → p60_v95 필요. [40,80,120] 만 프리로드하면 v95 가 빠져 Buffer not found 발생.
 * 연주는 한 층(95)만 쓰므로 해당 티어만 로드해 요청 수·시간을 줄임.
 */
const PRELOAD_VELOCITY = 95;

/**
 * @magenta/music SoundFontPlayer — acoustic grand (program 0), 지연 로딩
 */
export async function createMagentaEngine() {
  const { SoundFontPlayer } = await import("@magenta/music/esm/core/player.js");
  const out = Tone.Destination;
  const player = new SoundFontPlayer(SGM_PLUS, out);

  const notes = [];
  for (let p = 21; p <= 108; p++) {
    notes.push({ pitch: p, velocity: PRELOAD_VELOCITY, program: 0, isDrum: false });
  }
  await player.loadSamples({ notes });

  return {
    async dispose() {},

    noteOn(midi) {
      player.playNoteDown({
        pitch: midi,
        velocity: PRELOAD_VELOCITY,
        program: 0,
        isDrum: false,
      });
    },

    noteOff(midi) {
      player.playNoteUp({
        pitch: midi,
        velocity: PRELOAD_VELOCITY,
        program: 0,
        isDrum: false,
      });
    },

    stopAll() {
      for (let m = 21; m <= 108; m++) {
        try {
          player.playNoteUp({
            pitch: m,
            velocity: PRELOAD_VELOCITY,
            program: 0,
            isDrum: false,
          });
        } catch (e) {}
      }
    },

    applyGainLinear(linear) {
      const db =
        linear <= 0.001
          ? -60
          : Math.max(-48, Math.min(3, 20 * Math.log10(linear * 0.4)));
      Tone.Destination.volume.rampTo(db, 0.05);
    },

    applyReverb() {},
  };
}
