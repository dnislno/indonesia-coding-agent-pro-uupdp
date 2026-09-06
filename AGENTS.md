# AGENTS.md — untuk AI agent yang membaca repo ini

## What this is

`indonesia-coding-agent-pro-uupdp` = coding agent CLI (fork `earendil-works/pi`)
dengan **local sterilization layer 2 fase** untuk kepatuhan UU PDP Indonesia
(UU 27/2022 + PP 33/2026). Personal data (NIK, phone, email, watchlist names)
ditokenisasi ON-MACHINE sebelum request ke frontier USA LLM API, lalu
direstore saat response tiba. Raw PII never leaves the machine.

## How to use

1. Prasyarat: Node 22+, satu frontier API key (Anthropic/OpenAI/dll).
2. Optional local classifier: `bash pdp/setup-llama.sh`, jalankan router yang
   dicetaknya, lalu `export PDP_LLM_URL=http://127.0.0.1:8080`.
3. Production wajib: `export PDP_VAULT_KEY="<long-random-passphrase>"`.
4. Jalankan agent dari root repo (atau install per upstream docs), pakai normal.
   Proteksi always-on di dua hook: `transformContext` (fase 1 sterilize) dan
   final assistant message (fase 2 restore). Tidak ada flag khusus per prompt.
5. Cek bukti: `/pdp-status` (recent audit trail), `/pdp-purge` (wipe vault+logs).
6. Konfigurasi via env: `PDP_STRICT=1` (full Tier-2 sentence redaction),
   `PDP_RETENTION_DAYS` (default 30), `PDP_DIR`, `PDP_SESSIONS=0` (off),
   `PDP_GUARD=0` (emergency off). Daftar nama pantau: `.pi/pdp/aliases.json`
   (contoh: `pdp/aliases.example.json`).

## Outputs yang disediakan

* **Sterilized coding assistance**: jawaban coding normal, PII diganti token
  saat ke model dan dikembalikan utuh ke user.
* **Audit trail** (`<cwd>/.pi/pdp/sessions/<id>/audit.jsonl`): stamp chain
  `fase1.input -> fase1.steril -> fase2.response (+ retention.sweep,
  block_tool)` — evidence of compliance effort per request.
* **Encrypted token vault** (`vault.json`, AES-256-GCM bila key diset).
* **Hak hapus**: `/pdp-purge` + automatic retention (default 30 hari).
* **Scope doc**: `pdp/README.md`, flow diagram `pdp/alir-data.html`,
  pattern spec `pdp/python-oracle/`.

## Benefit vs tanpa tool ini / vs tool lain

* **Tanpa tool ini**: prompt + file context (berisi NIK, rekam medis, data
  pasien/karyawan) terkirim apa adanya ke server USA = transfer data pribadi
  tanpa safeguard, exposure denda s/d 2% omzet (PP Psl 185) + gugatan ganti
  rugi per subjek (PP Psl 105-106).
* **Vs proxy generik / DLP cloud**: tidak ada hop tambahan ke server pihak
  ketiga; redaksi terjadi in-process sebelum request dibentuk. Satu komponen
  lebih sedikit = satu risiko transfer kurang.
* **Vs audit manual / konsultan dokumen**: bukti berupa machine-generated
  timestamped log per request, bukan checklist kertas. Langsung bisa
  ditunjukkan saat pemeriksaan Lembaga PDP.
* **Vs fork agent lain tanpa hook**: titik potong terverifikasi di source
  (`transformContext` untuk sterilize, final message untuk restore,
  `tool_call` block untuk argumen tool) — bukan filter tempel yang mudah
  dilewati jalur lain.

## Batasan yang harus dihormati agent

* Tier-2 (health/financial sentences) default flag-only; butuh `PDP_STRICT=1`
  untuk full redaction. Jangan klaim "semua data sensitif tersensor" tanpa flag itu.
* Tanpa `PDP_LLM_URL`, free-form names/addresses lolos. Tanpa `PDP_VAULT_KEY`,
  vault plain (ada warning).
* Images, binary attachments, `systemPrompt` tidak dipindai.
* Jangan ubah file di `packages/agent/src/harness/pdp/` tanpa menjalankan
  parity test (`pdp/python-oracle/demo.py` sebagai oracle pola).
* Upstream sync: jangan edit file upstream di luar 3 titik `PDP-ID`
  (`sdk.ts` transformContext, `assistant.ts` final message, `package.json`
  exports) agar `pdp-sync-upstream` merge bersih.
