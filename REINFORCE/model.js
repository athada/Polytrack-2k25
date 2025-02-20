import * as tf from '@tensorflow/tfjs'


const FRAME_SEQ_LEN = 8;



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

  // Define a small CNN model for sequence of grayscale 224x224 images
  model = tf.sequential();
  model.add(tf.layers.conv2d({inputShape: [224, 224, FRAME_SEQ_LEN], filters: 8, kernelSize: 3, activation: "relu"}));
  model.add(tf.layers.maxPooling2d({ poolSize: 2, strides: 2 }));
  model.add(tf.layers.conv2d({ filters: 16, kernelSize: 3, activation: "relu" }));
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
