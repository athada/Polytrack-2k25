// Import TensorFlow.js from CDN
// At the top of your file
async function initTF() {
  await import("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs");
  await tf.ready();
  console.log("TensorFlow.js initialized with backend:", tf.getBackend());
}

// Make sure to await this before starting your AI
await initTF();
// Constants
const CANVAS_SIZE = 224;
const N_FRAMES = 8;
const FRAME_SEQ_LEN = 8;
const ACTIONS = ["w", "s", "a", "d"];
const GAME_LEN = 100;
const SPEED_THRESHOLD = 200;
const N_EPISODES = 10;
const N_EPOCHS = 10;
const BATCH_SIZE = 4;

// Global variables
let model;
let isInterrupted = false;
let gameRewards = [];
let gameStates = [];
let gameActions = [];

// Model-related functions
async function createOrLoadModel(trainMode = false) {
  if (!trainMode) {
    try {
      const loadedModel = await loadLatestModel();
      if (!loadedModel) {
        throw new Error("No saved models found");
      }
      model = loadedModel;
      console.log("Loaded existing model.");
      return;
    } catch (error) {
      console.warn("No saved model found, creating a new one:", error.message);
    }
  }

  model = tf.sequential();
  model.add(
    tf.layers.conv2d({
      inputShape: [CANVAS_SIZE, CANVAS_SIZE, N_FRAMES],
      filters: 8,
      kernelSize: 3,
      activation: "relu",
    })
  );
  model.add(tf.layers.maxPooling2d({ poolSize: 2, strides: 2 }));
  model.add(
    tf.layers.conv2d({ filters: 16, kernelSize: 3, activation: "relu" })
  );
  model.add(tf.layers.maxPooling2d({ poolSize: 2, strides: 2 }));
  model.add(tf.layers.flatten());
  model.add(tf.layers.dense({ units: 32, activation: "relu" }));
  model.add(tf.layers.dense({ units: 4, activation: "softmax" }));

  model.compile({
    optimizer: "adam",
    loss: "categoricalCrossentropy",
    metrics: ["accuracy"],
  });

  console.log("Model created.");
}

async function cleanupModels() {
  const models = await tf.io.listModels();
  const modelKeys = Object.keys(models).filter((key) =>
    key.startsWith("indexeddb://model_")
  );

  modelKeys.sort(
    (a, b) =>
      models[a].modelArtifactsInfo.dateSaved -
      models[b].modelArtifactsInfo.dateSaved
  );

  while (modelKeys.length > 5) {
    const keyToRemove = modelKeys.shift();
    await tf.io.removeModel(keyToRemove);
    console.log(`Removed old model: ${keyToRemove}`);
  }
}

async function saveModelWithCleanup(model) {
  const timestamp = Date.now();
  const modelKey = `indexeddb://model_${timestamp}`;
  await model.save(modelKey);
  console.log(`Model saved as ${modelKey}`);
  await cleanupModels();
  return modelKey;
}

async function loadLatestModel() {
  const models = await tf.io.listModels();
  const modelKeys = Object.keys(models).filter((key) =>
    key.startsWith("indexeddb://model_")
  );

  if (modelKeys.length === 0) {
    console.log("No saved models found in IndexedDB.");
    return null;
  }

  modelKeys.sort(
    (a, b) =>
      models[a].modelArtifactsInfo.dateSaved -
      models[b].modelArtifactsInfo.dateSaved
  );

  const latestKey = modelKeys[modelKeys.length - 1];
  console.log(`Loading latest model: ${latestKey}`);
  return await tf.loadLayersModel(latestKey);
}

// Game-related functions
async function getProcessedCanvasTensors(canvasId="`", numCaptures=8) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) {
    console.error("Canvas not found!");
    return null;
  }

  const tensors = [];
  const originalWidth = canvas.width;
  const originalHeight = canvas.height;

  for (let i = 0; i < numCaptures; i++) {
    const offscreenCanvas = document.createElement("canvas");
    offscreenCanvas.width = CANVAS_SIZE;
    offscreenCanvas.height = CANVAS_SIZE;
    const ctx = offscreenCanvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(
      canvas,
      0, 0, originalWidth, originalHeight,
      0, 0, CANVAS_SIZE, CANVAS_SIZE
    );

    const imageData = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    const grayData = new Float32Array(CANVAS_SIZE * CANVAS_SIZE);

    for (let j = 0; j < imageData.data.length; j += 4) {
      const r = imageData.data[j];
      const g = imageData.data[j + 1];
      const b = imageData.data[j + 2];
      grayData[j / 4] = (0.299 * r + 0.587 * g + 0.114 * b) / 255.0;
    }
    tensors.push(grayData);
  }

  return tf.tidy(() => {
    return tf.concat(tensors, -1).reshape([1, CANVAS_SIZE, CANVAS_SIZE, numCaptures]);
  });
}

