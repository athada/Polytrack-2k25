#!/bin/bash

# Script to set up a TensorFlow/tfjs environment on macOS with Apple Silicon (M3 Pro) using Conda

# --- Configuration ---
ENVIRONMENT_NAME="tf-web-v8"
PYTHON_VERSION="3.8"
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

# --- Install Required Packages
pip install tensorflow-macos==2.13.0
pip install tensorflow-metal==1.0.1
pip install tensorflowjs==4.20.0
conda install pillow matplotlib ipykernel

echo "Environment setup complete!"
echo "Activate the environment using: conda activate $ENVIRONMENT_NAME"
echo "You can now train your model and use tensorflowjs to convert it."
