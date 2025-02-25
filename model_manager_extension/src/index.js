import * as tf from "@tensorflow/tfjs";

/**
 * Loads the latest model from IndexedDB by filtering for keys that start with
 * "indexeddb://model_" and sorting by the saved timestamp.
 */
async function loadLatestModel() {
  const models = await tf.io.listModels();
  // Filter for models saved with our naming pattern.
  console.log(models);
  const modelKeys = Object.keys(models).filter((key) =>
    key.startsWith("indexeddb://model_")
  );
  if (modelKeys.length === 0) {
    console.log("No saved models found in IndexedDB.");
    return null;
  }
  // Sort keys by dateSaved (oldest first) and pick the most recent.
  modelKeys.sort((a, b) => models[a].dateSaved - models[b].dateSaved);
  const latestKey = modelKeys[modelKeys.length - 1];
  console.log(`Loading latest model: ${latestKey}`);
  return await tf.loadLayersModel(latestKey);
}

/**
 * Exports the latest model from IndexedDB by triggering a download.
 */
export async function exportLatestModelToDownload() {
  const model = await loadLatestModel();
  if (!model) {
    console.error("No model found to export.");
    return;
  }
  // This triggers a download of "exported-model.json" and "exported-model.weights.bin".
  await model.save("downloads://exported-model");
  console.log("Model export initiated. Check your downloads.");
}

/**
 * Loads a model from locally selected files and saves it to IndexedDB
 * with a unique key (using the current timestamp).
 */
export async function loadLocalModelToIndexedDB(event) {
  const fileList = event.target.files;
  if (fileList.length === 0) {
    console.error("No files selected.");
    return;
  }
  const files = Array.from(fileList);
  try {
    // Load the model from local files using TensorFlow.js browserFiles IO handler.
    const model = await tf.loadLayersModel(tf.io.browserFiles(files));
    console.log("Model loaded from local files.");

    // Generate a unique key for IndexedDB using the current timestamp.
    const timestamp = Date.now();
    const modelKey = `indexeddb://model_${timestamp}`;
    await model.save(modelKey);
    console.log(`Model saved to IndexedDB as ${modelKey}.`);
  } catch (err) {
    console.error("Error loading or saving the model:", err);
  }
}
