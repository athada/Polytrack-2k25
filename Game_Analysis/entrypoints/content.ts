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

    // Validate that the track is one of the allowed tracks before proceeding
    const validTracks = ["GD-Track-01", "GD-Track-02", "GD-Track-03"];
    if (!validTracks.includes(message.track)) {
      console.log(
        `Invalid track name: "${message.track}". Using default track.`
      );
      sendResponse({ error: "Invalid track name" });
      return true;
    }

    // Explicitly save the track to Chrome storage for consistency
    await chrome.storage.local.set({ selectedTrack: message.track });

    await redirectToTrack(message.track);
    await new Promise((resolve) => setTimeout(resolve, 300));
    closeWelcomeDialog();
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
  closeButton?.addEventListener("click", async () => {
    closeDialog();
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

  // Add the leaderboard button
  addLeaderboardButton();

  // Add the reset player button
  addResetPlayerButton();

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

        // Save race to leaderboard ONLY if the time-announcer exists
        // This ensures the race was properly finished
        if (timeAnnouncer) {
          const raceTime = getRaceTime();
          if (raceTime) {
            saveRaceToLeaderboard(raceTime);
            console.log("Race completed successfully, saved to leaderboard");
          }
        } else {
          console.log(
            "Race ended without time-announcer, not saving to leaderboard"
          );
        }

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

// Add these functions to create and show the leaderboard

// Add a floating button to open the leaderboard
function addLeaderboardButton() {
  // Remove existing button if it exists
  const existingButton = document.getElementById("leaderboard-button");
  if (existingButton) {
    existingButton.remove();
  }

  const button = document.createElement("button");
  button.id = "leaderboard-button";
  button.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 20v-6M6 20V10M18 20V4"/>
    </svg>
    Leaderboard
  `;

  button.style.cssText = `
    position: fixed;
    bottom: 60px;
    right: 20px;
    z-index: 9000;
    background: linear-gradient(135deg, #dc2626, #991b1b);
    color: white;
    border: none;
    border-radius: 8px;
    padding: 8px 12px;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    transition: all 0.2s ease;
  `;

  button.addEventListener("mouseover", () => {
    button.style.transform = "translateY(-2px)";
    button.style.boxShadow =
      "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)";
  });

  button.addEventListener("mouseout", () => {
    button.style.transform = "translateY(0)";
    button.style.boxShadow =
      "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)";
  });

  button.addEventListener("click", () => {
    showLeaderboard();
  });

  document.body.appendChild(button);
}

// Show the leaderboard dialog
function showLeaderboard() {
  // Get the list of tracks
  const tracks = ["GD-Track-01", "GD-Track-02", "GD-Track-03"];
  const trackLabels = ["Track 1", "Track 2", "Track 3"];

  // Get currently selected track from storage or default to first track
  let selectedTrackIndex = 0;

  // Try to get last selected track from chrome storage
  chrome.storage.local.get(["selectedTrack"], (result) => {
    if (result.selectedTrack) {
      const index = tracks.findIndex((track) => track === result.selectedTrack);
      if (index >= 0) selectedTrackIndex = index;
      renderLeaderboard(selectedTrackIndex);
    } else {
      renderLeaderboard(0); // Default to first track
    }
  });

  // Create backdrop
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

  // Create dialog
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
    max-height: 90vh;
    overflow-y: auto;
  `;

  // Add shared CSS styles
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
      
      .leaderboard-header {
        text-align: center;
        padding: 20px;
        background: linear-gradient(135deg, #dc2626, #991b1b);
        color: white;
        position: relative;
        overflow: hidden;
        border-bottom: 2px solid rgba(255, 255, 255, 0.1);
      }
      
      .leaderboard-header::after {
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
      
      .leaderboard-header h2 {
        font-size: 1.6rem;
        font-weight: 800;
        color: white;
        letter-spacing: -0.025em;
        margin: 0;
        text-shadow: 0 2px 4px rgba(0,0,0,0.3);
        text-transform: uppercase;
        font-family: monospace;
      }
      
      .track-tabs {
        display: flex;
        margin: 0;
        padding: 0;
        background: #1a1a1a;
        border-bottom: 2px solid rgba(220, 38, 38, 0.5);
      }
      
      .track-tab {
        flex: 1;
        text-align: center;
        padding: 12px 16px;
        font-size: 1rem;
        font-weight: 700;
        color: #e5e7eb;
        cursor: pointer;
        transition: all 0.2s ease;
        border-bottom: 3px solid transparent;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      
      .track-tab:hover {
        background: rgba(255, 255, 255, 0.05);
      }
      
      .track-tab.active {
        color: white;
        background: rgba(220, 38, 38, 0.2);
        border-bottom-color: #dc2626;
      }
      
      .leaderboard-content {
        padding: 0;
      }
      
      /* Enhanced AI Time Section Styles */
      .ai-time-section {
        background: rgba(20, 20, 31, 0.9);
        margin: 0;
        position: relative;
        overflow: hidden;
        box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
        border-bottom: 1px solid rgba(30, 41, 59, 0.8);
      }
      
      .ai-time-section::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: 
          radial-gradient(circle at top right, rgba(220, 38, 38, 0.1), transparent 70%),
          radial-gradient(circle at bottom left, rgba(16, 185, 129, 0.07), transparent 70%);
        pointer-events: none;
      }
      
      @keyframes gradientShift {
        0% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
      }
      
      .ai-time-header {
        padding: 14px 16px;
        font-size: 1.3rem;
        font-weight: 700;
        color: white;
        text-transform: uppercase;
        letter-spacing: 1px;
        background: linear-gradient(110deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.95));
        display: flex;
        align-items: center;
        gap: 10px;
        border-left: 4px solid #dc2626;
        position: relative;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        overflow: hidden;
      }
      
      .ai-time-header::after {
        content: '';
        position: absolute;
        top: 0;
        right: 0;
        bottom: 0;
        width: 30%;
        background: linear-gradient(90deg, transparent, rgba(220, 38, 38, 0.1), transparent);
        transform: skewX(-30deg);
        animation: sweepLight 3s ease-in-out infinite;
      }
      
      @keyframes sweepLight {
        0% { transform: skewX(-30deg) translateX(-200%); }
        100% { transform: skewX(-30deg) translateX(400%); }
      }
      
      .ai-badge {
        background: linear-gradient(135deg, #dc2626, #991b1b);
        color: white;
        padding: 3px 9px;
        border-radius: 4px;
        font-size: 0.9rem;
        font-weight: 800;
        letter-spacing: 1px;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
        position: relative;
        overflow: hidden;
      }
      
      .ai-badge::after {
        content: '';
        position: absolute;
        top: -50%;
        left: -50%;
        width: 200%;
        height: 200%;
        background: linear-gradient(rgba(255,255,255,0.2), transparent);
        transform: rotate(30deg);
      }
      
      .ai-time-entry {
        display: flex;
        align-items: center;
        padding: 16px 20px;
        transition: all 0.3s ease;
        border-left: 4px solid transparent;
        position: relative;
        background: linear-gradient(90deg, 
          rgba(17, 24, 39, 0.7), 
          rgba(17, 24, 39, 0.5)
        );
      }
      
      .ai-time-entry:hover {
        background: linear-gradient(90deg, 
          rgba(17, 24, 39, 0.8), 
          rgba(17, 24, 39, 0.6)
        );
        border-left-color: rgba(220, 38, 38, 0.5);
      }
      
      @keyframes pulse-border {
        0% { border-color: rgba(220, 38, 38, 0.2); }
        50% { border-color: rgba(220, 38, 38, 0.6); }
        100% { border-color: rgba(220, 38, 38, 0.2); }
      }
      
      .ai-time-entry::before {
        content: '';
        position: absolute;
        left: 0;
        top: 0;
        height: 100%;
        width: 4px;
        background: linear-gradient(to bottom, #dc2626, #991b1b);
        opacity: 0.7;
        animation: pulse-border 2s infinite;
      }
      
      .ai-car {
        position: relative;
        animation: carHover 2s ease-in-out infinite;
        filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.4));
        transition: transform 0.3s ease;
      }
      
      .ai-time-entry:hover .ai-car {
        transform: scale(1.1) translateY(-2px);
        filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.6));
      }
      
      @keyframes carHover {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-4px); }
      }
      
      .ai-car::after {
        content: '';
        position: absolute;
        bottom: -8px;
        left: 15%;
        width: 70%;
        height: 6px;
        background: rgba(0, 0, 0, 0.3);
        filter: blur(3px);
        border-radius: 50%;
        animation: shadowPulse 2s ease-in-out infinite;
      }
      
      @keyframes shadowPulse {
        0%, 100% { transform: scaleX(1); opacity: 0.4; }
        50% { transform: scaleX(0.7); opacity: 0.1; }
      }
      
      .ai-rank {
        font-size: 1.3rem;
        color: #dc2626;
        font-weight: 900;
        text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
        margin-left: 5px;
        position: relative;
      }
      
      .ai-rank::after {
        content: '';
        position: absolute;
        bottom: -4px;
        left: 0;
        width: 100%;
        height: 2px;
        background: linear-gradient(to right, #dc2626, transparent);
      }
      
      .ai-time {
        font-weight: 800;
        font-size: 1.6rem;
        color: #f8fafc;
        position: relative;
        letter-spacing: 1px;
        text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
        font-family: 'Courier New', monospace;
        padding: 5px 0;
        transition: all 0.3s ease;
      }
      
      .ai-time-entry:hover .ai-time {
        color: white;
        text-shadow: 0 0 10px rgba(255, 255, 255, 0.5);
      }
      
      .ai-time::after {
        content: 'TARGET';
        position: absolute;
        font-size: 0.7rem;
        top: -10px;
        left: 50%;
        transform: translateX(-50%);
        color: #dc2626;
        font-weight: 700;
        letter-spacing: 2px;
        text-shadow: none;
        background: rgba(0, 0, 0, 0.2);
        padding: 2px 8px;
        border-radius: 2px;
        white-space: nowrap;
      }
      
      .ai-time::before {
        content: '';
        position: absolute;
        bottom: -3px;
        left: 0;
        width: 100%;
        height: 1px;
        background: linear-gradient(to right, transparent, rgba(255, 255, 255, 0.5), transparent);
      }
      
      .human-times-header {
        padding: 12px 16px;
        font-size: 1.2rem;
        font-weight: 700;
        color: white;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        background: linear-gradient(to right, rgba(30, 41, 59, 0.9), rgba(15, 23, 42, 0.9));
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      }
      
      .leaderboard-entry {
        display: flex;
        align-items: center;
        padding: 12px 16px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        transition: background-color 0.2s ease;
      }
      
      .leaderboard-entry:nth-child(odd) {
        background-color: rgba(255, 255, 255, 0.02);
      }
      
      .leaderboard-entry:hover {
        background-color: rgba(220, 38, 38, 0.1);
      }
      
      .entry-car-container {
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-right: 8px;
      }
      
      .entry-car {
        width: 35px;
        height: 35px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 3px;
        color: rgba(255, 255, 255, 0.9);
      }
      
      .entry-rank {
        width: 50px;
        font-size: 1.2rem;
        font-weight: 800;
        color: white;
        font-family: monospace;
        text-align: center;
      }
      
      .entry-name {
        flex: 1;
        font-size: 1.2rem;
        font-weight: 600;
        color: white;
        padding: 0 15px;
        font-family: monospace;
        text-align: left;
      }
      
      .entry-time {
        width: 120px;
        font-size: 1.2rem;
        font-weight: 600;
        color: white;
        font-family: monospace;
        text-align: center;
      }
      
      .no-times-message {
        padding: 32px 16px;
        text-align: center;
        color: rgba(255, 255, 255, 0.7);
        font-style: italic;
      }
      
      .close-button {
        display: block;
        width: calc(100% - 32px);
        margin: 16px auto;
        padding: 12px;
        background: linear-gradient(to right, #dc2626, #b91c1c);
        color: white;
        border: none;
        border-radius: 8px;
        font-size: 1rem;
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
    
    <div class="leaderboard-header">
      <h2>Leaderboard</h2>
    </div>
    
    <div class="track-tabs">
      ${tracks
        .map(
          (track, index) => `
        <div class="track-tab ${
          index === selectedTrackIndex ? "active" : ""
        }" data-track="${track}">
          ${trackLabels[index]}
        </div>
      `
        )
        .join("")}
    </div>
    
    <div id="leaderboard-data-container">
      <!-- Leaderboard data will be rendered here -->
    </div>
    
    <button class="close-button">Close Leaderboard</button>
  `;

  // Function to render the leaderboard for a specific track
  function renderLeaderboard(trackIndex: number) {
    const track = tracks[trackIndex];
    const trackLabel = trackLabels[trackIndex];

    // Update active tab
    const allTabs = dialog.querySelectorAll(".track-tab");
    allTabs.forEach((tab, idx) => {
      if (idx === trackIndex) {
        tab.classList.add("active");
      } else {
        tab.classList.remove("active");
      }
    });

    // Get track-specific leaderboard data
    const leaderboardKey = `raceLeaderboard_${track}`;
    let leaderboardData: LeaderboardEntry[] = [];
    try {
      const storedLeaderboard = localStorage.getItem(leaderboardKey);
      if (storedLeaderboard) {
        leaderboardData = JSON.parse(storedLeaderboard);
      }
    } catch (error) {
      console.error(`Error loading leaderboard data for ${track}:`, error);
    }

    // Separate user times and AI times
    const userTimes = leaderboardData.filter((entry) => !entry.isAI);
    const aiTimes = leaderboardData.filter((entry) => entry.isAI);

    // Create AI Time to Beat entry (if available)
    let aiTimeToBeat = null;
    if (aiTimes.length > 0) {
      // Sort AI times to find the fastest
      aiTimes.sort((a, b) => {
        const timeA = a.time
          .split(":")
          .reduce((acc, val) => acc * 60 + parseFloat(val), 0);
        const timeB = b.time
          .split(":")
          .reduce((acc, val) => acc * 60 + parseFloat(val), 0);
        return timeA - timeB;
      });

      // Take the fastest AI time
      aiTimeToBeat = aiTimes[0];
    }

    // Add position/rank to each user entry
    const rankedUserData = userTimes.map((entry, index) => {
      const position = index + 1;
      let rank: string;

      // Convert position to rank with suffix
      if (position === 1) rank = "1st";
      else if (position === 2) rank = "2nd";
      else if (position === 3) rank = "3rd";
      else rank = `${position}th`;

      return { ...entry, rank };
    });

    // Add these styles to the existing <style> tag in your dialog
    const additionalStyles = `
      /* Advanced AI Time Section Styles */
      .ai-time-section {
        background: linear-gradient(170deg, rgba(17, 24, 39, 0.95), rgba(10, 15, 25, 0.98));
        margin: 0;
        position: relative;
        overflow: hidden;
        box-shadow: 0 8px 20px -6px rgba(0, 0, 0, 0.5);
        border-bottom: 1px solid rgba(30, 41, 59, 0.8);
      }
      
      .ai-time-section::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: 
          radial-gradient(circle at top right, rgba(220, 38, 38, 0.15), transparent 70%),
          radial-gradient(circle at bottom left, rgba(16, 185, 129, 0.07), transparent 70%),
          linear-gradient(to right, rgba(0, 0, 0, 0.2), transparent 80%);
        pointer-events: none;
      }
      
      .ai-time-section::after {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: repeating-linear-gradient(
          -45deg,
          transparent,
          transparent 10px,
          rgba(220, 38, 38, 0.03) 10px,
          rgba(220, 38, 38, 0.03) 20px
        );
        pointer-events: none;
      }
      
      .ai-time-header {
        padding: 16px;
        font-size: 1.3rem;
        font-weight: 700;
        color: white;
        text-transform: uppercase;
        letter-spacing: 1.5px;
        background: linear-gradient(110deg, rgba(20, 20, 35, 0.95), rgba(15, 15, 25, 0.95));
        display: flex;
        align-items: center;
        gap: 12px;
        border-left: 4px solid #dc2626;
        position: relative;
        box-shadow: 0 3px 10px rgba(0, 0, 0, 0.3);
        overflow: hidden;
        z-index: 1;
      }
      
      .ai-time-header::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: linear-gradient(110deg, transparent, rgba(220, 38, 38, 0.2));
        z-index: -1;
      }
      
      .ai-time-header::after {
        content: '';
        position: absolute;
        top: 0;
        right: 0;
        bottom: 0;
        width: 30%;
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
        transform: skewX(-30deg);
        animation: sweepLight 4s ease-in-out infinite;
        z-index: 0;
      }
      
      @keyframes sweepLight {
        0% { transform: skewX(-30deg) translateX(-300%); }
        100% { transform: skewX(-30deg) translateX(500%); }
      }
      
      .ai-badge {
        background: linear-gradient(135deg, #dc2626, #991b1b);
        color: white;
        padding: 5px 10px;
        border-radius: 6px;
        font-size: 0.95rem;
        font-weight: 800;
        letter-spacing: 1.5px;
        box-shadow: 0 3px 6px rgba(0, 0, 0, 0.3);
        position: relative;
        overflow: hidden;
        transform: perspective(100px) rotateX(2deg);
        transform-origin: top;
      }
      
      .ai-badge::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 50%;
        background: linear-gradient(to bottom, rgba(255,255,255,0.4), transparent);
        border-radius: 4px 4px 0 0;
      }
      
      .ai-badge::after {
        content: '';
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 6px;
        background: linear-gradient(to right, transparent, rgba(255,255,255,0.4), transparent);
        animation: badgeScan 2s linear infinite;
      }
      
      @keyframes badgeScan {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(100%); }
      }
      
      .ai-time-entry {
    display: flex;
    align-items: center;
        padding: 20px;
        transition: all 0.3s ease;
        border-left: 4px solid transparent;
        position: relative;
        background: linear-gradient(90deg, 
          rgba(15, 23, 42, 0.8), 
          rgba(15, 23, 42, 0.6)
        );
      }
      
      .ai-time-entry:hover {
        background: linear-gradient(90deg, 
          rgba(20, 29, 47, 0.9), 
          rgba(15, 23, 42, 0.7)
        );
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
      }
      
      .ai-time-entry::before {
        content: '';
        position: absolute;
    left: 0;
        top: 0;
        height: 100%;
        width: 4px;
        background: linear-gradient(to bottom, #dc2626, #991b1b);
        opacity: 0.8;
        animation: pulse-border 2s infinite;
        box-shadow: 0 0 8px rgba(220, 38, 38, 0.4);
      }
      
      .ai-icon-container {
        width: 48px;
        height: 48px;
        margin-right: 15px;
    display: flex;
    align-items: center;
    justify-content: center;
        position: relative;
      }
      
      .ai-icon {
        width: 100%;
        height: 100%;
        position: relative;
        animation: floatIcon 3s ease-in-out infinite;
        filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.5));
      }
      
      @keyframes floatIcon {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-5px); }
      }
      
      .ai-icon::after {
        content: '';
        position: absolute;
        bottom: -5px;
        left: 15%;
        width: 70%;
        height: 10px;
        background: rgba(0, 0, 0, 0.3);
        filter: blur(4px);
        border-radius: 50%;
        animation: iconShadow 3s ease-in-out infinite;
      }
      
      @keyframes iconShadow {
        0%, 100% { transform: scaleX(1); opacity: 0.3; }
        50% { transform: scaleX(0.7); opacity: 0.15; }
      }
      
      .ai-rank {
        font-size: 1.4rem;
        color: #dc2626;
        font-weight: 900;
        text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
        margin-left: 8px;
        position: relative;
        letter-spacing: 1px;
      }
      
      .ai-rank::after {
        content: '';
        position: absolute;
        bottom: -4px;
        left: 0;
        width: 100%;
        height: 2px;
        background: linear-gradient(to right, #dc2626, transparent);
      }
      
      .ai-time {
        font-weight: 800;
        font-size: 1.8rem;
        color: #f8fafc;
        position: relative;
        letter-spacing: 2px;
        text-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
        font-family: 'Courier New', monospace;
        padding: 5px 10px;
        transition: all 0.3s ease;
        background: rgba(0, 0, 0, 0.2);
        border-radius: 4px;
        box-shadow: inset 0 0 10px rgba(0, 0, 0, 0.3);
      }
      
      .ai-time-entry:hover .ai-time {
        color: white;
        text-shadow: 0 0 15px rgba(255, 255, 255, 0.7);
        letter-spacing: 2.5px;
        transform: scale(1.05);
      }
      
      .ai-time::after {
        content: 'TARGET';
        position: absolute;
        font-size: 0.7rem;
        top: -12px;
        left: 50%;
        transform: translateX(-50%);
        color: #f8fafc;
        font-weight: 700;
        letter-spacing: 2px;
        text-shadow: none;
        background: linear-gradient(to right, #991b1b, #dc2626);
        padding: 3px 10px;
        border-radius: 3px;
        white-space: nowrap;
      }
      
      .ai-time::before {
        content: '';
        position: absolute;
        bottom: -3px;
        left: 10%;
        width: 80%;
        height: 1px;
        background: linear-gradient(to right, transparent, rgba(255, 255, 255, 0.6), transparent);
      }
      
      @keyframes pulse-glow {
        0%, 100% { text-shadow: 0 0 10px rgba(255, 255, 255, 0.2); }
        50% { text-shadow: 0 0 20px rgba(255, 255, 255, 0.5); }
      }
    `;

    // Generate AI Time to Beat HTML with enhanced styling and new bot icon
    const aiTimeHTML = aiTimeToBeat
      ? `
        <div class="ai-time-section">
          <div class="ai-time-header">
            <span class="ai-badge">AI</span>
            <span>Time to Beat</span>
          </div>
          <div class="ai-time-entry">
            <div class="ai-icon-container">
              <div class="ai-icon">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="100%" height="100%" fill="none">
                  <!-- Bot Head Base -->
                  <rect x="4" y="4" width="16" height="12" rx="2" fill="rgba(30, 30, 40, 0.9)" stroke="${aiTimeToBeat.carColor}" stroke-width="1.2" />
                  
                  <!-- Bot Eyes -->
                  <rect x="7" y="8" width="3" height="2" rx="1" fill="${aiTimeToBeat.carColor}" opacity="0.8">
                    <animate attributeName="opacity" values="0.8;1;0.8" dur="3s" repeatCount="indefinite" />
                  </rect>
                  <rect x="14" y="8" width="3" height="2" rx="1" fill="${aiTimeToBeat.carColor}" opacity="0.8">
                    <animate attributeName="opacity" values="0.8;1;0.8" dur="3s" repeatCount="indefinite" />
                  </rect>
                  
                  <!-- Bot Antennas -->
                  <line x1="9" y1="4" x2="9" y2="2" stroke="${aiTimeToBeat.carColor}" stroke-width="1.2">
                    <animate attributeName="y2" values="2;1.5;2" dur="2s" repeatCount="indefinite" />
                  </line>
                  <line x1="15" y1="4" x2="15" y2="2" stroke="${aiTimeToBeat.carColor}" stroke-width="1.2">
                    <animate attributeName="y2" values="2;1.5;2" dur="2.5s" repeatCount="indefinite" />
                  </line>
                  <circle cx="9" cy="1.5" r="0.5" fill="#ffffff" opacity="0.8">
                    <animate attributeName="opacity" values="0.8;1;0.8" dur="2s" repeatCount="indefinite" />
                  </circle>
                  <circle cx="15" cy="1.5" r="0.5" fill="#ffffff" opacity="0.8">
                    <animate attributeName="opacity" values="0.8;1;0.8" dur="2.5s" repeatCount="indefinite" />
                  </circle>
                  
                  <!-- Bot Mouth/Speaker -->
                  <rect x="8" y="12" width="8" height="1.5" rx="0.75" fill="rgba(255, 255, 255, 0.5)" opacity="0.7" />
                  <line x1="9" y1="12.75" x2="15" y2="12.75" stroke="${aiTimeToBeat.carColor}" stroke-width="0.5" opacity="0.9" stroke-dasharray="1 0.5">
                    <animate attributeName="stroke-dashoffset" values="0;6" dur="3s" repeatCount="indefinite" />
                  </line>
                  
                  <!-- Bot Neck -->
                  <rect x="10" y="16" width="4" height="2" fill="rgba(30, 30, 40, 0.9)" stroke="${aiTimeToBeat.carColor}" stroke-width="0.7" />
                  
                  <!-- Bot Body (Racing Theme) -->
                  <path d="M8 18H16L18 22H6L8 18Z" fill="rgba(30, 30, 40, 0.9)" stroke="${aiTimeToBeat.carColor}" stroke-width="1" />
                  
                  <!-- Racing Stripes -->
                  <line x1="9" y1="19" x2="9" y2="22" stroke="${aiTimeToBeat.carColor}" stroke-width="0.7" opacity="0.8" />
                  <line x1="15" y1="19" x2="15" y2="22" stroke="${aiTimeToBeat.carColor}" stroke-width="0.7" opacity="0.8" />
                  
                  <!-- Circuit Board Pattern -->
                  <path d="M6 7L4.5 7" stroke="rgba(255, 255, 255, 0.3)" stroke-width="0.5" />
                  <path d="M6 10L4.5 10" stroke="rgba(255, 255, 255, 0.3)" stroke-width="0.5" />
                  <path d="M18 7L19.5 7" stroke="rgba(255, 255, 255, 0.3)" stroke-width="0.5" />
                  <path d="M18 10L19.5 10" stroke="rgba(255, 255, 255, 0.3)" stroke-width="0.5" />
                  
                  <!-- Digital Effects -->
                  <path d="M7 15.5L8 15.5" stroke="${aiTimeToBeat.carColor}" stroke-width="0.5" opacity="0.7">
                    <animate attributeName="opacity" values="0.7;1;0.7" dur="1s" repeatCount="indefinite" />
                  </path>
                  <path d="M16 15.5L17 15.5" stroke="${aiTimeToBeat.carColor}" stroke-width="0.5" opacity="0.7">
                    <animate attributeName="opacity" values="0.7;1;0.7" dur="1.5s" repeatCount="indefinite" />
                  </path>
                  
                  <!-- Mechanical Joints -->
                  <circle cx="8" cy="18" r="0.5" fill="#ffffff" opacity="0.7" />
                  <circle cx="16" cy="18" r="0.5" fill="#ffffff" opacity="0.7" />
                  
                  <!-- Power Indicator -->
                  <circle cx="12" cy="16" r="0.5" fill="${aiTimeToBeat.carColor}" opacity="0.8">
                    <animate attributeName="opacity" values="0.8;1;0.8" dur="1s" repeatCount="indefinite" />
                  </circle>
                </svg>
              </div>
            </div>
            <div class="ai-rank">AI</div>
            <div class="entry-time ai-time" style="flex: 1; text-align: center;">${aiTimeToBeat.time}</div>
          </div>
        </div>
      `
      : "";

    // Generate user entries HTML or show message if no entries
    const userEntriesHTML =
      rankedUserData.length > 0
        ? rankedUserData
            .map(
              (entry) => `
      <div class="leaderboard-entry">
        <div class="entry-car-container">
          <div class="entry-car" style="background-color: ${entry.carColor}">
            <svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg">
              <path d="M20,35 L30,15 L70,15 L80,35 Z" fill="currentColor" />
              <circle cx="30" cy="40" r="8" fill="#111" />
              <circle cx="70" cy="40" r="8" fill="#111" />
            </svg>
          </div>
        </div>
        <div class="entry-rank">${entry.rank}</div>
        <div class="entry-name">${entry.name}</div>
        <div class="entry-time">${entry.time}</div>
      </div>
    `
            )
            .join("")
        : `<div class="no-times-message">No race times recorded for ${trackLabel} yet. Complete a race to see your time here!</div>`;

    // Update the container with the generated HTML and inject additional styles
    const container = dialog.querySelector("#leaderboard-data-container");
    if (container) {
      container.innerHTML = `
        ${aiTimeHTML}
        <div class="human-times-header">Driver Times - ${trackLabel}</div>
        <div class="leaderboard-content">
          ${userEntriesHTML}
        </div>
      `;
    }

    // Inject additional styles if they don't already exist
    const existingStyle = dialog.querySelector("style");
    if (
      existingStyle &&
      !existingStyle?.textContent?.includes("ai-icon-container")
    ) {
      existingStyle.textContent += additionalStyles;
    }
  }

  // Set up tab click handlers
  document.body.appendChild(backdrop);
  backdrop.appendChild(dialog);

  // Add event listeners to tabs
  const tabs = dialog.querySelectorAll(".track-tab");
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => {
      selectedTrackIndex = index;
      const trackName = tab.getAttribute("data-track");
      if (trackName) {
        chrome.storage.local.set({ selectedTrack: trackName });
      }
      renderLeaderboard(index);
    });
  });

  // Close button functionality
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
}

// Add these functions for leaderboard persistence

// Define the structure of a leaderboard entry
interface LeaderboardEntry {
  name: string;
  time: string;
  track: string;
  timestamp: string;
  carColor: string;
  isAI: boolean; // New field to identify AI vs user times
}

// Function to save race result to leaderboard in local storage
async function saveRaceToLeaderboard(time: string) {
  try {
    // Get the player name, selected track, and AI status from chrome storage
    const result = await chrome.storage.local.get([
      "playerName",
      "selectedTrack",
      "aiDriverEnabled",
    ]);
    const playerName = result.playerName || "Unknown Driver";
    const track = result.selectedTrack;
    const isAI = result.aiDriverEnabled === "yes";

    // If no valid track is selected, don't save the entry
    if (
      !track ||
      !["GD-Track-01", "GD-Track-02", "GD-Track-03"].includes(track)
    ) {
      console.log(
        "No valid track found in storage, discarding leaderboard entry"
      );
      return;
    }

    // Generate a random car color if one doesn't exist for this player
    const getPlayerColor = (name: string) => {
      // Colors that match our red/black F1 theme but provide variety
      const colors = [
        "#ef4444",
        "#dc2626",
        "#b91c1c", // Reds
        "#f97316",
        "#ea580c", // Oranges
        "#a855f7",
        "#9333ea", // Purples
        "#3b82f6",
        "#2563eb", // Blues
        "#14b8a6",
        "#0d9488", // Teals
      ];

      // Use player name to deterministically select a color
      const nameHash = name
        .split("")
        .reduce((acc, char) => acc + char.charCodeAt(0), 0);
      return colors[nameHash % colors.length];
    };

    // Create the entry with isAI flag
    const newEntry: LeaderboardEntry = {
      name: playerName,
      time: time,
      track: track,
      timestamp: new Date().toISOString(),
      carColor: getPlayerColor(playerName),
      isAI: isAI,
    };

    // Create a track-specific key for the leaderboard
    const leaderboardKey = `raceLeaderboard_${track}`;

    // Get existing leaderboard for this specific track
    let leaderboard: LeaderboardEntry[] = [];
    const storedLeaderboard = localStorage.getItem(leaderboardKey);
    if (storedLeaderboard) {
      leaderboard = JSON.parse(storedLeaderboard);
    }

    // Add new entry
    leaderboard.push(newEntry);

    // Sort by time (ascending = faster times first)
    leaderboard.sort((a, b) => {
      // Convert time strings to comparable values
      const timeA = a.time
        .split(":")
        .reduce((acc, val) => acc * 60 + parseFloat(val), 0);
      const timeB = b.time
        .split(":")
        .reduce((acc, val) => acc * 60 + parseFloat(val), 0);
      return timeA - timeB;
    });

    // Keep only top 10 entries per track
    if (leaderboard.length > 10) {
      leaderboard = leaderboard.slice(0, 10);
    }

    // Save back to localStorage with track-specific key
    localStorage.setItem(leaderboardKey, JSON.stringify(leaderboard));
    console.log(`Race saved to leaderboard for ${track}:`, newEntry);
  } catch (error) {
    console.error("Error saving race to leaderboard:", error);
  }
}

// Function to get race time from DOM when race ends
function getRaceTime(): string | null {
  try {
    // First check for time in the time-announcer element
    const timeAnnouncer = document.querySelector(".time-announcer");
    if (timeAnnouncer) {
      const currentTimeElement = timeAnnouncer.querySelector(".current");
      if (currentTimeElement && currentTimeElement.textContent) {
        // Format is "00:17,336" - need to replace comma with period
        const timeText = currentTimeElement.textContent.trim();
        // Replace comma with period for standard format
        const formattedTime = timeText.replace(",", ".");
        console.log("Extracted race time from announcer:", formattedTime);
        return formattedTime;
      }
    }
    return null;
  } catch (error) {
    console.error("Error getting race time:", error);
    return null;
  }
}

// Add a reset player button to the top right corner
function addResetPlayerButton() {
  // Remove existing button if it exists
  const existingButton = document.getElementById("reset-player-button");
  if (existingButton) {
    existingButton.remove();
  }

  const button = document.createElement("button");
  button.id = "reset-player-button";
  button.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
      <path d="M3 3v5h5"></path>
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"></path>
      <path d="M16 21h5v-5"></path>
    </svg>
    Reset Player
  `;

  button.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 9000;
    background: rgba(220, 38, 38, 0.9);
    color: white;
    border: none;
    border-radius: 8px;
    padding: 8px 12px;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    transition: all 0.2s ease;
  `;

  button.addEventListener("mouseover", () => {
    button.style.transform = "translateY(-2px)";
    button.style.boxShadow =
      "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)";
  });

  button.addEventListener("mouseout", () => {
    button.style.transform = "translateY(0)";
    button.style.boxShadow =
      "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)";
  });

  button.addEventListener("click", () => {
    // Show a confirmation dialog
    showResetConfirmation();
  });

  document.body.appendChild(button);
}

// Show a confirmation dialog before resetting player data
function showResetConfirmation() {
  const backdrop = document.createElement("div");
  backdrop.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(8px);
    z-index: 10001;
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
    width: 400px;
    max-width: 90%;
    padding: 24px;
    box-shadow: 0 20px 25px -5px rgba(220, 38, 38, 0.25), 0 8px 10px -6px rgba(0, 0, 0, 0.3);
    animation: slideUp 0.4s ease-out;
    border: 1px solid rgba(220, 38, 38, 0.3);
    text-align: center;
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
    </style>
    <h2 style="margin-top: 0; font-size: 1.5rem; color: white;">Reset Player Data?</h2>
    <p style="margin-bottom: 24px; color: rgba(255,255,255,0.7);">This will clear your name and settings. You'll need to set them again before racing.</p>
    <div style="display: flex; gap: 12px; justify-content: center;">
      <button id="reset-cancel" style="
        background: rgba(255,255,255,0.1);
        border: none;
        padding: 10px 16px;
        border-radius: 6px;
        color: white;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
      ">Cancel</button>
      <button id="reset-confirm" style="
        background: linear-gradient(to right, #dc2626, #b91c1c);
        border: none;
        padding: 10px 16px;
        border-radius: 6px;
        color: white;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
      ">Reset</button>
    </div>
  `;

  // Close the dialog
  const closeDialog = () => {
    backdrop.remove();
  };

  // Setup event listeners
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) {
      closeDialog();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeDialog();
    }
  });

  // Add button click handlers after appending to DOM
  document.body.appendChild(backdrop);
  backdrop.appendChild(dialog);

  const cancelButton = document.getElementById("reset-cancel");
  const confirmButton = document.getElementById("reset-confirm");

  cancelButton?.addEventListener("click", closeDialog);
  confirmButton?.addEventListener("click", () => {
    // Reset player data in Chrome storage
    chrome.storage.local.remove(
      ["playerName", "selectedTrack", "aiDriverEnabled"],
      () => {
        console.log("Player data reset");
        closeDialog();
      }
    );
  });
}

function closeWelcomeDialog() {
  // Find the backdrop element created by showWelcomeDialog
  const backdrop = document.querySelector(
    'div[style*="backdrop-filter: blur(8px)"][style*="z-index: 9999"]'
  );

  // Remove event listener for Escape key if it was added
  document.removeEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      backdrop?.remove();
    }
  });

  // If found, remove it from the DOM
  if (backdrop) {
    backdrop.remove();
    console.log("Welcome dialog closed successfully");
  } else {
    console.log("Welcome dialog not found or already closed");
  }
}
