#!/bin/bash

# Script to set up local development environment for Complens.ai

echo "Setting up local development environment..."

# Check if running on Ubuntu/Debian
if ! command -v apt-get &> /dev/null; then
    echo "This script is for Ubuntu/Debian systems"
    echo "For other systems, manually install Node.js 18+ and zip utility"
    exit 1
fi

# Install zip utility
echo "Installing zip utility..."
sudo apt-get update
sudo apt-get install -y zip

# Install Node.js 18.x using NodeSource
echo "Installing Node.js 18.x..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installations
echo ""
echo "Verification:"
echo "Node version: $(node --version)"
echo "npm version: $(npm --version)"
echo "zip installed: $(which zip)"

echo ""
echo "Setup complete! You can now run:"
echo "  cd backend/lambda/api"
echo "  npm install"
echo "  npm run build"
