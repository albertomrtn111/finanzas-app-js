import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Copias de trabajo de los agentes (git worktree) dentro del proyecto.
    ".claude/**",
    // Cliente de Prisma generado con «npx prisma generate».
    "src/generated/**",
  ]),
]);

export default eslintConfig;
