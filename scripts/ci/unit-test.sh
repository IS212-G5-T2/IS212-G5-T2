#!/usr/bin/env bash
# Runs the fixed frontend and backend unit-test entrypoints concurrently.
set -euo pipefail

run_component() {
  local component="$1"

  echo "Running unit tests for ${component}"
  (
    cd "$component"
    npm ci
    npm test
  )
}

run_component backend &
backend_pid=$!
run_component frontend &
frontend_pid=$!

status=0
wait "$backend_pid" || status=1
wait "$frontend_pid" || status=1

exit "$status"
