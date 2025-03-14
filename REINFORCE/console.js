// Import TensorFlow.js from CDN
async function initTF() {
  await import("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs");
  await tf.ready();
  console.log("TensorFlow.js initialized with backend:", tf.getBackend());
}

// Make sure to await this before starting your AI
await initTF();

// Constants
const CANVAS_SIZE = 224;
const N_FRAMES = 1;
const ACTIONS = ["w", "s", "a", "d"];
const SPEED_THRESHOLD = 200;
const N_EPISODES = 200;
const N_EPOCHS = 6;
const BATCH_SIZE = 5;
const WAIT_TIME = 100;

// Global variables
let model;
let isInterrupted = false;
let gameRewards = [];
let gameStates = [];
let gameActions = [];

// Constants for rewards
const REWARDS = {
  R_EXISTENCE: -0.01,    // Small negative reward per step
  R_CHECKPOINT: 10.0,    // Reward for completing a lap
  R_FINISH: 50.0,        // Reward for finishing the game
};

// Event listener for interruption
window.addEventListener("keydown", (e) => {
  if (e.key === "i") {
    isInterrupted = true;
    console.log("Interrupted");
  }
});

function logMemoryUsage(label = '') {
  const memoryInfo = tf.memory();
  const bytesToGB = bytes => (bytes / 1024 / 1024 / 1024).toFixed(3);
  console.log(`[Memory Usage] ${label}: numBytes: ${bytesToGB(memoryInfo.numBytes)} GB, numTensors: ${memoryInfo.numTensors}, numDataBuffers: ${memoryInfo.numDataBuffers}`);
}

async function createOrLoadModel() {
  try {
      const loadedModel = await tf.loadLayersModel('indexeddb://model_latest');
      loadedModel.compile({optimizer: tf.train.adam(0.001), loss: "categoricalCrossentropy", metrics: ["accuracy"]});
      if (loadedModel) {
          model = loadedModel;
          console.log("[Model-Loading] Loaded existing model.");
      }
      return;
  } catch (error) {
      console.warn("[Model-Loading] Creating New Model:", error.message)
  } 
  try {
    // Create new model if loading failed
    console.log("[Model-Loading] Creating new model...");
    model = tf.sequential();
    model.add(tf.layers.conv2d({inputShape: [CANVAS_SIZE, CANVAS_SIZE, N_FRAMES],filters: 8,kernelSize: 3, activation: "relu"}));
    model.add(tf.layers.maxPooling2d({ poolSize: 2, strides: 2 }));
    model.add(tf.layers.conv2d({ filters: 16, kernelSize: 3, activation: "relu" }));
    model.add(tf.layers.maxPooling2d({ poolSize: 2, strides: 2 }));
    model.add(tf.layers.flatten());
    model.add(tf.layers.dense({ units: 4, activation: "softmax" }));

    model.compile({optimizer: tf.train.adam(0.001), loss: "categoricalCrossentropy", metrics: ["accuracy"]});
    console.log("[Model-Loading] Model created and compiled successfully.");
  } catch (error) {
    console.error("[Model-Loading] Error creating model:", error);
    if (model)
      model.dispose();
  } finally {
    return;
  }
}

async function getProcessedCanvasTensors(canvasId="screen", numCaptures=N_FRAMES) {
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
  let gameCompleted = document.querySelector(".hint.show") !== null;

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

  return { currentLap, totalLaps, speed, gameCompleted };
}

function checkReachedFinishLine() {
  // Check for time announcer
  const hasTimeAnnouncer = document.querySelector(".time-announcer") !== null;
  return hasTimeAnnouncer;
}

function checkGameOver() {  
  // Check for hint show element
  const hasHintShow = document.querySelector(".hint.show") !== null;
  const speed = getGameData().speed;
  return hasHintShow || isInterrupted || speed > SPEED_THRESHOLD;
}

