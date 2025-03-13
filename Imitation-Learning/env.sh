#!/bin/bash

# Script to set up a TensorFlow/tfjs environment on macOS with Apple Silicon (M3 Pro) using Conda

# --- Configuration ---
ENVIRONMENT_NAME="tfjs-env"
PYTHON_VERSION="3.9"  # Choose 3.9 or 3.10 for compatibility
# ---------------------

# --- Check for Conda ---
if ! command -v conda &> /dev/null
then
    echo "Conda is not installed. Please install Conda (e.g., via Anaconda or Miniconda) first."
    exit 1
fi

# --- Create and Activate Conda Environment ---
echo "Creating Conda environment '$ENVIRONMENT_NAME' with Python $PYTHON_VERSION..."
conda create -n "$ENVIRONMENT_NAME" python="$PYTHON_VERSION" -y

echo "Activating Conda environment '$ENVIRONMENT_NAME'..."
source $(conda info --env | grep "base" | awk '{print $NF}')/../etc/profile.d/conda.sh  #Initialize conda if this is first time running conda in script
conda activate "$ENVIRONMENT_NAME"

# --- Install TensorFlow Dependencies (Important!) ---
echo "Installing TensorFlow dependencies..."
conda install -c apple tensorflow-deps -y

# --- Install TensorFlow-macOS ---
echo "Installing TensorFlow-macOS..."
pip install tensorflow-macos

# --- Install TensorFlow-Metal (GPU Support) ---
echo "Installing TensorFlow-Metal..."
pip install tensorflow-metal

# --- Install TensorFlow.js Converter ---
echo "Installing TensorFlow.js converter..."
pip install tensorflowjs

echo "Environment setup complete!"
echo "Activate the environment using: conda activate $ENVIRONMENT_NAME"
echo "You can now train your model and use tensorflowjs to convert it."