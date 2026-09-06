// PDP-ID FASE 2: restore token ke PII asli pada model response, lalu catat.
// Called di assistant.ts AFTER afterResponse, BEFORE observer.end.
// Never throws.

import { TOKEN_RE } from "./patterns.ts";
import { pdpAudit, resolvePdpDir, vaultGet } from "./store.ts";

function restoreText(text: string, dir: string, counter: { n: number }): string {
	TOKEN_RE.lastIndex = 0;
	return text.replace(TOKEN_RE, (tok) => {
		const v = vaultGet(dir, tok);
		if (v === undefined) return tok;
		counter.n++;
		return v;
	});
}

function restoreContent(content: unknown, dir: string, counter: { n: number }): unknown {
	if (typeof content === "string") return restoreText(content, dir, counter);
	if (Array.isArray(content))
		return content.map((p) =>
			p && typeof p === "object" && typeof (p as Record<string, unknown>)["text"] === "string"
				? {
						...(p as Record<string, unknown>),
						text: restoreText((p as Record<string, unknown>)["text"] as string, dir, counter),
					}
				: p,
		);
	return content;
}

/** Restore semua token __PDP_*__ pada assistant message. Return pesan baru bila berubah. */
export function pdpFase2Restore(message: unknown, dir?: string): unknown {
	try {
		if (process.env["PDP_GUARD"] === "0") return message;
		if (!message || typeof message !== "object") return message;
		// Vault sesi aktif diekspor fase 1; fallback direktori eksplisit/default.
		const d = resolvePdpDir(dir ?? process.env["PDP_ACTIVE_DIR"]);
		const m = message as Record<string, unknown>;
		if (!("content" in m)) return message;
		const counter = { n: 0 };
		const content = restoreContent(m["content"], d, counter);
		pdpAudit(d, "fase2.response", { tokensRestored: counter.n });
		if (counter.n === 0) return message;
		return { ...m, content };
	} catch (err) {
		try {
			pdpAudit(resolvePdpDir(dir), "fase2.error", { error: err instanceof Error ? err.message : String(err) });
		} catch {
			/* abaikan */
		}
		return message;
	}
}
