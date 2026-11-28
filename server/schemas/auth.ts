// Form login dan ganti password sendiri.
import { object, pipe, transform } from "valibot";
import { normEmail, safeNext } from "../../shared/format";
import { newPassword, str } from "./fields";

/** Password lebih panjang dari ini tidak di-hash sama sekali (langsung gagal), agar tidak bisa dipakai membebani CPU */
export const MAX_LOGIN_PASSWORD = 1024;

/** Login: email dinormalkan, `next` hanya /dashboard… (selain itu /dashboard). Password terlalu panjang = gagal biasa
 * (bukan kode baru), jadi panjangnya dicek rute, bukan di sini. */
export const loginForm = object({
  email: pipe(str(), transform(normEmail)),
  password: str(),
  next: pipe(
    str(),
    transform((v) => safeNext(v) ?? "/dashboard"),
  ),
});

/** Ganti password sendiri: `current` diverifikasi rute dulu (password-wrong), baru `next` dicek */
export const accountPasswordForm = object({ current: str(), next: newPassword("password-short") });
