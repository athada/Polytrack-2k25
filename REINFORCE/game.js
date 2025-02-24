import * as tf from "@tensorflow/tfjs";
const SPEED_THRESHOLD = 600;  // Adjust this value based on your game's speed units
export const CANVAS_SIZE = 200;
export const FRAME_SEQ_LEN = 120;

// Function to capture and preprocess the canvas image
const TOTAL_FRAMES = 120; 
export const N_FRAMES = 8;// Number of frames to capture per second
const FRAME_INTERVAL = Math.floor(TOTAL_FRAMES / N_FRAMES);

export async function captureCanvasFramesAsGrayscaleTensor(sourceCanvasId, targetWidth = 224, targetHeight = 224) {
  const sourceCanvas = document.getElementById(sourceCanvasId);
  if (!sourceCanvas) {
    console.error(`Canvas element with id '${sourceCanvasId}' not found!`);
    return null;
  }

  const offscreenCanvas = document.createElement("canvas");
  offscreenCanvas.width = targetWidth;
  offscreenCanvas.height = targetHeight;
  const offscreenCtx = offscreenCanvas.getContext("2d");

  const tensors = [];

  for (let i = 0; i < TOTAL_FRAMES; i++) {
    await new Promise((resolve) => requestAnimationFrame(() => {
      if (i % FRAME_INTERVAL === 0) {  // Capture only every FRAME_INTERVAL-th frame
        offscreenCtx.drawImage(sourceCanvas, 0, 0, targetWidth, targetHeight);
        
        // Convert to TensorFlow.js tensor
        let tensor = tf.browser.fromPixels(offscreenCanvas).toFloat().div(255);

        // Convert RGB to Grayscale using the luminance formula
        tensor = tensor.mean(2).expandDims(-1); // Averaging over the last axis (color channels)

        tensors.push(tensor);
      }
      resolve();
    }));
  }

  if (tensors.length === 0) {
    console.error("No frames captured.");
    return null;
  }

  return tf.concat(tensors, axis=-1); // Stack tensors along a new batch dimension
}

// Function to send keypress event
export function sendKeyPress(key) {
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

// Check if game is over.
function checkGameOver() {
  // Check for time announcer
  const hasTimeAnnouncer = document.querySelector(".time-announcer") !== null;
  
  // Check speed threshold
  const gameData = getGameData();
  const currentSpeed = gameData.speed ? parseFloat(gameData.speed) : 0;
  const isSpeedTooHigh = currentSpeed > SPEED_THRESHOLD;
  
  // Check for interrupt flag
  const isInterruptTriggered = isInterrupted;

  return hasTimeAnnouncer || isSpeedTooHigh || isInterruptTriggered;
}

// Function to Restart the Game from Checkpoint
export function restartGame() {
  const eventOptions = { code: "KeyR", keyCode: 82, bubbles: true };

  // Dispatch keydown + keyup events to trigger the restart
  document.dispatchEvent(new KeyboardEvent("keydown", eventOptions));
  setTimeout(
    () => document.dispatchEvent(new KeyboardEvent("keyup", eventOptions)),
    50
  );
  console.log("Game restarted from begining!");
}

export function getGameData() {
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

  return {
    currentLap,
    totalLaps,
    speed,
  };
}

let isInterrupted = false;
// Adding interrupt Listener
window.addEventListener("keydown", (e) => {
  if (e.key === "i") {
    isInterrupted = true;
    console.log("Interrupted");
  }
});