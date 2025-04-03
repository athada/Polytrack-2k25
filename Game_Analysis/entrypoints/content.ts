let lastRecordedBlob: Blob | null = null;
import init, { stopSimulation } from "./replay";

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.type === "GENERATE_SUMMARY") {
    const gameplayStatus = checkGameplayAvailability();

    if (!gameplayStatus.available) {
      showErrorDialog(gameplayStatus.message);
      sendResponse({ error: gameplayStatus.message });
      return;
    }

    showLoadingDialog();

    // Send to LLM endpoint
    if (lastRecordedBlob) {
      sendToLLMEndpoint(message.prompt, lastRecordedBlob)
        .then((summary) => {
          hideLoadingDialog();
          showSummaryDialog(summary);
        })
        .catch((error) => {
          hideLoadingDialog();
          showErrorDialog("Failed to generate summary. Please try again.");
          console.error("Error generating summary:", error);
        });
    } else {
      hideLoadingDialog();
      showErrorDialog("No gameplay recording found.");
    }

    return true;
  }

  if (message.type === "CHECK_GAMEPLAY") {
    const status = checkGameplayAvailability();
    sendResponse(status);
    return true;
  }

  if (message.type === "RUN_AI_DRIVER") {
    console.log("RUN_AI_DRIVER", message);
    if (!message.track) {
      sendResponse({ error: "No track specified" });
      return true;
    }
    await redirectToTrack(message.track);
    if (message.isAIDriverSet) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      fetchJsonData(message.track)
        .then((jsonData) => {
          init(jsonData);
        })
        .catch((error) => {
          console.error("Error fetching JSON data:", error);
        });
    }

    return true;
  }
});
async function redirectToTrack(track: string) {
  // simulateKeyState(["Escape"]);
  document.querySelectorAll("button.button").forEach((btn) => {
    if (
      btn.textContent?.trim() === "Exit" &&
      btn instanceof HTMLButtonElement
    ) {
      console.log("Click on Exit button.");
      btn.click();
    }
  });

  await new Promise((resolve) => setTimeout(resolve, 500));
  //Click play button Main Menu
  const buttons = document.querySelectorAll("button.button-image");
  const lastButton = Array.from(buttons)
    .reverse()
    .find(
      (button) => button.querySelector("p")?.textContent?.trim() === "Play"
    );

  if (lastButton && lastButton instanceof HTMLButtonElement) {
    lastButton.click();
  } else {
    console.warn("No Menu Play button found.");
  }

  //Click track button
  const trackButtons = document.querySelectorAll("button.button");

  for (const button of trackButtons) {
    const trackTitleDiv = button.querySelector("div.track-title");
    const paragraph = trackTitleDiv?.querySelector("p");

    if (
      paragraph &&
      paragraph.textContent?.trim() === track &&
      button instanceof HTMLButtonElement
    ) {
      button.click();
    } else {
      console.warn("No Track button found.");
    }
  }

  //Click play button
  const button = Array.from(
    document.querySelectorAll("button.button.play")
  ).find((btn) => btn?.textContent?.trim() === "Play");

  if (button && button instanceof HTMLButtonElement) {
    button.click();
  } else {
    console.warn("No Play button found.");
  }
}

