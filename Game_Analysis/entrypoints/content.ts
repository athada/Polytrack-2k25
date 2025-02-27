let lastRecordedBlob: Blob | null = null;

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
  const dialog = document.createElement("dialog");
  dialog.style.cssText = `
    padding: 0;
    border: none;
    border-radius: 12px;
    max-width: 800px;
    background: white;
    color: #1a1a1a;
    box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
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
      .summary-container {
        padding: 20px;
        color: #1a1a1a;
      }
      .summary-header {
        margin-bottom: 16px;
        padding-bottom: 12px;
        border-bottom: 2px solid rgba(0,0,0,0.1);
      }
      .summary-header h2 {
        font-size: 2rem;
        font-weight: 700;
        color: #1e40af;
        letter-spacing: -0.025em;
        margin: 0;
      }
      .rating-container {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 20px;
        padding: 16px;
        background: #f8fafc;
        border-radius: 8px;
        border: 1px solid #e2e8f0;
      }
      .rating-label {
        font-size: 1.25rem;
        font-weight: 600;
        color: #475569;
      }
      .rating-score {
        font-size: 1.75rem;
        font-weight: bold;
        color: ${rating ? getRatingColor(rating) : "#475569"};
      }
      .summary-subheading {
        color: #334155;
        font-size: 1.6rem;
        font-weight: 700;
        margin: 20px 0 12px 0;
        padding-bottom: 6px;
        border-bottom: 2px solid #e2e8f0;
        letter-spacing: -0.025em;
      }
      .summary-section {
        color: #1e40af;
        font-size: 1.4rem;
        font-weight: 700;
        margin: 16px 0 12px 0;
        padding-bottom: 6px;
        border-bottom: 1px solid #e2e8f0;
      }
      .summary-item {
        margin: 8px 0;
        padding-left: 20px;
        position: relative;
        color: #1a1a1a;
        font-size: 1.1rem;
        line-height: 1.5;
      }
      .summary-item:before {
        content: "•";
        position: absolute;
        left: 0;
        color: #2563eb;
        font-size: 1.2rem;
      }
      .summary-text {
        margin: 8px 0;
        line-height: 1.5;
        color: #1a1a1a;
        font-size: 1.1rem;
      }
      .close-button {
        margin-top: 20px;
        padding: 8px 16px;
        background: #2563eb;
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 500;
        font-size: 1.1rem;
        transition: background-color 0.2s;
      }
      .close-button:hover {
        background: #1d4ed8;
      }
    </style>
    <div class="summary-container">
      <div class="summary-header">
        <h2>Game Analysis Summary</h2>
      </div>
      ${
        rating
          ? `
        <div class="rating-container">
          <span class="rating-label">Final Rating</span>
          <span class="rating-score">${rating.toFixed(1)}/10</span>
        </div>
      `
          : ""
      }
      <div class="summary-content">
        ${formattedSummary}
      </div>
      <button class="close-button">Close</button>
    </div>
  `;

  const closeDialog = () => {
    dialog.close();
    dialog.remove();
  };

  const closeButton = dialog.querySelector(".close-button");
  closeButton?.addEventListener("click", closeDialog);

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      closeDialog();
    }
  });

  document.body.appendChild(dialog);
  dialog.showModal();
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GENERATE_SUMMARY") {
    const gameplayStatus = checkGameplayAvailability();

    if (!gameplayStatus.available) {
      showErrorDialog(gameplayStatus.message);
      sendResponse({ error: gameplayStatus.message });
      return;
    }

    sendToLLMEndpoint(message.prompt, lastRecordedBlob!)
      .then((summary) => {
        showSummaryDialog(summary);
        sendResponse({ success: true });
      })
      .catch((error) => {
        const errorMessage = "Failed to generate summary. Please try again.";
        console.error("Error generating summary:", error);
        showErrorDialog(errorMessage);
        sendResponse({ error: errorMessage });
      });

    return true;
  }

  if (message.type === "CHECK_GAMEPLAY") {
    const status = checkGameplayAvailability();
    sendResponse(status);
    return true;
  }
});

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
    const url = URL.createObjectURL(blob);
    downloadRecording(url);
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

function initializeRecorder() {
  const canvasRecorder = createCanvasRecorder("screen", 600, 600);
  if (!canvasRecorder) return;

  let recordingState: "idle" | "recording" | "ended" = "idle";

  function checkDomForRecording() {
    const speed = getSpeed();
    const timeAnnouncer = document.querySelector(".time-announcer");

    // First check for game end condition
    if (recordingState === "recording" && timeAnnouncer) {
      if (canvasRecorder) {
        canvasRecorder.stopRecording();
        recordingState = "ended";
      }
      return;
    }

    // Then check for reset condition
    if (recordingState === "ended" && speed === null && !timeAnnouncer) {
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
