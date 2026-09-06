# Lapisan PDP Indonesia di atas pi (UU 27/2022 + PP 33/2026)

Repo ini = full fork `earendil-works/pi` + lapisan PDP. Update upstream
di-merge via workflow `pdp-sync-upstream`; code PDP terisolasi agar merge bersih:

* Baru: `packages/agent/src/harness/pdp/` (patterns, store, fase1, fase2)
* Edit upstream (ditandai `PDP-ID`, masing-masing <5 baris):
  1. `packages/coding-agent/src/core/sdk.ts` transformContext -> `pdpFase1Sterilize`
  2. `packages/agent/src/harness/execution/assistant.ts` pesan final -> `pdpFase2Restore`
  3. `packages/agent/package.json` exports += `./harness/pdp`
* Extension `.pi/extensions/pdp-guard.ts`: jaring kedua + `/pdp-status` + `/pdp-purge`
* Oracle pola: `pdp/python-oracle/` (spec + test paritas)

## Alir data (4 stempel)

```
[INPUT dev] "betulkan query WHERE nik='3174...'"
  |  (1) audit fase1.input {nMessages, teks, ts}
  v
[FASE 1 lokal] regex NIK/HP/email -> token __PDP_NIK_1__ (vault .pi/pdp/vault.json)
  opsional: LLM lokal via PDP_LLM_URL (llama.cpp router :8080) untuk nama/alamat
  |  (2) audit fase1.steril {hits, tokens, llmUsed, ts}  <- bukti patuh
  v
[STERIL ke frontier USA] "betulkan query WHERE nik='__PDP_NIK_1__'"
  |
  v
[RESPONS model] "... __PDP_NIK_1__ ..."
  |  (3) audit fase2.response {tokensRestored, ts}
  v  pdpFase2Restore: token -> nilai asli dari vault
[OUTPUT user] "... 3174..." + log lengkap
```

Env:

* `PDP_GUARD=0` matikan lapisan (darurat/test)
* `PDP_DIR` pindah vault+log (default `<cwd>/.pi/pdp`)
* `PDP_LLM_URL=http://127.0.0.1:8080` aktifkan klasifier lokal
* `PDP_LLM_MODEL` nama model di router (default `local-pii-8b`)

## Binary llama.cpp per OS (pin: `pdp/LLAMA_PIN`)

* Windows x64 tanpa NVIDIA: `llama-<build>-bin-win-vulkan-x64.zip`
* Windows x64 CPU saja: `llama-<build>-bin-win-cpu-x64.zip`
* Windows x64 NVIDIA: `llama-<build>-bin-win-cuda-12.4-x64.zip`
* Ubuntu x64: `llama-<build>-bin-ubuntu-x64.tar.gz`
* macOS arm64: `llama-<build>-bin-macos-arm64.tar.gz`

Router:

```bash
llama-server --models-dir ~/models --no-models-autoload --jinja \
  --host 127.0.0.1 --port 8080 -ngl 999 -c 32768
```

## Mapping pasal (ringkas)

| Kewajiban | Sumber | Implementasi |
|---|---|---|
| Data spesifik vs umum | UU Psl 4; PP Psl 6 | regex + SPECIFIC_HINT + LLM lokal |
| Minimisasi | UU Psl 16 | tokenisasi sebelum kirim, selalu on |
| Catat pemrosesan (RoPA) | UU Psl 35-40 | audit.jsonl 4 stempel + session JSONL |
| Hak hapus | UU Psl 8-15 | `/pdp-purge` |
| Bukti menekan denda 2% | PP Psl 184-185 | fase1.steril per kiriman |

## Batas jujur v1.1

* Filter LLM bisa lolos: log simpan diff sebagai bukti usaha, bukan sempurna.
* Vault `vault.json` plain: enkripsi (AES) = fase berikut untuk produksi.
* `process.cwd()` dipakai sebagai direktori vault bila core tak tahu cwd proyek.
