"use client";

import { useState } from "react";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { createSession } from "@/lib/actions";
import { authErrorMessage, clientAuth } from "@/lib/firebase-client";

export function LoginForm({ next, initialError }: { next: string; initialError?: string }) {
  const [error, setError] = useState(initialError ?? "");
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setPending(true);
    setError("");
    try {
      const auth = clientAuth();
      const cred = await signInWithEmailAndPassword(auth, String(fd.get("email")), String(fd.get("password")));
      const idToken = await cred.user.getIdToken();
      // Server membuat session cookie httpOnly; state login di browser tidak diperlukan lagi
      await signOut(auth);
      const res = await createSession(idToken, next);
      if (res?.error) {
        setError(res.error);
        setPending(false);
      }
    } catch (err) {
      // redirect() dari server action dilempar sebagai error khusus Next — biarkan lewat
      if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw err;
      setError(authErrorMessage(err));
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="mb-1.5 block text-sm text-white/70">Email</label>
        <input name="email" type="email" required autoComplete="email" className="input-dark" />
      </div>
      <div>
        <label className="mb-1.5 block text-sm text-white/70">Password</label>
        <input name="password" type="password" required autoComplete="current-password" className="input-dark" />
      </div>
      {error && <p className="text-sm text-rose-400">{error}</p>}
      <button type="submit" disabled={pending} className="btn-primary w-full rounded-xl py-3">
        {pending ? "Memeriksa…" : "Masuk"}
      </button>
    </form>
  );
}
