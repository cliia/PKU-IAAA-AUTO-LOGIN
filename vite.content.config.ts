import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vite";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  publicDir: false,
  build: {
    outDir: resolve(rootDir, "dist"),
    emptyOutDir: false,
    target: "chrome88",
    minify: "esbuild",
    rollupOptions: {
      input: resolve(rootDir, "src/content/index.ts"),
      output: {
        format: "iife",
        name: "PkuIaaaContent",
        inlineDynamicImports: true,
        entryFileNames: "assets/content.js",
      },
    },
  },
});
