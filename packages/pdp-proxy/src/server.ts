// pdp-proxy v1: standalone OpenAI-compatible sterilizing proxy (non-streaming).
// Agent apa pun -> proxy ini sebagai endpoint -> frontier USA.
// Reuse penuh core PDP: fase1 (tokenize+audit), fase2 (restore+audit).
// v1 constraint: stream:true ditolak eksplisit (token bisa terbelah antar chunk).

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
	pdpAudit,
	pdpFase1Sterilize,
	pdpFase2Restore,
	resolvePdpDir,
} from "../../agent/src/harness/pdp/index.ts";

const PORT = Number(process.env["PDP_PROXY_PORT"] ?? 11480);
const UPSTREAM = (process.env["PDP_UPSTREAM_URL"] ?? "").replace(/\/$/, "");
const KEY = process.env["PDP_UPSTREAM_KEY"] ?? "";
const MAX_BODY = 10 * 1024 * 1024;

function send(res: ServerResponse, code: number, obj: unknown): void {
	const body = JSON.stringify(obj);
	res.writeHead(code, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
	res.end(body);
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

const server = createServer(async (req, res) => {
	try {
		if (req.method === "GET" && req.url === "/healthz") {
			send(res, 200, { ok: true, mode: "non-streaming", upstream: UPSTREAM || null });
			return;
		}
		if (req.method !== "POST" || req.url !== "/v1/chat/completions") {
			send(res, 404, { error: { message: "pdp-proxy v1: hanya POST /v1/chat/completions + GET /healthz" } });
			return;
		}
		if (!UPSTREAM || !KEY) {
			send(res, 500, { error: { message: "pdp-proxy: set PDP_UPSTREAM_URL dan PDP_UPSTREAM_KEY" } });
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
		pdpAudit(base, "proxy.forward", { session, tokens: report.tokens, upstream: new URL(UPSTREAM).host });

		const up = await fetch(`${UPSTREAM}/v1/chat/completions`, {
			method: "POST",
			headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
			body: JSON.stringify({ ...body, messages: steril, stream: false }),
			signal: AbortSignal.timeout(120000),
		});
		if (!up.ok) {
			pdpAudit(base, "proxy.upstream_error", { session, status: up.status });
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
	console.log(`pdp-proxy v1 di http://127.0.0.1:${PORT} -> ${UPSTREAM || "(upstream belum diset)"} [non-streaming]`);
});
