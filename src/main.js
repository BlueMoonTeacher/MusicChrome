import "./styles.css";
import * as Facade from "./audio/facade.js";
import * as Legacy from "./legacy/engine.js";
import { initPianoUi } from "./piano-ui.js";

async function boot() {
  await Facade.initAudioFacade();
  initPianoUi();
  if (Facade.getMode() === "legacy") {
    Legacy.ensureSamplesLoading();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", function () {
    void boot();
  });
} else {
  void boot();
}
