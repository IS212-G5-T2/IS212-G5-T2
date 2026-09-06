#!/bin/sh
set -eu

PROJECT_ID="${PROJECT_ID:-local-spm}"
PUBSUB_TOPIC="${PUBSUB_TOPIC:-spm-events}"
PUBSUB_SUBSCRIPTION="${PUBSUB_SUBSCRIPTION:-spm-events-microservices}"
BASE_URL="http://pubsub-emulator:8085/v1/projects/${PROJECT_ID}"

until curl -fsS "${BASE_URL}/topics" >/dev/null 2>&1; do
  sleep 1
done

curl -fsS -X PUT "${BASE_URL}/topics/${PUBSUB_TOPIC}" >/dev/null || true
curl -fsS -X PUT \
  -H "Content-Type: application/json" \
  -d "{\"topic\":\"projects/${PROJECT_ID}/topics/${PUBSUB_TOPIC}\"}" \
  "${BASE_URL}/subscriptions/${PUBSUB_SUBSCRIPTION}" >/dev/null || true

echo "Pub/Sub emulator is ready with topic ${PUBSUB_TOPIC} and subscription ${PUBSUB_SUBSCRIPTION}."
