import * as tf from '@tensorflow/tfjs'



let model;
let gameRewards = [];
let gameStates = [];
let gameActions = [];



// Train the model using collected experience
async function trainModel(epochs) {
    console.log("Training model...");

    if (gameStates.length === 0) return;

    for (let epoch = 0; epoch < epochs; epoch++) {
      const states = tf.concat(gameStates);
      const actions = tf.tensor1d(gameActions, "int32");
      const rewards = computeDiscountedRewards(gameRewards);

      const oneHotActions = tf.oneHot(actions, 4);
      const optimizer = model.optimizer;

      // Compute policy loss (negative log probability * reward)
      const logits = model.apply(stateTensors);
      const logProbs = tf.losses.softmaxCrossEntropy(actionOneHot, logits);
      const loss = tf.sum(tf.mul(logProbs, rewardTensors));

      // Optimize
      const optimizer = tf.train.adam(0.01);
      optimizer.minimize(() => loss);
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
