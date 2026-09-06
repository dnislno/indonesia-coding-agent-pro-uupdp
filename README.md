# indonesia-coding-agent-pro-uupdp

Coding agent yang patuh **UU No. 27 Tahun 2022 (PDP) + PP No. 33 Tahun 2026**.
Full fork [earendil-works/pi](https://github.com/earendil-works/pi) ditambah
lapisan sterilisasi lokal 2 fase: data pribadi ditokenisasi di mesin sendiri
sebelum ke API frontier USA, dikembalikan utuh saat respons tiba.

## Cara kerja (30 detik)

```
INPUT dev:  "betulkan query WHERE nik='3174051209900001'"
   |  stempel 1: fase1.input (teks + timestamp -> audit.jsonl)
   v
FASE 1 (lokal): NIK/HP/email -> __PDP_NIK_1__ (vault sesi
<cwd>/.pi/pdp/sessions/<id>/vault.json, terisolasi per sesi)
   |  stempel 2: fase1.steril (hits + timestamp -> audit.jsonl) = bukti patuh
   v
yang dikirim ke frontier USA: "betulkan query WHERE nik='__PDP_NIK_1__'"
   |
   v
respons model (masih bertoken)
   |  stempel 3: fase2.response (tokensRestored + timestamp)
   v
OUTPUT user: "Query WHERE nik='3174051209900001' sudah benar"
```

Satu kalimat: **data asli tidak pernah keluar mesin; yang keluar hanya token.**

## Input, proses, output

| Tahap | Input | Proses (di mana) | Output |
|---|---|---|---|
| Fase 1a | Prompt + konteks file mentah | `pdpFase1Sterilize` via `transformContext` di `sdk.ts`; sapu retensi; audit `fase1.input` | Teks tercatat + timestamp |
| Fase 1b | Teks tercatat | Alias pantau -> NIK bersparator -> regex NIK/HP/email -> token vault; opsional LLM lokal via `PDP_LLM_URL` (llama.cpp `:8080`) untuk nama/alamat; audit `fase1.steril` | Pesan steril + laporan hits |
| Fase 2 | Pesan steril | Provider frontier USA seperti biasa | Respons bertoken |
| Fase 2b | Respons bertoken | `pdpFase2Restore` di `assistant.ts`; token -> nilai asli dari vault; audit `fase2.response` | Jawaban utuh ke user |
| Pengaman | Argumen tool model | Event `tool_call` di extension: pola PII = eksekusi ditolak + audit `block_tool` | Tool berbahaya tidak jalan |

## Data apa yang wajib steril (Pasal 4 UU 27/2022, terverifikasi verbatim)

**Spesifik** (risiko tinggi, Psl 4 ayat 2): data dan informasi kesehatan;
biometrik; genetika; catatan kejahatan; data anak; keuangan pribadi;
data lainnya menurut peraturan.

**Umum** (Psl 4 ayat 3): nama lengkap; jenis kelamin; kewarganegaraan; agama;
status perkawinan; data yang dikombinasikan untuk mengidentifikasi seseorang.
NIK, nomor HP, dan email masuk lewat huruf f ini (interpretasi standar:
identifier tunggal/kombinasi yang mengidentifikasi).

## Scope aplikasi: 3 tier, tegas

**Tier 1 — ditokenisasi otomatis (tidak pernah keluar):** NIK 16 digit
(rapat maupun berspasi/strip/titik), nomor HP Indonesia, email, plus
daftar pantau proyek (`.pi/pdp/aliases.json`, contoh di
`pdp/aliases.example.json`). Aktif selalu, tanpa LLM. Nama orang dan alamat
lain menyusul otomatis bila `PDP_LLM_URL` diset (klasifier lokal).

**Tier 2 — ditandai, sensor opsional:** kesehatan, biometrik, genetika,
catatan kejahatan, data anak, keuangan pribadi. Default: kata pemicu
(`diagnosa`, `rekening`, `gaji`...) dicatat sebagai `SPECIFIC_HINT`.
Aktifkan `PDP_STRICT=1` agar kalimat berpemicu ditokenisasi utuh
(`__PDP_SENSITIVE_n__`, aslinya di vault) — untuk klinik/RS.

**Tier 3 — di luar scope, tidak disentuh:** jenis kelamin, kewarganegaraan,
agama, status perkawinan (risiko rendah, merusak jawaban bila disensor);
gambar/lampiran biner; `systemPrompt`.

Di luar 3 tier di atas = bukan janji aplikasi ini.

## Bukti implementasi maksimal (evidence)

Setiap kiriman meninggalkan rantai stempel di `sessions/<id>/audit.jsonl`:

```json
{"ts":1788651011.89,"stage":"fase1.input","nMessages":2,"text":"..."}
{"ts":1788651011.90,"stage":"fase1.steril","report":{"hits":{"NIK":1},"tokens":1,"llmUsed":false}}
{"ts":1788651012.41,"stage":"fase2.response","tokensRestored":1}
{"ts":1788690000.00,"stage":"retention.sweep","vaultDropped":3,"auditDropped":12,"auditKept":40,"days":30}
```

Ditambah: `vault.json` (peta token terenkripsi, satu-satunya tempat nilai asli),
`/pdp-purge` (hapus vault + log = hak hapus Psl 8-15), dan retensi otomatis:

| Data | Default | Atur | Mati |
|---|---|---|---|
| Vault token | 30 hari | `PDP_RETENTION_DAYS=N` | `=0` |
| Baris audit | 30 hari | sama | sama |

Sapu jalan tiap awal fase 1 dan mengaudit dirinya sendiri
(`retention.sweep`). Ini jawaban atas Psl 35-40 (keamanan + pencatatan)
dan bahan penekan denda Psl 184-185: tiap byte yang keluar bisa ditelusur
ke stempelnya.

## Instalasi

Cara cepat: `bash pdp/setup-llama.sh` (Windows git-bash, Linux, macOS) —
mengunduh binary sesuai OS + model Qwen2.5-3B dan mencetak perintah router.
Atau manual:

1. Ambil binary llama.cpp sesuai OS (pin saat ini: `pdp/LLAMA_PIN`):
   * Windows x64 tanpa NVIDIA: `llama-<build>-bin-win-vulkan-x64.zip`
   * Windows x64 CPU saja: `llama-<build>-bin-win-cpu-x64.zip`
   * Windows x64 NVIDIA: `llama-<build>-bin-win-cuda-12.4-x64.zip`
   * Ubuntu x64: `llama-<build>-bin-ubuntu-x64.tar.gz`
   * macOS arm64: `llama-<build>-bin-macos-arm64.tar.gz`
2. Jalankan router lokal:
   ```bash
   llama-server --models-dir ~/models --no-models-autoload --jinja \
     --host 127.0.0.1 --port 8080 -ngl 999 -c 32768
   ```
3. Jalankan agent, lalu di dalamnya: `/login llama.cpp`, `/llama` (unduh/muat model),
   `/model` (pilih model). Tanpa `PDP_LLM_URL`, filter regex tetap jalan.
4. Produksi: `export PDP_VAULT_KEY="frasa-rahasia-panjang" PDP_LLM_URL=http://127.0.0.1:8080`

Env lengkap:

* `PDP_GUARD=0` matikan lapisan (darurat/test)
* `PDP_DIR` pindah vault + log (default `<cwd>/.pi/pdp`)
* `PDP_LLM_URL=http://127.0.0.1:8080` aktifkan klasifier lokal
* `PDP_LLM_MODEL` nama model di router (default `local-pii-8b`)
* `PDP_RETENTION_DAYS` batas simpan vault + audit hari (default `30`, `0` = nonaktif)
* `PDP_STRICT=1` tokenisasi kalimat Tier 2 utuh (default `0` = hanya tandai)
* `PDP_VAULT_KEY` frasa kunci enkripsi vault AES-256-GCM (wajib produksi)
* `PDP_SESSIONS=0` nonaktifkan isolasi vault per sesi (default aktif)

Perintah dalam agent: `/pdp-status` (audit terakhir semua sesi), `/pdp-purge`
(hapus vault + log = hak hapus UU PDP).

Diagram visual: buka `pdp/alir-data.html`.

## Struktur repo (mana milik siapa)

Baru milik produk:

* `packages/agent/src/harness/pdp/` — `patterns.ts`, `store.ts` (vault AES + audit +
  retensi + sesi), `fase1.ts`, `fase2.ts`, `index.ts`
* `.pi/extensions/pdp-guard.ts` — blokir argumen tool + jaring kedua +
  `/pdp-status` + `/pdp-purge`
* `pdp/` — docs, `LLAMA_PIN`, `setup-llama.sh`, `aliases.example.json`,
  `alir-data.html`, `python-oracle/` (spesifikasi pola + test paritas)

Edit file upstream, masing-masing ditandai `PDP-ID` (<10 baris):

1. `packages/coding-agent/src/core/sdk.ts` — `transformContext` memanggil fase 1
2. `packages/agent/src/harness/execution/assistant.ts` — pesan final lewat fase 2
3. `packages/agent/package.json` — exports += `./harness/pdp`

Sisanya 100% upstream.

## Update upstream

* `pdp-sync-upstream` (harian): merge `earendil-works/pi` `main` ke sini.
  Konflik hanya mungkin di 3 file edit di atas; selebihnya merge bersih.
* `pdp-bump-llama` (harian): pin build llama.cpp baru dibuka sebagai PR.

## Batasan (dibaca sebelum klaim patuh)

1. Tier 2 default hanya ditandai; sensor penuh butuh `PDP_STRICT=1`.
2. Filter bisa lolos: nama samaran, typo NIK. NIK berspasi/strip dan
   daftar pantau tertutup sejak P1.
3. Vault terenkripsi hanya bila `PDP_VAULT_KEY` diset; tanpa kunci = plain +
   peringatan. Wajib set untuk produksi.
4. Argumen tool berpola PII ditolak mentah (`tool_call` block). Tertutup sejak P0.
5. Gambar, file biner, dan `systemPrompt` tidak dipindai.
6. Vault terisolasi per sesi (`sessions/<id>/`, default aktif).
   Multi-proses satu sesi OS berbagi via `PDP_ACTIVE_DIR`.
7. Tanpa `PDP_LLM_URL`, nama/alamat bebas pola lolos.

## Dasar hukum (ringkas, per Sep 2026)

* UU 27/2022 berlaku penuh Okt 2024; PP 33/2026 aturan pelaksanaannya.
* PP Psl 184: sanksi administratif (teguran, henti sementara, hapus/musnahkan, denda).
* PP Psl 185: denda maks 2% pendapatan tahunan (ditimbang dampak, durasi, jenis data,
  jumlah subjek, kerja sama, skala usaha, riwayat patuh).
* PP Psl 105-106: subjek data bisa minta ganti rugi, ditolak = bisa gugat.
* Lapisan ini menjawab: minimisasi (Psl 16), data spesifik (Psl 4/PP Psl 6),
  pencatatan pemrosesan (Psl 35-40), hak hapus (Psl 8-15).

## Atribusi

Upstream: [earendil-works/pi](https://github.com/earendil-works/pi) (MIT).
Dokumentasi asli tiap paket tetap di `packages/*/README.md`.
