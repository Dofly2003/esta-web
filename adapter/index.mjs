// Adapter Astro minimal untuk server Bun vanilla.
// Build menghasilkan dist/server/entry.mjs yang mengekspor `handler(Request) => Response`,
// lalu server/main.ts memanggilnya untuk semua halaman non-API.
export default function bunAdapter() {
  return {
    name: "esta-bun-adapter",
    hooks: {
      "astro:config:done": ({ setAdapter }) => {
        setAdapter({
          name: "esta-bun-adapter",
          entrypointResolution: "auto",
          serverEntrypoint: new URL("./server-entry.mjs", import.meta.url),
          supportedAstroFeatures: {
            serverOutput: "stable",
            staticOutput: "stable",
            hybridOutput: "stable",
            envGetSecret: "stable",
            sharpImageService: "unsupported",
          },
        });
      },
    },
  };
}
