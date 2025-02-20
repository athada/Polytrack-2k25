// TrainingLoop
import { createOrLoadModel } from "./model";
import { predictAndAct } from "./inference";
import { trainModel } from "./train";
import { checkGameOver, restartGame } from "./game";

async function startAI(canvasId, epochs) {
  await createOrLoadModel();
  setInterval(async () => {
    await predictAndAct(canvasId);
    if (checkGameOver()) {
      await trainModel();
      restartGame(); // Restart from Beginning
    }
  }, GAME_LEN);
}

// Execute with canvas ID
startAI("screen", 100);

// Adding interrupt Listener
window.addEventListener("keydown", (e) => {
  if (e.key === "i") {
    isInterrupted = true;
    console.log("Interrupted");
  }
});
