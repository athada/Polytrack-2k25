import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  extensionApi: "chrome",
  modules: ["@wxt-dev/module-react"],
  manifest: {
    permissions: ["storage"],
    web_accessible_resources: [
      {
        resources: ["Datasets/**/*.json"],
        matches: ["<all_urls>"],
      },
    ],
  },
});
