// Log error tanpa rahasia. Error fetch Bun membawa URL lengkap (path) — untuk webhook Discord itu berarti token
// webhook ikut tercetak di log Vercel bila objek error dicetak apa adanya. Di sini hanya nama, kode, pesan, dan stack
// yang dicetak, semuanya setelah token webhook diganti "***".

/** Ganti token webhook Discord (/api/webhooks/<id>/<token>) dengan *** di teks apa pun */
export const redact = (s: string) => s.replace(/(\/api\/webhooks\/\d+\/)[\w-]+/gi, "$1***");

/** Ringkasan error yang aman dicetak (tanpa properti lain seperti path/url/headers) */
export function errInfo(e: unknown): string {
  if (!(e instanceof Error)) return redact(String(e));
  const code = (e as { code?: unknown }).code;
  const head = `${e.name}${typeof code === "string" && code ? ` [${code}]` : ""}: ${e.message}`;
  const stack = e.stack?.split("\n").slice(1).join("\n");
  return redact(stack ? `${head}\n${stack}` : head);
}

/** console.error dengan error yang sudah dibersihkan */
export function logError(prefix: string, e?: unknown) {
  console.error(e === undefined ? redact(prefix) : `${redact(prefix)} ${errInfo(e)}`);
}
