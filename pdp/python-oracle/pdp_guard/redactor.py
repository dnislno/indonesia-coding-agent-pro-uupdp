"""Redaksi PII Indonesia. Murni regex lokal, tanpa jaringan."""
import re

PATTERNS = {
    "NIK": re.compile(r"\b\d{16}\b"),
    "PHONE_ID": re.compile(r"\b(?:\+62|62|0)8\d{8,11}\b"),
    "EMAIL": re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"),
    "KK_16": re.compile(r"\bKK[:\s]*\d{16}\b", re.IGNORECASE),
}

SPECIFIC_HINTS = re.compile(
    r"(diagnosa|rekam medis|penyakit|biometrik|sidik jari|wajah|dna|genetika|"
    r"pidana|kejahatan|anak|rekening|saldo|gaji|pinjaman)",
    re.IGNORECASE,
)


def detect(text):
    found = {}
    for label, rx in PATTERNS.items():
        hits = rx.findall(text)
        if hits:
            found[label] = len(hits)
    if SPECIFIC_HINTS.search(text):
        found["SPECIFIC_HINT"] = True
    return found


def redact(text, token="[REDACTED]"):
    out = text
    for rx in PATTERNS.values():
        out = rx.sub(token, out)
    return out
