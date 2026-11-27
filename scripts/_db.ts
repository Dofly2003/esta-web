// Bersama untuk skrip yang menulis ke database (seed, impor).
import { ready } from "../server/db";
import { users } from "../server/repo";

/**
 * Tunggu skema siap; hentikan skrip bila database sudah berisi akun dan --force tidak dipakai.
 * Mengembalikan true bila --force (pemanggil menghapus data lama di urutan yang sama seperti sebelumnya).
 */
export async function openForWrite(redo: string) {
  const force = process.argv.includes("--force");
  await ready();
  if ((await users.count()) > 0 && !force) {
    console.error(`Database sudah berisi data. Tambahkan --force untuk menghapus dan ${redo}.`);
    process.exit(1);
  }
  return force;
}
