import React, { useState, useEffect } from "react";
import { AlertCircle, GamepadIcon, KeyRound, Loader2 } from "lucide-react";

// Summary style options
const SUMMARY_STYLES = [
  {
    id: "short",
    label: "Short",
    description: "Brief and concise analysis of driving performance",
    icon: "⚡",
  },
  {
    id: "extended",
    label: "Extended",
    description: "Detailed and comprehensive feedback",
    icon: "📊",
  },
  {
    id: "humor",
    label: "Humor",
    description: "Fun and entertaining commentary",
    icon: "😄",
  },
];

function App() {
  // State management
  const [apiKey, setApiKey] = useState("");
  const [summaryStyle, setSummaryStyle] = useState(() => {
    const savedStyle = localStorage.getItem("game-analysis-summary-style");
    return savedStyle || "short";
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [showTooltip, setShowTooltip] = useState("");
  const [isGameplayAvailable, setIsGameplayAvailable] =
    useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [hasStoredApiKey, setHasStoredApiKey] = useState(false);
  const [userName, setUserName] = useState("");
  const [submittedName, setSubmittedName] = useState("");
  const [isAIDriverSet, setIsAIDriverSet] = useState<boolean>(false);
  const [selectedTrack, setSelectedTrack] = useState<string>(() => {
    const savedTrack = localStorage.getItem("game-analysis-track");
    return savedTrack || "GD-Track-01";
  });

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

  // Add this effect to load name from localStorage when popup opens
  useEffect(() => {
    const storedName = localStorage.getItem("game-analysis-username");
    if (storedName) {
      setSubmittedName(storedName);
    }
  }, []);

  // Add effects to save state changes to localStorage
  useEffect(() => {
    localStorage.setItem("game-analysis-summary-style", summaryStyle);
  }, [summaryStyle]);

  useEffect(() => {
    localStorage.setItem("game-analysis-track", selectedTrack);
  }, [selectedTrack]);

  // Add new handler for API key setup
  const handleApiKeySetup = async () => {
    if (!apiKey.trim()) {
      setError("API key is required");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
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
      setError(""); // Clear any existing errors
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to set API key. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Update handler to save name to localStorage
  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (userName.trim()) {
      const name = userName.trim();
      setSubmittedName(name);
      localStorage.setItem("game-analysis-username", name);
      setUserName(""); // Clear input after submission
    }
  };

  // Update handleSubmit to remove API key setup logic
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isGameplayAvailable) {
      setError("No gameplay recording available. Please play a game first!");
      return;
    }

    if (!hasStoredApiKey) {
      setError("Please set up your API key first");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      // Get the current active tab
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab.id) throw new Error("No active tab found");

      // Define style-specific prompts
      const stylePrompts = {
        short: `Provide an extremely brief analysis in 2-3 bullet points:
        - Overall driving assessment
        - Key improvement tip
        - Rating (1-10)
        Be very concise.`,

        extended: `Keep this concise but include:
        - Quick driving style assessment
        - Top 2 strengths
        - Top 2 areas for improvement
        - One technical tip
        - Rating (1-10)
        Keep it short and focused.`,

        humor: `Create a brief, funny analysis:
        - One witty observation
        - One humorous tip
        - A comedic rating (1-10)
        Keep it short and entertaining.`,
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
    } finally {
      setIsLoading(false);
    }
  };

  const handleJSONSubmit = async () => {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab.id) throw new Error("No active tab found");

      chrome.tabs.sendMessage(tab.id, {
        type: "RUN_AI_DRIVER",
        isAIDriverSet: isAIDriverSet,
        track: selectedTrack,
      });
      window.close();
    } catch (err) {
      console.error("Error fetching JSON data:", err);
    }
  };

  return (
    <div className="w-[400px] p-6 bg-gray-900">
      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <GamepadIcon className="w-8 h-8 text-indigo-400" />
        <div>
          <h2 className="text-3xl font-bold text-white">Summaracer</h2>
          <p className="text-xs text-gray-400">
            AI-driven racing and smart summaries.
          </p>
        </div>
      </div>

      {/* Name Input Section */}
      {!submittedName ? (
        <form onSubmit={handleNameSubmit} className="mb-6">
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Your Name
            <div className="flex gap-2 mt-1">
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-md focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 text-white"
                placeholder="Enter your name"
              />
              <button
                type="submit"
                disabled={!userName.trim()}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
              >
                Set Name
              </button>
            </div>
          </label>
        </form>
      ) : (
        <div className="flex items-center justify-between mb-6 p-3 bg-gray-800 rounded-md border border-gray-700">
          <div className="flex items-center gap-2 text-lg">
            <span className="text-gray-400">Welcome,</span>
            <span className="text-indigo-400 font-semibold">
              {submittedName}
            </span>
          </div>
          <button
            onClick={() => {
              setSubmittedName("");
              localStorage.removeItem("game-analysis-username");
            }}
            className="text-xs text-gray-400 hover:text-white"
          >
            Change
          </button>
        </div>
      )}

      {/* AI Driver Enabled? - Smaller Beautified Version */}
      {submittedName && (
        <div className="mb-4 bg-gray-800 border border-gray-700 rounded-md overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-700">
            <label className="text-xs font-medium text-gray-300">
              AI Driver Enabled?
            </label>
          </div>
          <div className="p-3">
            <div className="grid grid-cols-2 gap-2">
              <label
                className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md cursor-pointer border transition-all ${
                  isAIDriverSet
                    ? "bg-indigo-900/40 border-indigo-500"
                    : "bg-gray-700/30 border-gray-600 hover:bg-gray-700/50"
                }`}
              >
                <input
                  type="radio"
                  name="aiDriver"
                  checked={isAIDriverSet}
                  onChange={() => setIsAIDriverSet(true)}
                  className="sr-only" // Hide default radio but keep functionality
                />
                <div
                  className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                    isAIDriverSet ? "border-indigo-400" : "border-gray-500"
                  }`}
                >
                  {isAIDriverSet && (
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400"></div>
                  )}
                </div>
                <span
                  className={`font-medium text-sm ${
                    isAIDriverSet ? "text-indigo-300" : "text-gray-300"
                  }`}
                >
                  Yes
                </span>
              </label>

              <label
                className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md cursor-pointer border transition-all ${
                  !isAIDriverSet
                    ? "bg-indigo-900/40 border-indigo-500"
                    : "bg-gray-700/30 border-gray-600 hover:bg-gray-700/50"
                }`}
              >
                <input
                  type="radio"
                  name="aiDriver"
                  checked={!isAIDriverSet}
                  onChange={() => setIsAIDriverSet(false)}
                  className="sr-only" // Hide default radio but keep functionality
                />
                <div
                  className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                    !isAIDriverSet ? "border-indigo-400" : "border-gray-500"
                  }`}
                >
                  {!isAIDriverSet && (
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400"></div>
                  )}
                </div>
                <span
                  className={`font-medium text-sm ${
                    !isAIDriverSet ? "text-indigo-300" : "text-gray-300"
                  }`}
                >
                  No
                </span>
              </label>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Select "Yes" if AI is controlling the vehicle
            </p>
          </div>
        </div>
      )}

      {/* Track Selection - Added new component */}
      {submittedName && (
        <div className="mb-4 bg-gray-800 border border-gray-700 rounded-md overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-700">
            <label className="text-xs font-medium text-gray-300">
              Select Track
            </label>
          </div>
          <div className="p-3">
            <div className="grid grid-cols-3 gap-2">
              <label
                className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md cursor-pointer border transition-all ${
                  selectedTrack === "GD-Track-01"
                    ? "bg-indigo-900/40 border-indigo-500"
                    : "bg-gray-700/30 border-gray-600 hover:bg-gray-700/50"
                }`}
              >
                <input
                  type="radio"
                  name="trackSelection"
                  checked={selectedTrack === "GD-Track-01"}
                  onChange={() => setSelectedTrack("GD-Track-01")}
                  className="sr-only"
                />
                <div
                  className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                    selectedTrack === "GD-Track-01"
                      ? "border-indigo-400"
                      : "border-gray-500"
                  }`}
                >
                  {selectedTrack === "GD-Track-01" && (
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400"></div>
                  )}
                </div>
                <span
                  className={`font-medium text-sm ${
                    selectedTrack === "GD-Track-01"
                      ? "text-indigo-300"
                      : "text-gray-300"
                  }`}
                >
                  Track 1
                </span>
              </label>

              <label
                className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md cursor-pointer border transition-all ${
                  selectedTrack === "GD-Track-02"
                    ? "bg-indigo-900/40 border-indigo-500"
                    : "bg-gray-700/30 border-gray-600 hover:bg-gray-700/50"
                }`}
              >
                <input
                  type="radio"
                  name="trackSelection"
                  checked={selectedTrack === "GD-Track-02"}
                  onChange={() => setSelectedTrack("GD-Track-02")}
                  className="sr-only"
                />
                <div
                  className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                    selectedTrack === "GD-Track-02"
                      ? "border-indigo-400"
                      : "border-gray-500"
                  }`}
                >
                  {selectedTrack === "GD-Track-02" && (
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400"></div>
                  )}
                </div>
                <span
                  className={`font-medium text-sm ${
                    selectedTrack === "GD-Track-02"
                      ? "text-indigo-300"
                      : "text-gray-300"
                  }`}
                >
                  Track 2
                </span>
              </label>

              <label
                className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md cursor-pointer border transition-all ${
                  selectedTrack === "GD-Track-03"
                    ? "bg-indigo-900/40 border-indigo-500"
                    : "bg-gray-700/30 border-gray-600 hover:bg-gray-700/50"
                }`}
              >
                <input
                  type="radio"
                  name="trackSelection"
                  checked={selectedTrack === "GD-Track-03"}
                  onChange={() => setSelectedTrack("GD-Track-03")}
                  className="sr-only"
                />
                <div
                  className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                    selectedTrack === "GD-Track-03"
                      ? "border-indigo-400"
                      : "border-gray-500"
                  }`}
                >
                  {selectedTrack === "GD-Track-03" && (
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400"></div>
                  )}
                </div>
                <span
                  className={`font-medium text-sm ${
                    selectedTrack === "GD-Track-03"
                      ? "text-indigo-300"
                      : "text-gray-300"
                  }`}
                >
                  Track 3
                </span>
              </label>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Select which track you're playing on
            </p>
          </div>
        </div>
      )}

      {/* Main Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Update API Key input section */}
        {!hasStoredApiKey && (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              API Key
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-md focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 text-white"
                    placeholder="Enter your API key"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleApiKeySetup}
                  disabled={isLoading || !apiKey}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
                >
                  Set Key
                </button>
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

        {/* Update Submit Button */}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isLoading || !isGameplayAvailable || !hasStoredApiKey}
            style={{
              backgroundColor:
                isLoading || !isGameplayAvailable || !hasStoredApiKey
                  ? "#4B5563"
                  : "#6366F1",
              color:
                isLoading || !isGameplayAvailable || !hasStoredApiKey
                  ? "#9CA3AF"
                  : "white",
              cursor:
                isLoading || !isGameplayAvailable || !hasStoredApiKey
                  ? "not-allowed"
                  : "pointer",
              opacity:
                isLoading || !isGameplayAvailable || !hasStoredApiKey ? 0.6 : 1,
            }}
            className="w-full py-2 px-4 rounded transition-colors hover:bg-indigo-600"
          >
            {isLoading ? "Generating..." : "Generate Summary"}
          </button>
          <button
            type="button"
            onClick={handleJSONSubmit}
            style={{
              backgroundColor: "#6366F1",
              color: "white",
              cursor: "pointer",
            }}
            className="w-full py-2 px-4 rounded transition-colors hover:bg-indigo-600"
          >
            Run
          </button>
        </div>
      </form>
    </div>
  );
}

export default App;
