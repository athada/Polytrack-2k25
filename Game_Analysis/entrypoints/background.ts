export default defineBackground(() => {
  console.log("Hello background!", { id: browser.runtime.id });
});
chrome.runtime.onInstalled.addListener(() => {
  chrome.tabs.create({ url: "https://app-polytrack.kodub.com/0.4.2/" });
});