async function sendToLLMEndpoint(
  prompt: string,
  videoBlob: Blob
): Promise<string> {
  const formData = new FormData();
  formData.append("prompt", prompt);
  formData.append("video", videoBlob, "gameplay.webm");

  const response = await fetch("http://localhost:3001/generate-summary", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Backend responded with status ${response.status}`);
  }

  const data = await response.json();
  return data.summary;
}

function showSummaryDialog(summary: string) {
  const backdrop = document.createElement("div");
  backdrop.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(8px);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.3s ease-out;
  `;

  const dialog = document.createElement("div");
  dialog.style.cssText = `
    background: #0a0a0a;
    color: #ffffff;
    border-radius: 12px;
    width: 800px;
    max-width: 90%;
    padding: 0;
    box-shadow: 0 20px 25px -5px rgba(220, 38, 38, 0.25), 0 8px 10px -6px rgba(0, 0, 0, 0.3);
    overflow: hidden;
    animation: slideUp 0.4s ease-out;
    border: 1px solid rgba(220, 38, 38, 0.3);
  `;

  // Extract rating if present
  const ratingMatch = summary.match(/(\d+\.?\d*)\/10/);
  const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;

  // Get rating color based on score
  const getRatingColor = (score: number) => {
    if (score >= 7) return "#22c55e";
    if (score >= 5) return "#eab308";
    return "#ef4444";
  };

  // Format the summary text with enhanced subheading styling
  const formattedSummary = summary
    .split("\n")
    .map((line) => {
      // Check for text between ** markers and preserve remaining text
      if (line.includes("**")) {
        const parts = line.split("**");
        if (parts.length >= 3) {
          const heading = parts[1];
          const remainingText = parts[2].trim();
          return `
            <h3 class="summary-subheading">${heading}</h3>
            ${
              remainingText
                ? `<p class="summary-text">${remainingText}</p>`
                : ""
            }
          `;
        }
      }
      if (line.startsWith("-")) {
        return `<li class="summary-item">${line.substring(1).trim()}</li>`;
      }
      if (line.trim().endsWith(":")) {
        return `<h3 class="summary-section">${line.trim()}</h3>`;
      }
      if (line.trim()) {
        return `<p class="summary-text">${line}</p>`;
      }
      return "";
    })
    .join("");

  dialog.innerHTML = `
    <style>
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      
      @keyframes slideUp {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }
      
      @keyframes pulse {
        0% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.4); }
        70% { box-shadow: 0 0 0 10px rgba(220, 38, 38, 0); }
        100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0); }
      }

      .summary-container {
        padding: 24px;
        color: #f1f5f9;
      }
      
      .summary-header {
        text-align: center;
        padding: 24px;
        background: linear-gradient(135deg, #dc2626, #991b1b);
        color: white;
        margin: -24px -24px 20px -24px;
        position: relative;
        overflow: hidden;
        border-bottom: 2px solid rgba(255, 255, 255, 0.1);
      }
      
      .summary-header::after {
        content: '';
        position: absolute;
        top: -50%;
        left: -50%;
        width: 200%;
        height: 200%;
        background: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0) 60%);
        transform: rotate(30deg);
        pointer-events: none;
      }
      
      .summary-header h2 {
        font-size: 1.8rem;
        font-weight: 800;
        color: white;
        letter-spacing: -0.025em;
        margin: 0;
        text-shadow: 0 2px 4px rgba(0,0,0,0.3);
        text-transform: uppercase;
      }
      
      .rating-container {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 20px;
        padding: 16px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 8px;
        border: 1px solid rgba(220, 38, 38, 0.3);
      }
      
      .rating-info {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      
      .rating-label {
        font-size: 1.25rem;
        font-weight: 600;
        color: #f1f5f9;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      
      .rating-description {
        font-size: 0.9rem;
        color: rgba(241, 245, 249, 0.7);
        max-width: 240px;
      }
      
      .rating-circle {
        width: 90px;
        height: 90px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 0 20px rgba(0, 0, 0, 0.3);
        position: relative;
        animation: pulse 2s infinite;
      }
      
      .rating-inner-circle {
        width: 80px;
        height: 80px;
        border-radius: 50%;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        border: 2px solid rgba(255, 255, 255, 0.2);
      }
      
      .rating-score {
        font-size: 2.2rem;
        font-weight: bold;
        color: white;
        line-height: 1;
        text-shadow: 0 0 10px rgba(255, 255, 255, 0.5);
      }
      
      .rating-max {
        font-size: 1rem;
        color: rgba(255, 255, 255, 0.7);
      }
      
      @keyframes pulse {
        0% {
          box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.4);
        }
        70% {
          box-shadow: 0 0 0 10px rgba(255, 255, 255, 0);
        }
        100% {
          box-shadow: 0 0 0 0 rgba(255, 255, 255, 0);
        }
      }
      
      .summary-subheading {
        color: #dc2626;
        font-size: 1.4rem;
        font-weight: 700;
        margin: 20px 0 12px 0;
        padding-bottom: 6px;
        border-bottom: 2px solid rgba(220, 38, 38, 0.3);
        letter-spacing: -0.025em;
        text-transform: uppercase;
      }
      
      .summary-section {
        color: #dc2626;
        font-size: 1.3rem;
        font-weight: 700;
        margin: 16px 0 12px 0;
        padding-bottom: 6px;
        border-bottom: 1px solid rgba(220, 38, 38, 0.3);
        text-transform: uppercase;
      }
      
      .summary-item {
        margin: 8px 0;
        padding-left: 20px;
        position: relative;
        color: #e2e8f0;
        font-size: 1.1rem;
        line-height: 1.5;
      }
      
      .summary-item:before {
        content: "•";
        position: absolute;
        left: 0;
        color: #dc2626;
        font-size: 1.2rem;
      }
      
      .summary-text {
        margin: 8px 0;
        line-height: 1.5;
        color: #e2e8f0;
        font-size: 1.1rem;
      }
      
      .close-button {
        display: block;
        width: 100%;
        margin-top: 24px;
        padding: 14px;
        background: linear-gradient(to right, #dc2626, #b91c1c);
        color: white;
        border: none;
        border-radius: 8px;
        font-size: 1.1rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      
      .close-button:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 10px -1px rgba(220, 38, 38, 0.4);
        animation: pulse 1.5s infinite;
      }
    </style>
    <div class="summary-container">
      <div class="summary-header">
        <h2>Race Analysis</h2>
      </div>
      ${
        rating
          ? `
        <div class="rating-container">
          <div class="rating-info">
            <span class="rating-label">Performance Rating</span>
            <span class="rating-description">${getRatingDescription(
              rating
            )}</span>
          </div>
          <div class="rating-circle" style="background: ${getRatingGradient(
            rating
          )}">
            <div class="rating-inner-circle">
              <span class="rating-score">${rating.toFixed(1)}</span>
              <span class="rating-max">/10</span>
            </div>
          </div>
        </div>
      `
          : ""
      }
      <div class="summary-content">
        ${formattedSummary}
      </div>
      <button class="close-button">Close Summary</button>
    </div>
  `;

  const closeDialog = () => {
    backdrop.remove();
  };

  const closeButton = dialog.querySelector(".close-button");
  closeButton?.addEventListener("click", closeDialog);

  // Close dialog when clicking outside of it
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) {
      closeDialog();
    }
  });

  // Close dialog when pressing Escape key
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeDialog();
    }
  });

  document.body.appendChild(backdrop);
  backdrop.appendChild(dialog);
}

function checkGameplayAvailability(): { available: boolean; message: string } {
  if (!lastRecordedBlob) {
    return {
      available: false,
      message: "No gameplay recording found. Please play a game first!",
    };
  }
  return {
    available: true,
    message: "Gameplay recording is available",
  };
}

function showErrorDialog(message: string) {
  const dialog = document.createElement("dialog");
  dialog.style.padding = "24px";
  dialog.style.border = "none";
  dialog.style.borderRadius = "8px";
  dialog.style.maxWidth = "32rem";

  dialog.innerHTML = `
    <div style="background-color: white; color: black;">
      <h2 class="text-xl font-bold mb-4" style="color: black;">Error</h2>
      <p class="mb-4" style="color: #EF4444;">${message}</p>
      <button class="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600">
        Close
      </button>
    </div>
  `;

  const closeDialog = () => {
    dialog.close();
    dialog.remove();
  };

  const closeButton = dialog.querySelector("button");
  closeButton?.addEventListener("click", closeDialog);

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      closeDialog();
    }
  });

  document.body.appendChild(dialog);
  dialog.showModal();
}

