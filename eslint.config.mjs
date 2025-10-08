import { FlatCompat } from "@eslint/eslintrc";
import js from "@eslint/js";

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

const config = [
  {
    ignores: ["node_modules", ".next", "out"],
  },
  ...compat.extends("next/core-web-vitals"),
  js.configs.recommended,
];

export default config;
