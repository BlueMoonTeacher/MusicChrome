import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("@magenta/music")) return "magenta";
          if (id.includes("@tonejs/piano") || id.includes("node_modules/tone")) return "tone-piano";
        },
      },
    },
  },
});
