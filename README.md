# Indonesia PDP Guardrail for AI Coding Agents — UU PDP No. 27/2022 Compliance Layer

**The compliance layer between your team and frontier AI.**
Every prompt containing NIK, phone numbers, emails, or patient data is
tokenized on your own machine before reaching OpenAI, Anthropic, or any USA
frontier LLM API — then restored on the way back, with a timestamped audit
trail per request. Built for Indonesia's UU PDP (Law No. 27 of 2022) and its
enforcement regulation PP No. 33 of 2026.

> Full fork of [earendil-works/pi](https://github.com/earendil-works/pi) +
> standalone OpenAI-compatible proxy. MIT licensed. Self-hosted. No data
> leaves Indonesia for filtering — ever.

## Why Indonesian enterprises need this now

Enforcement is no longer theoretical:

* **PP No. 33 Tahun 2026** (September 2026) activates administrative fines of
  **up to 2% of annual revenue** (Pasal 185) — scaled by impact, duration,
  data type, and subject count.
* **Every data subject can sue for compensation** (Pasal 105-106). One leaked
  customer database = thousands of potential plaintiffs.
* **Lembaga PDP is operational.** Complaints are verified within 3 days,
  then investigated, then sanctioned. Your AI usage is now auditable.

Meanwhile, inside every Indonesian bank, hospital, telco, and startup,
developers and analysts paste customer NIK, medical records, and financial
data into ChatGPT, Claude, and Copilot **every single day**. Legacy DLP does
not understand LLM traffic. Global GRC suites (Vanta, OneTrust, BigID) bill
in USD, host abroad, and know nothing about Pasal 4 tiers or PP 33/2026
evidence requirements.

**This is the guardrail BATNA for that gap**: drop-in protection for any AI
coding agent, in-country processing, regulator-ready evidence out of the box.
The companies that deploy a PII guardrail before the first Lembaga PDP audit
will negotiate from strength. The rest will negotiate from their logs —
if they have any.

## How it works (30 seconds)

```
INPUT:  "betulkan query WHERE nik='3174051209900001'"
   |  stamp 1: fase1.input (full text + timestamp -> audit.jsonl)
   v
FASE 1 (on-machine): NIK/phone/email -> __PDP_NIK_1__
(session vault: <cwd>/.pi/pdp/sessions/<id>/vault.json, per-session
isolated, AES-256-GCM encrypted with PDP_VAULT_KEY)
   |  stamp 2: fase1.steril (hits + timestamp) = compliance evidence
   v
Sent to frontier USA: "betulkan query WHERE nik='__PDP_NIK_1__'"
   |
   v
Model response (still tokenized)
   |  stamp 3: fase2.response (tokensRestored + timestamp)
   v
OUTPUT: "Query WHERE nik='3174051209900001' sudah benar"
```

One sentence: **raw personal data never leaves the machine; only tokens do.**

## Two doors, one core — and two different UIs

**Dashboard bukan milik pi dan tidak butuh pi jalan.**

**A. Launcher / proxy mode (zero-config, browser dashboard).**
Double-click `Start-PDP-Guard.bat` → your browser opens to
`http://127.0.0.1:11480/`:

```
+----------------------------------------------------------+
| PDP Guard — running locally                              |
| Personal data is tokenized on this machine before any    |
| model sees it. Works without an API key (full-local).    |
+----------------------------------------------------------+
| STATUS                                                   |
| Mode: local -> http://127.0.0.1:8080                     |
| Local LLM: running (binary: present)                     |
| Frontier key: empty (local mode)                         |
| [Start local LLM] [Stop local LLM]                       |
+----------------------------------------------------------+
| FRONTIER MODE (optional)                                 |
| Empty = 100% local. Filled = sterilized requests are     |
| forwarded to the frontier USA API.                       |
| [https://api.openai.com/v1____] [key______] [Save]       |
+----------------------------------------------------------+
| SESSIONS + AUDIT TRAIL                                   |
| klinik-a | 12 tokens | 36 audits                         |
| [klinik-a v] [View audit] [Purge this session]           |
| {"ts":...,"stage":"fase1.steril","report":{"hits":...}}  |
+----------------------------------------------------------+
```

Use this when: you use Claude Code, Codex, Cursor, or any other agent; you
want non-technical staff (clinic admins, DPO) to operate it; you want one
click, not one terminal.

**B. Fork mode (pi terminal TUI).** The agent looks exactly like upstream pi —
same terminal interface — plus two extra commands:

```
> /pdp-status
PDP audit:
[sess-9f2] {"ts":...,"stage":"fase1.steril","report":{"hits":{"NIK":1}}}
[sess-9f2] {"ts":...,"stage":"fase2.response","tokensRestored":1}

> /pdp-purge
Wipe project vault + audit (.pi/pdp)? [y/N]
```

Use this when: you live in the terminal and want the deepest integration
(tool-argument blocking included, which only exists in fork mode).

Rule of thumb: **dashboard for the team, TUI for the engineer.** Evidence
(`audit.jsonl`, vault) is identical in both.

**Proxy mode (any agent, v3):** OpenAI-compatible server in
`packages/pdp-proxy`. Point Claude Code, Codex, Cursor, or any
OpenAI-compatible app at it. Optional `x-pdp-session-id` header for vault
isolation. v1 constraints: non-streaming only (`stream:true` explicitly
rejected); empty/non-array `messages` rejected (400); fase-1 failure holds
the request (fail-closed + `proxy.blocked` audit). 100% shared PDP core.

## Enterprise guardrail: what the DPO gets

* **Per-request evidence chain** (`sessions/<id>/audit.jsonl`):
  `fase1.input -> fase1.steril -> fase2.response`, plus `proxy.forward`,
  `proxy.blocked`, `block_tool`, `retention.sweep`. This is your RoPA input
  (UU PDP Pasal 35-40) and fine-mitigation material (PP Pasal 184-185):
  every byte sent out traces to its stamp.
* **Data minimization by construction** (Pasal 16): only tokens cross the
  border. The frontier provider never sees the NIK.
* **Storage limitation enforced** (retention + `/pdp-purge`): vault and audit
  auto-expire (default 30 days, `PDP_RETENTION_DAYS`), manual wipe = right to
  erasure (Pasal 8-15).
* **Kill switch**: `PDP_GUARD=0` disables the layer instantly for incident
  response testing.
* **In-country filtering**: regex + optional local LLM (llama.cpp) run on
  your hardware. No third-country sub-processor added to your data map.

## WITHOUT vs WITH: the exact same request

Without this layer, a developer debugging a patient query sends this to a
frontier API — and nothing records it:

```json
// What leaves the machine WITHOUT the guardrail (forensic nightmare)
{ "role": "user", "content": "fix query WHERE nik='3174051209900001' AND hp='081234567890'" }
// Logs: none. Evidence of minimization: none. Lawsuit defense: "trust us."
```

With this layer, the provider receives only this — while the machine keeps
everything needed to prove compliance:

```json
// What leaves the machine WITH the guardrail (tokens only)
{ "role": "user", "content": "fix query WHERE nik='__PDP_NIK_1__' AND hp='__PDP_PHONE_ID_1__'" }
```

And the local audit trail captures the full chain (real format, values
trimmed here for this doc):

```json
{"ts":1788651011.89,"stage":"fase1.input","nMessages":1,"text":"fix query WHERE nik='3174051209900001'..."}
{"ts":1788651011.90,"stage":"fase1.steril","report":{"hits":{"NIK":1,"PHONE_ID":1},"tokens":2,"llmUsed":false}}
{"ts":1788651012.41,"stage":"fase2.response","tokensRestored":2}
```

The user still gets the working answer with real values restored. The
provider never saw them. That delta — provable, per request — is the product.

## Why these logs stand as audit evidence

Regulators and courts do not accept vibes; they accept records with five
properties. Each is engineered in, not claimed:

1. **Completeness** — every outbound request passes fase 1; no bypass path
   exists in fork mode (transformContext sits on the single send path) and
   proxy mode fails closed on any fase-1 error.
2. **Tamper-evidence by design** — append-only JSONL; retention sweeps and
   purges write their own audit entries (`retention.sweep`), so deletion
   itself is on record. No silent edits possible without leaving a timestamp
   gap an auditor can spot.
3. **Causality** — stamps are ordered per request
   (`input -> steril -> response`), each carrying the token counts that link
   them. Any byte sent out resolves to exactly one sterilization record.
4. **Proportionality mapping** — reports record data categories (NIK vs
   SPECIFIC_HINT vs LLM spans), precisely the weighting input PP Art. 185
   demands for fine calibration. This turns the log from cost center into
   leverage.
5. **Custody** — filtering and vault stay on operator hardware in Indonesia;
   no third-country sub-processor enters the data map.

Honest boundary, stated the way a regulator would want it: these logs prove
**maximum implementation effort per request**, not perfect detection. They
are built to be submitted alongside DPO attestation and counsel — and to
make the "we did everything technically reasonable" defense a documented
fact instead of a sentence.

## Quickstart proxy (5 minutes, zero-config)

Download the release ZIP, unzip, double-click **`Start-PDP-Guard.bat`**. Done.
First run downloads llama.cpp + the local model automatically; later clicks
just start everything and open the dashboard in your browser. Works fully
without any API key (100% local mode). Manual override via **`config.json`**
(env beats file).

Requirements: Node 22+ (the launcher installs it via winget if missing).

```bash
# 1. Optional frontier config (once per shell; empty = local mode)
export PDP_UPSTREAM_URL="https://api.openai.com/v1"
export PDP_UPSTREAM_KEY="<frontier-key>"
export PDP_VAULT_KEY="<frasa-rahasia-panjang-min-16-karakter>"
export PDP_PROXY_PORT=11480

# 2. Run the proxy (from repo root)
node packages/pdp-proxy/src/server.ts
# -> pdp-proxy v1 at http://127.0.0.1:11480 [non-streaming]

# 3. Point any agent at http://127.0.0.1:11480 as base URL,
#    send header x-pdp-session-id: <unique-per-team-or-project>
```

Direct request example (PII redaction proxy Indonesia):

```bash
curl -X POST http://127.0.0.1:11480/v1/chat/completions \
  -H "content-type: application/json" \
  -H "x-pdp-session-id: klinik-a" \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"cek nik 3174051209900001"}]}'
```

Verify evidence: `cat .pi/pdp/sessions/klinik-a/audit.jsonl`.
Health: `curl http://127.0.0.1:11480/healthz`.

## Quickstart fork (local LLM classifier)

1. Fast path: `bash pdp/setup-llama.sh` (Windows git-bash, Linux, macOS).
   Or manual — llama.cpp binary per OS (pinned build: `pdp/LLAMA_PIN`):
   * Windows x64 without NVIDIA: `llama-<build>-bin-win-vulkan-x64.zip`
   * Windows x64 CPU only: `llama-<build>-bin-win-cpu-x64.zip`
   * Windows x64 NVIDIA: `llama-<build>-bin-win-cuda-12.4-x64.zip`
   * Ubuntu x64: `llama-<build>-bin-ubuntu-x64.tar.gz`
   * macOS arm64: `llama-<build>-bin-macos-arm64.tar.gz`
2. Run the local router:
   ```bash
   llama-server --models-dir ~/models --no-models-autoload --jinja \
     --host 127.0.0.1 --port 8080 -ngl 999 -c 32768
   ```
3. Inside the agent: `/login llama.cpp`, `/llama` (download/load model),
   `/model` (select). Without `PDP_LLM_URL`, the regex filter still runs.
4. Production: `export PDP_VAULT_KEY="<passphrase>" PDP_LLM_URL=http://127.0.0.1:8080`

Visual flow: open `pdp/alir-data.html`.

## Input, process, output

| Stage | Input | Process (location) | Output |
|---|---|---|---|
| Fase 1a | Raw prompt + file context | `pdpFase1Sterilize` via `transformContext` (`sdk.ts`, fork) or proxy handler; retention sweep; audit `fase1.input` | Logged text + timestamp |
| Fase 1b | Logged text | Alias watchlist -> separator-tolerant NIK -> regex NIK/phone/email -> AES vault tokens (inter-process mutex); optional local LLM via `PDP_LLM_URL` (llama.cpp `:8080`) for names/addresses; audit `fase1.steril` | Sterilized messages + hit report |
| Fase 2 | Sterilized messages | Frontier USA provider as usual | Tokenized response |
| Fase 2b | Tokenized response | `pdpFase2Restore` (`assistant.ts`, fork) or proxy handler; tokens -> originals from vault; audit `fase2.response` | Full answer to user |
| Guard | Model tool arguments (fork) | `tool_call` event: PII patterns (incl. spaced NIK) = execution denied + `block_tool` audit | Dangerous tool never runs |

## What must be sterilized (UU PDP Article 4, verified verbatim)

Source: pasal.id, cross-checked with BPK RI metadata. Not legal advice.

**Specific data** (high risk, Art. 4(2)): health data and information;
biometric; genetic; criminal records; children data; personal financial data;
other data per regulation.

**General data** (Art. 4(3)): full name; gender; nationality; religion;
marital status; combined data identifying a person. NIK, phone, and email
fall under letter f (standard interpretation: single/combined identifiers).
Labeled as interpretation, not statutory text.

## Scope: 3 explicit tiers

**Tier 1 — auto-tokenized (never leaves the machine):** 16-digit NIK
(plain, spaced, dashed, dotted), Indonesian phone numbers, emails, plus
project watchlist (`.pi/pdp/aliases.json`, see `pdp/aliases.example.json`).
Always on, no LLM needed. Other names/addresses follow automatically when
`PDP_LLM_URL` is set.

**Tier 2 — flagged, redaction optional:** health, biometric, genetic,
criminal records, children, financial. Default: trigger words (`diagnosa`,
`rekening`, `gaji`...) logged as `SPECIFIC_HINT`. Set `PDP_STRICT=1` for
full-sentence tokenization (`__PDP_SENSITIVE_n__`, originals in vault) —
for clinics and hospitals.

**Tier 3 — out of scope, untouched:** gender, nationality, religion, marital
status (low risk, destroys answer quality if redacted); binary
images/attachments; `systemPrompt`.

Outside these 3 tiers = not this product's promise.

## Environment variables

| Variable | Default | Effect |
|---|---|---|
| `PDP_GUARD` | on | `=0` disables the layer (emergency/test) |
| `PDP_DIR` | `<cwd>/.pi/pdp` | relocate vault + logs |
| `PDP_VAULT_KEY` | empty (plaintext + warning) | AES-256-GCM vault encryption passphrase (mandatory for production) |
| `PDP_LLM_URL` | off | `http://127.0.0.1:8080` enables the local classifier |
| `PDP_LLM_MODEL` | `local-pii-8b` | model name in the llama.cpp router |
| `PDP_RETENTION_DAYS` | `30` | vault + audit retention in days (`0` = off) |
| `PDP_STRICT` | `0` | `=1` full Tier-2 sentence redaction |
| `PDP_SESSIONS` | on | `=0` disables per-session vault isolation |
| `PDP_UPSTREAM_URL` | required (proxy) | frontier base URL, e.g. `https://api.openai.com/v1` |
| `PDP_UPSTREAM_KEY` | required (proxy) | frontier API key (env only, never logged) |
| `PDP_PROXY_PORT` | `11480` | proxy listen port (localhost only) |

## In-agent commands (fork mode)

* `/pdp-status` — recent audit trail across sessions.
* `/pdp-purge` — wipe project vault + logs (with confirmation).

## Repository map (ours vs upstream)

New product code:

* `packages/agent/src/harness/pdp/` — `patterns.ts`, `store.ts` (AES vault + audit +
  retention + sessions + mutex), `fase1.ts`, `fase2.ts`, `index.ts`
* `packages/pdp-proxy/` — standalone proxy reusing the core above
* `.pi/extensions/pdp-guard.ts` — tool argument blocker + second net +
  `/pdp-status` + `/pdp-purge`
* `pdp/` — docs, `LLAMA_PIN`, `setup-llama.sh`, `aliases.example.json`,
  `alir-data.html`, `python-oracle/` (pattern spec + parity test)
* `AGENTS.md` — machine-readable brief for AI agents; `llms.txt` — crawler index

Upstream edits, each tagged `PDP-ID` (<10 lines):

1. `packages/coding-agent/src/core/sdk.ts` — `transformContext` calls fase 1
2. `packages/agent/src/harness/execution/assistant.ts` — final message passes fase 2
3. `packages/agent/package.json` — exports += `./harness/pdp`

Everything else is 100% upstream.

## Upstream sync

* `pdp-sync-upstream` (daily): merges `earendil-works/pi` `main` here.
  Conflicts possible only in the 3 edited files above.
* `pdp-bump-llama` (daily): new llama.cpp build pins open as PRs.

## Concurrency and security engineering

From internal audit (see commit history):

* Cross-process exclusive vault writes (atomic mkdir lock + stale reclaim +
  2s timeout that throws fail-closed). Pattern reference: `proper-lockfile`.
* Torn-read retry (4x) before giving up.
* scrypt key derivation cached per env value, not per token.
* Layered proxy fail-closed: `stream:true` rejected, invalid `messages`
  rejected 400, fase-1 failure held 500 — all with `proxy.blocked` audits.
* Frontier keys env-only, never written to logs or vault.

## Limitations (read before claiming compliance)

1. Tier 2 is flag-only by default; full redaction needs `PDP_STRICT=1`.
2. Detection can miss: alias names, NIK typos. Spaced/dashed NIK and
   watchlists covered.
3. Vault encrypted only with `PDP_VAULT_KEY`; without it plaintext + warning.
4. PII-patterned tool arguments hard-blocked (`tool_call` block).
5. Images, binaries, and `systemPrompt` are not scanned.
6. Vaults isolated per session (`sessions/<id>/`, on by default).
   Multi-process shares one OS session via `PDP_ACTIVE_DIR` (mutex-protected).
7. Without `PDP_LLM_URL`, free-form names/addresses pass through.
8. Fork-mode fase-1 crash passes messages through + `fase1.error` audit
   (extension second net covers base patterns). Proxy mode is fail-closed.
9. Proxy v1 is non-streaming only.

## FAQ — UU PDP compliance for AI tools in Indonesia

**Berapa denda pelanggaran UU PDP?**
PP 33/2026 Pasal 185: up to 2% of annual revenue, weighted by impact,
duration, data type, subject count, cooperation, business scale, and
compliance history. Plus per-subject compensation lawsuits (Pasal 105-106).

**Apakah mengirim NIK ke ChatGPT melanggar UU PDP?**
Transferring personal data abroad without a legal basis and safeguards
violates transfer rules and minimization duties. This tool ensures the
frontier model only ever receives tokens, with logged consent-basis records.

**Bagaimana cara comply UU PDP untuk AI coding assistant?**
Minimize (tokenize before sending), log every processing step with
timestamps, enforce retention and erasure, and keep filtering in-country.
That is exactly the four-stamp chain this repo implements.

**Apakah ada tool open source UU PDP Indonesia?**
Audit checklists exist (2-star skills/repos). This is the only runtime
enforcement layer mapped to Pasal 4 tiers with PP 33/2026 evidence output.

**Apakah bisa dipakai dengan Claude Code / Codex / Cursor?**
Yes — proxy mode is OpenAI-compatible and agent-agnostic (non-streaming v1).

## Legal basis (summary, Sep 2026)

* UU 27/2022 fully enforced since Oct 2024; PP 33/2026 implements it.
* PP Art. 184: administrative sanctions. PP Art. 185: fines up to 2%.
* PP Art. 105-106: subject compensation claims and lawsuits.
* This layer answers: minimization (Art. 16), specific data (Art. 4 / PP Art. 6),
  processing records (Art. 35-40), erasure (Art. 8-15).

## Attribution

Upstream: [earendil-works/pi](https://github.com/earendil-works/pi) (MIT).
Per-package upstream docs remain in `packages/*/README.md`.
AI agents reading this repo: see `AGENTS.md` and `llms.txt`.
