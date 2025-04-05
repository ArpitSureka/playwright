#!/bin/bash

# Load environment variables from .env file
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
  echo "Loaded environment variables from .env"
else
  echo "Warning: .env file not found"
fi

# Clear any existing log file
rm -f playwright-debug.log
touch playwright-debug.log

# Run a background process to monitor the log file
if [[ "$PW_SHOW_RECORDER_LOGS" == "1" ]]; then
  echo "Starting recorder log monitor..."
  (
    tail -f /tmp/playwright-recorder-debug.log | grep -E '\[Recorder\]|pw:debug:recorder' | 
    while read line; do 
      echo -e "\033[36m[RECORDER]\033[0m $line"
    done
  ) &
  TAIL_PID=$!
  
  # Cleanup the tail process when the script exits
  trap "kill $TAIL_PID 2>/dev/null" EXIT
fi

# Run Playwright codegen
echo "Starting Playwright codegen..."
npx playwright codegen "$@" 