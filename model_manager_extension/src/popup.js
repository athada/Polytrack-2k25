// Get references to the buttons and file input element.
import {
  exportLatestModelToDownload,
  loadLocalModelToIndexedDB,
} from "./index.js";
const downloadModelBtn = document.getElementById("downloadModelBtn");
const loadModelBtn = document.getElementById("loadModelBtn");
const modelFileInput = document.getElementById("modelFileInput");

// Bind event listeners.
downloadModelBtn.addEventListener("click", exportLatestModelToDownload);
loadModelBtn.addEventListener("click", () => {
  // Open the file selector when "Load Model from Files" is clicked.
  console.log("Opening file selector...");
  modelFileInput.click();
});
modelFileInput.addEventListener("change", loadLocalModelToIndexedDB);
