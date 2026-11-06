import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // React Compiler rules are useful, but too strict for existing mounted-flag and
      // URL-sync effects. Keep them visible without blocking production builds.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  {
    files: ["components/ui/**/*.{ts,tsx}", "lib/icons.tsx"],
    rules: {
      // shadcn/registry components use broad Recharts/icon types and animation refs.
      "@typescript-eslint/no-explicit-any": "off",
      "react-hooks/refs": "off",
      "react-hooks/purity": "off",
    },
  },
  {
    files: ["server.js"],
    rules: {
      // Legacy Node entrypoints are CommonJS.
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
