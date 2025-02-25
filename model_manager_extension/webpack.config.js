const path = require("path");

module.exports = {
  mode: "development", // or 'production' for production builds
  entry: {
    popup: "./src/popup.js", // Entry point for your popup
    content: "./src/index.js", // Entry point for your content script
  },
  output: {
    filename: "[name].bundle.js", // This will create popup.bundle.js and content.bundle.js in dist/
    path: path.resolve(__dirname, "dist"),
  },
  target: "web", // ensures the bundle is browser-compatible
  devtool: "source-map", // Optional for easier debugging
};
