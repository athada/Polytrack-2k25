//import * as tf from "@tensorflow/tfjs";
//import { saveModelWithCleanup } from "./model";

let model;
let gameRewards = [];
let gameStates = [];
let gameActions = [];

// Compute discounted rewards
function computeDiscountedRewards(rewards, gamma = 0.99) {
  let discountedRewards = [];
  let cumulativeReward = 0;
  for (let i = rewards.length - 1; i >= 0; i--) {
    cumulativeReward = rewards[i] + gamma * cumulativeReward;
    discountedRewards.unshift(cumulativeReward);
  }
  return tf.tensor2d(discountedRewards, [discountedRewards.length, 1]);
}

// Train the model using collected experience
export async function trainModel(epochs) {
  console.log("Training model...");

  if (gameStates.length === 0) return;

  for (let epoch = 0; epoch < epochs; epoch++) {
    const loss = tf.tidy(() => {
      const states = tf.concat(gameStates);
      const actions = tf.tensor1d(gameActions, "int32");
      const rewards = computeDiscountedRewards(gameRewards);

      // Use tape to track gradients
      const actionOneHot = tf.oneHot(actions, 4);
      const logits = model.predict(states);
      const logProbs = tf.losses.softmaxCrossEntropy(actionOneHot, logits);
      return tf.sum(tf.mul(logProbs, rewards));
    });

    // Optimize using the gradient tape
    await model.optimizer.minimize(() => loss, true);
    console.log(`Epoch ${epoch + 1}/${epochs} - Loss: ${loss.dataSync()}`);
    loss.dispose();
  }

  await saveModelWithCleanup(model);
  console.log("Model trained and saved!");

  // Clear experience
  gameStates.forEach(tensor => tensor.dispose());
  gameStates = [];
  gameActions = [];
  gameRewards = [];
}
