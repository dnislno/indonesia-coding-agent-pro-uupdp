# PDP-Guard: mapping pasal ke code. Bukan nasihat hukum.

## UU 27/2022 -> PP 33/2026 -> modul

| Kewajiban | Sumber | Modul |
|---|---|---|
| Jenis data: spesifik vs umum | UU Psl 4; PP Psl 6 | `redactor.py` (klasifikasi pola) |
| Dasar pemrosesan sah + persetujuan | UU Psl 20-22 | `consent.py` (recordConsent, checkConsent) |
| Hak subjek: akses, hapus, tarik persetujuan | UU Psl 8-15 | `consent.py` (revokeConsent), `audit.py` (eraseProof) |
| Kewajiban Pengendali: catat pemrosesan, amankan data | UU Psl 35-40 | `audit.py` (logProcessing) |
| Kegagalan pelindungan + ganti rugi | PP Psl 105-106 | `audit.py` (logBreach, compensation workflow) |
| Sanksi administratif + denda 2% | PP Psl 184-185 | `docs/` export bukti (riwayat patuh menekan denda) |
| Pengaduan ke Lembaga (verifikasi 3 hari) | PP mekanisme pengaduan | `audit.py` export JSON siap serah |

## Prinsip implementasi

1. Redaksi lokal dulu, baru kirim ke model. Vault tidak pernah keluar dari mesin.
2. Setiap pemrosesan wajib punya dasar hukum tercatat (consent/kontrak/kewajiban hukum).
3. Penarikan persetujuan menghentikan pemrosesan lanjutan, log tetap disimpan sebagai bukti.
