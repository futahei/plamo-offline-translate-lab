#!/usr/bin/env bash
set -euo pipefail

# @wllama/wllama 3.8.1 (npm) is too old for the PLaMo 3 tokenizer.
# Build the pinned upstream source (same working lineage as Sakutto) in CI.
WLLAMA_PIN=d275dac
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHECKOUT_DIR="$REPO_ROOT/vendor/wllama-src"
DEST_DIR="$REPO_ROOT/public/vendor/wllama"

if ! command -v docker >/dev/null 2>&1; then
  echo 'Docker Compose v2 is required for building the PLaMo 3 compatible WASM runtime.' >&2
  exit 1
fi

mkdir -p "$REPO_ROOT/vendor"
git clone --no-checkout https://github.com/ngxson/wllama.git "$CHECKOUT_DIR"
git -C "$CHECKOUT_DIR" checkout --detach "$WLLAMA_PIN"
git -C "$CHECKOUT_DIR" submodule update --init --recursive --depth 1

pushd "$CHECKOUT_DIR" >/dev/null
npm ci --include=dev --ignore-scripts --no-audit --no-fund
export D_UID="$(id -u)"
export D_GID="$(id -g)"
npm run build:wasm
npm run build:worker
npm exec -- tsup src/index.ts --format cjs,esm --clean
popd >/dev/null

mkdir -p "$DEST_DIR"
cp "$CHECKOUT_DIR/esm/index.js" "$DEST_DIR/wllama.js"
cp "$CHECKOUT_DIR/src/wasm/wllama.wasm" "$DEST_DIR/wllama.wasm"
cp "$CHECKOUT_DIR/compat/wasm/wllama.wasm" "$DEST_DIR/wllama-compat.wasm"
cp "$CHECKOUT_DIR/compat/wasm/wllama.js" "$DEST_DIR/wllama-compat-module.js"

test -s "$DEST_DIR/wllama.js"
test -s "$DEST_DIR/wllama.wasm"
test -s "$DEST_DIR/wllama-compat.wasm"
test -s "$DEST_DIR/wllama-compat-module.js"
echo "PLaMo 3-compatible wllama $WLLAMA_PIN assembled in $DEST_DIR"
