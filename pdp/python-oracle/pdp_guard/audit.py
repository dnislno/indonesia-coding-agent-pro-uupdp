"""Audit log pemrosesan. Satu baris per kejadian, export JSON."""
import json
import sqlite3
import time


class AuditLog:
    def __init__(self, path="audit.db"):
        self.db = sqlite3.connect(path)
        self.db.execute(
            "CREATE TABLE IF NOT EXISTS audit("
            "id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL, actor TEXT,"
            " action TEXT, subject TEXT, detail TEXT)"
        )
        self.db.commit()

    def log(self, actor, action, subject="-", detail="-"):
        self.db.execute(
            "INSERT INTO audit(ts,actor,action,subject,detail) VALUES(?,?,?,?,?)",
            (time.time(), actor, action, subject, detail),
        )
        self.db.commit()

    def export_json(self):
        rows = self.db.execute(
            "SELECT ts,actor,action,subject,detail FROM audit ORDER BY id"
        ).fetchall()
        return json.dumps(
            [
                {"ts": t, "actor": a, "action": c, "subject": s, "detail": d}
                for t, a, c, s, d in rows
            ],
            indent=2,
        )
