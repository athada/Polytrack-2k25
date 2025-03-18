import * as tf from "@tensorflow/tfjs";
import { CANVAS_SIZE } from "./game";
import { N_FRAMES } from "./game";

// Function to create or load a model
export async function createOrLoadModel(trainMode = false) {
  if (!trainMode) {
    try {
      const loadedModel = await loadLatestModel();
      if (!loadedModel) {
        throw new Error("No saved models found");
      }
      model = loadedModel;
      console.log("Loaded existing model.");
      return;
    } catch (error) {
      console.warn("No saved model found, creating a new one:", error.message);
    }
  }

  // Define a small CNN model for sequence of grayscale CANVAS_SIZExCANVAS_SIZE images
  model = tf.sequential();
  model.add(
    tf.layers.conv2d({
      inputShape: [CANVAS_SIZE, CANVAS_SIZE, N_FRAMES],
      filters: 8,
      kernelSize: 3,
      activation: "relu",
    })
  );
  model.add(tf.layers.maxPooling2d({ poolSize: 2, strides: 2 }));
  model.add(
    tf.layers.conv2d({ filters: 16, kernelSize: 3, activation: "relu" })
  );
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

// Cleans up old saved models, keeping only the last 5 saved sessions.
export async function cleanupModels() {
  // List all models saved in IndexedDB
  const models = await tf.io.listModels();
  // Filter keys to include only those matching our custom model key pattern
  const modelKeys = Object.keys(models).filter((key) =>
    key.startsWith("indexeddb://model_")
  );

  // Sort keys by their saved timestamp (oldest first)
  modelKeys.sort((a, b) => models[a].dateSaved - models[b].dateSaved);

  // Remove the oldest models if more than 5 exist
  while (modelKeys.length > 5) {
    const keyToRemove = modelKeys.shift();
    await tf.io.removeModel(keyToRemove);
    console.log(`Removed old model: ${keyToRemove}`);
  }
}

// Saves the model with a unique key and then cleans up old models.
export async function saveModelWithCleanup(model) {
  // Generate a unique key using the current timestamp
  const timestamp = Date.now();
  const modelKey = `indexeddb://model_${timestamp}`;

  // Save the model to IndexedDB using the unique key
  await model.save(modelKey);
  console.log(`Model saved as ${modelKey}`);

  // Cleanup old models, keeping only the most recent 5
  await cleanupModels();

  return modelKey;
}

export async function loadLatestModel() {
  // Get all saved models from IndexedDB
  const models = await tf.io.listModels();

  // Filter keys matching our custom model pattern
  const modelKeys = Object.keys(models).filter((key) =>
    key.startsWith("indexeddb://model_")
  );

  if (modelKeys.length === 0) {
    console.log("No saved models found in IndexedDB.");
    return null;
  }

  // Sort the model keys by the dateSaved (oldest first)
  modelKeys.sort((a, b) => models[a].dateSaved - models[b].dateSaved);

  // Get the latest model key (the one with the most recent timestamp)
  const latestKey = modelKeys[modelKeys.length - 1];
  console.log(`Loading latest model: ${latestKey}`);

  // Load and return the latest model
  return await tf.loadLayersModel(latestKey);
}

export async function downloadModel(modelKey) {
  try {
    // If no specific key provided, get the latest model
    if (!modelKey) {
      const models = await tf.io.listModels();
      const modelKeys = Object.keys(models).filter((key) =>
        key.startsWith("indexeddb://model_")
      );

      if (modelKeys.length === 0) {
        throw new Error("No models found in IndexedDB");
      }

      // Sort by date saved and get the latest
      modelKeys.sort((a, b) => models[a].dateSaved - models[b].dateSaved);

      modelKey = modelKeys[modelKeys.length - 1];
    }

    // Load the model from IndexedDB
    const model = await tf.loadLayersModel(modelKey);

    // Create a download filename based on the timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const downloadPath = `downloads://reinforcement-model-${timestamp}`;

    // Save to downloads (triggers browser download)
    await model.save(downloadPath);
    console.log(`Model downloaded from ${modelKey}`);
    return true;
  } catch (error) {
    console.error("Error downloading model:", error);
    return false;
  }
}

export async function uploadModel(jsonFile, weightsFile) {
  try {
    if (!jsonFile || !weightsFile) {
      throw new Error("Both JSON and weights files are required.");
    }

    // Verify file types
    if (!jsonFile.name.endsWith(".json")) {
      throw new Error("First file must be a JSON file (.json)");
    }

    if (
      !weightsFile.name.includes(".weights.bin") &&
      !weightsFile.name.endsWith(".bin")
    ) {
      throw new Error(
        "Second file must be a weights file (.bin or .weights.bin)"
      );
    }

    console.log("Processing model files:", {
      jsonFile: jsonFile.name,
      weightsFile: weightsFile.name,
    });

    // Use tf.io.browserFiles with the two specific files
    const uploadedModel = await tf.loadLayersModel(
      tf.io.browserFiles([jsonFile, weightsFile])
    );

    // Save the uploaded model to IndexedDB with a new timestamp
    const timestamp = Date.now();
    const modelKey = `indexeddb://model_${timestamp}`;
    await uploadedModel.save(modelKey);

    console.log(`Model uploaded and saved as ${modelKey}`);

    // Cleanup old models
    await cleanupModels();

    return modelKey;
  } catch (error) {
    console.error("Error uploading model:", error);
    return null;
  }
}

export function createModelFileInput(onUploadComplete) {
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.multiple = true;
  fileInput.accept = ".json, .bin"; // Model files are usually JSON + binary weights
  fileInput.style.display = "none";

  fileInput.addEventListener("change", async (e) => {
    if (e.target.files.length >= 2) {
      // Find the JSON file and weights file
      const jsonFile = Array.from(e.target.files).find((file) =>
        file.name.endsWith(".json")
      );
      const weightsFile = Array.from(e.target.files).find(
        (file) =>
          file.name.includes(".weights.bin") || file.name.endsWith(".bin")
      );

      if (jsonFile && weightsFile) {
        const modelKey = await uploadModel(jsonFile, weightsFile);
        if (modelKey && typeof onUploadComplete === "function") {
          onUploadComplete(modelKey);
        }
      } else {
        console.error("Please select both a .json and a .weights.bin file");
      }
    } else {
      console.error(
        "Please select at least 2 files: model.json and weights.bin"
      );
    }
  });

  document.body.appendChild(fileInput);
  return fileInput;
}

// To use the uploadModel function, you can use the following code:

/*

const fileInput = createModelFileInput((modelKey) => {
  console.log(`Model uploaded successfully as ${modelKey}`);
  // Optionally reload the model
});
fileInput.click();

*/

//To use a custom input, you can use the following code:

/*

const jsonFileInput = document.getElementById('json-file-input');
const weightsFileInput = document.getElementById('weights-file-input');

uploadModel(jsonFileInput.files[0], weightsFileInput.files[0])
  .then(modelKey => {
    if (modelKey) {
      console.log("Model uploaded successfully!");
    } else {
      console.log("Model upload failed.");
    }
  });

  */
