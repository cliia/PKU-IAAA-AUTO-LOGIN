import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vite";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  publicDir: false,
  build: {
    outDir: resolve(rootDir, "dist"),
    emptyOutDir: true,
    target: "chrome88",
    rollupOptions: {
      input: {
        popup: resolve(rootDir, "popup.html"),
      },
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: [resolve(rootDir, "test/setup.ts")],
    globals: true,
    css: false,
  },
});
