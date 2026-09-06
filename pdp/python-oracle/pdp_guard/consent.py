"""Catatan persetujuan. SQLite lokal (residensi ID)."""
import sqlite3
import time


class ConsentStore:
    def __init__(self, path="consent.db"):
        self.db = sqlite3.connect(path)
        self.db.execute(
            "CREATE TABLE IF NOT EXISTS consent("
            "subject TEXT, purpose TEXT, basis TEXT, ts REAL, revoked REAL DEFAULT 0,"
            "PRIMARY KEY(subject, purpose))"
        )
        self.db.commit()

    def record(self, subject, purpose, basis="persetujuan"):
        self.db.execute(
            "INSERT OR REPLACE INTO consent(subject,purpose,basis,ts,revoked)"
            " VALUES(?,?,?,?,0)",
            (subject, purpose, basis, time.time()),
        )
        self.db.commit()

    def check(self, subject, purpose):
        row = self.db.execute(
            "SELECT revoked FROM consent WHERE subject=? AND purpose=?",
            (subject, purpose),
        ).fetchone()
        return row is not None and row[0] == 0

    def revoke(self, subject, purpose):
        self.db.execute(
            "UPDATE consent SET revoked=? WHERE subject=? AND purpose=?",
            (time.time(), subject, purpose),
        )
        self.db.commit()
