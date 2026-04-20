import * as Tone from "tone";

const SGM_PLUS =
  "https://storage.googleapis.com/magentadata/js/soundfonts/sgm_plus";

/**
 * @magenta/music SoundFontPlayer — acoustic grand (program 0), 지연 로딩
 */
export async function createMagentaEngine() {
  const { SoundFontPlayer } = await import("@magenta/music/esm/core/player.js");
  const out = Tone.Master || Tone.Destination;
  const player = new SoundFontPlayer(SGM_PLUS, out);

  const notes = [];
  for (let p = 24; p <= 108; p++) {
    for (const v of [40, 80, 120]) {
      notes.push({ pitch: p, velocity: v, program: 0, isDrum: false });
    }
  }
  await player.loadSamples({ notes });

  return {
    async dispose() {},

    noteOn(midi) {
      player.playNoteDown({
        pitch: midi,
        velocity: 100,
        program: 0,
        isDrum: false,
      });
    },

    noteOff(midi) {
      player.playNoteUp({
        pitch: midi,
        velocity: 100,
        program: 0,
        isDrum: false,
      });
    },

    stopAll() {
      for (let m = 21; m <= 108; m++) {
        try {
          player.playNoteUp({
            pitch: m,
            velocity: 100,
            program: 0,
            isDrum: false,
          });
        } catch (e) {}
      }
    },

    applyGainLinear(linear) {
      const db = linear <= 0.001 ? -60 : Math.max(-48, Math.min(12, 20 * Math.log10(linear * 0.45)));
      Tone.Destination.volume.rampTo(db, 0.05);
    },

    applyReverb() {},
  };
}
