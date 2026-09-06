// PDP-ID local storage: token vault + audit JSONL. Zero new dependencies.
// Never throws: IO failure logged to stderr, agent keeps running.

import { appendFileSync, existsSync, mkdirSync, readFileSync, rmdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createDecipheriv, createCipheriv, randomBytes, scryptSync } from "node:crypto";
import { makeToken } from "./patterns.ts";

export interface VaultEntry {
	label: string;
	value: StoredValue;
	ts: number;
}

/**
 * Vault encryption (AES-256-GCM). Key dari env PDP_VAULT_KEY (free passphrase,
 * derived via scrypt). Tanpa env = plaintext + one-time warning per process.
 */
type StoredValue = string | { v: 1; iv: string; ct: string };

let warnedPlain = false;

// Cache turunan kunci per nilai env (scrypt ~puluhan ms; jangan per token).
let cachedKeyFor: string | null = null;
let cachedKey: Buffer | null = null;

function vaultKey(): Buffer | null {
	const k = process.env["PDP_VAULT_KEY"];
	if (!k) return null;
	if (cachedKeyFor !== k) {
		cachedKeyFor = k;
		cachedKey = scryptSync(k, "pdp-id-v1", 32);
	}
	return cachedKey;
}

function seal(plain: string): StoredValue {
	const key = vaultKey();
	if (!key) {
		if (!warnedPlain) {
			warnedPlain = true;
			console.error("[pdp] PDP_VAULT_KEY empty: vault stored in plaintext. Set it for production.");
		}
		return plain;
	}
	const iv = randomBytes(12);
	const c = createCipheriv("aes-256-gcm", key, iv);
	const ct = Buffer.concat([c.update(plain, "utf8"), c.final(), c.getAuthTag()]);
	return { v: 1, iv: iv.toString("base64"), ct: ct.toString("base64") };
}

function open(stored: StoredValue): string | undefined {
	if (typeof stored === "string") return stored;
	try {
		const key = vaultKey();
		if (!key || stored.v !== 1) return undefined;
		const iv = Buffer.from(stored.iv, "base64");
		const raw = Buffer.from(stored.ct, "base64");
		const tag = raw.subarray(raw.length - 16);
		const data = raw.subarray(0, raw.length - 16);
		const d = createDecipheriv("aes-256-gcm", key, iv);
		d.setAuthTag(tag);
		return Buffer.concat([d.update(data), d.final()]).toString("utf8");
	} catch {
		return undefined;
	}
}

export function resolvePdpDir(explicit?: string): string {
	const base = explicit ?? process.env["PDP_DIR"] ?? join(process.cwd(), ".pi", "pdp");
	mkdirSync(base, { recursive: true });
	return base;
}

function vaultPath(dir: string): string {
	return join(dir, "vault.json");
}

/**
 * Mutex antar-proses via direktori lock (mkdir atomik). Referensi pola:
 * proper-lockfile (npm, 30M+/minggu): lockfile + stale detection + retry.
 * Di sini tanpa dependensi baru: stale >10 dtk direbut, timeout 2 dtk melempar
 * agar penelepon fail-closed (jangan tulis parsial).
 */
function withVaultLock<T>(dir: string, fn: () => T): T {
	mkdirSync(dir, { recursive: true });
	const lock = join(dir, ".vault.lock");
	const deadline = Date.now() + 2000;
	for (;;) {
		try {
			mkdirSync(lock);
			break;
		} catch {
			let stale = false;
			try {
				stale = Date.now() - statSync(lock).mtimeMs > 10000;
			} catch {
				stale = false;
			}
			if (stale) {
				try {
					rmdirSync(lock);
				} catch {
					/* coba lagi */
				}
				continue;
			}
			if (Date.now() > deadline) throw new Error("vault terkunci (concurrent write timeout)");
			Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
		}
	}
	try {
		return fn();
	} finally {
		try {
			rmdirSync(lock);
		} catch {
			/* abaikan */
		}
	}
}

