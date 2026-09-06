# Lapisan PDP Indonesia di atas pi (UU 27/2022 + PP 33/2026)

Repo ini = full fork `earendil-works/pi` + PDP layer. Update upstream
di-merge via workflow `pdp-sync-upstream`; PDP code terisolasi agar merge bersih:

* New: `packages/agent/src/harness/pdp/` (patterns, store, fase1, fase2)
* Upstream edits (tagged `PDP-ID`, each <10 lines):
  1. `packages/coding-agent/src/core/sdk.ts` transformContext -> `pdpFase1Sterilize`
  2. `packages/agent/src/harness/execution/assistant.ts` final message -> `pdpFase2Restore`
  3. `packages/agent/package.json` exports += `./harness/pdp`
* Extension `.pi/extensions/pdp-guard.ts`: tool blocker + second net + `/pdp-status` + `/pdp-purge`
* Oracle pola: `pdp/python-oracle/` (spec + parity test)

## Data flow (4 stamps)

```
[INPUT dev] "betulkan query WHERE nik='3174...'"
  |  (1) audit fase1.input {nMessages, text, ts}
  v
[FASE 1 local] regex NIK/phone/email -> token __PDP_NIK_1__ (session vault)
  optional: local LLM via PDP_LLM_URL (llama.cpp router :8080)
  |  (2) audit fase1.steril {hits, tokens, llmUsed, ts}  <- compliance evidence
  v
[STERIL ke frontier USA] "betulkan query WHERE nik='__PDP_NIK_1__'"
  |
  v
[RESPONSE model] "... __PDP_NIK_1__ ..."
  |  (3) audit fase2.response {tokensRestored, ts}
  v  pdpFase2Restore: token -> original value dari vault
[OUTPUT user] "... 3174..." + full log chain
```

Env: `PDP_GUARD=0` (off), `PDP_DIR`, `PDP_LLM_URL` + `PDP_LLM_MODEL`,
`PDP_RETENTION_DAYS` (default 30), `PDP_STRICT=1`, `PDP_VAULT_KEY`,
`PDP_SESSIONS=0` (off). Detail + scope 3 tier + evidence di root `README.md`
dan `AGENTS.md`.

## Binary llama.cpp per OS (pin: `pdp/LLAMA_PIN`)

* Windows x64 tanpa NVIDIA: `llama-<build>-bin-win-vulkan-x64.zip`
* Windows x64 CPU only: `llama-<build>-bin-win-cpu-x64.zip`
* Windows x64 NVIDIA: `llama-<build>-bin-win-cuda-12.4-x64.zip`
* Ubuntu x64: `llama-<build>-bin-ubuntu-x64.tar.gz`
* macOS arm64: `llama-<build>-bin-macos-arm64.tar.gz`

Shortcut: `bash pdp/setup-llama.sh`, lalu jalankan printed router command.
Di pi: `/login llama.cpp`, `/llama`, `/model`.

## Mapping pasal (ringkas, bukan nasihat hukum)

| Kewajiban | Sumber | Implementasi |
|---|---|---|
| Specific vs general data | UU Psl 4; PP Psl 6 | regex NIK/phone/email + SPECIFIC_HINT |
| Minimization | UU Psl 16 | tokenization before send, always on |
| Processing records (RoPA) | UU Psl 35-40 | appendEntry audit per send + audit.jsonl |
| Right to erasure | UU Psl 8-15 | `/pdp-purge` + automatic retention |
| Fine mitigation 2% | PP Psl 184-185 | fase1.steril per request as evidence |
| Consent + withdrawal | UU Psl 20-22; 8-15 | fase berikut (`/pdp-consent`) |
