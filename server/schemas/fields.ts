// Primitif Valibot untuk input form. Kontrak (lihat juga server/api.ts → readBody):
// - input = objek dari body form/JSON yang sudah dinormalkan readBody (string, sudah di-trim);
//   field yang tidak dikirim sama dengan "" (sama seperti f.get() dulu)
// - pesan setiap issue = kode ErrCode (teks di shared/messages.ts), jadi rute tetap memilih sendiri:
//   redirect done(err) atau HttpError (status 400/404/409), persis seperti sebelum Valibot
// - urutan cek = urutan kunci objek (abortEarly) → kode error yang tampil sama dengan urutan if lama.
// Import per fungsi (bukan `* as v`) supaya bundel Vite bisa tree-shake. Valibot hanya untuk server / SSR.
import {
  check,
  maxLength,
  nonEmpty,
  optional,
  pipe,
  safeParse,
  string,
  transform,
  type GenericSchema,
  type InferOutput,
} from "valibot";
import { coverColorOr, MAX_LEN, MIN_PASSWORD } from "../../shared/constants";
import { ISO_DAY_RE, isEmail, isLink, normEmail, parseRupiah } from "../../shared/format";
import { ERR, type ErrCode } from "../../shared/messages";

/** Field form teks; tidak dikirim = "" */
export const str = () => optional(string(), "");
/** Teks maks. `max` karakter; lebih panjang = too-long (tidak dipotong diam-diam) */
export const text = (max: number) => pipe(str(), maxLength(max, "too-long" satisfies ErrCode));
/** Wajib diisi (setelah trim) */
export const required = (code: ErrCode) => pipe(str(), nonEmpty(code));
/** "" → null (id opsional, mis. leadId / assigneeId; keberadaannya di DB dicek rute) */
export const nullIfEmpty = () =>
  pipe(
    str(),
    transform((v): string | null => v || null),
  );
/** Kotak centang: "on" (form) atau true (JSON, dinormalkan readBody menjadi "on") */
export const flag = () =>
  pipe(
    str(),
    transform((v) => v === "on"),
  );

/** "YYYY-MM-DD" yang benar-benar ada di kalender, tahun 2000–2100 (2026-02-31 ditolak, bukan digeser) */
export function isRealDay(v: string) {
  const m = ISO_DAY_RE.exec(v);
  if (!m) return false;
  const y = +m[1]!;
  const mo = +m[2]! - 1;
  const d = new Date(Date.UTC(y, mo, +m[3]!));
  return y >= 2000 && y <= 2100 && d.getUTCMonth() === mo && d.getUTCDate() === +m[3]!;
}
/** Tanggal opsional: "" → null, selain tanggal valid → `code` */
export const isoDate = (code: ErrCode = "date-invalid") =>
  pipe(
    str(),
    check((v) => !v || isRealDay(v), code),
    transform((v): string | null => v || null),
  );

/** Pilihan yang wajib dikenal; kosong = fallback, nilai asing ditolak (tidak diganti diam-diam) */
export const pickStrict = (map: Record<string, unknown>, fallback: string, code: ErrCode = "status-invalid") =>
  pipe(
    str(),
    check((v) => !v || Object.hasOwn(map, v), code),
    transform((v) => v || fallback),
  );
/** Pilihan longgar: nilai asing / kosong diganti fallback tanpa error */
export const pickLoose = (map: Record<string, unknown>, fallback: string) =>
  pipe(
    str(),
    transform((v) => (Object.hasOwn(map, v) ? v : fallback)),
  );
/** Wajib salah satu kunci `map` ("" juga ditolak) */
export const oneOfStrict = (map: Record<string, unknown>, code: ErrCode) =>
  pipe(
    str(),
    check((v) => Object.hasOwn(map, v), code),
  );

/** Rupiah bulat ("15.000.000", "Rp 15000000"); kosong = null */
export const rupiah = () =>
  pipe(
    str(),
    transform(parseRupiah),
    check((v) => v !== "invalid", "budget-invalid" satisfies ErrCode),
    transform((v) => v as number | null),
  );

/** Link opsional (http/https, `relative` = boleh path lokal "/…"): maks. MAX_LEN.url (too-long), lalu formatnya */
export const link = (code: ErrCode, relative = false) =>
  pipe(
    str(),
    maxLength(MAX_LEN.url, "too-long" satisfies ErrCode),
    check((v) => !v || isLink(v, relative), code),
    transform((v): string | null => v || null),
  );

/** Email (dinormalkan: trim + huruf kecil), maks. MAX_LEN.email (too-long), lalu formatnya */
export const email = (code: ErrCode) =>
  pipe(str(), transform(normEmail), maxLength(MAX_LEN.email, "too-long" satisfies ErrCode), check(isEmail, code));

/** Discord ID dari input ("<@!123…>" atau angka) → angka, "" bila kosong. 17–20 digit, sama dengan teks bantuan. */
export const discordId = () =>
  pipe(
    str(),
    transform((v) => v.replace(/[<@!>]/g, "")),
    check((id) => !id || /^\d{17,20}$/.test(id), "discord-id-invalid" satisfies ErrCode),
  );

/** Password baru: minimal MIN_PASSWORD (`shortCode`), maksimal MAX_LEN.password (too-long). Tidak di-trim ulang. */
export const newPassword = (shortCode: ErrCode) =>
  pipe(
    str(),
    check((v) => v.length >= MIN_PASSWORD, shortCode),
    maxLength(MAX_LEN.password, "too-long" satisfies ErrCode),
  );

/** Warna sampul "#rrggbb", selain itu bawaan */
export const hexColor = () =>
  pipe(
    str(),
    transform((v) => coverColorOr(v)),
  );

/** Link webhook Discord yang sah (hanya domain Discord: tidak bisa dipakai untuk SSRF ke host lain) */
export function isWebhookUrl(url: string) {
  return /^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(url);
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; code: ErrCode };

/** safeParse dengan abortEarly: issue pertama → kodenya. Pesan yang bukan ErrCode (mis. tipe salah) → server-error. */
export function parseWith<S extends GenericSchema>(schema: S, input: unknown): Parsed<InferOutput<S>> {
  const r = safeParse(schema, input, { abortEarly: true });
  if (r.success) return { ok: true, value: r.output };
  const msg = r.issues[0].message;
  return { ok: false, code: Object.hasOwn(ERR, msg) ? (msg as ErrCode) : "server-error" };
}
