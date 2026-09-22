#!/bin/sh
# Executes the frontend's deterministic Vitest suite for the repository-level
# GitHub Actions test-discovery contract.
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
component_dir=$(CDPATH= cd -- "$script_dir/../.." && pwd)

cd "$component_dir"

npm ci
npm run test:coverage
