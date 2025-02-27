function createCanvasRecorder(
  sourceCanvasId: string,
  targetWidth = 1920,
  targetHeight = 1080,
  fps = 25,
  options: MediaRecorderOptions = { mimeType: "video/webm; codecs=vp9" }
) {
  // Find the source canvas in the DOM
  const sourceCanvas = document.getElementById(
    sourceCanvasId
  ) as HTMLCanvasElement | null;
  if (!sourceCanvas) {
    console.error(`Canvas element with id '${sourceCanvasId}' not found!`);
    return null;
  }

  // Create an offscreen canvas to scale/resize the original canvas if needed
  const offscreenCanvas = document.createElement("canvas");
  offscreenCanvas.width = targetWidth;
  offscreenCanvas.height = targetHeight;
  const offscreenCtx = offscreenCanvas.getContext("2d");

  if (!offscreenCtx) {
    console.error("Failed to get 2D context from offscreen canvas.");
    return null;
  }

  // Continuously copy from the source canvas to the offscreen canvas
  function updateOffscreen() {
    const ctx = offscreenCtx!; // Type assertion since we checked earlier
    ctx.clearRect(0, 0, targetWidth, targetHeight);
    ctx.drawImage(sourceCanvas!, 0, 0, targetWidth, targetHeight);
    requestAnimationFrame(updateOffscreen);
  }
  updateOffscreen();

  // Capture the stream from the offscreen canvas
  const canvasStream = offscreenCanvas.captureStream(fps);
  let recordedChunks: BlobPart[] = [];
  let mediaRecorder: MediaRecorder;

  try {
    mediaRecorder = new MediaRecorder(canvasStream, options);
  } catch (e) {
    console.error("MediaRecorder initialization failed:", e);
    return null;
  }

  // Collect video data in chunks
  mediaRecorder.ondataavailable = (event: BlobEvent) => {
    if (event.data && event.data.size > 0) {
      recordedChunks.push(event.data);
    }
  };

  // When recording stops, we create a Blob and handle download + (optionally) sending to LLM
  mediaRecorder.onstop = async () => {
    const blob = new Blob(recordedChunks, { type: "video/webm" });
    recordedChunks = [];

    // 1) Download the file
    const url = URL.createObjectURL(blob);
    downloadRecording(url);
    // Revoke the blob URL after the download has been triggered
    URL.revokeObjectURL(url);

    console.log("Recording saved as gameplay.webm");

    // 2) (Optional) Send to LLM endpoint if you like
    //    Remove or comment out if you don't need it
    const prompt =
      "Analyze the attached gameplay video and provide a concise, engaging summary that highlights key moments, strategy, and performance.";
    await sendToLLMEndpoint(prompt, blob);
  };

  // Helper function for downloading the recorded file
  function downloadRecording(fileUrl: string) {
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = fileUrl;
    a.download = "gameplay.webm";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // Example of sending the video to an LLM endpoint
  // async function sendToLLMEndpoint(videoBlob: Blob) {
  //   // Get user’s API key from chrome.storage
  //   chrome.storage.sync.get("apiKey", async ({ apiKey }) => {
  //     if (!apiKey) {
  //       console.warn(
  //         "No API key found. Please set it in the extension’s options/popup."
  //       );
  //       return;
  //     }

  //     // Prepare request data
  //     const formData = new FormData();
  //     formData.append("video", videoBlob, "gameplay.webm");

  //     try {
  //       const response = await fetch(
  //         "https://your-llm-endpoint.com/generate-summary",
  //         {
  //           method: "POST",
  //           headers: {
  //             Authorization: `Bearer ${apiKey}`,
  //           },
  //           body: formData,
  //         }
  //       );

  //       if (!response.ok) {
  //         throw new Error(`LLM endpoint returned status ${response.status}`);
  //       }

  //       const data = await response.json();
  //       console.log("Summary received from LLM:", data.summary);

  //       // You could display this summary on the page or send it back to your popup
  //     } catch (error) {
  //       console.error("Error sending video to LLM:", error);
  //     }
  //   });
  // }

  async function sendToLLMEndpoint(
    prompt: string,
    videoBlob: Blob
  ): Promise<void> {
    const formData = new FormData();
    formData.append("prompt", prompt);
    formData.append("video", videoBlob, "gameplay.webm");

    try {
      // For development, we're using the localhost endpoint.
      const response = await fetch("http://localhost:3001/generate-summary", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        throw new Error(`Backend responded with status ${response.status}`);
      }
      const data = await response.json();
      console.log("Summary received from backend:", data.summary);
      // Optionally, update your UI with the summary here.
    } catch (error) {
      console.error("Error sending video/prompt to backend:", error);
    }
  }

  // Return an object with start/stop methods
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

// 2) Example function to get the speed from .speedometer
function getSpeed(): string | null {
  const divElement = document.querySelector(".speedometer");
  if (divElement) {
    const spans = divElement.querySelectorAll("span");
    const speed = spans[0]?.textContent;
    return speed === "0" ? null : speed;
  }
  return null;
}

// 3) Main logic to monitor game state and control the recorder
function initializeRecorder() {
  // Create a canvas recorder for the #screen canvas
  const canvasRecorder = createCanvasRecorder("screen", 600, 600);
  if (!canvasRecorder) return;

  let recordingState: "idle" | "recording" | "ended" = "idle";

  function checkDomForRecording() {
    const speed = getSpeed();

    // If we ended previously and speed is null, reset to idle
    if (recordingState === "ended" && speed === null) {
      recordingState = "idle";
      console.log("Game reset; ready to start a new session.");
    }

    // If we're idle and speed is not null => start recording
    if (recordingState === "idle" && speed !== null && canvasRecorder) {
      canvasRecorder.startRecording();
      recordingState = "recording";
    }

    // If we're recording and .time-announcer appears => stop recording
    if (
      recordingState === "recording" &&
      document.querySelector(".time-announcer")
    ) {
      if (canvasRecorder) {
        canvasRecorder.stopRecording();
        recordingState = "ended";
      }
    }
  }

  // Initial check
  checkDomForRecording();

  // Use a MutationObserver to watch for changes in the DOM
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