function restartGame() {
  const eventOptions = { code: "KeyR", keyCode: 82, bubbles: true };
  document.dispatchEvent(new KeyboardEvent("keydown", eventOptions));
  setTimeout(
    () => document.dispatchEvent(new KeyboardEvent("keyup", eventOptions)),
    50
  );
  console.log("[Game-Restart]");
}

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
  console.log("[Exploit] Training Model");
  logMemoryUsage('[Exploit] Before');
  if (gameStates.length === 0){
    console.log("[Exploit] No Episodic Data");
    return;
  }
  if (!model) {
    console.error("[Exploit] Model not initialized!");
    return;
  }

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
            
            return tf.neg(tf.mean(tf.mul(actionLogProbs, rewards)));
          });

          // Get loss value for this batch
          const lossValue = loss.dataSync();
          epochLoss += lossValue[0];

          // Optimize on batch
          await model.optimizer.minimize(() => {
            return tf.tidy(() => {
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
                
                return tf.neg(tf.mean(tf.mul(actionLogProbs, rewards)));
              });
          }, true);

        } finally {
          if (loss) loss.dispose();
        }
      }

      // Log average loss for the epoch
      const avgLoss = epochLoss / numBatches;
      console.log(`[Exploit] Epoch ${epoch + 1}/${epochs} - Average Loss: ${avgLoss.toFixed(6)}`);
    }

    await model.save(`indexeddb://model_latest`);
    console.log("[Exploit] Model Trained and Saved!");
    logRewardStats();

  } finally {
    // Ensure cleanup happens even if training fails
    gameStates.forEach(tensor => tensor.dispose());
    gameStates = [];
    gameActions = [];
    gameRewards = [];
  }
}

function calculateReward(previousGameState, currentGameState) {
  let reward = REWARDS.R_EXISTENCE;  // Base penalty for existing
  
  if (!previousGameState)
    return reward;
  else if (currentGameState.currentLap > previousGameState.currentLap)
      return (reward + REWARDS.R_CHECKPOINT);
  else if (currentGameState.gameCompleted && !previousGameState.gameCompleted) 
      return (reward + REWARDS.R_FINISH);
  return reward;
}

function logRewardStats() {
  const totalReward = gameRewards.reduce((sum, reward) => sum + reward, 0);
  const steps = gameRewards.length;
  console.log("[Rewards] Episode Statistics:", {
      totalReward: totalReward.toFixed(2),
      averageReward: (totalReward / steps).toFixed(2),
      steps: steps,
      existencePenalty: (REWARDS.R_EXISTENCE * steps).toFixed(2),
      checkpointRewards: gameRewards.filter(r => r > REWARDS.R_EXISTENCE).length
  });
}

async function predictAndAct(canvasId, episodeLength = 100) {
  if (!model) {
    console.error("[Explore] Model not initialized!");
    return;
  }

  let stepCount = 0;
  let tensor = null;
  let stateTensor = null;
  let previousGameState = null;
  
  try {
    while (stepCount < episodeLength && !checkReachedFinishLine() && !checkGameOver()) {
      try {
        const currentGameState = getGameData();
        const reward = calculateReward(previousGameState, currentGameState);
        tensor = await getProcessedCanvasTensors(canvasId, N_FRAMES);
        if (!tensor) {
          console.error("[Explore] Failed to get canvas tensors");
          break;
        }
        // Use tidy for tensor operations
        const [actionIndex, newStateTensor] = tf.tidy(() => {
          const tensorForStorage = tensor.clone();
          const prediction = model.predict(tensor);
          const probabilities = prediction.dataSync();
          const action = probabilities.indexOf(Math.max(...probabilities));
          return [action, tensorForStorage];
        });

        // Store the tensor for later use
        stateTensor = newStateTensor;
        gameStates.push(stateTensor);
        gameActions.push(actionIndex);
        gameRewards.push(reward);

        // Send action to game
        sendKeyPress(ACTIONS[actionIndex]);
        stepCount++;
        previousGameState = {...currentGameState};

        // Wait for WAIT_TIME milliseconds
        await new Promise(resolve => setTimeout(resolve, WAIT_TIME));

      } finally {
        // Clean up input tensor after each step
        if (tensor) {
          tensor.dispose();
          tensor = null;
        }
        isInterrupted = false;
      }
    }

  } catch (error) {
    console.error("[Explore] Error in predictAndAct:", error);
  } finally {
    console.log(`[Explore] Episode completed after ${stepCount} steps`);
  }
}

async function trainingLoop(numIterations = 10, episodeLength = N_EPISODES, epochs = N_EPOCHS, batchSize=BATCH_SIZE) {
  logMemoryUsage('[Explore-Exploit] Initiation');
  await createOrLoadModel();

  for (let i = 0; i < numIterations; i++) {
    console.log("-".repeat(50));
    console.log(`[Explore-Exploit] Iteration ${i + 1}/${numIterations}`);
    console.log("-".repeat(50));
    
    tf.engine().startScope();

    restartGame();
    await predictAndAct("screen", episodeLength);
    await trainModel(epochs, batchSize);

    tf.engine().endScope();
    await new Promise(resolve => setTimeout(resolve, 2000));

    logMemoryUsage('[Explore-Exploit]');
  }
}

