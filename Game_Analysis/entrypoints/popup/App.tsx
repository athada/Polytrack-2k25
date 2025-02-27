import React, { useState, useEffect } from "react";
import { AlertCircle, GamepadIcon, KeyRound, Loader2 } from "lucide-react";

// Summary style options
const SUMMARY_STYLES = [
  {
    id: "normal",
    label: "Normal",
    description: "Professional and objective analysis",
    icon: "📊",
  },
  {
    id: "roast",
    label: "Roast",
    description: "Humorous and critical commentary",
    icon: "🔥",
  },
  {
    id: "enthusiastic",
    label: "Enthusiastic",
    description: "High-energy and positive feedback",
    icon: "⚡",
  },
  {
    id: "technical",
    label: "Technical",
    description: "Detailed statistics and analysis",
    icon: "📈",
  },
];

function App() {
  // State management
  const [apiKey, setApiKey] = useState("");
  const [summaryStyle, setSummaryStyle] = useState("normal");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [showTooltip, setShowTooltip] = useState("");
  const [isGameplayAvailable, setIsGameplayAvailable] =
    useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [hasStoredApiKey, setHasStoredApiKey] = useState(false);

  // Add this effect to check gameplay availability when popup opens
  useEffect(() => {
    const checkGameplayStatus = async () => {
      try {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (!tab.id) throw new Error("No active tab found");

        const response = await chrome.tabs.sendMessage(tab.id, {
          type: "CHECK_GAMEPLAY",
        });

        setIsGameplayAvailable(response.available);
        setStatusMessage(response.message);
      } catch (err) {
        setStatusMessage(
          "Unable to check gameplay status. Please refresh the page."
        );
        console.error("Error checking gameplay status:", err);
      }
    };

    checkGameplayStatus();
  }, []);

  // Add this effect to check for stored API key when popup opens
  useEffect(() => {
    const checkApiKey = async () => {
      try {
        const response = await fetch("http://localhost:3001/check-api-key");
        const data = await response.json();
        setHasStoredApiKey(data.hasKey);
      } catch (error) {
        console.error("Error checking API key:", error);
      }
    };

    checkApiKey();
  }, []);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Only check for API key if we don't have one stored
    if (!hasStoredApiKey && !apiKey.trim()) {
      setError("API key is required");
      return;
    }

    if (!isGameplayAvailable) {
      setError("No gameplay recording available. Please play a game first!");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      // Only send API key to backend if we don't have one stored
      if (!hasStoredApiKey) {
        const response = await fetch("http://localhost:3001/set-api-key", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ apiKey }),
        });

        if (!response.ok) {
          throw new Error("Failed to set API key");
        }

        setHasStoredApiKey(true);
        setApiKey(""); // Clear the input
      }

      // Get the current active tab
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab.id) throw new Error("No active tab found");

      // Define style-specific prompts
      const stylePrompts = {
        normal: `Analyze this gameplay video and provide a structured driving performance summary including:
        - Overall Driving Style
        - Steering Patterns and Control
        - Road Positioning and Lane Management
        - Speed Control and Acceleration Patterns
        - Common Mistakes and Risks
        - Specific Areas for Improvement
        - Final Rating (out of 10) with Brief Justification
        Keep the tone professional and objective.`,

        roast: `Watch this gameplay and create a humorous, critical roast of the driving performance. Include:
        - Sarcastic observations about driving style
        - Playful mockery of any obvious mistakes
        - Witty comments about steering and control
        - Creative analogies for their speed management
        - Entertaining criticism of their decision-making
        - A final rating (out of 10) with a comedic explanation
        Make it entertaining but not overly harsh.`,

        enthusiastic: `Provide an energetic and encouraging analysis of this gameplay! Include:
        - Exciting observations about driving style! 🚗
        - Highlight the best moments and techniques! ⭐
        - Positive notes about control and handling!
        - Enthusiastic tips for improvement!
        - Motivating final comments!
        - An upbeat rating (out of 10) with encouragement!
        Keep it high-energy and supportive!`,

        technical: `Perform a detailed technical analysis of the gameplay, including:
        - Quantitative assessment of steering inputs (W,A,S,D frequency)
        - Statistical analysis of speed variations
        - Technical evaluation of turn radius and positioning
        - Precise measurement of reaction times
        - Data-driven improvement recommendations
        - Mathematical rating (out of 10) based on measured metrics
        Focus on concrete data and specific technical details.`,
      };

      // Send message to content script with style-specific prompt
      const responseContent = await chrome.tabs.sendMessage(tab.id, {
        type: "GENERATE_SUMMARY",
        prompt: stylePrompts[summaryStyle as keyof typeof stylePrompts],
      });

      if (responseContent.error) {
        throw new Error(responseContent.error);
      }

      // Close the popup after successful generation
      window.close();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to generate summary. Please try again."
      );
      console.error("Error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-[400px] p-6 bg-gray-900">
      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <GamepadIcon className="w-8 h-8 text-indigo-400" />
        <div>
          <h2 className="text-3xl font-bold text-white">Game Analysis</h2>
          <p className="text-xs text-gray-400">
            Get instant game driving summaries
          </p>
        </div>
      </div>

      {/* Main Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Only show API Key input if no key is stored */}
        {!hasStoredApiKey && (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              API Key
              <div className="relative mt-1">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-md focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 text-white"
                  placeholder="Enter your API key"
                />
              </div>
            </label>
          </div>
        )}

        {/* Show success message when API key is stored */}
        {hasStoredApiKey && (
          <div className="flex items-center gap-2 text-green-400 text-sm">
            <span>✓ API Key is configured</span>
          </div>
        )}

        {/* Style Selector */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Summary Style
          </label>
          <div className="relative">
            <div className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-md">
              {SUMMARY_STYLES.map((style) => (
                <div key={style.id} className="relative">
                  <div
                    className={`flex items-center gap-2 p-2 cursor-pointer rounded-md ${
                      style.id === summaryStyle
                        ? "bg-indigo-900/50 text-indigo-300"
                        : "hover:bg-gray-700/50 text-gray-300"
                    }`}
                    onClick={() => setSummaryStyle(style.id)}
                    onMouseEnter={() => setShowTooltip(style.id)}
                    onMouseLeave={() => setShowTooltip("")}
                  >
                    <span className="text-lg">{style.icon}</span>
                    <span className="flex-1">{style.label}</span>
                    {style.id === summaryStyle && (
                      <span className="text-xs bg-indigo-900 text-indigo-200 px-2 py-1 rounded-full">
                        Selected
                      </span>
                    )}
                  </div>

                  {/* Tooltip */}
                  {showTooltip === style.id && (
                    <div className="absolute z-10 px-3 py-2 text-sm text-white bg-gray-800 rounded-md -top-2 left-1/2 transform -translate-x-1/2 -translate-y-full shadow-lg border border-gray-700 whitespace-nowrap">
                      {style.description}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4" />
            <span>{error}</span>
          </div>
        )}

        {/* Add this status indicator */}
        <div
          className={`mb-4 text-sm ${
            isGameplayAvailable ? "text-green-600" : "text-red-400"
          }`}
        >
          {statusMessage}
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={
            isLoading || !isGameplayAvailable || (!hasStoredApiKey && !apiKey)
          }
          style={{
            backgroundColor:
              isLoading || !isGameplayAvailable || (!hasStoredApiKey && !apiKey)
                ? "#4B5563"
                : "#6366F1",
            color:
              isLoading || !isGameplayAvailable || (!hasStoredApiKey && !apiKey)
                ? "#9CA3AF"
                : "white",
            cursor:
              isLoading || !isGameplayAvailable || (!hasStoredApiKey && !apiKey)
                ? "not-allowed"
                : "pointer",
            opacity:
              isLoading || !isGameplayAvailable || (!hasStoredApiKey && !apiKey)
                ? 0.6
                : 1,
          }}
          className="w-full py-2 px-4 rounded transition-colors hover:bg-indigo-600"
        >
          {isLoading ? "Generating..." : "Generate Summary"}
        </button>
      </form>
    </div>
  );
}

export default App;
