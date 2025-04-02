//@ts-nocheck
const PLAYING_FREQ = 5;
const CHECK_FOR_GAME_START_FREQ = 5000;
const CHECK_FOR_CAR_MOVE_FREQ = 1;
const VERBOSE = false;

let checkForGameStartInterval = 0;
let checkForCarMovementInterval = 0;
let recordingInterval = 0;

let carIsMoving = false;
let startedGame = false;

let activeKeys = new Set();

// Global variable to store actions data
window.actions = [];

// Add this variable at the top of your file with the other globals
let isRunning = false;
let keyDownHandler = null;

//Load actions data when script is first loaded
async function preloadActions() {
  try {
    console.log("Preloading actions data...");
    window.actions = await loadActionsFromIndexedDB();
  } catch (error) {
    console.error("Failed to preload actions:", error);
  }
}

function simulateKeyState(keysToBePressed) {
  if (!Array.isArray(keysToBePressed)) {
    console.error("Invalid input: keysToBePressed must be an array");
    return;
  }

  // Keys that need to be released (currently active but not in new keypress list)
  const keysToRelease = [...activeKeys].filter(
    (key) => !keysToBePressed.includes(key)
  );

  // Keys that need to be pressed (in new keypress list but not currently active)
  const keysToPress = keysToBePressed.filter((key) => !activeKeys.has(key));

  // Get key code for keyboard events
  function getKeyCode(key) {
    const keyCodeMap = {
      w: "KeyW",
      s: "KeyS",
      a: "KeyA",
      d: "KeyD",
    };
    return keyCodeMap[key] || key;
  }

  // Create and dispatch a keyboard event
  function dispatchKeyEvent(key, eventType) {
    const keyEvent = new KeyboardEvent(eventType, {
      key: key,
      code: getKeyCode(key),
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(keyEvent);
    if (VERBOSE) {
      console.log(
        `Key ${eventType === "keydown" ? "pressed" : "released"}: ${key}`
      );
    }
  }

  // Release keys that are no longer pressed
  keysToRelease.forEach((key) => {
    dispatchKeyEvent(key, "keyup");
    activeKeys.delete(key);
  });

  // Press new keys
  keysToPress.forEach((key) => {
    dispatchKeyEvent(key, "keydown");
    activeKeys.add(key);
  });
}

function findNearestAction(actions, timestamp) {
  if (!actions || actions.length === 0) return null;

  // First check if timestamp is before the first action or after the last action
  if (timestamp < actions[0].timestamp_min) {
    return actions[0];
  }
  if (timestamp > actions[actions.length - 1].timestamp_max) {
    return actions[actions.length - 1];
  }

  // Check if timestamp falls within any interval directly
  // This is a quick optimization for the common case
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    if (
      timestamp >= action.timestamp_min &&
      timestamp <= action.timestamp_max
    ) {
      return action;
    }
    // Early exit if we've gone past the timestamp
    if (action.timestamp_min > timestamp) {
      break;
    }
  }

  // Binary search for the closest action
  let left = 0;
  let right = actions.length - 1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);

    if (
      actions[mid].timestamp_min <= timestamp &&
      actions[mid].timestamp_max >= timestamp
    ) {
      // Found an exact interval match
      return actions[mid];
    }

    if (actions[mid].timestamp_min > timestamp) {
      right = mid - 1;
    } else {
      left = mid + 1;
    }
  }

  // At this point, we didn't find an exact interval match
  const beforeIndex = Math.max(0, left - 1);
  const afterIndex = Math.min(actions.length - 1, left);

  const beforeAction = actions[beforeIndex];
  const afterAction = actions[afterIndex];

  // Calculate distances
  const distToBefore =
    timestamp < beforeAction.timestamp_min
      ? beforeAction.timestamp_min - timestamp
      : timestamp > beforeAction.timestamp_max
      ? timestamp - beforeAction.timestamp_max
      : 0;

  const distToAfter =
    timestamp < afterAction.timestamp_min
      ? afterAction.timestamp_min - timestamp
      : timestamp > afterAction.timestamp_max
      ? timestamp - afterAction.timestamp_max
      : 0;

  // Return the closest action
  return distToBefore <= distToAfter ? beforeAction : afterAction;
}

