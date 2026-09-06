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

/** Audit append-only satu baris JSON per kejadian. Tidak pernah throw. */
export function pdpAudit(dir: string, stage: string, data: Record<string, unknown>): void {
	try {
		mkdirSync(dir, { recursive: true });
		appendFileSync(auditPath(dir), `${JSON.stringify({ ts: Date.now(), stage, ...data })}\n`);
	} catch (err) {
		console.error(`[pdp] audit gagal: ${err instanceof Error ? err.message : String(err)}`);
	}
}