async function freePlay(canvasId="screen", episodeLength = 100) {
  if (!model) {
    console.error("[Free-Play] Model not initialized. Upload a Model to Play.");
    selectModelFiles();
  }

  let stepCount = 0;
  let tensor = null;
  let stateTensor = null;
  let previousGameState = null;
  
  try {
    while (stepCount < episodeLength && !checkReachedFinishLine()) {
      try {
        const currentGameState = getGameData();
        tensor = await getProcessedCanvasTensors(canvasId, N_FRAMES);
        if (!tensor) {
          console.error("[Explore] Failed to get canvas tensors");
          break;
        }
        // Use tidy for tensor operations
        const actionIndex = tf.tidy(() => {
          const tensorForStorage = tensor.clone();
          const prediction = model.predict(tensor);
          const probabilities = prediction.dataSync();
          const action = probabilities.indexOf(Math.max(...probabilities));
          return action;
        });

        // Send action to game
        sendKeyPress(ACTIONS[actionIndex]);
        stepCount++;
        previousGameState = {...currentGameState};

        // Wait for WAIT_TIME milliseconds
        await new Promise(resolve => setTimeout(resolve, WAIT_TIME));

      } finally {
        // Clean up input tensor after each step
        if (tensor) {
          tensor.dispose();
          tensor = null;
        }
        isInterrupted = false;
      }
    }

  } catch (error) {
    console.error("[Explore] Error in freePlay:", error);
  }
}

async function uploadModelToIndexedDB(dbName, storeName) {
  if (!window.showDirectoryPicker) {
      console.error("Directory picker API is not supported in this browser.");
      return;
  }

  try {
      // Open IndexedDB
      const request = indexedDB.open(dbName, 1);
      request.onupgradeneeded = (event) => {
          let db = event.target.result;
          if (!db.objectStoreNames.contains(storeName)) {
              db.createObjectStore(storeName, { keyPath: "name" });
          }
      };

      const db = await new Promise((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
      });

      // Open directory picker
      const dirHandle = await window.showDirectoryPicker();
      for await (const [name, fileHandle] of dirHandle) {
          if (fileHandle.kind === "file") {
              const file = await fileHandle.getFile();
              const reader = new FileReader();
              reader.readAsArrayBuffer(file);
              
              await new Promise((resolve) => {
                  reader.onload = async (event) => {
                      const transaction = db.transaction(storeName, "readwrite");
                      const store = transaction.objectStore(storeName);
                      await store.put({ name, data: event.target.result });
                      resolve();
                  };
              });
          }
      }

      console.log("Model files uploaded to IndexedDB successfully.");
  } catch (error) {
      console.error("Error uploading model files to IndexedDB:", error);
  }
}

async function loadModelManuallyFromIndexedDB(dbName, storeName) {
  try {
      const request = indexedDB.open(dbName, 1);
      const db = await new Promise((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
      });

      const transaction = db.transaction(storeName, "readonly");
      const store = transaction.objectStore(storeName);
      const modelFiles = await new Promise((resolve, reject) => {
          const files = {};
          const cursorRequest = store.openCursor();

          cursorRequest.onsuccess = (event) => {
              const cursor = event.target.result;
              if (cursor) {
                  files[cursor.value.name] = cursor.value.data;
                  cursor.continue();
              } else {
                  resolve(files);
              }
          };
          cursorRequest.onerror = () => reject(cursorRequest.error);
      });

      if (!modelFiles["model.json"]) {
          throw new Error("model.json file is missing in IndexedDB");
      }

      // Convert model.json to a File object
      const modelJsonFile = new Blob([modelFiles["model.json"]], { type: "application/json" });
      const modelJsonText = await modelJsonFile.text();

      // Sort weight files
      const weightFiles = Object.keys(modelFiles)
          .filter(name => name.endsWith(".bin"))
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

      // Convert binary data to File objects
      const binFiles = weightFiles.map(name =>
          new File([modelFiles[name]], name, { type: "application/octet-stream" })
      );

      // Load the model using browserFiles
      const model = await tf.loadLayersModel(tf.io.browserFiles([
          new File([modelJsonText], "model.json", { type: "application/json" }),
          ...binFiles
      ]));

      console.log("Model loaded successfully.");
      return model;
  } catch (error) {
      console.error("Error loading model from IndexedDB:", error);
  }
}