function sendKeyPress(key) {
  const eventOptions = {
    w: { code: "KeyW", keyCode: 87, bubbles: true },
    a: { code: "KeyA", keyCode: 65, bubbles: true },
    d: { code: "KeyD", keyCode: 68, bubbles: true },
    s: { code: "KeyS", keyCode: 83, bubbles: true },
  }[key.toLowerCase()];

  const canvasElement = document.getElementById("screen");

  if (canvasElement) {
    canvasElement.focus();
  }

  const keyDownEvent = new KeyboardEvent("keydown", eventOptions);
  const keyUpEvent = new KeyboardEvent("keyup", eventOptions);

  canvasElement.dispatchEvent(keyDownEvent);
  setTimeout(() => canvasElement.dispatchEvent(keyUpEvent), 50);
}

function getGameData() {
  const checkpointEl = document.querySelector(".checkpoint");
  const speedEl = document.querySelector(".speedometer");

  let currentLap = null;
  let totalLaps = null;
  let speed = null;

  if (checkpointEl) {
    const span = checkpointEl.querySelector("span");
    if (span && span.innerText.includes("/")) {
      const [lap, total] = span.innerText.split("/");
      currentLap = lap.trim();
      totalLaps = total.trim();
    }
  }

  if (speedEl) {
    const span = speedEl.querySelector("span");
    if (span) {
      speed = span.innerText.trim();
    }
  }

  return { currentLap, totalLaps, speed };
}

function checkGameOver() {
  // Check for time announcer
  const hasTimeAnnouncer = document.querySelector(".time-announcer") !== null;
  
  // Check for hint show element
  const hasHintShow = document.querySelector(".hint.show") !== null;
  
  // Check speed threshold
  const gameData = getGameData();
  const currentSpeed = gameData.speed ? parseFloat(gameData.speed) : 0;
  const isSpeedTooHigh = currentSpeed > SPEED_THRESHOLD;
  
  return hasTimeAnnouncer || hasHintShow || isSpeedTooHigh || isInterrupted;
}

function restartGame() {
  const eventOptions = { code: "KeyR", keyCode: 82, bubbles: true };
  document.dispatchEvent(new KeyboardEvent("keydown", eventOptions));
  setTimeout(
    () => document.dispatchEvent(new KeyboardEvent("keyup", eventOptions)),
    50
  );
  console.log("Game restarted from beginning!");
}

// Training functions
function computeDiscountedRewards(rewards, gamma = 0.99) {
  let discountedRewards = [];
  let cumulativeReward = 0;
  for (let i = rewards.length - 1; i >= 0; i--) {
    cumulativeReward = rewards[i] + gamma * cumulativeReward;
    discountedRewards.unshift(cumulativeReward);
  }
  return tf.tidy(() => {
    return tf.tensor2d(discountedRewards, [discountedRewards.length, 1]);
  });
}

