// Jalankan backend (Bun) + frontend (Astro) bersamaan: `bun run dev`
const procs = [
  Bun.spawn(["bun", "--watch", "server/main.ts"], { stdout: "inherit", stderr: "inherit" }),
  Bun.spawn(["bunx", "--bun", "astro", "dev"], { stdout: "inherit", stderr: "inherit" }),
];

const stop = () => {
  for (const p of procs) p.kill();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

// Jika salah satu berhenti, hentikan yang lain juga
await Promise.race(procs.map((p) => p.exited));
stop();

export {};
