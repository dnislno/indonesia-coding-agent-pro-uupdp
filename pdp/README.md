# Lapisan PDP Indonesia di atas pi (UU 27/2022 + PP 33/2026)

Repo ini = fork `earendil-works/pi` + lapisan PDP di folder `pdp/` dan
`.pi/extensions/pdp-guard.ts`. Upstream tetap bisa di-sync otomatis
(workflow `pdp-sync-upstream`), binary llama.cpp dipin di `pdp/LLAMA_PIN`
dan di-bump otomatis (workflow `pdp-bump-llama`).

## Arsitektur

```
prompt dev (mungkin ada NIK/HP/email)
  -> pi extension pdp-guard (before_provider_request, regex lokal)
  -> payload steril -> provider frontier USA
  -> audit appendEntry("pdp-guard") per pengiriman
```

Fase 2: klasifier LLM lokal via llama.cpp router (`http://127.0.0.1:8080`)
sebelum regex, untuk data yang tidak berpola (nama dalam kalimat bebas).

## Binary llama.cpp per OS (build lihat LLAMA_PIN)

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

Lalu di pi: `/login llama.cpp`, `/llama`, `/model`.

## Mapping pasal (ringkas)

| Kewajiban | Sumber | Implementasi |
|---|---|---|
| Data spesifik vs umum | UU Psl 4; PP Psl 6 | regex NIK/HP/email + SPECIFIC_HINT |
| Minimisasi, kirim seperlunya | UU Psl 16 | redaksi sebelum kirim (selalu on) |
| Catat pemrosesan (RoPA) | UU Psl 35-40 | appendEntry audit per kiriman |
| Bukti patuh menekan denda 2% | PP Psl 184-185 | export session JSONL |
| Persetujuan + tarik persetujuan | UU Psl 20-22; 8-15 | fase 2 (`/pdp-consent`) |
