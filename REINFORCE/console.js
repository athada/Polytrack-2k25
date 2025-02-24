// Import TensorFlow.js from CDN
await import("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs");

// Constants
const FRAME_SEQ_LEN = 8;
const ACTIONS = ["w", "s", "a", "d"];
const GAME_LEN = 500;
const SPEED_THRESHOLD = 150;

// Global variables
let model;
let isInterrupted = false;
let gameRewards = [];
let gameStates = [];
let gameActions = [];

// Model-related functions
// Function to create or load a model
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

  // Define a small CNN model for sequence of grayscale 224x224 images
  model = tf.sequential();
  model.add(
    tf.layers.conv2d({
      inputShape: [224, 224, FRAME_SEQ_LEN],
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
  model.add(tf.layers.dense({ units: 4, activation: "softmax" })); // 4 outputs for W, S, A, D

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
async function getProcessedCanvasTensors(canvasId, numCaptures) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) {
    console.error("Canvas not found!");
    return null;
  }

  const tensors = [];

  for (let i = 0; i < numCaptures; i++) {
    const offscreenCanvas = document.createElement("canvas");
    offscreenCanvas.width = 224;
    offscreenCanvas.height = 224;
    const ctx = offscreenCanvas.getContext("2d");

    ctx.drawImage(canvas, 0, 0, 224, 224);

    const imageData = ctx.getImageData(0, 0, 224, 224);
    const grayData = new Uint8ClampedArray(224 * 224);
    for (let j = 0; j < imageData.data.length; j += 4) {
      const r = imageData.data[j];
      const g = imageData.data[j + 1];
      const b = imageData.data[j + 2];
      grayData[j / 4] = 0.299 * r + 0.587 * g + 0.114 * b;
    }

    let tensor = tf.tensor(grayData, [224, 224, 1]);
    tensors.push(tensor);
  }
  return tf.concat(tensors, -1).toFloat().div(tf.scalar(255)).expandDims(0);
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
  const hasTimeAnnouncer = document.querySelector(".time-announcer") !== null;
  const gameData = getGameData();
  const currentSpeed = gameData.speed ? parseFloat(gameData.speed) : 0;
  const isSpeedTooHigh = currentSpeed > SPEED_THRESHOLD;
  return hasTimeAnnouncer || isSpeedTooHigh || isInterrupted;
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
  return tf.tensor2d(discountedRewards, [discountedRewards.length, 1]);
}

async function trainModel(epochs) {
  console.log("Training model...");

  if (gameStates.length === 0) return;

  for (let epoch = 0; epoch < epochs; epoch++) {
    const loss = tf.tidy(() => {
      const states = tf.concat(gameStates);
      const actions = tf.tensor1d(gameActions, "int32");
      const rewards = computeDiscountedRewards(gameRewards);

      // Use tape to track gradients
      const actionOneHot = tf.oneHot(actions, 4);
      const logits = model.predict(states);
      const logProbs = tf.losses.softmaxCrossEntropy(actionOneHot, logits);
      return tf.sum(tf.mul(logProbs, rewards));
    });

    // Optimize using the gradient tape
    await model.optimizer.minimize(() => loss, true);
    console.log(`Epoch ${epoch + 1}/${epochs} - Loss: ${loss.dataSync()}`);
    loss.dispose();
  }

  await saveModelWithCleanup(model);
  console.log("Model trained and saved!");

  // Clear experience
  gameStates.forEach(tensor => tensor.dispose());
  gameStates = [];
  gameActions = [];
  gameRewards = [];
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

  const tensor = await getProcessedCanvasTensors(canvasId, FRAME_SEQ_LEN);
  if (!tensor) return;

  const prediction = model.predict(tensor);
  const probabilities = prediction.dataSync();
  const actionIndex = probabilities.indexOf(Math.max(...probabilities));

  gameStates.push(tensor);
  gameActions.push(actionIndex);
  gameRewards.push(checkGameOver() ? 1 : 0);

  sendKeyPress(ACTIONS[actionIndex]);

  if (!checkGameOver()) {
    requestAnimationFrame(() => predictAndAct(canvasId));
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
async function startAI(canvasId, epochs, n_runs) {
  let runCount = 0;
  await createOrLoadModel();
  
  const gameInterval = setInterval(async () => {
    if (runCount >= n_runs) {
      console.log(`Training completed after ${n_runs} runs!`);
      clearInterval(gameInterval);
      return;
    }

    await predictAndAct(canvasId);
    if (checkGameOver()) {
      restartGame();
      await trainModel(epochs);
      runCount++;
      console.log(`Completed run ${runCount}/${n_runs}`);
      
    }
  }, GAME_LEN);
}

// Start the AI with canvas ID, epochs per training, and number of runs
startAI("screen", 10, 10);