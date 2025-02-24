// TrainingLoop
//import { createOrLoadModel } from "./model";
//import { predictAndAct } from "./inference";
//import { trainModel } from "./train";
//import { checkGameOver, restartGame } from "./game";

const GAME_LEN = 500;

async function startAI(canvasId, epochs, episodes=10) {
  let runCount = 0;  // Local variable that resets with each startAI call
  await createOrLoadModel();
  
  const gameInterval = setInterval(async () => {
    if (runCount >= episodes) {
      console.log(`Training completed after ${episodes} episodes!`);
      return;
    }

    await predictAndAct(canvasId);
    if (checkGameOver()) {
      await trainModel(epochs);
      runCount++;
      console.log(`Completed run ${runCount}/${episodes}`);
      restartGame();
    }
  }, GAME_LEN);
}

// Execute with canvas ID
startAI("screen", 100);
