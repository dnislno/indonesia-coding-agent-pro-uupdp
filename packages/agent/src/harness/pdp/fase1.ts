// PDP-ID FASE 1: catat input + timestamp, sterilkan PII jadi token, catat bukti.
// Dipanggil dari transformContext (sdk.ts) SEBELUM pesan ke provider.
// Tidak pernah throw: gagal = kembalikan pesan apa adanya + audit kegagalan.

import { PII_PATTERNS, SPECIFIC_HINT } from "./patterns.ts";
import { pdpAudit, resolvePdpDir, vaultPut } from "./store.ts";

export interface Fase1Report {
	hits: Record<string, number>;
	tokens: number;
	specificHint: boolean;
	llmUsed: boolean;
	llmExtra: number;
}

/** Ganti PII berpola dengan token vault. Kembalikan teks steril + jumlah. */
export function sterilizeText(text: string, dir: string, hits: Record<string, number>): string {
	let out = text;
	for (const { label, rx } of PII_PATTERNS) {
		rx.lastIndex = 0;
		out = out.replace(rx, (m) => {
			hits[label] = (hits[label] ?? 0) + 1;
			return vaultPut(dir, label, m);
		});
	}
	return out;
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

/** Pass LLM lokal (llama.cpp router OpenAI-compatible). Gagal = lewati, regex tetap berlaku. */
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
 * FASE 1. messages = AgentMessage[] (defensif: bentuk lain diteruskan).
 * Tahap 1: audit fase1.input (teks penuh + timestamp).
 * Tahap 2: regex -> token, lalu LLM lokal bila PDP_LLM_URL diset -> token.
 * Audit fase1.steril sebagai bukti. Kembalikan pesan steril + laporan.
 */
export async function pdpFase1Sterilize(
	messages: unknown,
	dir?: string,
): Promise<{ messages: unknown; report: Fase1Report }> {
	const empty: Fase1Report = { hits: {}, tokens: 0, specificHint: false, llmUsed: false, llmExtra: 0 };
	try {
		if (process.env["PDP_GUARD"] === "0") return { messages, report: empty };
		if (!Array.isArray(messages)) return { messages, report: empty };
		const d = resolvePdpDir(dir);
		const hits: Record<string, number> = {};

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
		return { messages: out, report };
	} catch (err) {
		try {
			pdpAudit(resolvePdpDir(dir), "fase1.error", { error: err instanceof Error ? err.message : String(err) });
		} catch {
			/* abaikan */
		}
		return { messages, report: empty };
	}
}
