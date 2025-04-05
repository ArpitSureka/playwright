#!/bin/bash

# Load environment variables from .env file
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
  echo "Loaded environment variables from .env"
else
  echo "Warning: .env file not found"
fi

# Run playwright codegen
npx playwright codegen "$@" 