const getSpeed = () => {
  const divElement = document.querySelector(".speedometer");
  if (divElement) {
    let spans = divElement.querySelectorAll("span");
    const speed = spans[0].innerText;
    return speed == 0 ? null : speed;
  }
  return null;
};

const gameEnded = () => document.querySelector(".time-announcer");

const getTimerValueMs = () => {
  const timerSpans = [
    ...document.querySelectorAll(".timer > .center > div > p > span"),
  ]
    .map((span) => span.innerText)
    .filter((string) => !isNaN(+string));
  if (timerSpans.length == 0) return 0;
  const minutes = +timerSpans.slice(0, 2).join("");
  const milliseconds = +timerSpans.slice(2).join("");
  return minutes * 60 * 1000 + milliseconds;
};

const checkForGameStart = () => {
  if (VERBOSE) {
    console.log("Waiting for game start.");
  }
  return setInterval(() => {
    if (!startedGame && document.querySelector(".speedometer"))
      checkForCarMovement();
  }, CHECK_FOR_GAME_START_FREQ);
};

const checkForCarMovement = () => {
  if (VERBOSE) {
    console.log("Game started, waiting for car movement.");
  }
  clearInterval(checkForGameStartInterval);
  startedGame = true;

  checkForCarMovementInterval = setInterval(() => {
    const curSpeed = getSpeed();
    if (curSpeed && !gameEnded()) {
      startGame();
    }
  }, CHECK_FOR_CAR_MOVE_FREQ);
};

const startGame = async () => {
  console.log("Car is moving. Starting replay...");
  clearInterval(checkForCarMovementInterval);
  carIsMoving = true;

  // Start by pressing 'w' to ensure acceleration
  simulateKeyState(["w"]);
  activeKeys.clear();
  activeKeys.add("w"); // Ensure 'w' is in the active keys set from the start

  // Track when the game started
  const gameStartTime = getTimerValueMs();
  console.log(`Game start time: ${gameStartTime}ms`);

  // If no actions were loaded, don't proceed
  if (!window.actions || window.actions.length === 0) {
    console.error("No actions available for replay. Stopping.");
    return;
  }

  let lastTimestamp = null;
  let foundFirstTurn = false; // Flag to track if we've found the first turning action

  recordingInterval = setInterval(() => {
    // Check if the game has been manually restarted
    if (!isRunning) {
      clearInterval(recordingInterval);
      return;
    }

    if (gameEnded()) {
      console.log("Game has ended. Stopping replay.");
      clearInterval(recordingInterval);
      simulateKeyState([]);
      return;
    }

    // Current game time - use absolute time directly
    const currentGameTime = getTimerValueMs();

    // Find the exact action for this timestamp using the findNearestAction helper
    let actionToApply = findNearestAction(window.actions, currentGameTime);

    // Apply the action based on the simplified logic
    if (actionToApply) {
      // Get keypresses from action
      let keypresses = Array.isArray(actionToApply.keypressInputs)
        ? actionToApply.keypressInputs
        : [];

      // Check if this action is within its time window
      const isWithinTimeWindow =
        currentGameTime >= actionToApply.timestamp_min &&
        currentGameTime <= actionToApply.timestamp_max;

      if (isWithinTimeWindow) {
        // This is a turning or braking action - use exactly as recorded
        foundFirstTurn = true;

        // Apply the inputs exactly as recorded
        simulateKeyState(keypresses);

        if (
          VERBOSE &&
          (!lastTimestamp || currentGameTime - lastTimestamp > 1000)
        ) {
          console.log(
            `Time: ${currentGameTime}ms | Action: ${
              actionToApply.timestamp_min
            }-${actionToApply.timestamp_max}ms | Keys: [${keypresses.join(
              ", "
            )}]`
          );
          lastTimestamp = currentGameTime;
        }
      } else {
        // Outside any action window - default to pressing 'w'
        simulateKeyState(["w"]);

        if (
          VERBOSE &&
          (!lastTimestamp || currentGameTime - lastTimestamp > 1000)
        ) {
          console.log(`Time: ${currentGameTime}ms | Default acceleration`);
          lastTimestamp = currentGameTime;
        }
      }
    } else {
      // No action found for this time - default to pressing 'w'
      simulateKeyState(["w"]);

      if (
        VERBOSE &&
        (!lastTimestamp || currentGameTime - lastTimestamp > 1000)
      ) {
        console.log(
          `Time: ${currentGameTime}ms | No action found, default acceleration`
        );
        lastTimestamp = currentGameTime;
      }
    }
  }, PLAYING_FREQ);
};

