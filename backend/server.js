// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs").promises;
const path = require("path");

const app = express();
const port = process.env.PORT || 3000;

// Configure multer to store files in memory
const upload = multer({ storage: multer.memoryStorage() });

// Enable CORS so your extension can reach your local backend
app.use(cors());

const API_KEY_FILE = path.join(__dirname, "api-key.json");

// Function to read API key from file
async function getStoredApiKey() {
  try {
    const data = await fs.readFile(API_KEY_FILE, "utf8");
    const { apiKey } = JSON.parse(data);
    return apiKey;
  } catch (error) {
    return null;
  }
}

// Function to store API key to file
async function storeApiKey(apiKey) {
  await fs.writeFile(API_KEY_FILE, JSON.stringify({ apiKey }));
}

// Add endpoints to handle API key
app.get("/check-api-key", async (req, res) => {
  const apiKey = await getStoredApiKey();
  res.json({ hasKey: !!apiKey });
});

app.post("/set-api-key", express.json(), async (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey) {
    return res.status(400).json({ error: "API key is required" });
  }

  await storeApiKey(apiKey);
  res.json({ success: true });
});

// POST endpoint to receive the video file and prompt
app.post("/generate-summary", upload.single("video"), async (req, res) => {
  try {
    const prompt = req.body.prompt;
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }
    if (!req.file) {
      return res.status(400).json({ error: "Video file is required" });
    }

    // Get the video file buffer and its original name
    const videoBuffer = req.file.buffer;
    const videoFilename = req.file.originalname;

    // Get API key from file instead of env
    const geminiApiKey = await getStoredApiKey();
    if (!geminiApiKey) {
      return res
        .status(500)
        .json({ error: "Gemini API key is not configured" });
    }

    // Initialize the Gemini API client
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    // Create the content parts array
    const prompt_parts = [
      { text: prompt },
      {
        inlineData: {
          mimeType: req.file.mimetype,
          data: videoBuffer.toString("base64"),
        },
      },
    ];

    // Call the Gemini API with the correct format
    const result = await model.generateContent(prompt_parts);
    const response = await result.response;
    const summary = response.text();

    console.log("Summary:", summary);
    res.json({ summary });
  } catch (error) {
    console.error("Error generating summary:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.listen(port, () => {
  console.log(`Backend server is running on port ${port}`);
});
