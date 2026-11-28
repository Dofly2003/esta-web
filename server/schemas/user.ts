// Form akun (Tim & Akun). Urutan = urutan if lama: nama wajib → panjang nama → panjang email → format email →
// password awal → Discord ID; peran jatuh ke MEMBER. email-taken dicek rute (database).
import { maxLength, object, pipe } from "valibot";
import { MAX_LEN, ROLES } from "../../shared/constants";
import { discordId, email, newPassword, oneOfStrict, pickLoose, required } from "./fields";

export const userCreateForm = object({
  name: pipe(required("user-name-required"), maxLength(MAX_LEN.userName, "too-long")),
  email: email("user-email-invalid"),
  password: newPassword("user-password-short"),
  discordId: discordId(),
  role: pickLoose(ROLES, "MEMBER"),
});

/** Admin mereset password akun lain */
export const userPasswordForm = object({ password: newPassword("password-short") });
/** Ubah peran: wajib peran yang dikenal ("" juga ditolak) */
export const userRoleForm = object({ role: oneOfStrict(ROLES, "role-invalid") });
export const userDiscordForm = object({ discordId: discordId() });