async function loadActionsFromIndexedDB(
  dbName = "RacingGameDB",
  storeName = "keyPressActions"
) {
  return new Promise(async (resolve, reject) => {
    try {
      const request = indexedDB.open(dbName, 1);

      request.onerror = async (event) => {
        console.warn(
          `IndexedDB error: ${event.target.error}. Attempting to load JSON file...`
        );
        try {
          // Fall back to file upload if database access fails
          const uploadResult = await uploadJSONtoIndexedDB(dbName, storeName);
          if (uploadResult && uploadResult.success) {
            // Re-attempt to load after successful upload
            const reloadedActions = await loadActionsFromIndexedDB(
              dbName,
              storeName
            );
            resolve(reloadedActions);
          } else {
            reject(`Failed to load or upload actions data`);
          }
        } catch (uploadError) {
          reject(`IndexedDB error and JSON upload failed: ${uploadError}`);
        }
      };

      request.onsuccess = (event) => {
        const db = event.target.result;
        const transaction = db.transaction(storeName, "readonly");
        const store = transaction.objectStore(storeName);

        const countRequest = store.count();
        countRequest.onsuccess = async () => {
          if (countRequest.result === 0) {
            console.warn(
              "No actions found in IndexedDB. Attempting to load JSON file..."
            );
            try {
              // Database exists but is empty, prompt for file upload
              const uploadResult = await uploadJSONtoIndexedDB(
                dbName,
                storeName
              );
              if (uploadResult && uploadResult.success) {
                // Re-attempt to load after successful upload
                const reloadedActions = await loadActionsFromIndexedDB(
                  dbName,
                  storeName
                );
                resolve(reloadedActions);
              } else {
                reject(`No actions in database and upload failed`);
              }
            } catch (uploadError) {
              reject(`Empty database and JSON upload failed: ${uploadError}`);
            }
          } else {
            // Normal case - database has data
            store.getAll().onsuccess = (event) => {
              const actions = event.target.result.sort(
                (a, b) => a.timestamp_min - b.timestamp_min
              );
              if (actions && actions.length > 0) {
                if (VERBOSE) {
                  console.log(
                    `Successfully loaded ${actions.length} actions from IndexedDB`
                  );
                }
                resolve(actions);
              } else {
                console.warn(
                  "Database returned empty result. Attempting to load JSON file..."
                );
                // This shouldn't happen given our count check, but just in case
                uploadJSONtoIndexedDB(dbName, storeName)
                  .then(() => loadActionsFromIndexedDB(dbName, storeName))
                  .then(resolve)
                  .catch(reject);
              }
            };
          }
        };

        transaction.onerror = async (event) => {
          console.warn(
            `Transaction error: ${event.target.error}. Attempting to load JSON file...`
          );
          try {
            const uploadResult = await uploadJSONtoIndexedDB(dbName, storeName);
            if (uploadResult && uploadResult.success) {
              const reloadedActions = await loadActionsFromIndexedDB(
                dbName,
                storeName
              );
              resolve(reloadedActions);
            } else {
              reject(`Transaction error and upload failed`);
            }
          } catch (uploadError) {
            reject(`Transaction error and JSON upload failed: ${uploadError}`);
          }
        };
      };
    } catch (error) {
      console.error(`Unexpected error in loadActionsFromIndexedDB: ${error}`);
      reject(error);
    }
  });
}

