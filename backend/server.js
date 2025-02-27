// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
const port = process.env.PORT || 3000;

// Configure multer to store files in memory
const upload = multer({ storage: multer.memoryStorage() });

// Enable CORS so your extension can reach your local backend
app.use(cors());

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

    // Convert the video buffer to a base64 string (if required)
    const videoBase64 = videoBuffer.toString("base64");

    // Retrieve the Gemini API key from your environment variables
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return res
        .status(500)
        .json({ error: "Gemini API key is not configured" });
    }

    // Initialize the Gemini API client
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Call the Gemini API passing in the prompt and the base64 encoded video
    const result = await model.generateContent(prompt, {
      video: videoBase64, // now a base64 string instead of a raw buffer
      filename: videoFilename,
    });

    const summary = result.response.text();
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
