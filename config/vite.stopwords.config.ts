import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";

// ponytail: JS-only build, deliberately no vite-plugin-dts here. Every stopwords/* subpath
// export's `types` condition points straight at src/*.ts (see AGENTS.md) — a rolled-up dist
// .d.ts per language would be dead weight nobody imports, so don't generate one.
const stopwordsDir = resolve(import.meta.dirname, "../src/stopwords");
const stopwordEntries = Object.fromEntries(
  readdirSync(stopwordsDir)
    .filter((file) => file.endsWith(".ts"))
    .map((file) => [`stopwords/${file.replace(/\.ts$/, "")}`, resolve(stopwordsDir, file)]),
);

export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: stopwordEntries,
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
