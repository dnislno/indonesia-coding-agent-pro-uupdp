// pdp-proxy v4: standalone sterilizing proxy + local dashboard.
// Dua mode upstream: frontier USA (bila key diset) atau 100% lokal via
// llama.cpp router (default bila tanpa key). Zero-config: config.json.
// v1 constraint: non-streaming only (token bisa terbelah antar chunk).

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	pdpAudit,
	pdpFase1Sterilize,
	pdpFase2Restore,
	resolvePdpDir,
} from "../../agent/src/harness/pdp/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url)); // packages/pdp-proxy/src
const ROOT = join(HERE, "..", "..", ".."); // repo root (atau folder unzip)
const SRC = (p: string): string => join(HERE, p);

interface FileConfig {
	upstreamUrl?: string;
	upstreamKey?: string;
	proxyPort?: number;
	llmUrl?: string;
	llmModel?: string;
	modelsDir?: string;
	vaultKey?: string;
	strict?: boolean;
	retentionDays?: number;
}

function userConfigDir(): string {
	return platform() === "win32"
		? join(process.env["APPDATA"] ?? join(homedir(), "AppData", "Roaming"), "pdp-guard")
		: join(process.env["XDG_CONFIG_HOME"] ?? join(homedir(), ".config"), "pdp-guard");
}

function loadFileConfig(): { file: FileConfig; userPath: string } {
	const userPath = join(userConfigDir(), "config.json");
	let file: FileConfig = {};
	for (const p of [join(ROOT, "config.json"), userPath]) {
		try {
			if (existsSync(p)) file = { ...file, ...(JSON.parse(readFileSync(p, "utf8")) as FileConfig) };
		} catch {
			/* abaikan */
		}
	}
	return { file, userPath };
}

const { file: CFG, userPath: USER_CONFIG } = loadFileConfig();
const env = (k: string): string | undefined => process.env[k];

const PORT = Number(env("PDP_PROXY_PORT") ?? CFG.proxyPort ?? 11480);
const UPSTREAM = ((env("PDP_UPSTREAM_URL") ?? CFG.upstreamUrl ?? "") as string).replace(/\/$/, "");
const KEY = env("PDP_UPSTREAM_KEY") ?? CFG.upstreamKey ?? "";
const LOCAL = ((env("PDP_LLM_URL") ?? CFG.llmUrl ?? "http://127.0.0.1:8080") as string).replace(/\/$/, "");
const LLM_MODEL = env("PDP_LLM_MODEL") ?? CFG.llmModel ?? "local-pii-8b";
const MODELS_DIR = env("PDP_MODELS_DIR") || CFG.modelsDir || join(homedir(), "models");
if (env("PDP_VAULT_KEY") === undefined && CFG.vaultKey) process.env["PDP_VAULT_KEY"] = CFG.vaultKey;
if (env("PDP_STRICT") === undefined && CFG.strict === true) process.env["PDP_STRICT"] = "1";
if (env("PDP_RETENTION_DAYS") === undefined && typeof CFG.retentionDays === "number") {
	process.env["PDP_RETENTION_DAYS"] = String(CFG.retentionDays);
}

const TARGET = UPSTREAM || LOCAL;
const MODE: "frontier" | "local" = UPSTREAM ? "frontier" : "local";
const MAX_BODY = 10 * 1024 * 1024;

let llamaChild: ChildProcess | null = null;

function llamaBin(): string | null {
	const cands = [
		join(ROOT, "pdp", "llama-bin", platform() === "win32" ? "llama-server.exe" : "llama-server"),
		join(ROOT, "pdp", "llama-bin", "llama-server"),
	];
	return cands.find((c) => existsSync(c)) ?? null;
}

function send(res: ServerResponse, code: number, obj: unknown): void {
	const body = JSON.stringify(obj);
	res.writeHead(code, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
	res.end(body);
}

function sendHtml(res: ServerResponse, html: string): void {
	res.writeHead(200, { "content-type": "text/html; charset=utf-8", "content-length": Buffer.byteLength(html) });
	res.end(html);
}

function readBody(req: IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		let size = 0;
		req.on("data", (c: Buffer) => {
			size += c.length;
			if (size > MAX_BODY) {
				reject(new Error("body too large"));
				req.destroy();
				return;
			}
			chunks.push(c);
		});
		req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
		req.on("error", reject);
	});
}

