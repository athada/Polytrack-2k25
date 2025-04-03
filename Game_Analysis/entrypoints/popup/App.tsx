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

  // Add this effect to load name from extension storage when popup opens
  useEffect(() => {
    chrome.storage.local.get(["playerName"], (result) => {
      if (result.playerName) {
        setSubmittedName(result.playerName);
      }
    });
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

  // Update handler to save name to extension storage
  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (userName.trim()) {
      const name = userName.trim();
      setSubmittedName(name);
      chrome.storage.local.set({ playerName: name });
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
      window.close();
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
    <div className="w-[400px] p-6 bg-black">
      {/* Header */}
      <div className="flex items-center gap-2 mb-6 relative overflow-hidden p-4 bg-gradient-to-r from-red-600 to-red-800 rounded-md">
        {/* Checkered flag accent */}
        <div
          className="absolute top-0 right-0 w-12 h-8 opacity-30"
          style={{
            backgroundImage: `
              linear-gradient(45deg, #000 25%, transparent 25%),
              linear-gradient(-45deg, #000 25%, transparent 25%),
              linear-gradient(45deg, transparent 75%, #000 75%),
              linear-gradient(-45deg, transparent 75%, #000 75%)
            `,
            backgroundSize: "8px 8px",
            backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0px",
            transform: "rotate(-10deg)",
          }}
        />
        <GamepadIcon className="w-8 h-8 text-white" />
        <div>
          <h2 className="text-3xl font-bold text-white uppercase tracking-wide">
            Summaracer
          </h2>
          <p className="text-xs text-gray-200">
            AI-driven racing and smart summaries.
          </p>
        </div>
      </div>

      {/* Name Input Section */}
      {!submittedName ? (
        <form onSubmit={handleNameSubmit} className="mb-6">
          <label className="block text-sm font-medium text-gray-300 mb-1 uppercase tracking-wide">
            Your Name
            <div className="flex gap-2 mt-1">
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className="flex-1 px-4 py-2 bg-gray-900 border border-gray-800 rounded-md focus:border-red-600 focus:outline-none focus:shadow-[0_0_0_1px_rgba(220,38,38,0.5),0_0_8px_rgba(220,38,38,0.4)] text-white transition-all duration-200"
                placeholder="Enter your name"
              />
              <button
                type="submit"
                disabled={!userName.trim()}
                style={{
                  paddingLeft: "1rem",
                  paddingRight: "1rem",
                  paddingTop: "0.5rem",
                  paddingBottom: "0.5rem",
                  background: !userName.trim()
                    ? "linear-gradient(to right, #374151, #1f2937)"
                    : "linear-gradient(to right, #dc2626, #991b1b)",
                  color: !userName.trim() ? "#9ca3af" : "#ffffff",
                  borderRadius: "0.375rem",
                  border: "1px solid transparent",
                  transition: "all 200ms",
                  textTransform: "uppercase",
                  fontWeight: 500,
                  letterSpacing: "0.025em",
                  cursor: !userName.trim() ? "not-allowed" : "pointer",
                  opacity: !userName.trim() ? 0.6 : 1,
                }}
                onMouseEnter={(e) => {
                  if (userName.trim()) {
                    e.currentTarget.style.borderColor = "#ef4444";
                    e.currentTarget.style.background =
                      "linear-gradient(to right, #b91c1c, #7f1d1d)";
                    e.currentTarget.style.boxShadow =
                      "0 0 12px rgba(220,38,38,0.6)";
                    e.currentTarget.style.transform = "translateY(-0.125rem)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (userName.trim()) {
                    e.currentTarget.style.borderColor = "transparent";
                    e.currentTarget.style.background =
                      "linear-gradient(to right, #dc2626, #991b1b)";
                    e.currentTarget.style.boxShadow = "none";
                    e.currentTarget.style.transform = "none";
                  }
                }}
              >
                Set Name
              </button>
            </div>
          </label>
        </form>
      ) : (
        <div className="flex items-center justify-between mb-6 p-3 bg-gray-900 rounded-md border border-gray-800">
          <div className="flex items-center gap-2 text-lg">
            <span className="text-gray-400">Welcome,</span>
            <span className="text-red-500 font-semibold">{submittedName}</span>
          </div>
          <button
            onClick={() => {
              setSubmittedName("");
              chrome.storage.local.remove("playerName");
            }}
            style={{
              fontSize: "0.75rem",
              color: "#9ca3af",
              border: "1px solid #ef4444",
              backgroundColor: "#111827",
              paddingLeft: "0.5rem",
              paddingRight: "0.5rem",
              paddingTop: "0.25rem",
              paddingBottom: "0.25rem",
              borderRadius: "0.25rem",
              transition: "all 200ms",
              textTransform: "uppercase",
              fontWeight: 500,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "#ef4444";
              e.currentTarget.style.borderColor = "#ef4444";
              e.currentTarget.style.backgroundColor = "#1f2937";
              e.currentTarget.style.boxShadow = "0 0 8px rgba(220,38,38,0.3)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "#9ca3af";
              e.currentTarget.style.borderColor = "#ef4444";
              e.currentTarget.style.backgroundColor = "#111827";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            Change
          </button>
        </div>
      )}

      {/* AI Driver Enabled? - Racing Style Cards */}
      {submittedName && (
        <div className="mb-4 bg-gray-900 border border-gray-800 rounded-md overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-800 bg-gradient-to-r from-red-800/30 to-red-900/20">
            <label className="text-xs font-medium text-gray-300 uppercase tracking-wide">
              AI Driver Enabled?
            </label>
          </div>
          <div className="p-3">
            <div className="grid grid-cols-2 gap-2">
              <label
                className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md cursor-pointer border transition-all ${
                  isAIDriverSet
                    ? "bg-red-900/40 border-red-500"
                    : "bg-gray-900/30 border-gray-800 hover:bg-gray-800/50"
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
                    isAIDriverSet ? "border-red-400" : "border-gray-600"
                  }`}
                >
                  {isAIDriverSet && (
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>
                  )}
                </div>
                <span
                  className={`font-medium text-sm uppercase ${
                    isAIDriverSet ? "text-red-300" : "text-gray-300"
                  }`}
                >
                  Yes
                </span>
              </label>

              <label
                className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md cursor-pointer border transition-all ${
                  !isAIDriverSet
                    ? "bg-red-900/40 border-red-500"
                    : "bg-gray-900/30 border-gray-800 hover:bg-gray-800/50"
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
                    !isAIDriverSet ? "border-red-400" : "border-gray-600"
                  }`}
                >
                  {!isAIDriverSet && (
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>
                  )}
                </div>
                <span
                  className={`font-medium text-sm uppercase ${
                    !isAIDriverSet ? "text-red-300" : "text-gray-300"
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

      {/* Track Selection - Racing Style Cards */}
      {submittedName && (
        <div className="mb-4 bg-gray-900 border border-gray-800 rounded-md overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-800 bg-gradient-to-r from-red-800/30 to-red-900/20">
            <label className="text-xs font-medium text-gray-300 uppercase tracking-wide">
              Select Track
            </label>
          </div>
          <div className="p-3">
            <div className="grid grid-cols-3 gap-2">
              <label
                className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md cursor-pointer border transition-all ${
                  selectedTrack === "GD-Track-01"
                    ? "bg-red-900/40 border-red-500"
                    : "bg-gray-900/30 border-gray-800 hover:bg-gray-800/50"
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
                      ? "border-red-400"
                      : "border-gray-600"
                  }`}
                >
                  {selectedTrack === "GD-Track-01" && (
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>
                  )}
                </div>
                <span
                  className={`font-medium text-sm uppercase ${
                    selectedTrack === "GD-Track-01"
                      ? "text-red-300"
                      : "text-gray-300"
                  }`}
                >
                  Track 1
                </span>
              </label>

              <label
                className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md cursor-pointer border transition-all ${
                  selectedTrack === "GD-Track-02"
                    ? "bg-red-900/40 border-red-500"
                    : "bg-gray-900/30 border-gray-800 hover:bg-gray-800/50"
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
                      ? "border-red-400"
                      : "border-gray-600"
                  }`}
                >
                  {selectedTrack === "GD-Track-02" && (
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>
                  )}
                </div>
                <span
                  className={`font-medium text-sm uppercase ${
                    selectedTrack === "GD-Track-02"
                      ? "text-red-300"
                      : "text-gray-300"
                  }`}
                >
                  Track 2
                </span>
              </label>

              <label
                className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md cursor-pointer border transition-all ${
                  selectedTrack === "GD-Track-03"
                    ? "bg-red-900/40 border-red-500"
                    : "bg-gray-900/30 border-gray-800 hover:bg-gray-800/50"
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
                      ? "border-red-400"
                      : "border-gray-600"
                  }`}
                >
                  {selectedTrack === "GD-Track-03" && (
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>
                  )}
                </div>
                <span
                  className={`font-medium text-sm uppercase ${
                    selectedTrack === "GD-Track-03"
                      ? "text-red-300"
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
            <label className="block text-sm font-medium text-gray-300 mb-1 uppercase tracking-wide">
              API Key
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-gray-900 border border-gray-800 rounded-md focus:border-red-600 focus:outline-none focus:shadow-[0_0_0_1px_rgba(220,38,38,0.5),0_0_8px_rgba(220,38,38,0.4)] text-white transition-all duration-200"
                    placeholder="Enter your API key"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleApiKeySetup}
                  disabled={isLoading || !apiKey}
                  className="px-4 py-2 bg-gradient-to-r from-red-600 to-red-800 text-white rounded-md border border-transparent hover:border-red-500 hover:from-red-700 hover:to-red-900 hover:shadow-[0_0_12px_rgba(220,38,38,0.6)] hover:-translate-y-0.5 transition-all duration-200 disabled:from-gray-700 disabled:to-gray-800 disabled:border-transparent disabled:text-gray-400 disabled:cursor-not-allowed disabled:shadow-none disabled:transform-none uppercase font-medium tracking-wide"
                >
                  Set Key
                </button>
              </div>
            </label>
          </div>
        )}

        {/* Show success message when API key is stored */}
        {/* {hasStoredApiKey && (
          <div className="flex items-center gap-2 text-red-400 text-sm bg-gray-900/50 p-2 rounded border border-red-900/30">
            <span className="text-red-500">✓</span>
            <span>API Key is configured</span>
          </div>
        )} */}

        {/* Style Selector */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1 uppercase tracking-wide">
            Summary Style
          </label>
          <div className="relative">
            <div className="w-full px-4 py-2 bg-gray-900 border border-gray-800 rounded-md">
              {SUMMARY_STYLES.map((style) => (
                <div key={style.id} className="relative">
                  <div
                    className={`flex items-center gap-2 p-2 cursor-pointer rounded-md ${
                      style.id === summaryStyle
                        ? "bg-red-900/50 text-red-300"
                        : "hover:bg-gray-800/50 text-gray-300"
                    }`}
                    onClick={() => setSummaryStyle(style.id)}
                    onMouseEnter={() => setShowTooltip(style.id)}
                    onMouseLeave={() => setShowTooltip("")}
                  >
                    <span className="text-lg">{style.icon}</span>
                    <span className="flex-1 uppercase tracking-wide font-medium">
                      {style.label}
                    </span>
                    {style.id === summaryStyle && (
                      <span className="text-xs bg-red-900 text-red-200 px-2 py-1 rounded-full uppercase text-[10px]">
                        Selected
                      </span>
                    )}
                  </div>

                  {/* Tooltip */}
                  {showTooltip === style.id && (
                    <div className="absolute z-10 px-3 py-2 text-sm text-white bg-gray-900 rounded-md -top-2 left-1/2 transform -translate-x-1/2 -translate-y-full shadow-lg border border-gray-800 whitespace-nowrap">
                      {style.description}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Error Message */}
        {/* {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4" />
            <span>{error}</span>
          </div>
        )} */}

        {/* Add this status indicator */}
        {/* <div
          className={`mb-4 text-sm ${
            isGameplayAvailable ? "text-green-600" : "text-red-400"
          }`}
        >
          {statusMessage}
        </div> */}

        {/* Update Submit Button */}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isLoading || !isGameplayAvailable || !hasStoredApiKey}
            className={`w-full py-2 px-4 rounded transition-all uppercase tracking-wide font-medium border ${
              isLoading || !isGameplayAvailable || !hasStoredApiKey
                ? "bg-gray-800 text-gray-500 cursor-not-allowed opacity-60 border-transparent"
                : "bg-gradient-to-r from-red-600 to-red-800 text-white border-transparent hover:border-red-500 hover:shadow-lg hover:shadow-red-900/30 hover:-translate-y-0.5"
            }`}
          >
            {isLoading ? "Generating..." : "Generate Summary"}
          </button>
          <button
            type="button"
            onClick={handleJSONSubmit}
            className="w-full py-2 px-4 rounded transition-all bg-gradient-to-r from-red-600 to-red-800 text-white border border-transparent hover:border-red-500 hover:shadow-lg hover:shadow-red-900/30 hover:-translate-y-0.5 uppercase tracking-wide font-medium"
          >
            Run
          </button>
        </div>
      </form>
    </div>
  );
}

export default App;