/**
 * Isolasi sesi: vault+audit tiap sesi di <base>/sessions/<id>/.
 * Default AKTIF (PDP_SESSIONS=0 menonaktifkan). ID disanitasi.
 */
export function resolveSessionDir(base: string, sessionId?: string): string {
	if (process.env["PDP_SESSIONS"] === "0" || !sessionId) return base;
	const safe = sessionId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64) || "default";
	const d = join(base, "sessions", safe);
	mkdirSync(d, { recursive: true });
	return d;
}

function auditPath(dir: string): string {
	return join(dir, "audit.jsonl");
}

function readVault(dir: string): { tokens: Record<string, VaultEntry>; seq: Record<string, number> } {
	const empty = { tokens: {}, seq: {} };
	// Baca robek (torn read) saat writer lain tengah menulis: retry singkat.
	for (let attempt = 0; attempt < 4; attempt++) {
		try {
			if (!existsSync(vaultPath(dir))) return { tokens: {}, seq: {} };
			const raw = JSON.parse(readFileSync(vaultPath(dir), "utf8")) as {
				tokens?: Record<string, VaultEntry>;
				seq?: Record<string, number>;
			};
			return { tokens: raw.tokens ?? {}, seq: raw.seq ?? {} };
		} catch {
			if (attempt === 3) return empty;
			Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
		}
	}
	return empty;
}

function writeVault(
	dir: string,
	data: { tokens: Record<string, VaultEntry>; seq: Record<string, number> },
): void {
	try {
		writeFileSync(vaultPath(dir), JSON.stringify(data, null, 2));
	} catch (err) {
		console.error(`[pdp] vault write failed: ${err instanceof Error ? err.message : String(err)}`);
	}
}

/** Simpan original value (encrypted bila PDP_VAULT_KEY diset), return token. Idempotent. */
export function vaultPut(dir: string, label: string, value: string): string {
	return withVaultLock(dir, () => {
		const v = readVault(dir);
		for (const [tok, e] of Object.entries(v.tokens)) {
			if (e.label === label && open(e.value) === value) return tok;
		}
		const n = (v.seq[label] ?? 0) + 1;
		v.seq[label] = n;
		const tok = makeToken(label, n);
		v.tokens[tok] = { label, value: seal(value), ts: Date.now() };
		writeVault(dir, v);
		return tok;
	});
}

/** Return original value untuk token, atau undefined bila unknown / wrong key. */
export function vaultGet(dir: string, token: string): string | undefined {
	const e = readVault(dir).tokens[token];
	if (!e) return undefined;
	return open(e.value);
}

/** Retention hari (env PDP_RETENTION_DAYS, default 30, 0 = off). */
export function retentionDays(): number {
	const raw = process.env["PDP_RETENTION_DAYS"];
	if (raw === undefined || raw === "") return 30;
	const n = Number.parseInt(raw, 10);
	return Number.isFinite(n) && n >= 0 ? n : 30;
}

/**
 * Sweep entries vault + audit rows older than retention. Returns counts.
 * Called at each fase 1 start. Self-audits via retention.sweep stamp.
 */
export function pdpRetentionSweep(dir: string): { vaultDropped: number; auditDropped: number; auditKept: number } {
	const zero = { vaultDropped: 0, auditDropped: 0, auditKept: 0 };
	try {
		const days = retentionDays();
		if (days <= 0) return zero;
		const cutoff = Date.now() - days * 86400 * 1000;
		return withVaultLock(dir, () => {
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
		});
	} catch {
		return zero;
	}
}
/** Append-only audit, one JSON line per event. Never throws. */
export function pdpAudit(dir: string, stage: string, data: Record<string, unknown>): void {
	try {
		mkdirSync(dir, { recursive: true });
		appendFileSync(auditPath(dir), `${JSON.stringify({ ts: Date.now(), stage, ...data })}\n`);
	} catch (err) {
		console.error(`[pdp] audit failed: ${err instanceof Error ? err.message : String(err)}`);
	}
}
