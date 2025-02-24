import * as tf from "@tensorflow/tfjs";
const SPEED_THRESHOLD = 600;  // Adjust this value based on your game's speed units


// Function to capture and preprocess the canvas image
export async function getProcessedCanvasTensors(canvasId, numCaptures) {
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
  return tf
    .concat(tensors, (axis = -1))
    .toFloat()
    .div(tf.scalar(255))
    .expandDims(0);
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

//const { currentLap, totalLaps, speed } = getGameData();
//console.log(currentLap, totalLaps, speed);
