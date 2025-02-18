(async function () {
    // Load TensorFlow.js if not already loaded
    if (typeof tf === "undefined") {
        await import("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs");
    }

    let model;
    const ACTIONS = ["w", "s", "a", "d"];  // Ensure lowercase (some games require this)

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

        // Define a small CNN model for grayscale 224x224 images
        model = tf.sequential();
        model.add(tf.layers.conv2d({ inputShape: [224, 224, 1], filters: 8, kernelSize: 3, activation: "relu" }));
        model.add(tf.layers.maxPooling2d({ poolSize: 2, strides: 2 }));
        model.add(tf.layers.conv2d({ filters: 16, kernelSize: 3, activation: "relu" }));
        model.add(tf.layers.maxPooling2d({ poolSize: 2, strides: 2 }));
        model.add(tf.layers.flatten());
        model.add(tf.layers.dense({ units: 32, activation: "relu" }));
        model.add(tf.layers.dense({ units: 4, activation: "softmax" })); // 4 outputs for W, S, A, D

        model.compile({ optimizer: "adam", loss: "categoricalCrossentropy", metrics: ["accuracy"] });

        console.log("Model created.");
    }

    // Function to capture and preprocess the canvas image
    async function getProcessedCanvasTensor(canvasId) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) {
            console.error("Canvas not found!");
            return null;
        }

        // Create an offscreen canvas
        const offscreenCanvas = document.createElement("canvas");
        offscreenCanvas.width = 224;
        offscreenCanvas.height = 224;
        const ctx = offscreenCanvas.getContext("2d");

        // Copy and resize the canvas image
        ctx.drawImage(canvas, 0, 0, 224, 224);

        // Convert to grayscale
        const imageData = ctx.getImageData(0, 0, 224, 224);
        const grayData = new Uint8ClampedArray(224 * 224);
        for (let i = 0; i < imageData.data.length; i += 4) {
            const r = imageData.data[i];
            const g = imageData.data[i + 1];
            const b = imageData.data[i + 2];
            grayData[i / 4] = 0.299 * r + 0.587 * g + 0.114 * b; // Convert to grayscale
        }

        // Convert to TensorFlow.js tensor
        let tensor = tf.tensor(grayData, [224, 224, 1]).toFloat().div(tf.scalar(255)); // Normalize
        return tensor.expandDims(0); // Shape: [1, 224, 224, 1]
    }

    // Function to send keypress event (Fixes input issue)
    function sendKeyPress(key) {
        const eventOptions = {
            key: key,
            code: key.toUpperCase(),
            keyCode: key.toUpperCase().charCodeAt(0),
            which: key.toUpperCase().charCodeAt(0),
            bubbles: true
        };

        // Ensure the canvas or game has focus
        const activeElement = document.activeElement || document.body;

        // Dispatch keydown + keyup events for better recognition
        activeElement.dispatchEvent(new KeyboardEvent("keydown", eventOptions));
        setTimeout(() => activeElement.dispatchEvent(new KeyboardEvent("keyup", eventOptions)), 50);
    }

    // Function to predict action and send keypress
    async function predictAndAct(canvasId) {
        if (!model) {
            console.error("Model not initialized!");
            return;
        }

        const tensor = await getProcessedCanvasTensor(canvasId);
        if (!tensor) return;

        const prediction = model.predict(tensor);
        const probabilities = await prediction.data();
        const actionIndex = probabilities.indexOf(Math.max(...probabilities));

        console.log("Predicted Action:", ACTIONS[actionIndex], "Probabilities:", probabilities);

        // Send keypress to the game
        sendKeyPress(ACTIONS[actionIndex]);
    }

    // Train Model (Dummy Training)
    async function trainModel(canvasId) {
        console.log("Training model...");

        for (let i = 0; i < 100; i++) {
            const inputTensor = await getProcessedCanvasTensor(canvasId);
            const target = tf.tensor2d([[1, 0, 0, 0]]);  // Dummy label for "W" action

            await model.fit(inputTensor, target, { epochs: 1 });
        }

        await model.save("localstorage://canvas-game-model");
        console.log("Model trained and saved!");
    }

    // Start AI for Training or Inference
    async function startAI(canvasId, trainMode = false) {
        await createOrLoadModel(trainMode);
        if (trainMode) {
            await trainModel(canvasId);
        } else {
            setInterval(() => predictAndAct(canvasId), 500); // Run inference every 500ms
        }
    }

    // Execute with canvas ID
    startAI("screen", false);  // Change to `true` for training mode
})();
