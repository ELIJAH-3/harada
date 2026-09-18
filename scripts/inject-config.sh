#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

echo "[Harada build] forwarding Render env vars into config.js"
if [ -n "${JSONBIN_MASTER_KEY:-}" ]; then
  echo "[Harada build] JSONBIN_MASTER_KEY is set"
else
  echo "[Harada build] JSONBIN_MASTER_KEY is missing"
fi
if [ -n "${JSONBIN_BIN_ID:-}" ]; then
  echo "[Harada build] JSONBIN_BIN_ID is set"
else
  echo "[Harada build] JSONBIN_BIN_ID is missing"
fi

node scripts/build-config.js \
  --master-key "${JSONBIN_MASTER_KEY:-}" \
  --bin-id "${JSONBIN_BIN_ID:-}"
