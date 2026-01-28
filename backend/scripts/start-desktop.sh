#!/bin/bash

# Desktop Processing Server Start Script
# This script starts both FRP client and processing server

set -e

echo "==================================="
echo "Starting Desktop Processing Setup"
echo "==================================="

# Check if frpc config exists
if [ ! -f "frpc-local.toml" ]; then
    echo "ERROR: frpc-local.toml not found!"
    echo "Please run setup-frp.sh first or copy frpc.toml to frpc-local.toml"
    exit 1
fi

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "WARNING: .env file not found!"
    echo "Please create .env with necessary API keys"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Kill existing processes
echo "Stopping any existing processes..."
pkill -f "frpc -c frpc-local.toml" || true
pkill -f "processing-server.js" || true
sleep 2

# Start FRP client in background
echo "Starting FRP client..."
nohup frpc -c frpc-local.toml > frpc.log 2>&1 &
FRP_PID=$!
echo "FRP client started (PID: $FRP_PID)"

# Wait for FRP to connect
echo "Waiting for FRP connection..."
sleep 3

# Check if FRP connected successfully
if ! grep -q "login to server success" frpc.log 2>/dev/null; then
    echo "WARNING: FRP may not have connected successfully"
    echo "Check frpc.log for details"
fi

# Start processing server
echo "Starting processing server..."
node processing-server.js

# Note: This script will keep running with the processing server
# Press Ctrl+C to stop both services
