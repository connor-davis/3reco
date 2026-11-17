#!/usr/bin/env bash
# Nightly demo reset. Run from cron on the host (see docs/operate.md).
#
# Stops the demo API, wipes the demo database and bucket, runs the migrations,
# fills it with made-up data, and starts the API again. It only ever touches the
# threereco-demo stack: the live stack has a different compose project.
set -euo pipefail

cd "$(dirname "$0")/../.."

COMPOSE=(docker compose -f deployments/docker-compose.demo.yml --env-file .env.demo)

"${COMPOSE[@]}" stop api-demo

# Make sure the data stores are up, then wipe and refill from a one-off
# container of the same image. The start-up guards inside refuse anything that
# is not the demo database and bucket.
"${COMPOSE[@]}" up -d postgres-demo minio-demo

if "${COMPOSE[@]}" run --rm --no-deps api-demo demo reset --yes; then
  status=0
else
  status=$?
  echo "demo reset FAILED (exit $status); the demo API stays stopped" >&2
fi

if [ "$status" -eq 0 ]; then
  "${COMPOSE[@]}" up -d api-demo
fi

exit "$status"
