import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

const stopwordsDir = resolve(import.meta.dirname, "../src/stopwords");
const stopwordEntries = Object.fromEntries(
  readdirSync(stopwordsDir)
    .filter((file) => file.endsWith(".ts") && file !== "en.ts")
    .map((file) => [`stopwords/${file.replace(/\.ts$/, "")}`, resolve(stopwordsDir, file)]),
);

export default defineConfig({
  plugins: [dts({ rollupTypes: true })],
  build: {
    lib: {
      entry: { index: resolve(import.meta.dirname, "../src/index.ts"), ...stopwordEntries },
      formats: ["es"],
      fileName: (_format, entryName) => `${entryName}.js`,
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
