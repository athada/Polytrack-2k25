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
  return await tf.loadLatestModel(latestKey);
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

export async function uploadModel(files) {
  try {
    if (!files || files.length < 2) {
      throw new Error(
        "At least one JSON file and one weights file are required."
      );
    }

    // Find the JSON model file
    const jsonFile = Array.from(files).find(
      (file) => file.name.endsWith(".json") && !file.name.includes("metadata")
    );

    // Find the metadata file
    const metadataFile = Array.from(files).find((file) =>
      file.name.includes("metadata.json")
    );

    // Find all weight shard files (.bin)
    const weightFiles = Array.from(files).filter((file) =>
      file.name.endsWith(".bin")
    );

    if (!jsonFile) {
      throw new Error("Model architecture file (.json) is required");
    }

    if (weightFiles.length === 0) {
      throw new Error("At least one weights file (.bin) is required");
    }

    console.log("Processing model files:", {
      jsonFile: jsonFile.name,
      metadataFile: metadataFile ? metadataFile.name : "None",
      weightFiles: weightFiles.map((f) => f.name),
    });

    // If we have a metadata file, read it first
    let metadata = null;
    if (metadataFile) {
      const metadataContent = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsText(metadataFile);
      });

      metadata = JSON.parse(metadataContent);
      console.log("Model metadata:", metadata);
    }

    // Create a model load options object
    const loadOptions = {};

    // If we have input shape information from metadata, use it
    if (metadata && metadata.inputShape) {
      console.log(`Using input shape from metadata: [${metadata.inputShape}]`);
      loadOptions.inputShape = metadata.inputShape;
    }

    // Use tf.io.browserFiles with all files (json + all weight shards)
    const uploadedModel = await tf.loadLayersModel(
      tf.io.browserFiles([jsonFile, ...weightFiles]),
      loadOptions
    );

    // If model loaded, check the input shape
    console.log(
      "Model loaded successfully, input shape:",
      uploadedModel.inputs[0].shape
    );

    // Save the uploaded model to IndexedDB with a new timestamp
    const timestamp = Date.now();
    const modelKey = `indexeddb://model_${timestamp}`;
    await uploadedModel.save(modelKey);

    // If we have metadata, also store it with the model
    if (metadata) {
      // Save metadata in localStorage with a matching key
      localStorage.setItem(`${modelKey}_metadata`, JSON.stringify(metadata));
      console.log(`Model metadata saved with key ${modelKey}_metadata`);
    }

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
  fileInput.accept = ".json, .bin"; // Accept JSON and bin files
  fileInput.style.display = "none";

  fileInput.addEventListener("change", async (e) => {
    if (e.target.files.length >= 2) {
      // Check if we have at least one JSON file and one bin file
      const hasJsonFile = Array.from(e.target.files).some((file) =>
        file.name.endsWith(".json")
      );

      const hasBinFile = Array.from(e.target.files).some((file) =>
        file.name.endsWith(".bin")
      );

      if (hasJsonFile && hasBinFile) {
        const modelKey = await uploadModel(e.target.files);
        if (modelKey && typeof onUploadComplete === "function") {
          onUploadComplete(modelKey);
        }
      } else {
        console.error(
          "Please select at least one .json file and one or more .bin weight files"
        );
      }
    } else {
      console.error(
        "Please select at least 2 files: model.json, metadata.json (optional), and at least one weights file (.bin)"
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