function createCanvasRecorder(
  sourceCanvasId: string,
  targetWidth = 1920,
  targetHeight = 1080,
  fps = 25,
  options: MediaRecorderOptions = { mimeType: "video/webm; codecs=vp9" }
) {
  const sourceCanvas = document.getElementById(
    sourceCanvasId
  ) as HTMLCanvasElement | null;
  if (!sourceCanvas) {
    console.error(`Canvas element with id '${sourceCanvasId}' not found!`);
    return null;
  }

  const offscreenCanvas = document.createElement("canvas");
  offscreenCanvas.width = targetWidth;
  offscreenCanvas.height = targetHeight;
  const offscreenCtx = offscreenCanvas.getContext("2d");

  if (!offscreenCtx) {
    console.error("Failed to get 2D context from offscreen canvas.");
    return null;
  }

  function updateOffscreen() {
    const ctx = offscreenCtx!;
    ctx.clearRect(0, 0, targetWidth, targetHeight);
    ctx.drawImage(sourceCanvas!, 0, 0, targetWidth, targetHeight);
    requestAnimationFrame(updateOffscreen);
  }
  updateOffscreen();

  const canvasStream = offscreenCanvas.captureStream(fps);
  let recordedChunks: BlobPart[] = [];
  let mediaRecorder: MediaRecorder;

  try {
    mediaRecorder = new MediaRecorder(canvasStream, options);
  } catch (e) {
    console.error("MediaRecorder initialization failed:", e);
    return null;
  }

  mediaRecorder.ondataavailable = (event: BlobEvent) => {
    if (event.data && event.data.size > 0) {
      recordedChunks.push(event.data);
    }
  };

  mediaRecorder.onstop = async () => {
    const blob = new Blob(recordedChunks, { type: "video/webm" });
    recordedChunks = [];
    lastRecordedBlob = blob;

    // Save to IndexedDB
    try {
      await saveGameplayRecording(blob);
      console.log("Recording saved to IndexedDB");
    } catch (error) {
      console.error("Failed to save recording to IndexedDB:", error);
    }

    const url = URL.createObjectURL(blob);
    // downloadRecording(url);
    URL.revokeObjectURL(url);

    console.log("Recording saved as gameplay.webm");
  };

  function downloadRecording(fileUrl: string) {
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = fileUrl;
    a.download = "gameplay.webm";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return {
    startRecording: () => {
      if (mediaRecorder.state !== "recording") {
        recordedChunks = [];
        mediaRecorder.start();
        console.log("Recording started");
      }
    },
    stopRecording: () => {
      if (mediaRecorder.state === "recording") {
        mediaRecorder.stop();
        console.log("Recording stopped");
      }
    },
    mediaRecorder,
  };
}

function getSpeed(): string | null {
  const divElement = document.querySelector(".speedometer");
  if (divElement) {
    const spans = divElement.querySelectorAll("span");
    const speed = spans[0]?.textContent;
    return speed === "0" ? null : speed;
  }
  return null;
}

// Add this new function to monitor for the Play button and show welcome dialog when clicked
function setupPlayButtonListener() {
  // Use a MutationObserver to watch for changes in the DOM
  const observer = new MutationObserver(() => {
    const buttons = document.querySelectorAll("button.button-image");
    const playButton = Array.from(buttons).find(
      (button) => button.querySelector("p")?.textContent?.trim() === "Play"
    );

    if (playButton && playButton instanceof HTMLButtonElement) {
      // Check if we've already added a listener to this button
      if (!playButton.dataset.listenerAdded) {
        playButton.dataset.listenerAdded = "true";

        playButton.addEventListener("click", () => {
          // Show the welcome dialog when the Play button is clicked
          setTimeout(() => showWelcomeDialog(), 300);
        });

        console.log("Added welcome dialog listener to Play button");
      }
    }
  });

  // Start observing changes in the DOM
  observer.observe(document.body, { childList: true, subtree: true });

  // Also check immediately in case the button is already present
  const buttons = document.querySelectorAll("button.button-image");
  const playButton = Array.from(buttons).find(
    (button) => button.querySelector("p")?.textContent?.trim() === "Play"
  );

  if (playButton && playButton instanceof HTMLButtonElement) {
    if (!playButton.dataset.listenerAdded) {
      playButton.dataset.listenerAdded = "true";

      playButton.addEventListener("click", () => {
        setTimeout(() => showWelcomeDialog(), 300);
      });

      console.log("Added welcome dialog listener to Play button (initial)");
    }
  }
}

// Call this in your main function
async function initializeRecorder() {
  // Initialize IndexedDB
  await initGameplayStorage();

  // Try to load the last recording from IndexedDB
  try {
    const savedBlob = await loadGameplayRecording();
    if (savedBlob) {
      lastRecordedBlob = savedBlob;
      console.log("Loaded previous gameplay recording from storage");
    }
  } catch (error) {
    console.error("Error loading saved recording:", error);
  }

  const canvasRecorder = createCanvasRecorder("screen", 600, 600);
  if (!canvasRecorder) return;

  let recordingState: "idle" | "recording" | "ended" = "idle";

  // Call the new function to setup Play button listener
  setupPlayButtonListener();

  // Show welcome dialog on initial load
  // setTimeout(() => {
  //   if (document.getElementById("screen")) {
  //     showWelcomeDialog();
  //   }
  // }, 1500);

  function checkDomForRecording() {
    const speed = getSpeed();
    const timeAnnouncer = document.querySelector(".time-announcer");
    const hintShow = document.querySelector(".hint.show");

    // First check for game end condition
    if (recordingState === "recording" && (timeAnnouncer || hintShow)) {
      if (canvasRecorder) {
        canvasRecorder.stopRecording();
        recordingState = "ended";

        // Show the summary style dialog after a small delay
        setTimeout(() => {
          showSummaryStyleDialog();
        }, 1000);
      }
      return;
    }

    // Then check for reset condition
    if (
      recordingState === "ended" &&
      speed === null &&
      !timeAnnouncer &&
      !hintShow
    ) {
      recordingState = "idle";
      console.log("Game reset; ready to start a new session.");
    }

    // Finally check for start condition
    if (recordingState === "idle" && speed !== null && canvasRecorder) {
      canvasRecorder.startRecording();
      recordingState = "recording";
    }
  }

  // Add keyboard event listener for manual recording stop
  document.addEventListener("keydown", (event) => {
    if (
      recordingState === "recording" &&
      (event.key === "r" || event.key === "R" || event.key === "Enter")
    ) {
      if (canvasRecorder) {
        canvasRecorder.stopRecording();
        recordingState = "ended";
        console.log("Recording stopped manually");
      }
    }
  });

  checkDomForRecording();

  const observer = new MutationObserver(() => {
    checkDomForRecording();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function showWelcomeDialog() {
  // Create backdrop that will blur everything else
  const backdrop = document.createElement("div");
  backdrop.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(8px);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.3s ease-out;
  `;

  const dialog = document.createElement("div");
  dialog.style.cssText = `
    background: #0a0a0a;
    color: #ffffff;
    border-radius: 12px;
    width: 600px;
    max-width: 90%;
    padding: 0;
    box-shadow: 0 20px 25px -5px rgba(220, 38, 38, 0.25), 0 8px 10px -6px rgba(0, 0, 0, 0.3);
    overflow: hidden;
    animation: slideUp 0.4s ease-out;
    border: 1px solid rgba(220, 38, 38, 0.3);
  `;

  const tracks = ["GD-Track-01", "GD-Track-02", "GD-Track-03"];
  const trackLabels = ["Track 1", "Track 2", "Track 3"];

  dialog.innerHTML = `
    <style>
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      
      @keyframes slideUp {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }
      
      @keyframes pulse {
        0% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.4); }
        70% { box-shadow: 0 0 0 10px rgba(220, 38, 38, 0); }
        100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0); }
      }
      
      @keyframes fadeInUp {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }

      .welcome-header {
        text-align: center;
        padding: 28px 24px;
        background: linear-gradient(135deg, #dc2626, #991b1b);
        color: white;
        margin-bottom: 0;
        position: relative;
        overflow: hidden;
        border-bottom: 2px solid rgba(255, 255, 255, 0.1);
      }
      
      .welcome-header::after {
        content: '';
        position: absolute;
        top: -50%;
        left: -50%;
        width: 200%;
        height: 200%;
        background: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0) 60%);
        transform: rotate(30deg);
        pointer-events: none;
      }
      
      .welcome-header h2 {
        font-size: 2.2rem;
        font-weight: 800;
        color: white;
        letter-spacing: -0.025em;
        margin: 0 0 8px 0;
        text-shadow: 0 2px 4px rgba(0,0,0,0.3);
      }
      
      .welcome-header p {
        color: rgba(255,255,255,0.9);
        font-size: 1.1rem;
        margin: 0;
      }
      
      .form-container {
        padding: 28px;
        background: #0a0a0a;
      }
      
      .form-group {
        margin-bottom: 24px;
        position: relative;
      }
      
      .form-group:last-of-type {
        margin-bottom: 8px;
      }
      
      .form-input {
        width: 100%;
        padding: 18px 24px;
        border: 2px solid #27272a;
        border-radius: 8px;
        font-size: 1rem;
        transition: all 0.2s ease;
        background:rgb(27, 24, 24);
        color: white;
        box-shadow: 0 1px 2px rgba(0,0,0,0.1) inset;
        margin-top: 10px;
      }
      
      .form-input:focus {
        border-color: #dc2626;
        outline: none;
        box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.2);
      }
      
      .form-input::placeholder {
        color: #71717a;
      }
      
      .section-title {
        font-size: 1.1rem;
        font-weight: 600;
        color: #f1f5f9;
        margin: 0 0 5px 0;
        text-transform: uppercase;
      }
      
      .section-desc {
        font-size: 0.9rem;
        color: #a1a1aa;
        margin: 0 0 16px 0;
      }
      
      .option-group {
        display: flex;
        gap: 12px;
        margin-bottom: 20px;
        width: 100%;
      }
      
      .option-card {
        flex: 1;
        background: #121212;
        border: 2px solid #27272a;
        border-radius: 8px;
        padding: 16px;
        cursor: pointer;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        position: relative;
        overflow: hidden;
      }
      
      .option-card:hover {
        border-color: rgba(220, 38, 38, 0.5);
        transform: translateY(-2px);
      }
      
      .option-card.selected {
        border-color: #dc2626;
        background: rgba(220, 38, 38, 0.1);
      }
      
      .option-card input {
        position: absolute;
        opacity: 0;
        cursor: pointer;
        height: 0;
        width: 0;
      }
      
      .radio-circle {
        height: 20px;
        width: 20px;
        min-width: 20px;
        border-radius: 50%;
        border: 2px solid #71717a;
        display: inline-block;
        position: relative;
        transition: all 0.2s ease;
      }
      
      .option-card.selected .radio-circle {
        border-color: #dc2626;
      }
      
      .radio-circle:after {
        content: "";
        position: absolute;
        display: none;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: #dc2626;
        transition: all 0.2s ease;
      }
      
      .option-card.selected .radio-circle:after {
        display: block;
      }
      
      .option-label {
        font-size: 1rem;
        font-weight: 500;
        color: #e5e7eb;
      }
      
      .action-button {
        display: block;
        width: 100%;
        padding: 14px;
        margin-top: 20px;
        background: linear-gradient(to right, #dc2626, #b91c1c);
        color: white;
        border: none;
        border-radius: 8px;
        font-size: 1.1rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
        box-shadow: 0 4px 6px -1px rgba(220, 38, 38, 0.3);
        position: relative;
        overflow: hidden;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      
      .action-button::after {
        content: '';
        position: absolute;
        top: 0;
        left: -100%;
        width: 100%;
        height: 100%;
        background: linear-gradient(to right, transparent, rgba(255,255,255,0.2), transparent);
        transition: 0.5s;
      }
      
      .action-button:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 10px -1px rgba(220, 38, 38, 0.4);
        animation: pulse 1.5s infinite;
      }
      
      .action-button:hover::after {
        left: 100%;
      }
      
      .action-button:active {
        transform: translateY(1px);
      }
      
      .action-button:disabled {
        background: linear-gradient(to right, #3f3f46, #52525b);
        cursor: not-allowed;
        box-shadow: none;
        transform: none;
        animation: none;
      }
      
      .action-button:disabled::after {
        display: none;
      }
      
      .step-one {
        display: block;
      }
      
      .step-two {
        display: none;
      }
      
      .welcome-message {
        font-size: 1.6rem;
        font-weight: 700;
        color: #f1f5f9;
        margin: 0 0 20px 0;
        text-align: center;
        text-shadow: 0 1px 2px rgba(0,0,0,0.2);
        animation: fadeInUp 0.5s ease-out;
      }
      
      .driver-highlight {
        color: #dc2626;
        font-weight: 800;
      }
      
      /* Racing flag pattern for header accent */
      .checkered-flag {
        position: absolute;
        bottom: 0;
        right: 0;
        width: 50px;
        height: 30px;
        background-image: linear-gradient(45deg, #000 25%, transparent 25%),
                          linear-gradient(-45deg, #000 25%, transparent 25%),
                          linear-gradient(45deg, transparent 75%, #000 75%),
                          linear-gradient(-45deg, transparent 75%, #000 75%);
        background-size: 10px 10px;
        background-position: 0 0, 0 5px, 5px -5px, -5px 0px;
        transform: rotate(-10deg);
        opacity: 0.4;
      }
    </style>
    <div class="welcome-header">
      <div class="checkered-flag"></div>
      <h2>SUMMARACER</h2>
      <p>Ready to race?</p>
    </div>
    
    <div class="form-container">
      <div class="step-one">
        <div class="form-group">
          <label for="player-name">ENTER YOUR DRIVER NAME</label>
          <input type="text" id="player-name" class="form-input" placeholder="Enter your name" required>
        </div>
        <button id="set-name" class="action-button" disabled>SET NAME</button>
      </div>
      
      <div class="step-two">
        <div class="welcome-message">Welcome, <span class="driver-highlight" id="driver-name"></span>!</div>
        
        <div class="form-group">
          <div class="section-title">AI Driver Enabled?</div>
          <div class="section-desc">Select "Yes" if AI is controlling the vehicle</div>
          <div class="option-group">
            <label class="option-card" id="ai-yes-card">
              <input type="radio" name="ai-enabled" value="yes" id="ai-yes">
              <span class="radio-circle"></span>
              <span class="option-label">Yes</span>
            </label>
            <label class="option-card selected" id="ai-no-card">
              <input type="radio" name="ai-enabled" value="no" id="ai-no" checked>
              <span class="radio-circle"></span>
              <span class="option-label">No</span>
            </label>
          </div>
        </div>
        
        <div class="form-group">
          <div class="section-title">Select Track</div>
          <div class="section-desc">Select which track you're playing on</div>
          <div class="option-group" style="flex-wrap: wrap;">
            ${tracks
              .map(
                (track, index) => `
              <label class="option-card ${
                index === 0 ? "selected" : ""
              }" id="track-${index}-card">
                <input type="radio" name="track-selection" value="${track}" id="track-${index}" ${
                  index === 0 ? "checked" : ""
                }>
                <span class="radio-circle"></span>
                <span class="option-label">${trackLabels[index]}</span>
              </label>
            `
              )
              .join("")}
          </div>
        </div>
        
        <button id="start-race" class="action-button">START RACE</button>
      </div>
    </div>
  `;

  // Handle step one - name input
  const nameInput = dialog.querySelector("#player-name") as HTMLInputElement;
  const setNameButton = dialog.querySelector("#set-name") as HTMLButtonElement;
  const stepOne = dialog.querySelector(".step-one") as HTMLDivElement;
  const stepTwo = dialog.querySelector(".step-two") as HTMLDivElement;
  const driverNameSpan = dialog.querySelector(
    "#driver-name"
  ) as HTMLSpanElement;

  // Handle input validation for name
  nameInput.addEventListener("input", () => {
    setNameButton.disabled = !nameInput.value.trim();
  });

  // Function to transition from step one to step two
  const transitionToStepTwo = (playerName: string) => {
    // Update welcome message with player name
    driverNameSpan.textContent = playerName;

    // Hide step one, show step two
    stepOne.style.display = "none";
    stepTwo.style.display = "block";

    // Save player name in extension storage
    chrome.storage.local.set({ playerName: playerName });
  };

  // Handle "Set Name" button click - transition to step two
  setNameButton.addEventListener("click", () => {
    const playerName = nameInput.value.trim();
    if (!playerName) return;
    transitionToStepTwo(playerName);
  });

  // Handle card selection for AI option
  const aiYesCard = dialog.querySelector("#ai-yes-card") as HTMLLabelElement;
  const aiNoCard = dialog.querySelector("#ai-no-card") as HTMLLabelElement;
  const aiYesInput = dialog.querySelector("#ai-yes") as HTMLInputElement;
  const aiNoInput = dialog.querySelector("#ai-no") as HTMLInputElement;

  // Function to set AI driver state
  const setAIDriverState = (enabled: boolean) => {
    if (enabled) {
      aiYesCard.classList.add("selected");
      aiNoCard.classList.remove("selected");
      aiYesInput.checked = true;
    } else {
      aiNoCard.classList.add("selected");
      aiYesCard.classList.remove("selected");
      aiNoInput.checked = true;
    }

    // Save to extension storage
    chrome.storage.local.set({ aiDriverEnabled: enabled ? "yes" : "no" });
  };

  aiYesCard.addEventListener("click", () => setAIDriverState(true));
  aiNoCard.addEventListener("click", () => setAIDriverState(false));

  // Handle card selection for track options
  const trackCards = dialog.querySelectorAll('[id^="track-"][id$="-card"]');
  const trackInputs = dialog.querySelectorAll(
    '[id^="track-"]:not([id$="-card"])'
  );

  // Function to select a specific track
  const selectTrack = (index: number) => {
    // Deselect all cards
    trackCards.forEach((c) => c.classList.remove("selected"));
    // Select the specified card
    trackCards[index].classList.add("selected");
    // Check corresponding radio
    (trackInputs[index] as HTMLInputElement).checked = true;
    // Save to extension storage
    chrome.storage.local.set({
      selectedTrack: (trackInputs[index] as HTMLInputElement).value,
    });
  };

  trackCards.forEach((card, index) => {
    card.addEventListener("click", () => selectTrack(index));
  });

  // Handle step two - race options
  const startButton = dialog.querySelector("#start-race") as HTMLButtonElement;

  // Function to close dialog
  const closeDialog = () => {
    backdrop.remove();
  };

  // Handle form submission
  startButton.addEventListener("click", async () => {
    // Get playerName asynchronously
    const result = await chrome.storage.local.get(["playerName"]);
    const playerName = result.playerName;
    const aiDriverEnabled = aiYesInput.checked;

    // Get selected track
    let selectedTrack = "";
    trackInputs.forEach((input: Element) => {
      if ((input as HTMLInputElement).checked) {
        selectedTrack = (input as HTMLInputElement).value;
      }
    });

    console.log("Player settings:", {
      name: playerName,
      aiDriverEnabled,
      track: selectedTrack,
    });

    // Save track preference to extension storage
    chrome.storage.local.set({ selectedTrack: selectedTrack });

    // Save AI driver preference to extension storage
    chrome.storage.local.set({
      aiDriverEnabled: aiDriverEnabled ? "yes" : "no",
    });

    // Remove the dialog
    closeDialog();

    // Directly run the track selection and AI initialization
    if (selectedTrack) {
      // First redirect to the selected track
      await redirectToTrack(selectedTrack);

      // If AI driver is enabled, fetch data and initialize
      if (aiDriverEnabled) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        try {
          const jsonData = await fetchJsonData(selectedTrack);
          if (jsonData) {
            init(jsonData);
          }
        } catch (error) {
          console.error("Error initializing AI driver:", error);
        }
      }
    } else {
      console.error("No track selected");
    }
  });

  // Close dialog when clicking outside of it
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) {
      closeDialog();
    }
  });

  // Close dialog when pressing Escape key
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeDialog();
    }
  });

  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);

  // Load previous settings
  chrome.storage.local.get(
    ["playerName", "selectedTrack", "aiDriverEnabled"],
    (result) => {
      const storedName = result.playerName;
      const storedTrack = result.selectedTrack;
      const storedAIDriver = result.aiDriverEnabled;

      // Pre-fill the name input
      if (storedName) {
        nameInput.value = storedName;
        setNameButton.disabled = false;

        // Automatically proceed to step two
        transitionToStepTwo(storedName);

        // Apply saved AI driver preference
        if (storedAIDriver === "yes") {
          setAIDriverState(true);
        } else {
          setAIDriverState(false);
        }

        // Apply saved track preference
        if (storedTrack) {
          const trackIndex = tracks.findIndex((track) => track === storedTrack);
          if (trackIndex >= 0) {
            selectTrack(trackIndex);
          }
        }
      } else {
        // Focus on the name input for new users
        nameInput.focus();
      }
    }
  );
}

async function fetchJsonData(track: string): Promise<any> {
  try {
    // Define the number of files in each track folder
    const fileCountMap: Record<string, number> = {
      "GD-Track-01": 9,
      "GD-Track-02": 15,
      "GD-Track-03": 10,
    };

    const fileCount = fileCountMap[track] || 10;

    // Generate a random file index
    const randomIndex = Math.floor(Math.random() * fileCount);

    // Path is now simpler since files from public get copied to root
    const fileUrl = chrome.runtime.getURL(
      `Datasets/${track}/${randomIndex}.json`
    );

    console.log("Attempting to fetch:", fileUrl);

    // Fetch the random file
    const response = await fetch(fileUrl);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch file: ${response.status} ${response.statusText}`
      );
    }

    const jsonData = await response.json();

    // console.log(
    //   `Random JSON data from track ${track} (file: ${randomIndex}.json):`,
    //   jsonData
    // );
    return jsonData;
  } catch (error) {
    console.error(`Error fetching JSON data for track ${track}:`, error);
    return null;
  }
}

export default defineContentScript({
  matches: [
    "*://*.google.com/*",
    "https://kodub.itch.io/polytrack",
    "https://www.kodub.com/apps/polytrack",
    "https://app-polytrack.kodub.com/",
    "https://app-polytrack.kodub.com/*",
  ],
  runAt: "document_end",
  main() {
    console.log("Hello content.");
    initializeRecorder();
  },
});

// Add this new function to display the summary style selection dialog
function showSummaryStyleDialog() {
  const backdrop = document.createElement("div");
  backdrop.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(8px);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.3s ease-out;
  `;

  const dialog = document.createElement("div");
  dialog.style.cssText = `
    background: #0a0a0a;
    color: #ffffff;
    border-radius: 12px;
    width: 480px;
    max-width: 90%;
    padding: 0;
    box-shadow: 0 20px 25px -5px rgba(220, 38, 38, 0.25), 0 8px 10px -6px rgba(0, 0, 0, 0.3);
    overflow: hidden;
    animation: slideUp 0.4s ease-out;
    border: 1px solid rgba(220, 38, 38, 0.3);
  `;

  dialog.innerHTML = `
    <style>
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      
      @keyframes slideUp {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }
      
      @keyframes pulse {
        0% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.4); }
        70% { box-shadow: 0 0 0 10px rgba(220, 38, 38, 0); }
        100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0); }
      }

      .summary-header {
        text-align: center;
        padding: 24px;
        background: linear-gradient(135deg, #dc2626, #991b1b);
        color: white;
        margin-bottom: 0;
        position: relative;
        overflow: hidden;
        border-bottom: 2px solid rgba(255, 255, 255, 0.1);
      }
      
      .summary-header::after {
        content: '';
        position: absolute;
        top: -50%;
        left: -50%;
        width: 200%;
        height: 200%;
        background: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0) 60%);
        transform: rotate(30deg);
        pointer-events: none;
      }
      
      .summary-header h2 {
        font-size: 1.8rem;
        font-weight: 800;
        color: white;
        letter-spacing: -0.025em;
        margin: 0 0 8px 0;
        text-shadow: 0 2px 4px rgba(0,0,0,0.3);
      }
      
      .summary-header p {
        color: rgba(255,255,255,0.9);
        font-size: 1.05rem;
        margin: 0;
      }
      
      .summary-content {
        padding: 24px;
      }
      
      .style-title {
        font-size: 1.1rem;
        font-weight: 600;
        color: #f1f5f9;
        margin: 0 0 16px 0;
        text-transform: uppercase;
      }
      
      .style-options {
        display: flex;
        flex-direction: column;
        gap: 12px;
        margin-bottom: 24px;
      }
      
      .style-option {
        display: flex;
        align-items: center;
        padding: 16px;
        background: #121212;
        border: 2px solid #27272a;
        border-radius: 12px;
        cursor: pointer;
        transition: all 0.2s ease;
        gap: 16px;
      }
      
      .style-option:hover {
        transform: translateY(-2px);
        border-color: rgba(220, 38, 38, 0.5);
      }
      
      .style-option.selected {
        border-color: #dc2626;
        background: rgba(220, 38, 38, 0.1);
      }
      
      .style-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        font-size: 20px;
        color: #f1f5f9;
      }
      
      .style-label {
        font-size: 1.1rem;
        font-weight: 600;
        color: #f1f5f9;
      }
      
      .style-badge {
        margin-left: auto;
        padding: 4px 10px;
        background: #4338ca;
        color: white;
        border-radius: 16px;
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: uppercase;
      }
      
      .analyze-button {
        display: block;
        width: 100%;
        padding: 14px;
        background: linear-gradient(to right, #dc2626, #b91c1c);
        color: white;
        border: none;
        border-radius: 8px;
        font-size: 1.1rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      
      .analyze-button::after {
        content: '';
        position: absolute;
        top: 0;
        left: -100%;
        width: 100%;
        height: 100%;
        background: linear-gradient(to right, transparent, rgba(255,255,255,0.2), transparent);
        transition: 0.5s;
      }
      
      .analyze-button:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 10px -1px rgba(220, 38, 38, 0.4);
        animation: pulse 1.5s infinite;
      }
      
      .analyze-button:disabled {
        background: linear-gradient(to right, #3f3f46, #52525b);
        cursor: not-allowed;
        box-shadow: none;
        transform: none;
        animation: none;
      }
    </style>
    
    <div class="summary-header">
      <h2>AI Racing Coach</h2>
      <p>Select a style for your performance analysis</p>
    </div>
    
    <div class="summary-content">
      <div class="style-title">Summary Style</div>
      
      <div class="style-options">
        <div class="style-option selected" data-style="short">
          <div class="style-icon">⚡</div>
          <div class="style-label">Short</div>
          <div class="style-badge">Selected</div>
        </div>
        
        <div class="style-option" data-style="extended">
          <div class="style-icon">📊</div>
          <div class="style-label">Extended</div>
        </div>
        
        <div class="style-option" data-style="humor">
          <div class="style-icon">😄</div>
          <div class="style-label">Humor</div>
        </div>
      </div>
      
      <button class="analyze-button">Analyze My Race</button>
    </div>
  `;

  // Define the exact prompts from your code
  const stylePrompts = {
    short: `Provide an extremely brief analysis in 2-3 bullet points:
    - Overall driving assessment
    - Key improvement tip
    - Rating (1-10)
    Be very concise.`,

    extended: `Keep this concise but include:
    - Quick driving style assessment
    - Top 2 strengths
    - Top 2 areas for improvement
    - One technical tip
    - Rating (1-10)
    Keep it short and focused.`,

    humor: `Create a brief, funny analysis:
    - One witty observation
    - One humorous tip
    - A comedic rating (1-10)
    Keep it short and entertaining.`,
  };

  // Function to handle style selection
  const styleOptions = dialog.querySelectorAll(".style-option");
  let selectedStyle = "short"; // Default style

  styleOptions.forEach((option) => {
    option.addEventListener("click", () => {
      // Remove selected class from all options
      styleOptions.forEach((opt) => {
        opt.classList.remove("selected");
        opt.querySelector(".style-badge")?.remove();
      });

      // Add selected class to clicked option
      option.classList.add("selected");

      // Add selected badge
      const badge = document.createElement("div");
      badge.className = "style-badge";
      badge.textContent = "Selected";
      option.appendChild(badge);

      // Update selected style
      selectedStyle = option.getAttribute("data-style") || "short";
    });
  });

  // Function to close dialog
  const closeDialog = () => {
    backdrop.remove();
  };

  // Handle analyze button click
  const analyzeButton = dialog.querySelector(".analyze-button");
  analyzeButton?.addEventListener("click", () => {
    closeDialog();
    stopSimulation();

    // Get the prompt based on the selected style
    const prompt = stylePrompts[selectedStyle as keyof typeof stylePrompts];

    // Show loading indicator
    showLoadingDialog();

    // Send to LLM endpoint
    if (lastRecordedBlob) {
      sendToLLMEndpoint(prompt, lastRecordedBlob)
        .then((summary) => {
          hideLoadingDialog();
          showSummaryDialog(summary);
        })
        .catch((error) => {
          hideLoadingDialog();
          showErrorDialog("Failed to generate summary. Please try again.");
          console.error("Error generating summary:", error);
        });
    } else {
      hideLoadingDialog();
      showErrorDialog("No gameplay recording found.");
    }
  });

  // Close dialog when clicking outside of it
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) {
      closeDialog();
    }
  });

  // Close dialog when pressing Escape key
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeDialog();
    }
  });

  document.body.appendChild(backdrop);
  backdrop.appendChild(dialog);
}

// Add loading dialog functions
function showLoadingDialog() {
  const backdrop = document.createElement("div");
  backdrop.id = "loading-backdrop";
  backdrop.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(8px);
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
  `;

  backdrop.innerHTML = `
    <div style="
      background: #0a0a0a;
      border-radius: 12px;
      padding: 24px;
      text-align: center;
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
      border: 1px solid rgba(220, 38, 38, 0.3);
    ">
      <div style="
        width: 40px;
        height: 40px;
        border: 4px solid rgba(220, 38, 38, 0.3);
        border-top-color: #dc2626;
        border-radius: 50%;
        margin: 0 auto 16px;
        animation: spin 1s linear infinite;
      "></div>
      <p style="
        color: white;
        font-size: 1.1rem;
        font-weight: 600;
        margin: 0;
      ">Analyzing your race...</p>
      <p style="
        color: #a1a1aa;
        font-size: 0.9rem;
        margin: 8px 0 0;
      ">This might take a moment</p>
      
      <style>
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      </style>
    </div>
  `;

  document.body.appendChild(backdrop);
}

function hideLoadingDialog() {
  const loadingBackdrop = document.getElementById("loading-backdrop");
  if (loadingBackdrop) {
    loadingBackdrop.remove();
  }
}

function getRatingGradient(score: number) {
  if (score >= 8) return "linear-gradient(135deg, #22c55e, #16a34a)";
  if (score >= 6) return "linear-gradient(135deg, #eab308, #ca8a04)";
  if (score >= 4) return "linear-gradient(135deg, #f97316, #ea580c)";
  return "linear-gradient(135deg, #ef4444, #dc2626)";
}

function getRatingDescription(score: number) {
  if (score >= 8) return "Outstanding performance! Exceptional driving skills.";
  if (score >= 6) return "Good driving with room for improvement.";
  if (score >= 4) return "Average performance - keep practicing.";
  return "Needs significant improvement. Don't give up!";
}

// Add these IndexedDB helper functions near the top of your file

// Initialize the IndexedDB
function initGameplayStorage(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("GameAnalysisDB", 1);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      // Create an object store for gameplay recordings if it doesn't exist
      if (!db.objectStoreNames.contains("gameplayRecordings")) {
        db.createObjectStore("gameplayRecordings", { keyPath: "id" });
      }
    };

    request.onsuccess = () => {
      console.log("IndexedDB initialized successfully");
      resolve();
    };

    request.onerror = (event) => {
      console.error("Error initializing IndexedDB:", request.error);
      reject(request.error);
    };
  });
}

