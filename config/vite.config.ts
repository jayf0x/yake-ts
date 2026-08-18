import { resolve } from "node:path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  plugins: [dts({ rollupTypes: true })],
  build: {
    lib: {
      entry: resolve(import.meta.dirname, "../src/index.ts"),
      formats: ["es"],
      fileName: () => "index.js",
    },
    target: "es2022",
    minify: "oxc",
    sourcemap: false,
    rollupOptions: {
      external: [/^node:/],
      output: { exports: "named" },
    },
  },
});
