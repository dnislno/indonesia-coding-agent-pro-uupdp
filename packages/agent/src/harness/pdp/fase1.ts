// PDP-ID FASE 1: log input + timestamp, sterilize PII to tokens, catat bukti.
// Called from transformContext (sdk.ts) BEFORE provider request.
// Never throws: on failure return messages unchanged + audit the failure.

import { PII_PATTERNS, SPECIFIC_HINT } from "./patterns.ts";
import { pdpAudit, pdpRetentionSweep, resolvePdpDir, resolveSessionDir, vaultPut } from "./store.ts";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * PDP_STRICT=1: trigger sentence data spesifik ditokenisasi utuh.
 * Default 0 = flag only (SPECIFIC_HINT). Original sentence masuk vault.
 */
function strictSentences(text: string, dir: string, hits: Record<string, number>): string {
	if (process.env["PDP_STRICT"] !== "1") return text;
	return text.replace(/[^.!?\n]+[.!?\n]*/g, (sent) => {
		SPECIFIC_HINT.lastIndex = 0;
		if (!SPECIFIC_HINT.test(sent)) return sent;
		hits["STRICT_SENTENCE"] = (hits["STRICT_SENTENCE"] ?? 0) + 1;
		return vaultPut(dir, "SENSITIVE", sent);
	});
}

export interface Fase1Report {
	hits: Record<string, number>;
	tokens: number;
	specificHint: boolean;
	llmUsed: boolean;
	llmExtra: number;
	/** Terisi bila fase 1 gagal: penelepon WAJIB fail-closed (jangan teruskan mentah). */
	error?: string;
}

/** 16 digit with separators (spasi/titik/strip): "3174 0512 0990 0001". */
const NIK_SEP_RX = /\b\d(?:[\s.\-]*\d){15}\b/g;

