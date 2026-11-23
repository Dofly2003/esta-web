// Kelas & helper kecil untuk komponen dashboard (dipakai di file .astro)
export const pill = (active: boolean) =>
  `rounded-full px-3 py-1 text-sm ${active ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-200"}`;

/** Atribut untuk <select> yang langsung mengirim form saat diganti */
export const autoSubmit = { onchange: "this.form.requestSubmit()" };

/** Atribut untuk tombol hapus dengan konfirmasi */
export const confirmAttr = (msg: string) => ({ onclick: `return confirm(${JSON.stringify(msg)})` });