function uploadJSONtoIndexedDB(
  jsonData = null,
  dbName = "RacingGameDB",
  storeName = "keyPressActions"
) {
  return new Promise((resolve, reject) => {
    // If jsonData is provided directly, process it instead of requesting user input
    if (jsonData) {
      processJSONData(jsonData);
      return;
    }

    // Only create file input if no data was provided
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".json";
    fileInput.style.display = "none";
    document.body.appendChild(fileInput);

    fileInput.onchange = (event) => {
      const file = event.target.files[0];
      if (!file) {
        document.body.removeChild(fileInput);
        reject(new Error("No file selected"));
        return;
      }

      if (VERBOSE) {
        console.log(`Reading file: ${file.name}`);
      }
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const jsonData = JSON.parse(e.target.result);
          document.body.removeChild(fileInput);
          processJSONData(jsonData);
        } catch (error) {
          document.body.removeChild(fileInput);
          reject(new Error(`Error processing JSON: ${error.message}`));
        }
      };

      reader.onerror = (error) => {
        document.body.removeChild(fileInput);
        reject(new Error(`File reading error: ${error}`));
      };
      reader.readAsText(file);
    };

    fileInput.click();

    // Helper function to process JSON data and store it in IndexedDB
    function processJSONData(jsonData) {
      try {
        if (!Array.isArray(jsonData)) {
          throw new Error("JSON data must be an array of keypress objects");
        }

        // Parse the data and ensure all timestamps are numbers, but make duration and count optional
        let data = jsonData.map((item, index) => {
          // Only include essential fields
          const actionData = {
            id: index,
            keypressInputs: Array.isArray(item.keypressInputs)
              ? item.keypressInputs
              : [],
            timestamp_min: parseInt(item.timestamp_min) || 0,
            timestamp_max: parseInt(item.timestamp_max) || 0,
          };

          // Only include duration and count if they exist in original data
          if (item.duration !== undefined) {
            actionData.duration = parseInt(item.duration);
          }

          if (item.count !== undefined) {
            actionData.count = parseInt(item.count);
          }

          return actionData;
        });

        // IMPORTANT: Sort the data by timestamp_min to ensure correct replay order
        data = data.sort((a, b) => a.timestamp_min - b.timestamp_min);
        if (VERBOSE) {
          console.log(`Sorted ${data.length} actions by timestamp_min`);
        }

        const request = indexedDB.open(dbName, 1);

        request.onerror = (event) => {
          reject(new Error(`IndexedDB error: ${event.target.error}`));
        };

        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName, { keyPath: "id" });
          }
        };

        request.onsuccess = (event) => {
          const db = event.target.result;
          const transaction = db.transaction(storeName, "readwrite");
          const store = transaction.objectStore(storeName);

          store.clear().onsuccess = () => {
            if (VERBOSE) {
              console.log(`Cleared existing data from ${storeName}`);
            }
            let addedCount = 0;

            // Reassign IDs based on sorted order
            data.forEach((item, newIndex) => {
              item.id = newIndex; // Update ID to match new sorted position
              store.add(item).onsuccess = () => {
                if (++addedCount === data.length && VERBOSE) {
                  if (VERBOSE) {
                    console.log(
                      `Added ${addedCount} records in timestamp order`
                    );
                  }
                }
              };
            });
          };

          transaction.oncomplete = () => {
            console.log(
              `Transaction completed: ${data.length} items stored in timestamp order`
            );
            resolve({
              success: true,
              message: `Loaded ${data.length} keypress actions in timestamp order`,
              data: data.slice(0, 3),
              timeRange:
                data.length > 0
                  ? {
                      start: data[0].timestamp_min,
                      end: data[data.length - 1].timestamp_max,
                    }
                  : null,
            });
          };

          transaction.onerror = (event) => {
            reject(new Error(`Transaction error: ${event.target.error}`));
          };
        };
      } catch (error) {
        reject(new Error(`Error processing JSON: ${error.message}`));
      }
    }
  });
}

const init = async (jsonData) => {
  // Clean up any previous simulation
  stopSimulation();

  await uploadJSONtoIndexedDB(jsonData);
  await preloadActions();

  // Set up key handler for restart detection
  isRunning = true;
  keyDownHandler = (event) => {
    if (event.key === "Escape" && isRunning) {
      console.log("Escape key detected - stopping AI driver simulation");
      stopSimulation();
    }
  };
  document.addEventListener("keydown", keyDownHandler);

  startGame();
};

// Add this new function to handle cleanup
const stopSimulation = () => {
  // Stop all intervals
  clearInterval(checkForGameStartInterval);
  clearInterval(checkForCarMovementInterval);
  clearInterval(recordingInterval);

  // Reset all flags
  carIsMoving = false;
  startedGame = false;
  isRunning = false;

  // Clear any active key states
  simulateKeyState([]);
  activeKeys.clear();

  // Remove key event listener if it exists
  if (keyDownHandler) {
    document.removeEventListener("keydown", keyDownHandler);
    keyDownHandler = null;
  }

  console.log("AI driver simulation stopped");
};

export default init;
