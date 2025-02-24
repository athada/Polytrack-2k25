import * as tf from "@tensorflow/tfjs";

export const FRAME_SEQ_LEN = 8;

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

  // Define a small CNN model for sequence of grayscale 224x224 images
  model = tf.sequential();
  model.add(
    tf.layers.conv2d({
      inputShape: [224, 224, FRAME_SEQ_LEN],
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
  modelKeys.sort(
    (a, b) =>
      models[a].modelArtifactsInfo.dateSaved -
      models[b].modelArtifactsInfo.dateSaved
  );

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
  modelKeys.sort(
    (a, b) =>
      models[a].modelArtifactsInfo.dateSaved -
      models[b].modelArtifactsInfo.dateSaved
  );

  // Get the latest model key (the one with the most recent timestamp)
  const latestKey = modelKeys[modelKeys.length - 1];
  console.log(`Loading latest model: ${latestKey}`);

  // Load and return the latest model
  return await tf.loadLatestModel(latestKey);
}
