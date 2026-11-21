# ESTA — Website & Dashboard Internal

Satu aplikasi Next.js berisi:

- **Website utama (publik)**: Beranda, Layanan, Portofolio (+ detail karya), Kontak (form tersimpan ke database).
- **Dashboard tim** (`/dashboard`, wajib login): tracking proyek, todo/tugas berbentuk papan kanban, kelola portofolio, inbox pesan kontak, dan manajemen akun tim.

Stack: Next.js 15 (App Router, Server Actions) · React 19 · Tailwind CSS 4 · **Firebase** (Firestore + Authentication).
Project Firebase: `estehanget-9c644`, Firestore lokasi `nam5` (AS). Saat ini `.env` sudah tersambung ke project asli.

## Cara kerja Firebase di sini

- Semua baca/tulis data dilakukan di **server** Next.js lewat `firebase-admin` (`src/lib/data.ts`).
  Browser tidak pernah mengakses Firestore langsung, jadi `firestore.rules` menutup semua akses klien.
- Login: browser masuk dengan Firebase Auth (email & password) → server membuat **session cookie** httpOnly (7 hari).
- Anggota tim = akun Firebase Auth + dokumen `users/{uid}` (nama & peran). Akun Auth tanpa dokumen `users` tidak bisa masuk.

Koleksi Firestore: `users`, `projects`, `tasks`, `portfolio`, `inquiries`.

## Menjalankan di lokal (emulator, tanpa menyentuh project asli)

Butuh Java (sudah ada) dan Firebase CLI. Untuk kembali ke emulator, aktifkan lagi 3 baris `*_EMULATOR*` di `.env` dan komentari `GOOGLE_APPLICATION_CREDENTIALS`.

```bash
npm install
cp .env.example .env
npm run emulators        # terminal 1: Auth + Firestore emulator, UI di http://127.0.0.1:4000
npm run seed             # terminal 2: isi data contoh
npm run dev              # http://localhost:3000
```

Login: `admin@esta.id`, password = `SEED_PASSWORD` di `.env` (default `esta12345`). Akun contoh lain: `rina@esta.id`, `budi@esta.id`.
Data emulator disimpan di `.emulator-data/` saat emulator dimatikan (Ctrl+C).

## Pindah ke project Firebase asli

1. **Aktifkan Firestore**: Firebase Console → Build → Firestore Database → *Create database* → mode *production*.
2. **Aktifkan login email**: Authentication → *Get started* → Sign-in method → **Email/Password** → Enable.
3. **Kunci server**: Project settings → Service accounts → *Generate new private key*.
   Simpan sebagai `service-account.json` di folder ini (sudah di-`.gitignore`, **jangan dibagikan**).
4. Di `.env`: hapus 3 baris `*_EMULATOR*`, lalu aktifkan `GOOGLE_APPLICATION_CREDENTIALS="./service-account.json"`.
5. Pasang rules: `npm run deploy:rules`
6. Buat akun admin pertama (tidak menghapus apa pun): `npm run seed -- --admin-only --force`
   — atau isi semua data contoh (**menghapus data yang ada**): `npm run seed -- --force`
7. `npm run dev`, login, lalu **ganti password** di menu *Tim & Akun*.

## Fitur dashboard

| Menu | Isi |
|---|---|
| Ringkasan | Statistik, proyek berjalan + progres, tugas saya, inquiry baru |
| Proyek | Daftar proyek (filter status/jenis, cari), tambah proyek: klien, jenis (Website/Web App/Mobile App/UI/UX), status, PJ, nilai, timeline |
| Detail proyek | Papan kanban To Do → Dikerjakan → Review → Selesai, assign anggota, prioritas, deadline (merah jika lewat), progres otomatis, tombol **Jadikan portofolio** |
| Tugas | Todo lintas proyek: milik saya / semua tim |
| Portofolio | Tambah/edit karya, link gambar cover, atur *Tayang* & *Unggulan* (muncul di Beranda), urutan |
| Inbox | Pesan dari form Kontak, status, balas email |
| Tim & Akun | Admin menambah/menghapus anggota; semua bisa ganti password |

## Mengganti identitas brand

- Nama, email, telepon, WhatsApp, alamat, layanan: `src/lib/constants.ts` (`BRAND`, `SERVICES`).
- Warna: token `--color-accent`, `--color-ink` di `src/app/globals.css`.
- Logo: komponen `Logo` di `src/app/(site)/layout.tsx`.

## Online (Vercel)

Live: **https://esta-web.vercel.app** (project Vercel `esta-web`). Data & login tetap di Firebase (paket Spark).

Deploy ulang setelah mengubah kode:

```bash
npx vercel deploy --prod
```

Environment variable di Vercel (Production): semua `NEXT_PUBLIC_FIREBASE_*` + `FIREBASE_SERVICE_ACCOUNT` (JSON service account).
Kalau kunci service account diganti, perbarui juga variabel ini di Vercel → Settings → Environment Variables, lalu deploy ulang.

Alternatif:
- **Firebase App Hosting**: butuh paket Blaze; kredensial server otomatis.
- Tambahkan domain produksi di Authentication → Settings → Authorized domains.

## Untuk kolaborator (setup pertama kali)

1. `git clone <url-repo>` lalu `npm install`
2. Minta file berikut ke pemilik proyek **lewat jalur pribadi** (jangan lewat GitHub/grup publik):
   - `.env` (atau salin `.env.example` → `.env` untuk mode emulator)
   - `service-account.json` (hanya jika perlu akses ke database asli)
3. Paling aman bekerja dengan emulator: `npm run emulators`, `npm run seed`, `npm run dev`.
4. Alur kerja: buat branch baru → commit → push → buka Pull Request ke `main`.
   Setiap push ke `main` otomatis di-deploy ke https://esta-web.vercel.app (jika Vercel sudah terhubung ke GitHub).

**Jangan pernah commit** `.env`, `.env.local`, atau file `*.json` kunci service account (sudah ada di `.gitignore`).
