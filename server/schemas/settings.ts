// Setelan Discord: form admin dan baris JSON tersimpan di tabel settings.
import { boolean, check, fallback, object, pipe, safeParse, string } from "valibot";
import type { DiscordSettings } from "../../shared/types";
import { flag, isWebhookUrl, str } from "./fields";

/** Link webhook opsional: kosong = notifikasi mati, diisi wajib link webhook Discord */
const webhook = () =>
  pipe(
    str(),
    check((v) => !v || isWebhookUrl(v), "webhook-invalid"),
  );

export const discordForm = object({ webhookUrl: webhook(), enabled: flag() });
/** Kirim pesan uji ke link yang sedang diketik (kosong = link tersimpan) */
export const discordTestForm = object({ webhookUrl: webhook() });

export const DISCORD_DEFAULT: DiscordSettings = { webhookUrl: "", enabled: true };
const discordRow = object({
  webhookUrl: fallback(string(), DISCORD_DEFAULT.webhookUrl),
  enabled: fallback(boolean(), DISCORD_DEFAULT.enabled),
});

/** Nilai JSON tersimpan → setelan. JSON rusak / bukan objek = bawaan; field yang hilang atau bertipe salah = bawaannya
 * (tidak membuat setiap notifikasi gagal). */
export function discordSettingOf(json: string): DiscordSettings {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ...DISCORD_DEFAULT };
  }
  const r = safeParse(discordRow, raw);
  return r.success ? r.output : { ...DISCORD_DEFAULT };
}
