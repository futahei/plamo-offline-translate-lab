#!/usr/bin/env bash
set -euo pipefail

# GitHub PagesにはGGUF分割ファイルをソース管理せず、デプロイ時に生成する。
# 分割してもモデル推論時のメモリ必要量が分割数に比例して減るわけではない。
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

model_source="$work_dir/plamo-3-translate-0.8b-Q4_0.gguf"
output_dir="public/models"
mkdir -p "$output_dir"

curl --fail --location --retry 5 --retry-delay 5 \
  'https://huggingface.co/pfnet/plamo-3-translate-0.8b-GGUF/resolve/main/plamo-3-translate-0.8b-Q4_0.gguf' \
  --output "$model_source"

model_bytes="$(stat -c '%s' "$model_source")"
if (( model_bytes < 400000000 || model_bytes > 650000000 )); then
  echo "Unexpected Q4_0 model size: $model_bytes bytes" >&2
  exit 1
fi
if [[ "$(head -c 4 "$model_source")" != 'GGUF' ]]; then
  echo 'Downloaded model has no GGUF header' >&2
  exit 1
fi

git init -q "$work_dir/llama.cpp"
git -C "$work_dir/llama.cpp" remote add origin https://github.com/ggml-org/llama.cpp.git
git -C "$work_dir/llama.cpp" fetch -q --depth 1 origin d6be065572cdb7bf64014c8c5771e210c9570e44
git -C "$work_dir/llama.cpp" checkout -q FETCH_HEAD

cmake -S "$work_dir/llama.cpp" -B "$work_dir/llama.cpp/build" \
  -DCMAKE_BUILD_TYPE=Release -DLLAMA_BUILD_TESTS=OFF \
  -DLLAMA_BUILD_EXAMPLES=OFF -DLLAMA_BUILD_TOOLS=ON -DGGML_NATIVE=OFF
cmake --build "$work_dir/llama.cpp/build" --target llama-gguf-split --parallel 2

"$work_dir/llama.cpp/build/bin/llama-gguf-split" --split-max-size 80M \
  "$model_source" "$output_dir/plamo-3-translate-0.8b-Q4_0"

node scripts/write-q4-manifest.mjs "$output_dir"

# モデル再配布時に必須のライセンス全文を配布物にも同梱する。
curl --fail --location --retry 5 --retry-delay 5 \
  'https://plamo.preferredai.jp/info/plamo-community-license-en' \
  --output "$output_dir/PLAMO-COMMUNITY-LICENSE.html"
test "$(stat -c '%s' "$output_dir/PLAMO-COMMUNITY-LICENSE.html")" -gt 1000
