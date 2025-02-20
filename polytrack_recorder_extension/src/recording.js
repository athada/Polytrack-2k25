(() => {
  function createCanvasRecorder(
    sourceCanvasId,
    targetWidth = 1920,
    targetHeight = 1080,
    fps = 25,
    options = { mimeType: "video/webm; codecs=vp9" }
  ) {
    const sourceCanvas = document.getElementById(sourceCanvasId);
    if (!sourceCanvas) {
      console.error(`Canvas element with id '${sourceCanvasId}' not found!`);
      return null;
    }

    // Create an offscreen canvas with the desired resolution.
    const offscreenCanvas = document.createElement("canvas");
    offscreenCanvas.width = targetWidth;
    offscreenCanvas.height = targetHeight;
    const offscreenCtx = offscreenCanvas.getContext("2d");

    // Continuously copy the source canvas to the offscreen canvas, scaling it.
    function updateOffscreen() {
      offscreenCtx.clearRect(0, 0, targetWidth, targetHeight);
      // Draw the source canvas onto the offscreen canvas scaled to target dimensions.
      offscreenCtx.drawImage(sourceCanvas, 0, 0, targetWidth, targetHeight);
      requestAnimationFrame(updateOffscreen);
    }
    updateOffscreen();

    // Capture the stream from the offscreen canvas.
    const canvasStream = offscreenCanvas.captureStream(fps);
    let recordedChunks = [];
    let mediaRecorder;

    try {
      mediaRecorder = new MediaRecorder(canvasStream, options);
    } catch (e) {
      console.error("MediaRecorder initialization failed:", e);
      return null;
    }

    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      downloadRecording(url);
      URL.revokeObjectURL(url);
      recordedChunks = [];
      console.log("Recording saved as gameplay.webm");
    };

    function downloadRecording(url) {
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = "gameplay.webm";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }

    return {
      startRecording: () => {
        if (!mediaRecorder) {
          console.error("MediaRecorder is not initialized.");
          return;
        }
        recordedChunks = []; // Clear previous recordings.
        mediaRecorder.start();
        console.log("Recording started");
      },
      stopRecording: () => {
        if (mediaRecorder && mediaRecorder.state === "recording") {
          mediaRecorder.stop();
          console.log("Recording stopped");
        } else {
          console.warn("MediaRecorder is not recording");
        }
      },
      // Expose the mediaRecorder for checking its state.
      mediaRecorder: mediaRecorder,
    };
  }

  const getSpeed = () => {
    const divElement = document.querySelector(".speedometer");
    if (divElement) {
      const spans = divElement.querySelectorAll("span");
      const speed = spans[0].innerText;
      return speed == 0 ? null : speed;
    }
    console.log(".speedometer not found");
    return null;
  };

  // Create a canvas recorder for the canvas with id "screen" and desired resolution (1920×1080).
  const canvasRecorder = createCanvasRecorder("screen", 200, 200);
  if (!canvasRecorder) return;

  let recordingState = "idle";

  function checkDomForRecording() {
    const speed = getSpeed();

    // Reset state if the game has ended and speed is null.
    if (recordingState === "ended" && speed === null) {
      console.log("Game reset; ready to start a new session.");
      recordingState = "idle";
    }

    // Start a new recording session if the car is moving and we're idle.
    if (recordingState === "idle" && speed !== null) {
      canvasRecorder.startRecording();
      recordingState = "recording";
    }

    // Stop recording if the game-end indicator appears.
    if (
      recordingState === "recording" &&
      document.querySelector(".time-announcer")
    ) {
      canvasRecorder.stopRecording();
      recordingState = "ended";
    }
  }

  // Perform an initial check on startup.
  checkDomForRecording();

  // Set up a MutationObserver to monitor the DOM for changes.
  const observer = new MutationObserver(() => {
    checkDomForRecording();
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
