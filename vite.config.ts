import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const zustandEsm = path.resolve(__dirname, "node_modules/zustand/esm/index.mjs");
const zustandShallowEsm = path.resolve(__dirname, "node_modules/zustand/esm/shallow.mjs");

function fixLevaZustandInterop() {
  return {
    name: "fix-leva-zustand-interop",
    enforce: "pre" as const,
    resolveId(id: string, importer?: string) {
      if (!importer) return null;
      const fromLeva =
        importer.includes(`${path.sep}leva${path.sep}`) || importer.includes("/leva/");
      if (!fromLeva) return null;
      if (id === "zustand") return "\0leva-zustand-default";
      if (id === "zustand/shallow") return "\0leva-zustand-shallow-default";
      return null;
    },
    load(id: string) {
      if (id === "\0leva-zustand-default") {
        const p = JSON.stringify(zustandEsm);
        return `export * from ${p};\nexport { create as default } from ${p};\n`;
      }
      if (id === "\0leva-zustand-shallow-default") {
        const p = JSON.stringify(zustandShallowEsm);
        return `export * from ${p};\nexport { shallow as default } from ${p};\n`;
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [fixLevaZustandInterop(), react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5175,
    open: true,
  },
});