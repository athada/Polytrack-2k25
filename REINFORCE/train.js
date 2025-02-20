import * as tf from "@tensorflow/tfjs";

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
    const states = tf.concat(gameStates);
    const actions = tf.tensor1d(gameActions, "int32");
    const rewards = computeDiscountedRewards(gameRewards);

    // Compute policy loss (negative log probability * reward)
    const actionOneHot = tf.oneHot(actions, 4);
    const logits = model.apply(states);
    const logProbs = tf.losses.softmaxCrossEntropy(actionOneHot, logits);
    const loss = tf.sum(tf.mul(logProbs, rewards));

    // Optimize
    model.optimizer.minimize(() => loss);
    console.log(`Epoch ${epoch + 1}/${epochs} - Loss: ${loss.dataSync()}`);
  }

  // Save model
  await model.save("localstorage://policy-gradient-game-model");
  console.log("Model trained and saved!");

  // Clear experience
  gameStates = [];
  gameActions = [];
  gameRewards = [];
}
