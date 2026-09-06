#!/usr/bin/env bash
# Setup llama.cpp lokal sekali jalan (Windows git-bash, Linux, macOS).
# Ambil: binary sesuai OS + model kecil Qwen2.5-3B Q4_K_M (~2 GB).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
BUILD="$(head -1 "$HERE/LLAMA_PIN" | tr -d ' \r\n')"
OS="$(uname -s)"; ARCH="$(uname -m)"
ASSET=""
case "$OS-$ARCH" in
  MINGW*|MSYS*|CYGWIN*-*|Windows_NT-*) ASSET="llama-${BUILD}-bin-win-vulkan-x64.zip" ;;
  Linux-x86_64)  ASSET="llama-${BUILD}-bin-ubuntu-x64.tar.gz" ;;
  Linux-aarch64) ASSET="llama-${BUILD}-bin-ubuntu-arm64.tar.gz" ;;
  Darwin-arm64)  ASSET="llama-${BUILD}-bin-macos-arm64.tar.gz" ;;
  Darwin-x86_64) ASSET="llama-${BUILD}-bin-macos-x64.tar.gz" ;;
  *) echo "OS/arsitektur tak dikenal: $OS-$ARCH"; exit 1 ;;
esac
mkdir -p "$HERE/llama-bin" "$HOME/models"
URL="https://github.com/ggml-org/llama.cpp/releases/download/${BUILD}/${ASSET}"
echo "-> unduh $ASSET"
curl -sSL --retry 3 -o "$HERE/llama-bin/pkg" "$URL"
case "$ASSET" in
  *.zip)
    if command -v unzip >/dev/null 2>&1; then
      (cd "$HERE/llama-bin" && unzip -o -q pkg)
    else
      # Git-bash Windows tanpa unzip: bsdtar bisa buka zip.
      tar -xf "$HERE/llama-bin/pkg" -C "$HERE/llama-bin"
    fi ;;
  *.tar.gz) tar -xzf "$HERE/llama-bin/pkg" -C "$HERE/llama-bin" ;;
esac
rm -f "$HERE/llama-bin/pkg"
MODEL_URL="https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf"
if [ ! -f "$HOME/models/qwen2.5-3b-instruct-q4_k_m.gguf" ]; then
  echo "-> unduh model (~2 GB)"
  curl -sSL -o "$HOME/models/qwen2.5-3b-instruct-q4_k_m.gguf" "$MODEL_URL"
fi
BIN="$HERE/llama-bin/llama-server"
[ -x "$HERE/llama-bin/llama-server.exe" ] && BIN="$HERE/llama-bin/llama-server.exe"
echo "SELESAI. Jalankan router:"
echo "  $BIN --models-dir $HOME/models --no-models-autoload --jinja --host 127.0.0.1 --port 8080 -ngl 999 -c 32768"
echo "Lalu di pi: /login llama.cpp  ->  /llama  ->  /model"
echo "Aktifkan klasifier PDP: export PDP_LLM_URL=http://127.0.0.1:8080 PDP_LLM_MODEL=qwen2.5-3b-instruct-q4_k_m"
