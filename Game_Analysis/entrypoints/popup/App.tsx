import React, { useState } from "react";
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
  const [summary, setSummary] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [showTooltip, setShowTooltip] = useState("");

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!apiKey.trim()) {
      setError("API key is required");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      chrome.storage.sync.set({ apiKey: apiKey });
      await new Promise((resolve) => setTimeout(resolve, 1500));
      setSummary("Sample game summary based on selected style...");
    } catch (err) {
      setError("Failed to generate summary. Please try again.");
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
          <h1 className="text-xl font-bold text-white">Game Analysis</h1>
          <p className="text-sm text-gray-400">
            Get instant game driving summaries
          </p>
        </div>
      </div>

      {/* Main Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* API Key Input */}
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

        {/* Style Selector */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Summary Style
          </label>
          <div className="relative">
            <div
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-md cursor-pointer hover:border-indigo-400"
              onClick={() => setShowTooltip(showTooltip ? "" : summaryStyle)}
            >
              {SUMMARY_STYLES.map((style) => (
                <div
                  key={style.id}
                  className={`flex items-center gap-2 p-2 rounded-md ${
                    style.id === summaryStyle
                      ? "bg-indigo-900/50 text-indigo-300"
                      : "hover:bg-gray-700/50 text-gray-300"
                  }`}
                  onClick={() => setSummaryStyle(style.id)}
                >
                  <span className="text-lg">{style.icon}</span>
                  <span className="flex-1">{style.label}</span>
                  {style.id === summaryStyle && (
                    <span className="text-xs bg-indigo-900 text-indigo-200 px-2 py-1 rounded-full">
                      Selected
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Tooltip */}
            {showTooltip && (
              <div className="absolute z-10 px-3 py-2 text-sm text-white bg-gray-800 rounded-md -top-10 left-1/2 transform -translate-x-1/2 shadow-lg border border-gray-700">
                {
                  SUMMARY_STYLES.find((style) => style.id === showTooltip)
                    ?.description
                }
              </div>
            )}
          </div>
        </div>

        {/* Summary Display */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Summary
          </label>
          <textarea
            value={summary}
            readOnly
            className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-md h-32 focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 text-white"
            placeholder="Generated summary will appear here..."
          />
        </div>

        {/* Error Message */}
        {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4" />
            <span>{error}</span>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isLoading}
          className={`w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-500 text-white rounded-md hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 focus:ring-offset-gray-900 ${
            isLoading ? "opacity-75 cursor-not-allowed" : ""
          }`}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating...
            </>
          ) : (
            "Generate Summary"
          )}
        </button>
      </form>
    </div>
  );
}

export default App;
