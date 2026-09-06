# indonesia-coding-agent-pro-uupdp

Coding agent yang patuh **UU No. 27 Tahun 2022 (PDP) + PP No. 33 Tahun 2026**.
Ini full fork [earendil-works/pi](https://github.com/earendil-works/pi) dengan
satu tambahan: **local sterilization layer 2 fase**. Personal data
ditokenisasi di mesin sendiri sebelum request ke frontier USA LLM API,
lalu dikembalikan utuh saat response tiba.

## How it works (30 detik)

```
INPUT dev:  "betulkan query WHERE nik='3174051209900001'"
   |  stamp 1: fase1.input (full text + timestamp -> audit.jsonl)
   v
FASE 1 (local): NIK/HP/email -> __PDP_NIK_1__ (session vault di
<cwd>/.pi/pdp/sessions/<id>/vault.json, isolated per session)
   |  stamp 2: fase1.steril (hits + timestamp -> audit.jsonl) = compliance evidence
   v
yang terkirim ke frontier USA: "betulkan query WHERE nik='__PDP_NIK_1__'"
   |
   v
model response (masih bertoken)
   |  stamp 3: fase2.response (tokensRestored + timestamp)
   v
OUTPUT user: "Query WHERE nik='3174051209900001' sudah benar"
```

Intinya satu kalimat: **raw data tidak pernah keluar mesin; yang keluar hanya token.**

## Input, process, output

| Stage | Input | Process (lokasi) | Output |
|---|---|---|---|
| Fase 1a | Raw prompt + file context | `pdpFase1Sterilize` via `transformContext` di `sdk.ts`; retention sweep; audit `fase1.input` | Logged text + timestamp |
| Fase 1b | Logged text | Alias watchlist -> NIK separator -> regex NIK/phone/email -> token vault; optional local LLM via `PDP_LLM_URL` (llama.cpp `:8080`) untuk name/address; audit `fase1.steril` | Sterilized messages + hit report |
| Fase 2 | Sterilized messages | Frontier provider USA seperti biasa | Tokenized response |
| Fase 2b | Tokenized response | `pdpFase2Restore` di `assistant.ts`; token -> original value dari vault; audit `fase2.response` | Full answer ke user |
| Guard | Model tool arguments | Event `tool_call` di extension: pola PII = execution ditolak + audit `block_tool` | Tool berbahaya tidak jalan |

## Data apa yang wajib steril (Pasal 4 UU 27/2022, verified verbatim)

**Specific** (high risk, Psl 4 ayat 2): health data and information;
biometric; genetic; criminal records; children data; personal financial data;
other data per regulation.

**General** (Psl 4 ayat 3): full name; gender; nationality; religion;
marital status; combined data identifying a person. NIK, phone number,
dan email masuk lewat huruf f (standard interpretation: single/combined
identifier). Label interpretasi ini eksplisit agar tidak dikira bunyi pasal.

## Scope aplikasi: 3 tier, tegas

**Tier 1 — auto-tokenized (never leaves the machine):** NIK 16 digit
(rapat maupun spaced/dash/dot), Indonesian phone number, email, plus
project watchlist (`.pi/pdp/aliases.json`, contoh di
`pdp/aliases.example.json`). Always on, no LLM needed. Other names/addresses
menyusul otomatis bila `PDP_LLM_URL` diset (local classifier).

**Tier 2 — flagged, redaction optional:** health, biometric, genetic,
criminal records, children, financial. Default: trigger words (`diagnosa`,
`rekening`, `gaji`...) dicatat sebagai `SPECIFIC_HINT`. Set `PDP_STRICT=1`
agar trigger sentence ditokenisasi utuh (`__PDP_SENSITIVE_n__`, original di
vault) — untuk klinik/RS.

**Tier 3 — out of scope, tidak disentuh:** gender, nationality, religion,
marital status (low risk, merusak answer quality bila disensor);
binary images/attachments; `systemPrompt`.

Di luar 3 tier = bukan janji aplikasi ini.

## Bukti implementasi (evidence)

Setiap request meninggalkan stamp chain di `sessions/<id>/audit.jsonl`:

```json
{"ts":1788651011.89,"stage":"fase1.input","nMessages":2,"text":"..."}
{"ts":1788651011.90,"stage":"fase1.steril","report":{"hits":{"NIK":1},"tokens":1,"llmUsed":false}}
{"ts":1788651012.41,"stage":"fase2.response","tokensRestored":1}
{"ts":1788690000.00,"stage":"retention.sweep","vaultDropped":3,"auditDropped":12,"auditKept":40,"days":30}
```

Plus: `vault.json` (encrypted token map, satu-satunya tempat original value),
`/pdp-purge` (wipe vault + log = hak hapus Psl 8-15), dan automatic retention:

| Data | Default | Atur | Mati |
|---|---|---|---|
| Vault tokens | 30 hari | `PDP_RETENTION_DAYS=N` | `=0` |
| Audit rows | 30 hari | sama | sama |

Sweep jalan tiap awal fase 1 dan mengaudit dirinya sendiri
(`retention.sweep`). Ini menjawab Psl 35-40 (security + record keeping)
dan menjadi mitigating evidence untuk denda Psl 184-185: every byte sent
out dapat ditelusur ke stamp-nya.

## Instalasi

Cara cepat: `bash pdp/setup-llama.sh` (Windows git-bash, Linux, macOS) —
download binary sesuai OS + model Qwen2.5-3B, lalu print router command.
Atau manual:

1. Ambil binary llama.cpp sesuai OS (pinned build: `pdp/LLAMA_PIN`):
   * Windows x64 tanpa NVIDIA: `llama-<build>-bin-win-vulkan-x64.zip`
   * Windows x64 CPU only: `llama-<build>-bin-win-cpu-x64.zip`
   * Windows x64 NVIDIA: `llama-<build>-bin-win-cuda-12.4-x64.zip`
   * Ubuntu x64: `llama-<build>-bin-ubuntu-x64.tar.gz`
   * macOS arm64: `llama-<build>-bin-macos-arm64.tar.gz`
2. Jalankan local router:
   ```bash
   llama-server --models-dir ~/models --no-models-autoload --jinja \
     --host 127.0.0.1 --port 8080 -ngl 999 -c 32768
   ```
3. Jalankan agent, lalu di dalamnya: `/login llama.cpp`, `/llama` (download/load
   model), `/model` (pilih model). Tanpa `PDP_LLM_URL`, regex filter tetap jalan.
4. Untuk production: `export PDP_VAULT_KEY="frasa-rahasia-panjang" PDP_LLM_URL=http://127.0.0.1:8080`

Environment variables:

* `PDP_GUARD=0` disable layer (emergency/test)
* `PDP_DIR` pindah vault + log (default `<cwd>/.pi/pdp`)
* `PDP_LLM_URL=http://127.0.0.1:8080` enable local classifier
* `PDP_LLM_MODEL` model name di router (default `local-pii-8b`)
* `PDP_RETENTION_DAYS` retention hari vault + audit (default `30`, `0` = off)
* `PDP_STRICT=1` full sentence redaction Tier 2 (default `0` = flag only)
* `PDP_VAULT_KEY` encryption passphrase vault AES-256-GCM (wajib production)
* `PDP_SESSIONS=0` disable per-session vault isolation (default on)

In-agent commands: `/pdp-status` (recent audit across sessions), `/pdp-purge`
(wipe vault + log = hak hapus UU PDP).

Visual diagram: buka `pdp/alir-data.html`.

## Struktur repo (mana milik siapa)

Baru milik produk:

* `packages/agent/src/harness/pdp/` — `patterns.ts`, `store.ts` (AES vault + audit +
  retention + sessions), `fase1.ts`, `fase2.ts`, `index.ts`
* `.pi/extensions/pdp-guard.ts` — tool argument blocker + second net +
  `/pdp-status` + `/pdp-purge`
* `pdp/` — docs, `LLAMA_PIN`, `setup-llama.sh`, `aliases.example.json`,
  `alir-data.html`, `python-oracle/` (pattern spec + parity test)

Edit file upstream, masing-masing ditandai `PDP-ID` (<10 baris):

1. `packages/coding-agent/src/core/sdk.ts` — `transformContext` memanggil fase 1
2. `packages/agent/src/harness/execution/assistant.ts` — final message lewat fase 2
3. `packages/agent/package.json` — exports += `./harness/pdp`

Sisanya 100% upstream.

## Update upstream

* `pdp-sync-upstream` (daily): merge `earendil-works/pi` `main` ke sini.
  Konflik hanya mungkin di 3 file edit di atas; selebihnya clean merge.
* `pdp-bump-llama` (daily): new llama.cpp build pin dibuka sebagai PR.

## Batasan (baca sebelum klaim patuh)

1. Tier 2 default flag only; full redaction butuh `PDP_STRICT=1`.
2. Filter bisa miss: alias names, typo NIK. Spaced/dashed NIK dan
   watchlist covered sejak P1.
3. Vault encrypted hanya bila `PDP_VAULT_KEY` diset; tanpa key = plain +
   warning. Wajib set untuk production.
4. Tool arguments berpola PII hard-blocked (`tool_call` block). Covered sejak P0.
5. Images, binary files, dan `systemPrompt` tidak dipindai.
6. Vault isolated per session (`sessions/<id>/`, default on).
   Multi-process satu sesi OS masih share via `PDP_ACTIVE_DIR`.
7. Tanpa `PDP_LLM_URL`, free-form names/addresses lolos.

## Dasar hukum (ringkas, per Sep 2026)

* UU 27/2022 full enforcement Okt 2024; PP 33/2026 aturan pelaksanaannya.
* PP Psl 184: administrative sanctions (teguran, suspend, delete/destroy, fine).
* PP Psl 185: fine up to 2% annual revenue (ditimbang impact, duration, data type,
  subject count, cooperation, business scale, compliance history).
* PP Psl 105-106: data subject bisa claim compensation, ditolak = bisa gugat.
* Layer ini menjawab: minimization (Psl 16), specific data (Psl 4/PP Psl 6),
  processing records (Psl 35-40), right to erasure (Psl 8-15).

## Atribusi

Upstream: [earendil-works/pi](https://github.com/earendil-works/pi) (MIT).
Dokumentasi asli tiap paket tetap di `packages/*/README.md`.
Untuk AI agent yang membaca repo ini: lihat `AGENTS.md`.
