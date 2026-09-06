#!/bin/sh
set -eu

echo "Configure this service's unit test command in scripts/ci/unit-test.sh."
echo "Example commands:"
echo "- npm test"
echo "- python -m pytest"
echo "- mvn test"
echo "- ./gradlew test"
exit 1
