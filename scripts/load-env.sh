#!/usr/bin/env bash
# Load the repo .env into the current shell (source this file).
set -a
# shellcheck disable=SC1091
. /workspace/project/oryx/.env
set +a
export DATABASE_URL
