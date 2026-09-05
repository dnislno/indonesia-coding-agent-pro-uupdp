# indonesia-coding-agent-pro-uupdp

Coding agent yang patuh UU No. 27 Tahun 2022 (PDP) + PP No. 33 Tahun 2026.

**Produk:** PDP-Guard. Lapisan tipis di atas agent coding apa pun (termasuk Hermes).
Prompt + code yang mengandung data pribadi di-masking secara lokal sebelum
dikirim ke model. Persetujuan dicatat. Audit log siap tunjuk ke Lembaga PDP.

## Struktur

```
pdp_guard/      redactor, consent, audit (SQLite lokal, residensi ID)
docs/           mapping pasal UU PDP dan PP 33/2026 ke modul code
examples/       demo ujung ke ujung
```

## Pakai cepat

```bash
pip install -r requirements.txt
python examples/demo.py
```

## Dasar hukum (ringkas, per 6 Sep 2026)

* UU 27/2022 berlaku penuh sejak Okt 2024. PP 33/2026 aturan pelaksanaannya.
* Pasal 184 PP: sanksi administratif (teguran, henti sementara, hapus/musnahkan, denda). Bisa kumulatif.
* Pasal 185 PP: denda maks 2% pendapatan tahunan, ditimbang dari dampak, durasi, jenis data, jumlah subjek, kerja sama, skala usaha, riwayat patuh.
* Pasal 105-106 PP: subjek data bisa minta ganti rugi ke Pengendali Data, kalau ditolak bisa gugat. Pengendali wajib punya mekanisme penanganan.
* Data spesifik (Pasal 6 PP): kesehatan, biometrik, genetika, catatan kejahatan, data anak, keuangan pribadi.

Detail: `docs/MAPPING_PASAL.md`.