async function trainModel(epochs=N_EPOCHS, batchSize = BATCH_SIZE) {
  console.log("Training model...");
  if (gameStates.length === 0) return;

  try {
    for (let epoch = 0; epoch < epochs; epoch++) {
      // Calculate number of batches
      const numBatches = Math.ceil(gameStates.length / batchSize);
      let epochLoss = 0;

      for (let batch = 0; batch < numBatches; batch++) {
        const startIdx = batch * batchSize;
        const endIdx = Math.min(startIdx + batchSize, gameStates.length);
        
        let computedTensors = null;
        try {
          // Compute tensors for current batch
          loss = tf.tidy(() => {
            // Get batch slices
            const batchStates = gameStates.slice(startIdx, endIdx);
            const batchActions = gameActions.slice(startIdx, endIdx);
            const batchRewards = gameRewards.slice(startIdx, endIdx);

            const states = tf.concat(batchStates);
            const actions = tf.tensor1d(batchActions, "int32");
            const rewards = computeDiscountedRewards(batchRewards);
            const actionOneHot = tf.oneHot(actions, 4);

            const logits = model.predict(states);
            const probs = tf.softmax(logits);
            const logProbs = tf.log(tf.add(probs, tf.scalar(1e-7))); // Add small epsilon to prevent log(0)
            const actionLogProbs = tf.sum(tf.mul(logProbs, actionOneHot), -1);
            
            return tf.neg(tf.mean(tf.mul(actionLogProbs, rewards))).clone();
          });

          // Get loss value for this batch
          const lossValue = loss.dataSync();
          epochLoss += lossValue[0];

          // Optimize on batch
          await model.optimizer.minimize(() => {
            return tf.tidy(() => {return loss;});
          }, true);

        } finally {
          loss.dispose();
        }
      }

      // Log average loss for the epoch
      const avgLoss = epochLoss / numBatches;
      console.log(`Epoch ${epoch + 1}/${epochs} - Average Loss: ${avgLoss.toFixed(4)}`);
    }

    await saveModelWithCleanup(model);
    console.log("Model trained and saved!");
  } finally {
    // Ensure cleanup happens even if training fails
    gameStates.forEach(tensor => tensor.dispose());
    gameStates = [];
    gameActions = [];
    gameRewards = [];
  }
}

// Prediction and action
async function predictAndAct(canvasId) {
  if (!model) {
    console.error("Model not initialized! Attempting to create/load model...");
    await createOrLoadModel();
    if (!model) {
      console.error("Failed to initialize model!");
      return;
    }
  }

  if (isInterrupted) {
    isInterrupted = false;
    return;
  }

  try {
    // Get tensor outside of tidy
    const tensor = await getProcessedCanvasTensors(canvasId, FRAME_SEQ_LEN);
    if (!tensor) return;

    // Use tidy for tensor operations
    const [actionIndex, stateTensor] = tf.tidy(() => {
      // Clone tensor for storage before any operations
      const tensorForStorage = tensor.clone();
      const prediction = model.predict(tensor);
      const probabilities = prediction.dataSync();
      const action = probabilities.indexOf(Math.max(...probabilities));
      return [action, tensorForStorage];
    });

    // Clean up the original tensor
    tensor.dispose();

    // Rest of the code...
    gameStates.push(stateTensor);
    gameActions.push(actionIndex);
    gameRewards.push(checkGameOver() ? 1 : 0);


    sendKeyPress(ACTIONS[actionIndex]);

    if (!checkGameOver() && !isInterrupted) {
      requestAnimationFrame(() => predictAndAct(canvasId));
    }
  } catch (error) {
    console.error("Error in predictAndAct:", error);
  }
}

// Event listener for interruption
window.addEventListener("keydown", (e) => {
  if (e.key === "i") {
    isInterrupted = true;
    console.log("Interrupted");
  }
});

// Main training loop
async function startAI(canvasId, epochs = N_EPOCHS, episodes = N_EPISODES) {
  let runCount = 0;
  await initTF();
  await createOrLoadModel();
  
  const gameInterval = setInterval(async () => {
    if (runCount >= episodes) {
      console.log(`Training completed after ${episodes} episodes!`);
      clearInterval(gameInterval);
      return;
    }

    if (isInterrupted) {
      console.log("Training terminated by user");
      clearInterval(gameInterval);
      return;
    }

    await predictAndAct(canvasId);
    if (checkGameOver()) {
      restartGame();
      await trainModel(epochs);
      runCount++;
      console.log(`Completed run ${runCount}/${episodes}`);

    }
  }, GAME_LEN);
}

// Start the AI with canvas ID
startAI("screen", N_EPOCHS, N_EPISODES);

setInterval(() => {
  const memoryInfo = tf.memory();
  const bytesToGB = bytes => (bytes / 1024 / 1024 / 1024).toFixed(3);
  
  console.log('Memory Usage (GB):', {
    numBytes: bytesToGB(memoryInfo.numBytes) + ' GB',
    numTensors: memoryInfo.numTensors,
    numDataBuffers: memoryInfo.numDataBuffers,
    unreliable: memoryInfo.unreliable,
    reasons: memoryInfo.unreliable ? memoryInfo.reasons : 'N/A'
  });
}, 4000);
