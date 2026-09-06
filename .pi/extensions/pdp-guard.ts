import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// PDP-Guard v1: redaksi data pribadi Indonesia SEBELUM request keluar ke provider.
// Hook: before_provider_request (return payload pengganti; undefined = teruskan asli).
// Pola selaras dengan oracle Python: repo indonesia-coding-agent-pro-uupdp, pdp_guard/redactor.py.
// Catatan jujur: v1 = regex pre-pass lokal. Klasifier LLM lokal via llama.cpp router = fase 2.

const TOKEN = "[REDACTED]";

const PATTERNS: Array<{ label: string; rx: RegExp }> = [
  { label: "NIK", rx: /\b\d{16}\b/g },
  { label: "PHONE_ID", rx: /\b(?:\+62|62|0)8\d{8,11}\b/g },
  { label: "EMAIL", rx: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
];

const SPECIFIC_HINT =
  /(diagnosa|rekam medis|penyakit|biometrik|sidik jari|wajah|dna|genetika|pidana|kejahatan|anak|rekening|saldo|gaji|pinjaman)/i;

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
  if (SPECIFIC_HINT.test(out)) hits["SPECIFIC_HINT"] = 1;
  return out;
}

function redactContent(content: unknown, hits: Hits): unknown {
  if (typeof content === "string") return redactString(content, hits);
  if (Array.isArray(content))
    return content.map((p) =>
      p && typeof p === "object" && typeof (p as Record<string, unknown>)["text"] === "string"
        ? { ...(p as Record<string, unknown>), text: redactString((p as Record<string, unknown>)["text"] as string, hits) }
        : p,
    );
  return content;
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
      if ("content" in msg) return { ...msg, content: redactContent(msg["content"], hits) };
      return m;
    });
  return { payload: next, hits };
}

export default function (pi: ExtensionAPI) {
  let total = 0;
  let last: Hits = {};

  pi.on("before_provider_request", async (event: any, ctx: any) => {
    const { payload, hits } = redactPayload(event?.payload);
    const n = Object.values(hits).reduce<number>((a, b) => a + (typeof b === "number" ? b : 0), 0);
    if (n === 0) return undefined;
    total += n;
    last = hits;
    ctx.ui.notify(
      `PDP-Guard: ${n} data pribadi disamarkan (${Object.keys(hits).join(", ")})`,
      "warning",
    );
    pi.appendEntry("pdp-guard", { ts: Date.now(), action: "redact_before_send", hits });
    return payload;
  });

  pi.registerCommand("pdp-status", {
    description: "Tampilkan statistik redaksi PDP-Guard sesi ini (UU PDP 27/2022)",
    handler: async (_args: any, ctx: any) => {
      ctx.ui.notify(`PDP-Guard sesi ini: ${total} redaksi. Terakhir: ${JSON.stringify(last)}`, "info");
    },
  });
}
