import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Fully Completely's own framework tooling (predates this app, is
    // plain CommonJS Node.js by design, and is not part of the Next.js
    // application this sprint scaffolds) — not in scope for this app's
    // lint config.
    "scripts/**",
    "templates/**",
    ".claude/**",
  ]),
]);

export default eslintConfig;
