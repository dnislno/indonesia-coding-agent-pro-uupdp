# Setup llama.cpp lokal sekali jalan (Windows PowerShell 5.1+).
# Idempoten: lewati yang sudah ada. Mirror dari pdp/setup-llama.sh.
$ErrorActionPreference = "Stop"
$HERE = Split-Path -Parent $MyInvocation.MyCommand.Path
$BUILD = ((Get-Content (Join-Path $HERE "LLAMA_PIN") -TotalCount 1) -replace '\s','')
$ARCH = if ([Environment]::Is64BitOperatingSystem) { "x64" } else { throw "Butuh Windows 64-bit" }
$ASSET = "llama-${BUILD}-bin-win-vulkan-x64.zip"
$BIN_DIR = Join-Path $HERE "llama-bin"
$MODELS_DIR = Join-Path $HOME "models"
New-Item -ItemType Directory -Force -Path $BIN_DIR, $MODELS_DIR | Out-Null

$EXE = Join-Path $BIN_DIR "llama-server.exe"
if (-not (Test-Path $EXE)) {
  $URL = "https://github.com/ggml-org/llama.cpp/releases/download/${BUILD}/${ASSET}"
  Write-Host "-> unduh $ASSET"
  $pkg = Join-Path $BIN_DIR "pkg.zip"
  Invoke-WebRequest -Uri $URL -OutFile $pkg
  Expand-Archive -Path $pkg -DestinationPath $BIN_DIR -Force
  Remove-Item $pkg -Force
} else { Write-Host "-> binary llama sudah ada, lewati" }

$MODEL = Join-Path $MODELS_DIR "qwen2.5-3b-instruct-q4_k_m.gguf"
if (-not (Test-Path $MODEL)) {
  Write-Host "-> unduh model (~2 GB)"
  Invoke-WebRequest -Uri "https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf" -OutFile $MODEL
} else { Write-Host "-> model sudah ada, lewati" }

Write-Host "SELESAI. Router bisa distart dari dashboard (tombol Start LLM lokal)."
