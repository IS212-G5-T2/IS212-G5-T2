#!/bin/sh
set -eu

PROJECT_ID="${PROJECT_ID:-local-spm}"
STORAGE_BUCKET="${STORAGE_BUCKET:-local-spm-spm-objects-local}"
BASE_URL="${STORAGE_EMULATOR_HOST:-http://gcs:4443}"

until curl -fsS "${BASE_URL}/storage/v1/b" >/dev/null 2>&1; do
  sleep 1
done

curl -fsS -X POST \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"${STORAGE_BUCKET}\"}" \
  "${BASE_URL}/storage/v1/b?project=${PROJECT_ID}" >/dev/null || true

echo "Storage emulator is ready with bucket ${STORAGE_BUCKET}."
