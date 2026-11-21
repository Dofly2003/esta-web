"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";

// Konfigurasi web Firebase memang publik (bukan rahasia); keamanan diatur di server & rules.
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let auth: Auth | undefined;

export function clientAuth() {
  if (!auth) {
    const app = getApps().length ? getApp() : initializeApp(config);
    auth = getAuth(app);
    const emu = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR;
    if (emu) connectAuthEmulator(auth, emu, { disableWarnings: true });
  }
  return auth;
}

export function authErrorMessage(e: unknown) {
  const code = (e as { code?: string })?.code ?? "";
  if (["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found", "auth/invalid-email"].includes(code))
    return "Email atau password salah.";
  if (code === "auth/too-many-requests") return "Terlalu banyak percobaan. Coba lagi beberapa menit lagi.";
  if (code === "auth/operation-not-allowed")
    return "Login Email/Password belum diaktifkan di Firebase Console (Authentication → Sign-in method).";
  if (code === "auth/network-request-failed") return "Tidak bisa terhubung ke Firebase. Cek koneksi.";
  return "Gagal masuk" + (code ? ` (${code})` : "") + ".";
}
