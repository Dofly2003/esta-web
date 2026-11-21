"use client";

import { useActionState, useState } from "react";
import { signInWithEmailAndPassword, signOut, updatePassword } from "firebase/auth";
import { createUser } from "@/lib/actions";
import { ROLES } from "@/lib/constants";
import { authErrorMessage, clientAuth } from "@/lib/firebase-client";
import { SubmitButton } from "@/components/ui";

function Msg({ state }: { state?: { error?: string; ok?: string } }) {
  if (state?.error) return <p className="text-sm text-rose-600">{state.error}</p>;
  if (state?.ok) return <p className="text-sm text-emerald-600">{state.ok}</p>;
  return null;
}

export function CreateUserForm() {
  const [state, action] = useActionState(createUser, undefined);
  return (
    <form action={action} className="space-y-3" key={state?.ok}>
      <input name="name" required placeholder="Nama" className="input" />
      <input name="email" type="email" required placeholder="Email" className="input" />
      <input name="password" type="password" required minLength={8} placeholder="Password awal (min. 8)" className="input" />
      <select name="role" defaultValue="MEMBER" className="input">
        {Object.entries(ROLES).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
      <Msg state={state} />
      <SubmitButton>Tambah akun</SubmitButton>
    </form>
  );
}

/** Ganti password langsung lewat Firebase Auth (verifikasi password lama di sisi Firebase) */
export function ChangePasswordForm({ email }: { email: string }) {
  const [state, setState] = useState<{ error?: string; ok?: string }>();
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const next = String(fd.get("next"));
    if (next.length < 8) return setState({ error: "Password baru minimal 8 karakter." });
    setPending(true);
    try {
      const auth = clientAuth();
      const cred = await signInWithEmailAndPassword(auth, email, String(fd.get("current")));
      await updatePassword(cred.user, next);
      await signOut(auth);
      form.reset();
      setState({ ok: "Password berhasil diubah." });
    } catch (err) {
      const msg = authErrorMessage(err);
      setState({ error: msg === "Email atau password salah." ? "Password lama salah." : msg });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input name="current" type="password" required placeholder="Password lama" className="input" />
      <input name="next" type="password" required minLength={8} placeholder="Password baru (min. 8)" className="input" />
      <Msg state={state} />
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Menyimpan…" : "Ganti password"}
      </button>
    </form>
  );
}
