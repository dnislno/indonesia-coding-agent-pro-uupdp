"""Demo ujung ke ujung: redaksi + consent + audit."""
from pdp_guard import redact, detect, ConsentStore, AuditLog

prompt = "SELECT * FROM pasien WHERE nik='3174051209900001' AND hp='081234567890'"

print("Deteksi:", detect(prompt))
print("Redaksi:", redact(prompt))

consent = ConsentStore(":memory:")
audit = AuditLog(":memory:")

consent.record("pasien-001", "query_data")
print("Consent aktif:", consent.check("pasien-001", "query_data"))
audit.log("dev-01", "process", "pasien-001", "query_data dgn dasar persetujuan")

consent.revoke("pasien-001", "query_data")
print("Setelah tarik:", consent.check("pasien-001", "query_data"))
audit.log("pasien-001", "revoke_consent", "pasien-001", "tarik persetujuan query_data")

print("Audit JSON:")
print(audit.export_json())
print("OK: tidak ada jaringan keluar selama demo.")
