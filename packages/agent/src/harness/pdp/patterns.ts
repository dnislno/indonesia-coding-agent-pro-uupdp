// PDP-ID pola identitas Indonesia. Mirror dari oracle: pdp/python-oracle/pdp_guard/redactor.py
// Token ASCII aman tokenizer: __PDP_NIK_1__

export const TOKEN_PREFIX = "__PDP_";

export const PII_PATTERNS: Array<{ label: string; rx: RegExp }> = [
	{ label: "NIK", rx: /\b\d{16}\b/g },
	{ label: "PHONE_ID", rx: /\b(?:\+62|62|0)8\d{8,11}\b/g },
	{ label: "EMAIL", rx: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
];

export const SPECIFIC_HINT =
	/(diagnosa|rekam medis|penyakit|biometrik|sidik jari|wajah|dna|genetika|pidana|kejahatan|anak|rekening|saldo|gaji|pinjaman)/i;

export const TOKEN_RE = /__PDP_([A-Z_]+)_(\d+)__/g;

export function makeToken(label: string, n: number): string {
	return `${TOKEN_PREFIX}${label}_${n}__`;
}