function escapeRx(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface Alias {
	label: string;
	value: string;
}

/**
 * Project watchlist: <dir>/aliases.json
 * {"Budi Santoso": "NAMA"} atau ["Budi Santoso"] (default label NAMA).
 */
function loadAliases(dir: string): Alias[] {
	try {
		const f = join(dir, "aliases.json");
		if (!existsSync(f)) return [];
		const raw = JSON.parse(readFileSync(f, "utf8")) as unknown;
		const list: Alias[] = [];
		if (Array.isArray(raw)) {
			for (const v of raw) if (typeof v === "string" && v.trim()) list.push({ label: "NAMA", value: v });
		} else if (raw && typeof raw === "object") {
			for (const [value, label] of Object.entries(raw as Record<string, unknown>)) {
				if (typeof label === "string" && value.trim()) list.push({ label: label.toUpperCase().slice(0, 24), value });
			}
		}
		return list
			.filter((a) => a.value.length > 2)
			.sort((a, b) => b.value.length - a.value.length);
	} catch {
		return [];
	}
}

function applyAliases(text: string, dir: string, hits: Record<string, number>): string {
	let out = text;
	for (const a of loadAliases(dir)) {
		const rx = new RegExp(escapeRx(a.value), "gi");
		let n = 0;
		out = out.replace(rx, () => {
			n++;
			return vaultPut(dir, a.label, a.value);
		});
		if (n > 0) hits[`ALIAS_${a.label}`] = (hits[`ALIAS_${a.label}`] ?? 0) + n;
	}
	return out;
}

/** Replace PII berpola dengan token vault. Return sterilized text + counts. */
export function sterilizeText(text: string, dir: string, hits: Record<string, number>): string {
	let out = applyAliases(text, dir, hits);
	NIK_SEP_RX.lastIndex = 0;
	out = out.replace(NIK_SEP_RX, (m) => {
		hits["NIK_SEP"] = (hits["NIK_SEP"] ?? 0) + 1;
		return vaultPut(dir, "NIK", m);
	});
	for (const { label, rx } of PII_PATTERNS) {
		rx.lastIndex = 0;
		out = out.replace(rx, (m) => {
			hits[label] = (hits[label] ?? 0) + 1;
			return vaultPut(dir, label, m);
		});
	}
	return strictSentences(out, dir, hits);
}

function sterilizeContent(content: unknown, dir: string, hits: Record<string, number>): unknown {
	if (typeof content === "string") return sterilizeText(content, dir, hits);
	if (Array.isArray(content))
		return content.map((p) =>
			p && typeof p === "object" && typeof (p as Record<string, unknown>)["text"] === "string"
				? {
						...(p as Record<string, unknown>),
						text: sterilizeText((p as Record<string, unknown>)["text"] as string, dir, hits),
					}
				: p,
		);
	return content;
}

function collectText(content: unknown): string {
	if (typeof content === "string") return content;
	if (Array.isArray(content))
		return content
			.map((p) =>
				p && typeof p === "object" && typeof (p as Record<string, unknown>)["text"] === "string"
					? String((p as Record<string, unknown>)["text"])
					: "",
			)
			.join("\n");
	return "";
}

interface LlmSpan {
	label: string;
	value: string;
}

/** Local LLM pass (llama.cpp router, OpenAI-compatible). Gagal = skip, regex tetap berlaku. */
async function llmSpans(text: string, baseUrl: string, model: string): Promise<LlmSpan[]> {
	const ctrl = new AbortController();
	const t = setTimeout(() => ctrl.abort(), 15000);
	try {
		const res = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/chat/completions`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			signal: ctrl.signal,
			body: JSON.stringify({
				model,
				temperature: 0,
				max_tokens: 512,
				messages: [
					{
						role: "system",
						content:
							"Ekstrak data pribadi Indonesia dari teks: nama orang, alamat, tanggal lahir, nomor identitas non-16-digit. Jawab HANYA JSON array [{label,value}]. Kosong = [].",
					},
					{ role: "user", content: text.slice(0, 4000) },
				],
			}),
		});
		if (!res.ok) return [];
		const body = (await res.json()) as {
			choices?: Array<{ message?: { content?: string } }>;
		};
		const raw = body.choices?.[0]?.message?.content ?? "[]";
		const start = raw.indexOf("[");
		const end = raw.lastIndexOf("]");
		if (start < 0 || end <= start) return [];
		const arr = JSON.parse(raw.slice(start, end + 1)) as LlmSpan[];
		return arr.filter((s) => typeof s?.label === "string" && typeof s?.value === "string" && s.value.length > 1);
	} catch {
		return [];
	} finally {
		clearTimeout(t);
	}
}

function applyLlmSpans(text: string, dir: string, spans: LlmSpan[], hits: Record<string, number>): string {
	let out = text;
	for (const s of spans) {
		if (!out.includes(s.value)) continue;
		const tok = vaultPut(dir, s.label.toUpperCase().replace(/[^A-Z_]/g, "_").slice(0, 24) || "LLM", s.value);
		out = out.split(s.value).join(tok);
		hits[`LLM_${s.label}`] = (hits[`LLM_${s.label}`] ?? 0) + 1;
	}
	return out;
}

function sterilizeOneMessage(msg: unknown, dir: string, hits: Record<string, number>): unknown {
	if (!msg || typeof msg !== "object") return msg;
	const m = msg as Record<string, unknown>;
	if (!("content" in m)) return msg;
	return { ...m, content: sterilizeContent(m["content"], dir, hits) };
}

/**
 * FASE 1. messages = AgentMessage[] (defensive: other shapes passed through).
 * Tahap 0: retention sweep. Tahap 1: audit fase1.input (full text + timestamp).
 * Tahap 2: alias -> NIK separator -> regex -> token, lalu local LLM bila
 * PDP_LLM_URL diset -> token. Audit fase1.steril sebagai bukti.
 * opts.sessionId mengisolasi vault per session + diekspor via PDP_ACTIVE_DIR
 * agar fase 2 menemukan vault yang sama. Return sterilized messages + report + dir.
 */
export async function pdpFase1Sterilize(
	messages: unknown,
	dir?: string,
	opts?: { sessionId?: string },
): Promise<{ messages: unknown; report: Fase1Report; dir: string }> {
	const empty: Fase1Report = { hits: {}, tokens: 0, specificHint: false, llmUsed: false, llmExtra: 0 };
	const base = resolvePdpDir(dir);
	try {
		if (process.env["PDP_GUARD"] === "0") return { messages, report: empty, dir: base };
		if (!Array.isArray(messages)) return { messages, report: empty, dir: base };
		const d = resolveSessionDir(base, opts?.sessionId);
		process.env["PDP_ACTIVE_DIR"] = d;
		const hits: Record<string, number> = {};
		const sweep = pdpRetentionSweep(d);

		pdpAudit(d, "fase1.input", {
			nMessages: messages.length,
			text: messages.map((m) => collectText((m as Record<string, unknown>)?.["content"])).join("\n---\n"),
		});

		let out = messages.map((m) => sterilizeOneMessage(m, d, hits));

	 const llmUrl = process.env["PDP_LLM_URL"];
		const llmModel = process.env["PDP_LLM_MODEL"] ?? "local-pii-8b";
		let llmExtra = 0;
		if (llmUrl) {
			for (let i = 0; i < out.length; i++) {
				const m = out[i] as Record<string, unknown>;
				if (!m || typeof m !== "object" || !("content" in m)) continue;
				if (typeof m["content"] === "string") {
					const txt = m["content"] as string;
					if (!txt.trim()) continue;
					const spans = await llmSpans(txt, llmUrl, llmModel);
					if (spans.length > 0) {
						(out[i] as Record<string, unknown>)["content"] = applyLlmSpans(txt, d, spans, hits);
						llmExtra += spans.length;
					}
				} else if (Array.isArray(m["content"])) {
					const parts = (m["content"] as unknown[]).map((p) => {
						if (
							p &&
							typeof p === "object" &&
							typeof (p as Record<string, unknown>)["text"] === "string"
						) {
							const txt = (p as Record<string, unknown>)["text"] as string;
							if (!txt.trim()) return p;
							return { ...(p as Record<string, unknown>), text: txt };
						}
						return p;
					});
					for (const p of parts) {
						const t = (p as Record<string, unknown>)["text"];
						if (typeof t !== "string") continue;
						const spans = await llmSpans(t, llmUrl, llmModel);
						if (spans.length > 0) {
							(p as Record<string, unknown>)["text"] = applyLlmSpans(t, d, spans, hits);
							llmExtra += spans.length;
						}
					}
					(out[i] as Record<string, unknown>)["content"] = parts;
				}
			}
		}

		const sample = collectText(((out[out.length - 1] ?? {}) as Record<string, unknown>)["content"] ?? "");
		const report: Fase1Report = {
			hits,
			tokens: Object.values(hits).reduce((a, b) => a + b, 0),
			specificHint: SPECIFIC_HINT.test(sample),
			llmUsed: Boolean(llmUrl),
			llmExtra,
		};
		if (report.specificHint) hits["SPECIFIC_HINT"] = 1;
		pdpAudit(d, "fase1.steril", { report });
		return { messages: out, report, dir: d };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		try {
			pdpAudit(resolvePdpDir(dir), "fase1.error", { error: msg });
		} catch {
			/* abaikan */
		}
		return { messages, report: { ...empty, error: msg }, dir: base };
	}
}
