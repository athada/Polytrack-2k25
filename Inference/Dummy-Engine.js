(async function () {
  
// Load TensorFlow.js if not already loaded
if (typeof tf === "undefined") {
  await import("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs");
}

let isInterrupted = false;
  
let model;
let gameRewards = [];
let gameStates = [];
let gameActions = [];

const ACTIONS = ["w", "s", "a", "d"]; // Ensure lowercase (some games require this)
const FRAME_SEQ_LEN = 8;
const GAME_LEN = 20*1000

// Function to capture and preprocess the canvas image
async function getProcessedCanvasTensors(canvasId, numCaptures) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) {
    console.error("Canvas not found!");
    return [];
  }

  const tensors = [];

  for (let i = 0; i < numCaptures; i++) {
    // Create an offscreen canvas for resizing
    const offscreenCanvas = document.createElement("canvas");
    offscreenCanvas.width = 224;
    offscreenCanvas.height = 224;
    const ctx = offscreenCanvas.getContext("2d");

    // Copy and resize the canvas image
    ctx.drawImage(canvas, 0, 0, 224, 224);

    // Convert to grayscale
    const imageData = ctx.getImageData(0, 0, 224, 224);
    const grayData = new Uint8ClampedArray(224 * 224);
    for (let j = 0; j < imageData.data.length; j += 4) {
      const r = imageData.data[j];
      const g = imageData.data[j + 1];
      const b = imageData.data[j + 2];
      grayData[j / 4] = 0.299 * r + 0.587 * g + 0.114 * b;
    }

    // Convert to TensorFlow.js tensor and normalize
    let tensor = tf.tensor(grayData, [224, 224, 1]);
      
    // Append tensor to list
    tensors.push(tensor);
  }
  return tf.concat(tensors, axis=-1)
           .toFloat()
           .div(tf.scalar(255))
           .expandDims(0);
}

// Function to create or load a model
async function createOrLoadModel(trainMode = false) {
  if (!trainMode) {
    try {
      model = await tf.loadLayersModel("localstorage://canvas-game-model");
      console.log("Loaded existing model.");
      return;
    } catch (error) {
      console.warn("No saved model found, creating a new one.");
    }
  }

  // Define a small CNN model for sequence of grayscale 224x224 images
  model = tf.sequential();
  model.add(tf.layers.conv2d({inputShape: [224, 224, FRAME_SEQ_LEN], filters: 8, kernelSize: 3, activation: "relu"}));
  model.add(tf.layers.maxPooling2d({ poolSize: 2, strides: 2 }));
  model.add(tf.layers.conv2d({ filters: 16, kernelSize: 3, activation: "relu" }));
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
  
// Function to send keypress event
function sendKeyPress(key) {
  eventOptions = {
    w: { code: "KeyW", keyCode: 87, bubbles: true },
    a: { code: "KeyA", keyCode: 65, bubbles: true },
    d: { code: "KeyD", keyCode: 68, bubbles: true },
    s: { code: "KeyS", keyCode: 83, bubbles: true },
  }[key.toLowerCase()];

  const canvasElement = document.getElementById("screen"); // Ensure this matches your canvas element

  // Focus on the canvas or game window before sending key events
  if (canvasElement) {
    canvasElement.focus(); // Ensure canvas is focused
  }

  // Dispatch keydown + keyup events for better recognition
  const keyDownEvent = new KeyboardEvent("keydown", eventOptions);
  const keyUpEvent = new KeyboardEvent("keyup", eventOptions);

  canvasElement.dispatchEvent(keyDownEvent);
  setTimeout(() => canvasElement.dispatchEvent(keyUpEvent), 50);
}

// 🔍 Detect if the game is over (reward = 1)
  function checkGameOver() {
      return document.querySelector(".time-announcer") !== null;
  }
  
// Function to predict action and send keypress
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
  
// Train the model using collected experience
async function trainModel(epochs) {
    console.log("Training model...");

    if (gameStates.length === 0) return;

    for (let epoch = 0; epoch < epochs; epoch++) {
      const states = tf.concat(gameStates);
      const actions = tf.tensor1d(gameActions, "int32");
      const rewards = computeDiscountedRewards(gameRewards);

      const oneHotActions = tf.oneHot(actions, 4);
      const optimizer = model.optimizer;

      // Compute policy loss (negative log probability * reward)
      const logits = model.apply(stateTensors);
      const logProbs = tf.losses.softmaxCrossEntropy(actionOneHot, logits);
      const loss = tf.sum(tf.mul(logProbs, rewardTensors));

      // Optimize
      const optimizer = tf.train.adam(0.01);
      optimizer.minimize(() => loss);
      console.log(`Epoch ${epoch + 1}/${epochs} - Loss: ${loss.dataSync()}`);
    }
    
    // Save model
    await model.save("localstorage://policy-gradient-game-model");
    console.log("Model trained and saved!");

    // Clear experience
    gameStates = [];
    gameActions = [];
    gameRewards = [];
}

// Function to Restart the Game from Checkpoint
function restartGame() {
    const eventOptions = {code: "KeyR", keyCode: 82, bubbles: true};

    // Dispatch keydown + keyup events to trigger the restart
    document.dispatchEvent(new KeyboardEvent("keydown", eventOptions));
    setTimeout(() => document.dispatchEvent(new KeyboardEvent("keyup", eventOptions)), 50);
    console.log("Game restarted from begining!");
}

// TrainingLoop
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
})();
