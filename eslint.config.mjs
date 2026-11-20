import { defineConfig, globalIgnores } from "eslint/config";
import next from "@next/eslint-plugin-next";
import typescript from "typescript-eslint";

export default defineConfig(
  ...typescript.configs.recommended,
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: { "@next/next": next },
    rules: next.configs["core-web-vitals"].rules,
    settings: { next: { rootDir: "apps/web" } },
  },
  globalIgnores([
    "**/.next/**",
    "**/generated/**",
    "**/next-env.d.ts",
    "playwright-report/**",
  ]),
);