// Save gameplay recording to IndexedDB
function saveGameplayRecording(blob: Blob): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("GameAnalysisDB", 1);

    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(["gameplayRecordings"], "readwrite");
      const store = transaction.objectStore("gameplayRecordings");

      // Always use the same key 'latestRecording' to overwrite previous recordings
      const record = {
        id: "latestRecording",
        blob: blob,
        timestamp: new Date().toISOString(),
      };

      const storeRequest = store.put(record);

      storeRequest.onsuccess = () => {
        console.log("Gameplay recording saved to IndexedDB");
        resolve();
      };

      storeRequest.onerror = () => {
        console.error("Error saving gameplay recording:", storeRequest.error);
        reject(storeRequest.error);
      };
    };

    request.onerror = () => {
      console.error("Error opening database:", request.error);
      reject(request.error);
    };
  });
}

// Load gameplay recording from IndexedDB
function loadGameplayRecording(): Promise<Blob | null> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("GameAnalysisDB", 1);

    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(["gameplayRecordings"], "readonly");
      const store = transaction.objectStore("gameplayRecordings");

      const getRequest = store.get("latestRecording");

      getRequest.onsuccess = () => {
        if (getRequest.result) {
          console.log("Gameplay recording loaded from IndexedDB");
          resolve(getRequest.result.blob);
        } else {
          console.log("No gameplay recording found in IndexedDB");
          resolve(null);
        }
      };

      getRequest.onerror = () => {
        console.error("Error loading gameplay recording:", getRequest.error);
        reject(getRequest.error);
      };
    };

    request.onerror = () => {
      console.error("Error opening database:", request.error);
      reject(request.error);
    };
  });
}
