import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createReadStream, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

const require = createRequire(import.meta.url);
const englishDataPath = resolve(
  dirname(require.resolve("@tesseract.js-data/eng/package.json")),
  "4.0.0_best_int/eng.traineddata.gz",
);
const englishDataRoute = "/ocr/lang/eng.traineddata.gz";

const bundledOcrData = () => ({
  name: "bundled-ocr-data",
  configureServer(server: { middlewares: { use: (handler: (request: { url?: string }, response: NodeJS.WritableStream & { setHeader: (name: string, value: string) => void }, next: () => void) => void) => void } }) {
    server.middlewares.use((request, response, next) => {
      if (request.url?.split("?")[0] !== englishDataRoute) return next();
      response.setHeader("Content-Type", "application/gzip");
      createReadStream(englishDataPath).pipe(response);
    });
  },
  generateBundle(this: { emitFile: (asset: { type: "asset"; fileName: string; source: Uint8Array }) => void }) {
    this.emitFile({
      type: "asset",
      fileName: englishDataRoute.slice(1),
      source: readFileSync(englishDataPath),
    });
  },
});

export default defineConfig({ plugins: [react(), bundledOcrData()] });
