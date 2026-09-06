// PDP-ID penyimpanan lokal: vault token + audit JSONL. Tanpa dependensi baru.
// Tidak pernah throw: kegagalan IO dicatat ke stderr, agent tetap jalan.

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeToken } from "./patterns.ts";

export interface VaultEntry {
	label: string;
	value: string;
	ts: number;
}

export function resolvePdpDir(explicit?: string): string {
	const base = explicit ?? process.env["PDP_DIR"] ?? join(process.cwd(), ".pi", "pdp");
	mkdirSync(base, { recursive: true });
	return base;
}

function vaultPath(dir: string): string {
	return join(dir, "vault.json");
}

function auditPath(dir: string): string {
	return join(dir, "audit.jsonl");
}

function readVault(dir: string): { tokens: Record<string, VaultEntry>; seq: Record<string, number> } {
	try {
		if (!existsSync(vaultPath(dir))) return { tokens: {}, seq: {} };
		const raw = JSON.parse(readFileSync(vaultPath(dir), "utf8")) as {
			tokens?: Record<string, VaultEntry>;
			seq?: Record<string, number>;
		};
		return { tokens: raw.tokens ?? {}, seq: raw.seq ?? {} };
	} catch {
		return { tokens: {}, seq: {} };
	}
}

function writeVault(
	dir: string,
	data: { tokens: Record<string, VaultEntry>; seq: Record<string, number> },
): void {
	try {
		writeFileSync(vaultPath(dir), JSON.stringify(data, null, 2));
	} catch (err) {
		console.error(`[pdp] vault write gagal: ${err instanceof Error ? err.message : String(err)}`);
	}
}

/** Simpan nilai asli, kembalikan token. Idempoten per (label, value). */
export function vaultPut(dir: string, label: string, value: string): string {
	const v = readVault(dir);
	for (const [tok, e] of Object.entries(v.tokens)) {
		if (e.label === label && e.value === value) return tok;
	}
	const n = (v.seq[label] ?? 0) + 1;
	v.seq[label] = n;
	const tok = makeToken(label, n);
	v.tokens[tok] = { label, value, ts: Date.now() };
	writeVault(dir, v);
	return tok;
}

/** Kembalikan nilai asli untuk token, atau undefined bila tak dikenal. */
export function vaultGet(dir: string, token: string): string | undefined {
	return readVault(dir).tokens[token]?.value;
}

/** Batas simpan hari (env PDP_RETENTION_DAYS, default 30, 0 = nonaktif). */
export function retentionDays(): number {
	const raw = process.env["PDP_RETENTION_DAYS"];
	if (raw === undefined || raw === "") return 30;
	const n = Number.parseInt(raw, 10);
	return Number.isFinite(n) && n >= 0 ? n : 30;
}

/**
 * Sapu entri vault + baris audit lebih tua dari batas. Kembalikan hitungan.
 * Dipanggil tiap awal fase 1. Audit hasilnya sebagai stempel retention.sweep.
 */
export function pdpRetentionSweep(dir: string): { vaultDropped: number; auditDropped: number; auditKept: number } {
	const zero = { vaultDropped: 0, auditDropped: 0, auditKept: 0 };
	try {
		const days = retentionDays();
		if (days <= 0) return zero;
		const cutoff = Date.now() - days * 86400 * 1000;
		const v = readVault(dir);
		for (const [tok, e] of Object.entries(v.tokens)) {
			if (e.ts < cutoff) {
				delete v.tokens[tok];
				zero.vaultDropped++;
			}
		}
		writeVault(dir, v);
		let kept = 0;
		let dropped = 0;
		try {
			if (existsSync(auditPath(dir))) {
				const lines = readFileSync(auditPath(dir), "utf8").split("\n");
				const fresh = lines.filter((l) => {
					if (!l.trim()) return false;
					try {
						const ts = (JSON.parse(l) as { ts?: number }).ts ?? 0;
						if (ts < cutoff) {
							dropped++;
							return false;
						}
					} catch {
						return true;
					}
					kept++;
					return true;
				});
				writeFileSync(auditPath(dir), `${fresh.join("\n")}${fresh.length > 0 ? "\n" : ""}`);
			}
		} catch {
			/* biarkan */
		}
		zero.auditDropped = dropped;
		zero.auditKept = kept;
		if (zero.vaultDropped > 0 || zero.auditDropped > 0) {
			pdpAudit(dir, "retention.sweep", { ...zero, days });
		}
		return zero;
	} catch {
		return zero;
	}
}
/** Audit append-only satu baris JSON per kejadian. Tidak pernah throw. */
export function pdpAudit(dir: string, stage: string, data: Record<string, unknown>): void {
	try {
		mkdirSync(dir, { recursive: true });
		appendFileSync(auditPath(dir), `${JSON.stringify({ ts: Date.now(), stage, ...data })}\n`);
	} catch (err) {
		console.error(`[pdp] audit gagal: ${err instanceof Error ? err.message : String(err)}`);
	}
}
