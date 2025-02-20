import * as tf from '@tensorflow/tfjs'


const ACTIONS = ["w", "s", "a", "d"]; // Ensure lowercase (some games require this)


async function predictAndAct(canvasId) {
    if (!model) {
      console.error("Model not initialized! Attempting to create/load model...");
      await createOrLoadModel();
      if (!model) {
        console.error("Failed to initialize model!");
        return;
      }
    }
  
    // Check if interrupted
    if (isInterrupted) {
        isInterrupted = false; // Reset for next time
        return;
    }

    const tensor = await getProcessedCanvasTensors(canvasId, FRAME_SEQ_LEN);
    if (!tensor) return;
  
    const prediction = model.predict(tensor);
    const probabilities = prediction.dataSync();
    const actionIndex = probabilities.indexOf(Math.max(...probabilities));
  
    //console.log("Predicted Action:", ACTIONS[actionIndex], "Probabilities:", probabilities);
  
    // Store state, action, and reward for training
    gameStates.push(tensor);
    gameActions.push(actionIndex);
    gameRewards.push(checkGameOver() ? 1 : 0);
    
    // Send keypress to the game
    sendKeyPress(ACTIONS[actionIndex]);
  
    // Continue predicting in the next frame if not game over
    if (!checkGameOver()) {
        requestAnimationFrame(() => predictAndAct(canvasId));
    }
}
