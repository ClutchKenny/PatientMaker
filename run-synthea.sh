#!/bin/bash
set -euo pipefail

# Resolve Synthea directory:
if [[ -n "${SYNTHEA_PATH:-}" ]]; then
  SYNTHEA_DIR="$SYNTHEA_PATH"
elif [[ -d "/Users/isabellegatmaitan/synthea" ]]; then
  SYNTHEA_DIR="/Users/isabellegatmaitan/synthea"
else
  SYNTHEA_DIR="$(pwd)/synthea"
fi

if [[ ! -d "$SYNTHEA_DIR" ]]; then
  echo "Error: Synthea directory not found at: $SYNTHEA_DIR" >&2
  exit 1
fi

# Important: run from inside the repo so ./gradlew exists
cd "$SYNTHEA_DIR"

# If gradlew isn't there, try falling back to the fat jar if present
if [[ ! -x "./gradlew" ]]; then
  if [[ -f "build/libs/synthea-with-dependencies.jar" ]]; then
    exec java -jar "build/libs/synthea-with-dependencies.jar" "$@"
  else
    echo "Error: ./gradlew not found and no fat JAR present." >&2
    echo "Clone the full Synthea repo or run: ./gradlew build" >&2
    exit 1
  fi
fi

exec ./run_synthea "$@"
