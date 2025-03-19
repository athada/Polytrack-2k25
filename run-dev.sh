#!/bin/bash

# Script to set up and run both backend and frontend services

echo "=== Setting up backend ==="
cd backend
npm install
echo "Backend dependencies installed."

# Start backend in the background
echo "Starting backend server..."
node server.js &
BACKEND_PID=$!
echo "Backend server running with PID: $BACKEND_PID"

# Wait a moment for backend to initialize
sleep 2

echo "=== Setting up frontend ==="
cd ../Game_Analysis
npm install
echo "Frontend dependencies installed."

echo "Starting frontend development server..."
npm run dev

# If the frontend server exits, also terminate the backend
kill $BACKEND_PID
echo "Backend server terminated."