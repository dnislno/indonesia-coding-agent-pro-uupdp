import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

// PDP-Guard: jaring pengaman kedua + monitor. Fase 1 (sterilisasi token) dan
// fase 2 (kembalikan PII) berjalan di core: packages/agent/src/harness/pdp/,
// dikabel di sdk.ts transformContext dan assistant.ts pesan final.
// Extension ini: (1) jaring kedua di before_provider_request bila core
// dilewati (PDP_GUARD=0), (2) /pdp-status baca audit, (3) /pdp-purge hapus vault+log.

const TOKEN = "[REDACTED]";

const PATTERNS: Array<{ label: string; rx: RegExp }> = [
  { label: "NIK", rx: /\b\d{16}\b/g },
  { label: "PHONE_ID", rx: /\b(?:\+62|62|0)8\d{8,11}\b/g },
  { label: "EMAIL", rx: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
];

type Hits = Record<string, number>;

function redactString(s: string, hits: Hits): string {
  let out = s;
  for (const { label, rx } of PATTERNS) {
    rx.lastIndex = 0;
    let n = 0;
    out = out.replace(rx, () => {
      n++;
      return TOKEN;
    });
    if (n > 0) hits[label] = (hits[label] ?? 0) + n;
  }
  return out;
}

function redactPayload(payload: unknown): { payload: unknown; hits: Hits } {
  const hits: Hits = {};
  if (!payload || typeof payload !== "object") return { payload, hits };
  const next: Record<string, unknown> = { ...(payload as Record<string, unknown>) };
  if (typeof next["system"] === "string") next["system"] = redactString(next["system"] as string, hits);
  if (Array.isArray(next["messages"]))
    next["messages"] = (next["messages"] as unknown[]).map((m) => {
      if (!m || typeof m !== "object") return m;
      const msg = m as Record<string, unknown>;
      if (typeof msg["content"] === "string")
        return { ...msg, content: redactString(msg["content"] as string, hits) };
      return m;
    });
  return { payload: next, hits };
}

function pdpDir(cwd: string): string {
  return process.env["PDP_DIR"] ?? join(cwd, ".pi", "pdp");
}

function auditTail(cwd: string, n: number): string[] {
  // Agregat: audit basis + tiap sesi (isolasi per sesi, lihat resolveSessionDir).
  const out: string[] = [];
  try {
    const base = pdpDir(cwd);
    const files: Array<{ f: string; tag: string }> = [{ f: join(base, "audit.jsonl"), tag: "base" }];
    try {
      const sdir = join(base, "sessions");
      for (const s of readdirSync(sdir)) files.push({ f: join(sdir, s, "audit.jsonl"), tag: s });
    } catch {
      /* belum ada sesi */
    }
    for (const { f, tag } of files) {
      if (!existsSync(f)) continue;
      for (const l of readFileSync(f, "utf8").trim().split("\n").slice(-n)) {
        if (l.trim()) out.push(`[${tag}] ${l}`);
      }
    }
  } catch {
    /* abaikan */
  }
  return out.slice(-n);
}

export default function (pi: ExtensionAPI) {
  // P0: tolak eksekusi tool yang argumennya mengandung pola PII.
  // Jalur tool tidak lewat fase 1 core; ini satu-satunya penutupnya.
  pi.on("tool_call", async (event: any, ctx: any) => {
    try {
      const raw = JSON.stringify(event?.input ?? {});
      const hits: Hits = {};
      redactString(raw, hits);
      const n = Object.values(hits).reduce<number>((a, b) => a + b, 0);
      if (n === 0) return undefined;
      const reason = `PDP: argumen tool '${event?.toolName ?? "?"}' mengandung ${n} pola data pribadi (${Object.keys(hits).join(", ")}). Sterilkan dulu.`;
      ctx.ui.notify(reason, "error");
      pi.appendEntry("pdp-guard", { ts: Date.now(), action: "block_tool", tool: event?.toolName, hits });
      return { block: true, reason };
    } catch {
      return undefined;
    }
  });

  pi.on("before_provider_request", async (event: any, ctx: any) => {
    const { payload, hits } = redactPayload(event?.payload);
    const n = Object.values(hits).reduce<number>((a, b) => a + b, 0);
    if (n === 0) return undefined;
    ctx.ui.notify(`PDP-Guard (jaring kedua): ${n} pola PII disamarkan`, "warning");
    pi.appendEntry("pdp-guard", { ts: Date.now(), action: "redact_fallback", hits });
    return payload;
  });

  pi.registerCommand("pdp-status", {
    description: "Tampilkan 5 baris audit PDP terakhir (UU PDP 27/2022)",
    handler: async (_args: any, ctx: any) => {
      const lines = auditTail(ctx.cwd as string, 5);
      ctx.ui.notify(
        lines.length === 0 ? "PDP: belum ada audit sesi ini." : `PDP audit:\n${lines.join("\n")}`,
        "info",
      );
    },
  });

  pi.registerCommand("pdp-purge", {
    description: "Hapus vault token + log audit PDP proyek ini (hak hapus UU PDP)",
    handler: async (_args: any, ctx: any) => {
      const ok = await ctx.ui.confirm("PDP purge", "Hapus vault + audit .pi/pdp proyek ini?");
      if (!ok) return;
      try {
        rmSync(pdpDir(ctx.cwd as string), { recursive: true, force: true });
        ctx.ui.notify("PDP: vault + audit dihapus.", "info");
      } catch (err) {
        ctx.ui.notify(`PDP purge gagal: ${err instanceof Error ? err.message : String(err)}`, "error");
      }
    },
  });
}
