# ESTA — Website & Dashboard Internal

- **Website utama (publik)**: Beranda, Layanan, Portofolio (+ detail karya), Kontak (tersimpan ke database).
- **Dashboard tim** (`/dashboard`, wajib login): tracking proyek, todo/tugas papan kanban, portofolio, inbox, tim & akun.
- **Notifikasi Discord**: pesan otomatis (dengan @mention) saat tugas diberikan ke seseorang atau seseorang dijadikan PJ proyek.

## System design

| Bagian   | Teknologi                                                                        |
| -------- | -------------------------------------------------------------------------------- |
| Runner   | **Bun**                                                                          |
| Tools    | **Vite+** (`vp check` / `vp lint` / `vp fmt` / `vp test`)                        |
| Frontend | **Astro** (SSR) — komponen bisa `.astro`, React (`.tsx`), atau tambah Vue/Svelte |
| Backend  | **Bun vanilla** (`Bun.serve`, router sendiri di `server/api.ts`)                 |
| Database | **SQLite** via libSQL: file `data/esta.sqlite` (lokal) / **Turso** (online)      |

```
server/      backend Bun: main.ts (server), api.ts (semua endpoint /api), repo.ts (SQL), db.ts (skema),
             auth.ts (login & sesi), discord.ts (notifikasi)
src/         frontend Astro: pages/, layouts/, components/ (dash/ = komponen dashboard)
shared/      tipe & konstanta yang dipakai backend + frontend
adapter/     adapter Astro kecil agar halaman SSR jalan di dalam server Bun
scripts/     dev.ts, seed.ts (data contoh), import-firestore.ts (impor data lama)
```

Alur data: halaman Astro mengambil data dari API Bun (`src/lib/api.ts`); semua form mengirim ke `/api/...`
lalu diarahkan kembali ke halaman dengan pesan `?ok=` / `?err=`. Form tetap jalan walau JavaScript mati.

## Menjalankan di lokal

Butuh [Bun](https://bun.sh) ≥ 1.3.

```bash
bun install
cp .env.example .env        # isi SEED_PASSWORD
bun run db:seed             # isi data contoh (atau: bun run db:import, lihat di bawah)
bun run dev                 # website: http://localhost:4321  ·  API: http://127.0.0.1:3001
```

Login: `admin@esta.id` / `rina@esta.id` / `budi@esta.id` dengan password = `SEED_PASSWORD`.

### Mode production (satu proses)

```bash
bun run build               # build halaman Astro ke dist/
bun run start               # http://localhost:3000 — API + halaman + file statis
```

### Perintah lain

| Perintah                  | Fungsi                                                             |
| ------------------------- | ------------------------------------------------------------------ |
| `bun run check`           | Vite+: format + lint                                               |
| `bun run fmt`             | Rapikan format kode                                                |
| `bun run db:seed --force` | Hapus semua data lalu isi data contoh                              |
| `bun run db:import`       | Impor `data/firestore-export.json` (data dari versi Firebase lama) |

## Data dari versi lama (Firebase)

Data Firestore sudah diekspor ke `data/firestore-export.json` dan diimpor ke SQLite.
Password Firebase tidak bisa dipindahkan: `admin@esta.id` memakai `SEED_PASSWORD`, akun lain mendapat password
sementara di `data/initial-passwords.txt` — bagikan lewat jalur pribadi, minta diganti, lalu hapus file itu.

## Notifikasi Discord

Dashboard → **Tim & Akun** (admin):

1. Tempel link webhook channel Discord (Edit Channel → Integrations → Webhooks → New Webhook → Copy URL), Simpan.
2. Isi **Discord ID** tiap anggota (Discord → Settings → Advanced → Developer Mode, lalu klik kanan nama → Copy User ID)
   supaya mereka di-mention dan HP-nya berbunyi.
3. Klik **Kirim pesan uji**.

## Online di Vercel + Turso

- `server.ts` (root) = server produksi `Bun.serve`; Vercel mendeteksinya otomatis (runtime Bun, lihat `vercel.json`).
- Database online: **Turso** (SQLite di cloud). Kredensial disimpan di `.env.vercel` (tidak di-commit) dan di
  Environment Variables Vercel: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `SITE_URL`.
- Isi database online dari ekspor lama: `bun --env-file=.env.vercel scripts/import-firestore.ts`
- Live: **https://esta-web-fawn.vercel.app** (akun Vercel dofly2003, terhubung ke GitHub)
- Deploy: otomatis setiap push ke `main`; branch lain mendapat link preview sendiri

## Backup

Seluruh data ada di satu file `data/esta.sqlite` (plus `-wal`/`-shm` saat server jalan). Backup aman saat server jalan:

```bash
sqlite3 data/esta.sqlite ".backup data/backup-$(date +%F).sqlite"
```

## Untuk kolaborator

1. `git clone` lalu `bun install`
2. `cp .env.example .env`, isi `SEED_PASSWORD`, lalu `bun run db:seed` (database lokal sendiri berisi data contoh)
3. `bun run dev`
4. Buat branch → commit → push → Pull Request ke `main`. Jalankan `bun run check` sebelum push.

**Jangan pernah commit** `.env` atau folder `data/` (database & password) — sudah ada di `.gitignore`.

## Mengganti identitas brand

- Nama, email, telepon, WhatsApp, layanan: `shared/constants.ts`
- Warna: token di `src/styles/global.css`
- Logo: `src/components/Logo.astro`, `public/favicon.svg`
