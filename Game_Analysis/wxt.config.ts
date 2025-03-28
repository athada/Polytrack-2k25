import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  extensionApi: "chrome",
  modules: ["@wxt-dev/module-react"],
  manifest: {
    permissions: ["storage"],
    web_accessible_resources: [
      {
        resources: [
          "Datasets/*",
          "Datasets/GD-Track-01/*",
          "Datasets/GD-Track-02/*",
          "Datasets/GD-Track-03/*",
          "entrypoints/replay.js",
        ],
        matches: ["<all_urls>"],
      },
    ],
  },
});