function sessionDirs(base: string): Array<{ id: string; tokens: number; audits: number }> {
	const out: Array<{ id: string; tokens: number; audits: number }> = [];
	try {
		const sdir = join(base, "sessions");
		if (!existsSync(sdir)) return out;
		for (const s of readdirSync(sdir)) {
			const d = join(sdir, s);
			let tokens = 0;
			let audits = 0;
			try {
				const v = JSON.parse(readFileSync(join(d, "vault.json"), "utf8")) as { tokens?: object };
				tokens = Object.keys(v.tokens ?? {}).length;
			} catch {
				/* abaikan */
			}
			try {
				audits = readFileSync(join(d, "audit.jsonl"), "utf8").split("\n").filter((l) => l.trim()).length;
			} catch {
				/* abaikan */
			}
			out.push({ id: s, tokens, audits });
		}
	} catch {
		/* abaikan */
	}
	return out;
}

const server = createServer(async (req, res) => {
	try {
		const url = new URL(req.url ?? "/", "http://127.0.0.1");

		if (req.method === "GET" && url.pathname === "/") {
			try {
				sendHtml(res, readFileSync(SRC("dashboard.html"), "utf8"));
			} catch {
				send(res, 500, { error: { message: "dashboard.html hilang" } });
			}
			return;
		}
		if (req.method === "GET" && url.pathname === "/healthz") {
			send(res, 200, { ok: true, mode: MODE, target: TARGET, streaming: false });
			return;
		}
		if (req.method === "GET" && url.pathname === "/api/status") {
			const base = resolvePdpDir(process.env["PDP_DIR"]);
			send(res, 200, {
				mode: MODE,
				target: TARGET,
				streaming: false,
				llamaRunning: llamaChild !== null && llamaChild.exitCode === null,
				llamaBinary: llamaBin() !== null,
				keySet: KEY !== "",
				sessions: sessionDirs(base),
			});
			return;
		}
		if (req.method === "GET" && url.pathname === "/api/audit") {
			const base = resolvePdpDir(process.env["PDP_DIR"]);
			const sid = (url.searchParams.get("session") ?? "").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64);
			const n = Math.min(Number(url.searchParams.get("n") ?? 20) || 20, 200);
			const f = sid ? join(base, "sessions", sid, "audit.jsonl") : join(base, "audit.jsonl");
			let lines: string[] = [];
			try {
				lines = readFileSync(f, "utf8").trim().split("\n").filter((l) => l.trim()).slice(-n);
			} catch {
				/* kosong */
			}
			send(res, 200, { session: sid || "base", lines: lines.map((l) => { try { return JSON.parse(l); } catch { return { raw: l }; } }) });
			return;
		}
		if (req.method === "POST" && url.pathname === "/api/purge") {
			const base = resolvePdpDir(process.env["PDP_DIR"]);
			const sid = (url.searchParams.get("session") ?? "").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64);
			rmSync(sid ? join(base, "sessions", sid) : base, { recursive: true, force: true });
			send(res, 200, { ok: true, wiped: sid || "all" });
			return;
		}
		if (req.method === "POST" && url.pathname === "/api/config") {
			let body: Record<string, unknown>;
			try {
				body = JSON.parse(await readBody(req)) as Record<string, unknown>;
			} catch {
				send(res, 400, { error: { message: "body bukan JSON valid" } });
				return;
			}
			const next: FileConfig = {};
			if (typeof body["upstreamUrl"] === "string") next.upstreamUrl = body["upstreamUrl"] as string;
			if (typeof body["upstreamKey"] === "string") next.upstreamKey = body["upstreamKey"] as string;
			mkdirSync(userConfigDir(), { recursive: true });
			let cur: FileConfig = {};
			try {
				if (existsSync(USER_CONFIG)) cur = JSON.parse(readFileSync(USER_CONFIG, "utf8")) as FileConfig;
			} catch {
				/* abaikan */
			}
			writeFileSync(USER_CONFIG, JSON.stringify({ ...cur, ...next }, null, 2));
			send(res, 200, { ok: true, note: "restart proxy agar berlaku" });
			return;
		}
		if (req.method === "POST" && url.pathname === "/api/llama/start") {
			if (llamaChild && llamaChild.exitCode === null) {
				send(res, 200, { ok: true, already: true });
				return;
			}
			const bin = llamaBin();
			if (!bin) {
				send(res, 400, { error: { message: "llama-server belum terunduh. Jalankan pdp/setup-llama.sh dulu." } });
				return;
			}
			llamaChild = spawn(bin, ["--models-dir", MODELS_DIR, "--no-models-autoload", "--jinja", "--host", "127.0.0.1", "--port", "8080", "-ngl", "999", "-c", "32768"], { stdio: "ignore", detached: false });
			llamaChild.on("exit", () => {
				llamaChild = null;
			});
			send(res, 200, { ok: true });
			return;
		}
		if (req.method === "POST" && url.pathname === "/api/llama/stop") {
			try {
				llamaChild?.kill();
			} catch {
				/* abaikan */
			}
			llamaChild = null;
			send(res, 200, { ok: true });
			return;
		}

		if (req.method !== "POST" || url.pathname !== "/v1/chat/completions") {
			send(res, 404, { error: { message: "pdp-proxy v4: gunakan / (dashboard), /healthz, atau POST /v1/chat/completions" } });
			return;
		}
		let body: Record<string, unknown>;
		try {
			body = JSON.parse(await readBody(req)) as Record<string, unknown>;
		} catch {
			send(res, 400, { error: { message: "pdp-proxy: body bukan JSON valid" } });
			return;
		}
		if (body["stream"] === true) {
			send(res, 400, {
				error: { message: "pdp-proxy v1: streaming belum didukung (token bisa terbelah antar chunk). Set stream:false." },
			});
			return;
		}
		const session = (req.headers["x-pdp-session-id"] as string) || "proxy";
		const base = resolvePdpDir(process.env["PDP_DIR"]);
		if (!Array.isArray(body["messages"]) || (body["messages"] as unknown[]).length === 0) {
			pdpAudit(base, "proxy.blocked", { session, error: "messages bukan array non-kosong" });
			send(res, 400, { error: { message: "pdp-proxy: messages harus array non-kosong (fail-closed)" } });
			return;
		}
		const { messages: steril, report } = await pdpFase1Sterilize(body["messages"], base, { sessionId: session });
		if (report.error) {
			pdpAudit(base, "proxy.blocked", { session, error: report.error });
			send(res, 500, { error: { message: `pdp-proxy: fase 1 gagal, request DITAHAN (fail-closed): ${report.error}` } });
			return;
		}
		pdpAudit(base, "proxy.forward", { session, mode: MODE, tokens: report.tokens, upstream: new URL(TARGET).host });
		const headers: Record<string, string> = { "content-type": "application/json" };
		if (KEY) headers["authorization"] = `Bearer ${KEY}`;
		const model = MODE === "local" ? LLM_MODEL : ((body["model"] as string) ?? LLM_MODEL);
		const up = await fetch(`${TARGET}/v1/chat/completions`, {
			method: "POST",
			headers,
			body: JSON.stringify({ ...body, model, messages: steril, stream: false }),
			signal: AbortSignal.timeout(180000),
		});
		if (!up.ok) {
			pdpAudit(base, "proxy.upstream_error", { session, mode: MODE, status: up.status });
			send(res, 502, { error: { message: `pdp-proxy: upstream ${up.status}` } });
			return;
		}
		const out = (await up.json()) as { choices?: Array<{ message?: Record<string, unknown> }> };
		if (Array.isArray(out.choices)) {
			for (const c of out.choices) {
				if (c && typeof c === "object" && c.message) {
					c.message = pdpFase2Restore(c.message) as Record<string, unknown>;
				}
			}
		}
		send(res, 200, out);
	} catch (err) {
		send(res, 500, { error: { message: `pdp-proxy: ${err instanceof Error ? err.message : String(err)}` } });
	}
});

server.listen(PORT, "127.0.0.1", () => {
	console.log(`pdp-proxy v4 di http://127.0.0.1:${PORT} -> ${TARGET} [mode:${MODE}, non-streaming]`);
});
